
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

function reply(statusCode, data) {
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

  return groups.map(g => g.trim()).includes("manager");
}

function getBahrainDate() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date()).map(
      ({ type, value }) => [type, value]
    )
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validDate(text) {
  if (typeof text !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  const date = new Date(`${text}T12:00:00Z`);

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === text;
}

function validTime(text) {
  if (typeof text !== "string") return false;
  if (!/^\d{2}:\d{2}$/.test(text)) return false;

  const [hour, minute] = text.split(":").map(Number);

  return hour >= 0 && hour <= 23 &&
    minute >= 0 && minute <= 59;
}

export const handler = async event => {
  const claims =
    event.requestContext?.authorizer?.jwt?.claims;

  if (
    !claims?.sub ||
    claims.token_use !== "access" ||
    !isManager(claims)
  ) {
    return reply(403, {
      message: "Manager authorization required."
    });
  }

  const route = event.routeKey;

  const isList = route === "GET /manager/schedules";

  const isSave =
    route === "PUT /manager/schedules/{employeeId}";

  if (!isList && !isSave) {
    return reply(404, { message: "Unknown route." });
  }

  let employeeId;
  let schedule;

  if (isSave) {
    employeeId = Number(event.pathParameters?.employeeId);

    if (
      !Number.isSafeInteger(employeeId) ||
      employeeId < 1
    ) {
      return reply(400, {
        message: "Invalid employee ID."
      });
    }

    try {
      schedule = JSON.parse(event.body || "{}");
    } catch {
      return reply(400, {
        message: "Invalid JSON request."
      });
    }

    const {
      effectiveFrom,
      workDays,
      startTime,
      endTime,
      graceMinutes
    } = schedule;

    if (
      !validDate(effectiveFrom) ||
      effectiveFrom < getBahrainDate()
    ) {
      return reply(400, {
        message: "Effective date must be today or later."
      });
    }

    if (
      !Array.isArray(workDays) ||
      workDays.length > 7 ||
      !workDays.every(
        day => Number.isInteger(day) &&
          day >= 0 && day <= 6
      ) ||
      new Set(workDays).size !== workDays.length
    ) {
      return reply(400, {
        message: "Select valid workdays."
      });
    }

    // Overnight shifts are not supported in this version.
    if (
      !validTime(startTime) ||
      !validTime(endTime) ||
      startTime >= endTime
    ) {
      return reply(400, {
        message:
          "Enter valid shift times with Check-Out after Check-In."
      });
    }

    if (
      !Number.isInteger(graceMinutes) ||
      graceMinutes < 0 ||
      graceMinutes > 60
    ) {
      return reply(400, {
        message: "Grace period must be 0–60 minutes."
      });
    }
  }

  if (
    !process.env.DB_HOST ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD
  ) {
    return reply(500, {
      message: "Database configuration is incomplete."
    });
  }

  let db;
  let transactionStarted = false;

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

    // GET: Load registered employees and their latest
    // saved weekly schedule, including future changes.
    if (isList) {
      const [rows] = await db.query(`
        SELECT
          e.id AS employeeId,
          e.full_name AS employeeName,
          e.department,

          DATE_FORMAT(
            s.effective_from, '%Y-%m-%d'
          ) AS effectiveFrom,

          s.weekday,
          s.is_workday AS isWorkday,

          TIME_FORMAT(
            s.start_time, '%H:%i'
          ) AS startTime,

          TIME_FORMAT(
            s.end_time, '%H:%i'
          ) AS endTime,

          s.grace_minutes AS graceMinutes

        FROM employees e

        LEFT JOIN employee_work_schedules s
          ON s.employee_id = e.id

        ORDER BY
          e.id,
          s.effective_from DESC,
          s.weekday ASC
      `);

      const employees = new Map();

      for (const row of rows) {
        const id = Number(row.employeeId);

        if (!employees.has(id)) {
          employees.set(id, {
            employeeId: id,
            employeeName: row.employeeName,
            department: row.department,
            effectiveFrom: null,
            startTime: null,
            endTime: null,
            graceMinutes: 10,
            workDays: []
          });
        }

        const employee = employees.get(id);

        if (!row.effectiveFrom) continue;

        if (!employee.effectiveFrom) {
          employee.effectiveFrom = row.effectiveFrom;
          employee.startTime = row.startTime;
          employee.endTime = row.endTime;
          employee.graceMinutes =
            Number(row.graceMinutes);
        }

        if (
          employee.effectiveFrom === row.effectiveFrom &&
          Number(row.isWorkday) === 1
        ) {
          employee.workDays.push(Number(row.weekday));
        }
      }

      return reply(200, {
        employees: Array.from(employees.values())
      });
    }

    // PUT: Save a complete weekly schedule for
    // the selected employee and effective date.
    const [found] = await db.execute(
      "SELECT id FROM employees WHERE id = ? LIMIT 1",
      [employeeId]
    );

    if (!found.length) {
      return reply(404, {
        message: "Employee not found in MySQL."
      });
    }

    await db.beginTransaction();
    transactionStarted = true;

    for (let weekday = 0; weekday < 7; weekday++) {
      const isWorkday =
        schedule.workDays.includes(weekday) ? 1 : 0;

      await db.execute(
        `
        INSERT INTO employee_work_schedules (
          employee_id,
          effective_from,
          weekday,
          is_workday,
          start_time,
          end_time,
          grace_minutes,
          updated_by_sub
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE
          is_workday = ?,
          start_time = ?,
          end_time = ?,
          grace_minutes = ?,
          updated_by_sub = ?
        `,
        [
          employeeId,
          schedule.effectiveFrom,
          weekday,
          isWorkday,
          schedule.startTime,
          schedule.endTime,
          schedule.graceMinutes,
          claims.sub,

          isWorkday,
          schedule.startTime,
          schedule.endTime,
          schedule.graceMinutes,
          claims.sub
        ]
      );
    }

    // Record who changed the weekly schedule.
    await db.execute(
      `
      INSERT INTO audit_logs (
        actor_cognito_sub,
        employee_id,
        action,
        result,
        details
      )
      VALUES (?, ?, 'schedule-updated', 'success', ?)
      `,
      [
        claims.sub,
        employeeId,
        JSON.stringify({
          effectiveFrom: schedule.effectiveFrom,
          workDays: schedule.workDays,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          graceMinutes: schedule.graceMinutes
        })
      ]
    );

    await db.commit();
    transactionStarted = false;

    return reply(200, {
      message: "Employee work schedule saved.",
      employeeId,
      effectiveFrom: schedule.effectiveFrom
    });

  } catch (error) {
    if (transactionStarted) {
      await db?.rollback().catch(() => {});
    }

    console.error("Schedule Lambda error:", {
      code: error.code || "UNKNOWN",
      sqlState: error.sqlState || null
    });

    return reply(500, {
      message: "Unable to process employee schedules."
    });

  } finally {
    if (db) {
      await db.end().catch(() => {});
    }
  }
};
