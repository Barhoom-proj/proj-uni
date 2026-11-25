
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

// Check whether the authenticated user is a manager.
function isManager(claims) {
  const raw = claims?.["cognito:groups"] || "";

  const groups = Array.isArray(raw)
    ? raw
    : String(raw).replace(/[\[\]"]/g, "").split(",");

  return groups
    .map(group => group.trim())
    .includes("manager");
}

// MySQL timestamps were stored in UTC.
// Return ISO 8601 timestamps for React.
function toISO(value) {
  if (!value) return null;
  return `${value.slice(0, 23)}Z`;
}

export const handler = async (event) => {
  // API Gateway provides verified Cognito claims.
  const claims =
    event.requestContext?.authorizer?.jwt?.claims;

  // Only manager accounts may read team attendance.
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
    !process.env.DB_HOST ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD
  ) {
    return response(500, {
      message: "Database configuration is incomplete."
    });
  }

  let connection;

  try {
    // Connect to RDS MySQL.
    connection = await mysql.createConnection({
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

    // Get registered employee count.
    const [employeeCountRows] = await connection.query(
      "SELECT COUNT(*) AS total FROM employees"
    );

    // Retrieve recent attendance records with names.
    const [rows] = await connection.query(`
      SELECT
        a.id,
        e.id AS employeeId,
        e.full_name AS employeeName,
        e.department,
        DATE_FORMAT(
          a.work_date, '%Y-%m-%d'
        ) AS workDate,
        DATE_FORMAT(
          a.check_in_at, '%Y-%m-%dT%H:%i:%s.%f'
        ) AS checkInUTC,
        DATE_FORMAT(
          a.check_out_at, '%Y-%m-%dT%H:%i:%s.%f'
        ) AS checkOutUTC,
        TIMESTAMPDIFF(
          SECOND, a.check_in_at, a.check_out_at
        ) AS durationSeconds
      FROM attendance_records a
      INNER JOIN employees e
        ON a.employee_id = e.id
      ORDER BY a.work_date DESC, a.check_in_at DESC
      LIMIT 200
    `);

    const records = rows.map(row => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      department: row.department || "Not assigned",
      date: row.workDate,
      checkInAt: toISO(row.checkInUTC),
      checkOutAt: toISO(row.checkOutUTC),
      durationSeconds:
        row.durationSeconds == null
          ? null
          : Math.max(0, Number(row.durationSeconds)),
      status: row.checkOutUTC
        ? "Completed"
        : "Checked In"
    }));

    return response(200, {
      message: "Manager attendance retrieved.",
      employeeCount: Number(employeeCountRows[0].total),
      records,
      count: records.length
    });

  } catch (error) {
    console.error("Manager attendance query failed:", {
      code: error.code || "UNKNOWN",
      sqlState: error.sqlState || null
    });

    return response(500, {
      message: "Unable to retrieve manager attendance."
    });

  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
};
