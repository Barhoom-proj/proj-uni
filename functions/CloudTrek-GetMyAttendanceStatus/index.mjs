import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const respond = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});

function isEmployee(claims) {
  const raw = claims?.["cognito:groups"] || "";
  const groups = Array.isArray(raw)
    ? raw
    : String(raw).replace(/[\[\]"]/g, "").split(",");
  return groups.map(group => group.trim()).includes("employee");
}

function bahrainToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date()).map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function iso(value) {
  return value ? `${String(value).slice(0, 23)}Z` : null;
}

function shiftAt(date, time) {
  // Bahrain uses UTC+03:00 year-round. No overnight shifts in this version.
  return new Date(`${date}T${time}:00+03:00`).getTime();
}

export const handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub || claims.token_use !== "access" || !isEmployee(claims)) {
    return respond(403, { message: "Employee authorization required." });
  }
  if (event.routeKey !== "GET /attendance/my-status") {
    return respond(404, { message: "Unknown route." });
  }

  const days = Number(event.queryStringParameters?.days ?? 90);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return respond(400, { message: "days must be an integer between 1 and 90." });
  }

  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    return respond(500, { message: "Database configuration is incomplete." });
  }

  const today = bahrainToday();
  const base = new Date(`${today}T12:00:00Z`);
  const dates = Array.from({ length: days }, (_, index) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - index);
    return d.toISOString().slice(0, 10);
  });
  const from = dates[dates.length - 1];
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

    // Employee identity is derived only from verified Cognito claims.
    const [employees] = await db.execute(
      "SELECT id FROM employees WHERE cognito_sub = ? LIMIT 1",
      [claims.sub]
    );
    if (employees.length === 0) {
      return respond(404, { message: "Employee has no MySQL profile." });
    }
    const employeeId = employees[0].id;

    const [schedules] = await db.execute(`
      SELECT DATE_FORMAT(effective_from, '%Y-%m-%d') AS effectiveFrom,
             weekday, is_workday AS isWorkday,
             TIME_FORMAT(start_time, '%H:%i') AS startTime,
             TIME_FORMAT(end_time, '%H:%i') AS endTime,
             grace_minutes AS graceMinutes
      FROM employee_work_schedules
      WHERE employee_id = ? AND effective_from <= ?
      ORDER BY effective_from DESC, weekday ASC
    `, [employeeId, today]);

    const [records] = await db.execute(`
      SELECT id, DATE_FORMAT(work_date, '%Y-%m-%d') AS workDate,
             DATE_FORMAT(check_in_at, '%Y-%m-%dT%H:%i:%s.%f') AS checkInUTC,
             DATE_FORMAT(check_out_at, '%Y-%m-%dT%H:%i:%s.%f') AS checkOutUTC,
             TIMESTAMPDIFF(SECOND, check_in_at, check_out_at) AS durationSeconds
      FROM attendance_records
      WHERE employee_id = ? AND work_date BETWEEN ? AND ?
    `, [employeeId, from, today]);

    const [leaveRows] = await db.execute(`
      SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
             DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate,
             leave_type AS leaveType
      FROM employee_leave_requests
      WHERE employee_id = ? AND status = 'approved'
        AND start_date <= ? AND end_date >= ?
    `, [employeeId, today, from]);
    const [holidayRows] = await db.execute(`
      SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date,
             holiday_name AS name
      FROM public_holidays WHERE holiday_date BETWEEN ? AND ?
    `, [from, today]);
    const holidayByDate = new Map(holidayRows.map(row => [row.date, row.name]));

    const byDate = new Map(records.map(r => [r.workDate, r]));
    const versions = [...new Set(schedules.map(s => s.effectiveFrom))]
      .sort().reverse();
    const now = Date.now();

    const daily = dates.map(date => {
      const record = byDate.get(date);
      const checkInAt = iso(record?.checkInUTC);
      const checkOutAt = iso(record?.checkOutUTC);
      const activeVersion = versions.find(version => version <= date);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const schedule = schedules.find(s =>
        s.effectiveFrom === activeVersion && Number(s.weekday) === weekday
      );
      const workday = schedule && Number(schedule.isWorkday) === 1;
      const holidayName = holidayByDate.get(date) || null;
      const approvedLeave = leaveRows.find(row => row.startDate <= date && row.endDate >= date);
      let status;

      if (!schedule) {
        status = checkInAt ? "Recorded (No Schedule)" : "No Schedule";
      } else if (!workday) {
        status = checkInAt ? "Unscheduled Check-In" : "Not Scheduled";
      } else if (holidayName) {
        status = checkInAt ? "Worked on Holiday" : "Holiday";
      } else if (approvedLeave) {
        status = checkInAt ? "Check-In During Leave" : "On Leave";
      } else if (checkInAt) {
        const threshold = shiftAt(date, schedule.startTime) +
          Number(schedule.graceMinutes) * 60_000;
        status = new Date(checkInAt).getTime() > threshold ? "Late" : "Present";
      } else if (now < shiftAt(date, schedule.startTime)) {
        status = "Upcoming";
      } else if (now < shiftAt(date, schedule.endTime)) {
        status = "Awaiting Check-In";
      } else {
        status = "Absent";
      }

      return {
        date,
        attendanceId: record ? Number(record.id) : null,
        checkInAt,
        checkOutAt,
        durationSeconds: record?.durationSeconds == null
          ? null : Math.max(0, Number(record.durationSeconds)),
        scheduled: Boolean(workday),
        shiftStart: workday ? schedule.startTime : null,
        shiftEnd: workday ? schedule.endTime : null,
        graceMinutes: workday ? Number(schedule.graceMinutes) : null,
        exceptionLabel: workday ? (holidayName || (approvedLeave?.leaveType ?? null)) : null,
        status
      };
    });

    const count = status => daily.filter(row => row.status === status).length;
    return respond(200, {
      message: "Employee attendance statuses retrieved.",
      from, to: today, days,
      summary: {
        present: count("Present"),
        late: count("Late"),
        absent: count("Absent"),
        onLeave: count("On Leave"),
        holidays: count("Holiday"),
        workedOnHoliday: count("Worked on Holiday"),
        checkInsDuringLeave: count("Check-In During Leave"),
        awaitingCheckIn: count("Awaiting Check-In"),
        upcoming: count("Upcoming"),
        scheduledDays: daily.filter(row => row.scheduled).length,
        recordedHours: Math.round(
          daily.reduce((total, row) => total + (row.durationSeconds || 0), 0)
          / 3600 * 100
        ) / 100
      },
      records: daily
    });
  } catch (error) {
    console.error("Employee status lookup error:", {
      code: error.code || "UNKNOWN", sqlState: error.sqlState || null
    });
    return respond(500, { message: "Unable to load attendance statuses." });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
