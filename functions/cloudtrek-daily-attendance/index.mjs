import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const reply = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});

function isManager(claims) {
  const raw = claims?.["cognito:groups"] || [];
  return (Array.isArray(raw) ? raw : String(raw).replace(/[\[\]"]/g, "").split(","))
    .map(s => s.trim()).includes("manager");
}

function bahrainToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date()).map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const iso = value => value ? `${String(value).slice(0, 23)}Z` : null;
const shiftAt = (date, time) => new Date(`${date}T${time}:00+03:00`).getTime();

function classify(row, date, now) {
  const checkInAt = iso(row.checkInUTC);
  const checkOutAt = iso(row.checkOutUTC);
  const hasSchedule = row.weekday !== null;
  const scheduled = hasSchedule && Number(row.isWorkday) === 1;
  const holidayName = row.holidayName || null;
  const approvedLeave = row.approvedLeaveType || null;
  let status;
  if (!hasSchedule) {
    status = checkInAt ? "Recorded (No Schedule)" : "No Schedule";
  } else if (!scheduled) {
    status = checkInAt ? "Unscheduled Check-In" : "Not Scheduled";
  } else if (holidayName) {
    status = checkInAt ? "Worked on Holiday" : "Holiday";
  } else if (approvedLeave) {
    status = checkInAt ? "Check-In During Leave" : "On Leave";
  } else if (checkInAt) {
    const threshold = shiftAt(date, row.startTime) + Number(row.graceMinutes) * 60000;
    status = new Date(checkInAt).getTime() > threshold ? "Late" : "Present";
  } else if (now < shiftAt(date, row.startTime)) {
    status = "Upcoming";
  } else if (now < shiftAt(date, row.endTime)) {
    status = "Awaiting Check-In";
  } else {
    status = "Absent";
  }
  return {
    employeeId: Number(row.employeeId),
    employeeName: row.employeeName,
    department: row.department || "Not assigned",
    date, scheduled,
    shiftStart: scheduled ? row.startTime : null,
    shiftEnd: scheduled ? row.endTime : null,
    graceMinutes: scheduled ? Number(row.graceMinutes) : null,
    checkInAt, checkOutAt,
    durationSeconds: row.durationSeconds == null ? null : Math.max(0, Number(row.durationSeconds)),
    exceptionLabel: scheduled ? (holidayName || approvedLeave) : null,
    status
  };
}

export const handler = async event => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub || claims.token_use !== "access" || !isManager(claims)) {
    return reply(403, { message: "Manager authorization required." });
  }
  if (event.routeKey !== "GET /manager/daily-attendance") {
    return reply(404, { message: "Unknown route." });
  }
  const date = event.queryStringParameters?.date || bahrainToday();
  if (!validDate(date)) return reply(400, { message: "Use YYYY-MM-DD for date." });
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    return reply(500, { message: "Database configuration is incomplete." });
  }
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  let db;
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, port: 3306,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || "cloudtrek_attendance", timezone: "Z",
      connectTimeout: 10000,
      ssl: { ca: readFileSync(new URL("./global-bundle.pem", import.meta.url)), rejectUnauthorized: true }
    });
    await db.query("SET time_zone = '+00:00'");
    const [rows] = await db.execute(`
      SELECT e.id AS employeeId, e.full_name AS employeeName, e.department,
        s.weekday, s.is_workday AS isWorkday,
        TIME_FORMAT(s.start_time, '%H:%i') AS startTime,
        TIME_FORMAT(s.end_time, '%H:%i') AS endTime,
        s.grace_minutes AS graceMinutes,
        DATE_FORMAT(a.check_in_at, '%Y-%m-%dT%H:%i:%s.%f') AS checkInUTC,
        DATE_FORMAT(a.check_out_at, '%Y-%m-%dT%H:%i:%s.%f') AS checkOutUTC,
        TIMESTAMPDIFF(SECOND, a.check_in_at, a.check_out_at) AS durationSeconds,
        h.holiday_name AS holidayName,
        (SELECT lr.leave_type FROM employee_leave_requests lr
         WHERE lr.employee_id = e.id AND lr.status = 'approved'
           AND ? BETWEEN lr.start_date AND lr.end_date
         ORDER BY lr.id DESC LIMIT 1) AS approvedLeaveType
      FROM employees e
      LEFT JOIN employee_work_schedules s
        ON s.employee_id = e.id AND s.weekday = ?
        AND s.effective_from = (
          SELECT MAX(s2.effective_from) FROM employee_work_schedules s2
          WHERE s2.employee_id = e.id AND s2.effective_from <= ?
        )
      LEFT JOIN attendance_records a
        ON a.employee_id = e.id AND a.work_date = ?
      LEFT JOIN public_holidays h ON h.holiday_date = ?
      ORDER BY e.full_name ASC
    `, [date, weekday, date, date, date]);
    const employees = rows.map(row => classify(row, date, Date.now()));
    const count = status => employees.filter(employee => employee.status === status).length;
    return reply(200, {
      message: "Daily attendance calculated.", date,
      summary: {
        totalEmployees: employees.length,
        scheduledEmployees: employees.filter(row => row.scheduled).length,
        present: count("Present"), late: count("Late"), absent: count("Absent"),
        onLeave: count("On Leave"), holidays: count("Holiday"),
        workedOnHoliday: count("Worked on Holiday"),
        checkInsDuringLeave: count("Check-In During Leave"),
        awaitingCheckIn: count("Awaiting Check-In"), upcoming: count("Upcoming"),
        notScheduled: count("Not Scheduled"), noSchedule: count("No Schedule"),
        unscheduledCheckIns: count("Unscheduled Check-In"),
        recordedWithoutSchedule: count("Recorded (No Schedule)")
      },
      employees
    });
  } catch (error) {
    console.error("Daily attendance error:", { code: error.code || "UNKNOWN", message: error.message });
    return reply(500, { message: "Unable to calculate daily attendance." });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
