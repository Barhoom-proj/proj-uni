
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

// Standard API response
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

// Check authenticated employee role
function isEmployee(claims) {
  const raw = claims?.["cognito:groups"] || "";

  const groups = Array.isArray(raw)
    ? raw
    : String(raw).replace(/[\[\]"]/g, "").split(",");

  return groups
    .map(group => group.trim())
    .includes("employee");
}

// Main Lambda handler
export const handler = async event => {
  // Get authenticated identity from API Gateway
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

  // Check database configuration
  if (
    !process.env.DB_HOST ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD
  ) {
    return response(500, {
      message: "Database configuration is incomplete."
    });
  }

  // Parse request body
  let request;

  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return response(400, {
      message: "Invalid request format."
    });
  }

  // Validate attendance ID and correction reason
  const attendanceId = Number(request.attendanceId);

  const reason =
    typeof request.reason === "string"
      ? request.reason.trim()
      : "";

  if (
    !Number.isSafeInteger(attendanceId) ||
    attendanceId <= 0
  ) {
    return response(400, {
      message: "A valid attendance record is required."
    });
  }

  if (reason.length < 10 || reason.length > 1000) {
    return response(400, {
      message: "Reason must contain 10 to 1000 characters."
    });
  }

  let db;
  let transactionStarted = false;

  try {
    // Connect to Amazon RDS MySQL
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

    // Find employee using verified Cognito identity
    const [employees] = await db.execute(
      `SELECT id
       FROM employees
       WHERE cognito_sub = ?
       LIMIT 1`,
      [claims.sub]
    );

    if (!employees.length) {
      return response(403, {
        message: "Employee is not registered."
      });
    }

    const employeeId = employees[0].id;

    // Begin database transaction
    await db.beginTransaction();
    transactionStarted = true;

    // Verify the employee owns this attendance record
    const [attendance] = await db.execute(
      `SELECT id
       FROM attendance_records
       WHERE id = ?
         AND employee_id = ?
       FOR UPDATE`,
      [attendanceId, employeeId]
    );

    if (!attendance.length) {
      await db.rollback();
      transactionStarted = false;

      return response(404, {
        message: "Attendance record not found."
      });
    }

    // Prevent duplicate pending correction requests
    const [pending] = await db.execute(
      `SELECT id
       FROM attendance_correction_requests
       WHERE attendance_id = ?
         AND status = 'pending'
       LIMIT 1`,
      [attendanceId]
    );

    if (pending.length) {
      await db.rollback();
      transactionStarted = false;

      return response(409, {
        message:
          "A correction request is already pending for this record."
      });
    }

    // Insert a new pending correction request
    const [result] = await db.execute(
      `INSERT INTO attendance_correction_requests
       (
         attendance_id,
         employee_id,
         reason,
         status
       )
       VALUES (?, ?, ?, 'pending')`,
      [attendanceId, employeeId, reason]
    );

    // Record the action in the audit logs
    await db.execute(
      `INSERT INTO audit_logs
       (
         actor_cognito_sub,
         employee_id,
         action,
         result,
         details
       )
       VALUES (
         ?, ?,
         'correction-request',
         'success',
         ?
       )`,
      [
        claims.sub,
        employeeId,
        JSON.stringify({
          correctionRequestId: result.insertId,
          attendanceId
        })
      ]
    );

    // Save database changes
    await db.commit();
    transactionStarted = false;

    return response(201, {
      message: "Correction request submitted successfully.",
      requestId: result.insertId,
      attendanceId,
      status: "pending"
    });

  } catch (error) {
    if (transactionStarted) {
      await db?.rollback().catch(() => {});
    }

    console.error("Correction request error:", {
      code: error.code || "UNKNOWN",
      sqlState: error.sqlState || null
    });

    return response(500, {
      message: "Unable to submit correction request."
    });

  } finally {
    if (db) {
      await db.end().catch(() => {});
    }
  }
};
