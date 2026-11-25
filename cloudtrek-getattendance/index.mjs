
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

// Convert a MySQL UTC datetime into ISO format.
function toISO(value) {
  if (!value) return null;

  // MySQL DATE_FORMAT returns six fractional digits.
  // JavaScript ISO format uses three.
  return `${value.slice(0, 23)}Z`;
}

export const handler = async event => {
  // Get identity verified by API Gateway.
  const claims =
    event.requestContext?.authorizer?.jwt?.claims;

  if (
    !claims?.sub ||
    claims.token_use !== "access" ||
    !isEmployee(claims)
  ) {
    return response(403, {
      message: "Employee authorization required."
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

    // Find the employee using their Cognito ID.
    const [employees] = await connection.execute(
      `SELECT id
       FROM employees
       WHERE cognito_sub = ?
       LIMIT 1`,
      [claims.sub]
    );

    if (!employees.length) {
      return response(404, {
        message: "Employee is not registered."
      });
    }

    // Get this employee's latest 100 records.
    // Timestamps were originally saved in UTC.
    const [rows] = await connection.execute(
      `SELECT
         id,
         DATE_FORMAT(
           work_date, '%Y-%m-%d'
         ) AS workDate,
         DATE_FORMAT(
           check_in_at, '%Y-%m-%dT%H:%i:%s.%f'
         ) AS checkInUTC,
         DATE_FORMAT(
           check_out_at, '%Y-%m-%dT%H:%i:%s.%f'
         ) AS checkOutUTC,
         TIMESTAMPDIFF(
           SECOND, check_in_at, check_out_at
         ) AS durationSeconds
       FROM attendance_records
       WHERE employee_id = ?
       ORDER BY work_date DESC, check_in_at DESC
       LIMIT 100`,
      [employees[0].id]
    );

    const records = rows.map(row => ({
      id: row.id,
      date: row.workDate,
      checkInAt: toISO(row.checkInUTC),
      checkOutAt: toISO(row.checkOutUTC),
      durationSeconds:
        row.durationSeconds === null
          ? null
          : Math.max(0, Number(row.durationSeconds)),
      status: row.checkOutUTC
        ? "Completed"
        : "Checked In"
    }));

    return response(200, {
      message: "Attendance history retrieved.",
      records,
      count: records.length
    });

  } catch (error) {
    console.error("History query failed:", {
      code: error.code || "UNKNOWN",
      sqlState: error.sqlState || null
    });

    return response(500, {
      message: "Unable to retrieve attendance history."
    });

  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
};
