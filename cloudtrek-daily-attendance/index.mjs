
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

function response(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  };
}

function isManager(claims) {
  const raw = claims?.["cognito:groups"] || "";

  const groups = Array.isArray(raw)
    ? raw
    : String(raw).replace(/[\[\]"]/g, "").split(",");

  return groups.map(group => group.trim())
    .includes("manager");
}

function todayBahrain() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date())
      .map(({ type, value }) => [type, value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isValidDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(`${value}T12:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function toISO(value) {
  if (!value) return null;

  // MySQL DATE_FORMAT produces six decimal digits.
  // Keep milliseconds and mark the value as UTC.
  return `${String(value).slice(0, 23)}Z`;
}

// Schedules are defined in Bahrain local time (UTC+03:00).
function shiftTimestamp(date, time) {
  return new Date(`${date}T${time}:00+03:00`).getTime();
}

function calculateStatus(row, date, now) {
  const checkInAt = toISO(row.checkInUTC);
  const checkOutAt = toISO(row.checkOutUTC);

  const hasSchedule = row.weekday !== null;
  const isWorkday = Number(row.isWorkday) === 1;

  let status;
  let scheduled = false;

  if (!hasSchedule) {
    status = checkInAt
      ? "Recorded (No Schedule)"
      : "No Schedule";

  } else if (!isWorkday) {
    status = checkInAt
      ? "Unscheduled Check-In"
      : "Not Scheduled";

  } else {
    scheduled = true;

    const start = shiftTimestamp(date, row.startTime);
    const end = shiftTimestamp(date, row.endTime);

    const graceMinutes = Number(row.graceMinutes) || 0;
    const lateThreshold = start + graceMinutes * 60000;

    if (checkInAt) {
      const actualCheckIn = new Date(checkInAt).getTime();

      status = actualCheckIn > lateThreshold
        ? "Late"
        : "Present";

    } else if (now < start) {
      status = "Upcoming";

    } else if (now < end) {
      status = "Awaiting Check-In";

    } else {
      status = "Absent";
    }
  }

  return {
    employeeId: Number(row.employeeId),
    employeeName: row.employeeName,
    department: row.department || "Not assigned",
    date,
    scheduled,
    shiftStart: row.startTime,
    shiftEnd: row.endTime,
    graceMinutes:
      hasSchedule ? Number(row.graceMinutes) : null,
    checkInAt,
    checkOutAt,
    durationSeconds:
      row.durationSeconds == null
        ? null
        : Math.max(0, Number(row.durationSeconds)),
    status
  };
}

export const handler = async event => {
  const claims =
    event.requestContext?.authorizer?.jwt?.claims;

  // Require a verified manager access token.
  if (
    !claims?.sub ||
    claims.token_use !== "access" ||
    !isManager(claims)
  ) {
    return response(403, {
      message: "Manager authorization required."
    });
  }

  if (
    event.routeKey !== "GET /manager/daily-attendance"
  ) {
    return response(404, {
      message: "Unknown route."
    });
  }

  const date =
    event.queryStringParameters?.date || todayBahrain();

  if (!isValidDate(date)) {
    return response(400, {
      message: "Date must use YYYY-MM-DD format."
    });
  }

  if (
    !process.env.DB_HOST ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD
  ) {
    return response(500, {
      message: "Database configuration is incomplete."
    });
  }

  let db;

  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database:
        process.env.DB_NAME || "cloudtrek_attendance",
      timezone: "Z",
      connectTimeout: 10000,
      ssl: {
        ca: readFileSync(
          new URL("./global-bundle.pem", import.meta.url)
        ),
        rejectUnauthorized: true
      }
    });

    await db.query("SET time_zone = '+00:00'");

    // Sunday = 0, Monday = 1, ... Saturday = 6.
    const weekday = new Date(
      `${date}T12:00:00Z`
    ).getUTCDay();

    // Use the schedule version that was effective
    // on the requested date, not a future version.
    const [rows] = await db.execute(
      `
      SELECT
        e.id AS employeeId,
        e.full_name AS employeeName,
        e.department,

        s.weekday,
        s.is_workday AS isWorkday,

        TIME_FORMAT(
          s.start_time, '%H:%i'
        ) AS startTime,

        TIME_FORMAT(
          s.end_time, '%H:%i'
        ) AS endTime,

        s.grace_minutes AS graceMinutes,

        DATE_FORMAT(
          a.check_in_at,
          '%Y-%m-%dT%H:%i:%s.%f'
        ) AS checkInUTC,

        DATE_FORMAT(
          a.check_out_at,
          '%Y-%m-%dT%H:%i:%s.%f'
        ) AS checkOutUTC,

        TIMESTAMPDIFF(
          SECOND,
          a.check_in_at,
          a.check_out_at
        ) AS durationSeconds

      FROM employees e

      LEFT JOIN employee_work_schedules s
        ON s.employee_id = e.id
        AND s.weekday = ?
        AND s.effective_from = (
          SELECT MAX(s2.effective_from)
          FROM employee_work_schedules s2
          WHERE s2.employee_id = e.id
            AND s2.effective_from <= ?
        )

      LEFT JOIN attendance_records a
        ON a.employee_id = e.id
        AND a.work_date = ?

      ORDER BY e.full_name ASC
      `,
      [weekday, date, date]
    );

    const now = Date.now();

    const employees = rows.map(row =>
      calculateStatus(row, date, now)
    );

    const countStatus = status =>
      employees.filter(
        employee => employee.status === status
      ).length;

    const summary = {
      totalEmployees: employees.length,

      scheduledEmployees: employees.filter(
        employee => employee.scheduled
      ).length,

      present: countStatus("Present"),
      late: countStatus("Late"),
      absent: countStatus("Absent"),

      awaitingCheckIn:
        countStatus("Awaiting Check-In"),

      upcoming: countStatus("Upcoming"),

      notScheduled: countStatus("Not Scheduled"),
      noSchedule: countStatus("No Schedule"),

      unscheduledCheckIns:
        countStatus("Unscheduled Check-In"),

      recordedWithoutSchedule:
        countStatus("Recorded (No Schedule)")
    };

    return response(200, {
      message: "Daily attendance calculated.",
      date,
      summary,
      employees
    });

  } catch (error) {
    console.error("Daily attendance error:", {
      code: error.code || "UNKNOWN",
      sqlState: error.sqlState || null
    });

    return response(500, {
      message: "Unable to calculate daily attendance."
    });

  } finally {
    if (db) {
      await db.end().catch(() => {});
    }
  }
};
