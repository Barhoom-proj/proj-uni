import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

function reply(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

function isManager(claims) {
  const raw = claims?.["cognito:groups"] || "";
  const groups = Array.isArray(raw)
    ? raw
    : String(raw).replace(/[\[\]"]/g, "").split(",");
  return groups.map(group => group.trim()).includes("manager");
}

function bahrainDate(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date).map(p => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toISO(value) {
  return value ? `${String(value).slice(0, 23)}Z` : null;
}

function shiftUTC(date, time) {
  return new Date(`${date}T${time}:00+03:00`).getTime();
}

function countSummary(rows) {
  const statuses = ["Present", "Late", "Absent", "Upcoming", "Awaiting Check-In", "Not Scheduled", "No Schedule", "Unscheduled Check-In", "Recorded (No Schedule)", "On Leave", "Holiday", "Worked on Holiday", "Check-In During Leave"];
  const counts = Object.fromEntries(statuses.map(status => [status, 0]));
  let totalSeconds = 0;
  for (const row of rows) {
    counts[row.status] = (counts[row.status] || 0) + 1;
    totalSeconds += row.durationSeconds || 0;
  }
  const completedShifts = counts.Present + counts.Late + counts.Absent;
  return {
    present: counts.Present,
    late: counts.Late,
    absent: counts.Absent,
    upcoming: counts.Upcoming,
    awaitingCheckIn: counts["Awaiting Check-In"],
    notScheduled: counts["Not Scheduled"],
    noSchedule: counts["No Schedule"],
    unscheduledCheckIns: counts["Unscheduled Check-In"],
    recordedWithoutSchedule: counts["Recorded (No Schedule)"],
    onLeave: counts["On Leave"],
    holidays: counts.Holiday,
    workedOnHoliday: counts["Worked on Holiday"],
    checkInsDuringLeave: counts["Check-In During Leave"],
    completedShifts,
    attendanceRate: completedShifts ? Math.round((counts.Present + counts.Late) * 1000 / completedShifts) / 10 : null,
    recordedHours: Math.round(totalSeconds / 36) / 100
  };
}

export const handler = async event => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub || claims.token_use !== "access" || !isManager(claims)) {
    return reply(403, { message: "Manager authorization required." });
  }
  if (event.routeKey !== "GET /manager/reports/monthly") {
    return reply(404, { message: "Unknown route." });
  }

  const currentMonth = bahrainDate(new Date()).slice(0, 7);
  const month = event.queryStringParameters?.month || currentMonth;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > currentMonth) {
    return reply(400, { message: "Choose a valid current or past month (YYYY-MM)." });
  }
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    return reply(500, { message: "Database configuration is incomplete." });
  }

  const startDate = `${month}-01`;
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString().slice(0, 10);
  const today = bahrainDate(new Date());
  const throughDate = lastDay < today ? lastDay : today;
  let db;

  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || "cloudtrek_attendance",
      timezone: "Z",
      connectTimeout: 10000,
      ssl: {
        ca: readFileSync(new URL("./global-bundle.pem", import.meta.url)),
        rejectUnauthorized: true
      }
    });
    await db.query("SET time_zone = '+00:00'");

    const [employees] = await db.query(`
      SELECT id AS employeeId, full_name AS employeeName, department,
             DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%f') AS createdUTC
      FROM employees ORDER BY full_name
    `);
    const eligibleEmployees = employees.filter(employee =>
      bahrainDate(new Date(toISO(employee.createdUTC))) <= throughDate
    );
    const [schedules] = await db.execute(`
      SELECT employee_id AS employeeId,
             DATE_FORMAT(effective_from, '%Y-%m-%d') AS effectiveFrom,
             weekday, is_workday AS isWorkday,
             TIME_FORMAT(start_time, '%H:%i') AS startTime,
             TIME_FORMAT(end_time, '%H:%i') AS endTime,
             grace_minutes AS graceMinutes
      FROM employee_work_schedules
      WHERE effective_from <= ?
      ORDER BY employee_id, effective_from, weekday
    `, [throughDate]);
    const [attendance] = await db.execute(`
      SELECT employee_id AS employeeId,
             DATE_FORMAT(work_date, '%Y-%m-%d') AS workDate,
             DATE_FORMAT(check_in_at, '%Y-%m-%dT%H:%i:%s.%f') AS checkInUTC,
             DATE_FORMAT(check_out_at, '%Y-%m-%dT%H:%i:%s.%f') AS checkOutUTC,
             TIMESTAMPDIFF(SECOND, check_in_at, check_out_at) AS durationSeconds
      FROM attendance_records
      WHERE work_date BETWEEN ? AND ?
    `, [startDate, throughDate]);

    const [leaveRows] = await db.execute(`
      SELECT employee_id AS employeeId,
             DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
             DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate,
             leave_type AS leaveType
      FROM employee_leave_requests
      WHERE status = 'approved' AND start_date <= ? AND end_date >= ?
    `, [throughDate, startDate]);
    const [holidayRows] = await db.execute(`
      SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date,
             holiday_name AS name
      FROM public_holidays WHERE holiday_date BETWEEN ? AND ?
    `, [startDate, throughDate]);
    const holidayByDate = new Map(holidayRows.map(row => [row.date, row.name]));
    const leaveByEmployee = new Map();
    for (const row of leaveRows) {
      const id = String(row.employeeId);
      if (!leaveByEmployee.has(id)) leaveByEmployee.set(id, []);
      leaveByEmployee.get(id).push(row);
    }

    // Group schedule versions by employee; the latest effective version applies per date.
    const versionsByEmployee = new Map();
    for (const row of schedules) {
      const id = String(row.employeeId);
      if (!versionsByEmployee.has(id)) versionsByEmployee.set(id, new Map());
      const versions = versionsByEmployee.get(id);
      if (!versions.has(row.effectiveFrom)) versions.set(row.effectiveFrom, new Map());
      versions.get(row.effectiveFrom).set(Number(row.weekday), row);
    }
    const attendanceByEmployeeAndDate = new Map(
      attendance.map(row => [`${row.employeeId}:${row.workDate}`, row])
    );

    const now = Date.now();
    const days = [];
    for (const employee of eligibleEmployees) {
      const id = String(employee.employeeId);
      const versions = versionsByEmployee.get(id) || new Map();
      const effectiveDates = [...versions.keys()].sort();
      const registeredOn = bahrainDate(new Date(toISO(employee.createdUTC)));
      const department = employee.department || "Not assigned";

      for (let d = new Date(`${startDate}T12:00:00Z`);
           d.toISOString().slice(0, 10) <= throughDate;
           d.setUTCDate(d.getUTCDate() + 1)) {
        const date = d.toISOString().slice(0, 10);
        if (date < registeredOn) continue;

        const weekday = d.getUTCDay();
        const chosen = [...effectiveDates].reverse().find(item => item <= date);
        const schedule = chosen ? versions.get(chosen)?.get(weekday) : null;
        const attendanceRecord = attendanceByEmployeeAndDate.get(`${id}:${date}`);
        const checkInAt = toISO(attendanceRecord?.checkInUTC);
        const checkOutAt = toISO(attendanceRecord?.checkOutUTC);
        const isScheduled = Number(schedule?.isWorkday) === 1;
        const holidayName = holidayByDate.get(date) || null;
        const approvedLeave = (leaveByEmployee.get(id) || [])
          .find(row => row.startDate <= date && row.endDate >= date);
        let status;

        if (!schedule) {
          status = checkInAt ? "Recorded (No Schedule)" : "No Schedule";
        } else if (!isScheduled) {
          status = checkInAt ? "Unscheduled Check-In" : "Not Scheduled";
        } else if (holidayName) {
          status = checkInAt ? "Worked on Holiday" : "Holiday";
        } else if (approvedLeave) {
          status = checkInAt ? "Check-In During Leave" : "On Leave";
        } else if (checkInAt) {
          const limit = shiftUTC(date, schedule.startTime) + Number(schedule.graceMinutes) * 60000;
          status = new Date(checkInAt).getTime() > limit ? "Late" : "Present";
        } else if (now < shiftUTC(date, schedule.startTime)) {
          status = "Upcoming";
        } else if (now < shiftUTC(date, schedule.endTime)) {
          status = "Awaiting Check-In";
        } else {
          status = "Absent";
        }

        // Show meaningful rows: scheduled shifts and actual unscheduled attendance.
        if (!isScheduled && !checkInAt) continue;

        days.push({
          employeeId: Number(employee.employeeId),
          employeeName: employee.employeeName,
          department,
          date,
          shiftStart: isScheduled ? schedule.startTime : null,
          shiftEnd: isScheduled ? schedule.endTime : null,
          checkInAt,
          checkOutAt,
          durationSeconds: attendanceRecord?.durationSeconds == null
            ? null : Math.max(0, Number(attendanceRecord.durationSeconds)),
          exceptionLabel: isScheduled ? (holidayName || (approvedLeave?.leaveType ?? null)) : null,
          status
        });
      }
    }

    const employeeSummaries = eligibleEmployees.map(employee => {
      const id = Number(employee.employeeId);
      const subset = days.filter(row => row.employeeId === id);
      return {
        employeeId: id,
        employeeName: employee.employeeName,
        department: employee.department || "Not assigned",
        ...countSummary(subset)
      };
    });

    return reply(200, {
      month,
      periodFrom: startDate,
      throughDate,
      generatedAt: new Date().toISOString(),
      summary: { employees: eligibleEmployees.length, ...countSummary(days) },
      employees: employeeSummaries,
      days: days.sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName))
    });
  } catch (error) {
    console.error("Monthly report failed:", { code: error.code || "UNKNOWN", sqlState: error.sqlState || null });
    return reply(500, { message: "Unable to generate monthly attendance report." });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
