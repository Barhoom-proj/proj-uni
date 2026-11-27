import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

// Standard HTTP API response
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

// Confirm the logged-in user belongs to the employee group
function isEmployee(claims) {
  const raw = claims?.["cognito:groups"] || "";

  const groups = Array.isArray(raw)
    ? raw
    : String(raw)
        .replace(/[\[\]"]/g, "")
        .split(",");

  return groups
    .map(group => group.trim())
    .includes("employee");
}

// Convert MySQL UTC datetime text to an ISO timestamp
function toISO(value) {
  if (!value) return null;

  return `${String(value).slice(0, 23)}Z`;
}

export const handler = async event => {
  const claims =
    event.requestContext?.authorizer?.jwt?.claims;

  // Require a validated Cognito employee access token
  if (
    !claims?.sub ||
    claims.token_use !== "access" ||
    !isEmployee(claims)
  ) {
    return response(403, {
      message: "Employee authorization required."
    });
  }

  // Only permit retrieving correction requests
  if (event.routeKey !== "GET /attendance/corrections") {
    return response(404, {
      message: "Unknown route."
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

    // Consistent UTC handling for MySQL TIMESTAMP columns
    await db.query("SET time_zone = '+00:00'");

    // Retrieve only requests belonging to this employee.
    // The employee identity comes from Cognito, never
    // from an employee ID supplied by the frontend.
    const [rows] = await db.execute(
      `
      SELECT
        c.id,
        c.attendance_id AS attendanceId,
        c.reason,
        c.status,
        c.manager_note AS managerNote,

        DATE_FORMAT(
          c.created_at,
          '%Y-%m-%dT%H:%i:%s.%f'
        ) AS createdUTC,

        DATE_FORMAT(
          c.reviewed_at,
          '%Y-%m-%dT%H:%i:%s.%f'
        ) AS reviewedUTC,

        DATE_FORMAT(
          a.work_date,
          '%Y-%m-%d'
        ) AS workDate,

        DATE_FORMAT(
          a.check_in_at,
          '%Y-%m-%dT%H:%i:%s.%f'
        ) AS checkInUTC,

        DATE_FORMAT(
          a.check_out_at,
          '%Y-%m-%dT%H:%i:%s.%f'
        ) AS checkOutUTC

      FROM attendance_correction_requests c

      INNER JOIN employees e
        ON e.id = c.employee_id

      INNER JOIN attendance_records a
        ON a.id = c.attendance_id
        AND a.employee_id = c.employee_id

      WHERE e.cognito_sub = ?

      ORDER BY c.created_at DESC, c.id DESC

      LIMIT 100
      `,
      [claims.sub]
    );

    const requests = rows.map(row => ({
      id: row.id,
      attendanceId: row.attendanceId,
      date: row.workDate,
      reason: row.reason,
      status: row.status,
      managerNote: row.managerNote,
      createdAt: toISO(row.createdUTC),
      reviewedAt: toISO(row.reviewedUTC),
      checkInAt: toISO(row.checkInUTC),
      checkOutAt: toISO(row.checkOutUTC)
    }));

    return response(200, {
      message: "Correction requests retrieved.",
      requests,
      count: requests.length
    });

  } catch (error) {
    console.error("Get correction requests failed:", {
      code: error.code || "UNKNOWN",
      sqlState: error.sqlState || null
    });

    return response(500, {
      message: "Unable to retrieve correction requests."
    });

  } finally {
    if (db) {
      await db.end().catch(() => {});
    }
  }
};