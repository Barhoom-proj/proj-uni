import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const response = (statusCode, data) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(data)
});

class ApiError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

function groups(claims) {
  const raw = claims?.["cognito:groups"] || [];
  return (Array.isArray(raw) ? raw : String(raw).replace(/[\[\]"]/g, "").split(","))
    .map(v => String(v).trim());
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    && Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100;
}

function diffDays(start, end) {
  return (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000 + 1;
}

function dateSQL(column) { return `DATE_FORMAT(${column}, '%Y-%m-%d')`; }

async function connect() {
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    throw new Error("Missing database environment variables");
  }
  const db = await mysql.createConnection({
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
  return db;
}

function bodyJSON(event) {
  try {
    const text = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "{}");
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error();
    return parsed;
  } catch { throw new ApiError(400, "Provide a valid JSON request body."); }
}

function leaveRowsQuery(where = "1=1") {
  return `SELECT lr.id, lr.employee_id AS employeeId,
      e.full_name AS employeeName, e.department,
      lr.leave_type AS leaveType,
      ${dateSQL("lr.start_date")} AS startDate,
      ${dateSQL("lr.end_date")} AS endDate,
      lr.reason, lr.status, lr.manager_note AS managerNote,
      lr.reviewed_by_sub AS reviewedBySub,
      DATE_FORMAT(lr.reviewed_at, '%Y-%m-%dT%H:%i:%s.%f') AS reviewedAtUTC,
      DATE_FORMAT(lr.created_at, '%Y-%m-%dT%H:%i:%s.%f') AS createdAtUTC
    FROM employee_leave_requests lr
    JOIN employees e ON e.id = lr.employee_id
    WHERE ${where}
    ORDER BY FIELD(lr.status, 'pending', 'approved', 'rejected'), lr.created_at DESC
    LIMIT 500`;
}

async function logAction(db, actor, employeeId, action, detail) {
  await db.execute(
    `INSERT INTO audit_logs (actor_cognito_sub, employee_id, action, result, details)
     VALUES (?, ?, ?, 'success', ?)`,
    [actor, employeeId, action, JSON.stringify(detail)]
  );
}

async function employeeProfile(db, sub) {
  const [rows] = await db.execute(
    "SELECT id FROM employees WHERE cognito_sub = ? LIMIT 1", [sub]
  );
  if (!rows.length) throw new ApiError(404, "Your employee database profile was not found.");
  return rows[0].id;
}

async function getMine(db, sub) {
  const employeeId = await employeeProfile(db, sub);
  const [rows] = await db.execute(leaveRowsQuery("lr.employee_id = ?"), [employeeId]);
  return response(200, { requests: rows });
}

async function submitLeave(db, sub, event) {
  const { leaveType, startDate, endDate, reason } = bodyJSON(event);
  if (!["annual", "sick", "unpaid", "other"].includes(leaveType)) {
    throw new ApiError(400, "Choose annual, sick, unpaid, or other leave.");
  }
  if (!validDate(startDate) || !validDate(endDate) || diffDays(startDate, endDate) < 1
      || diffDays(startDate, endDate) > 90) {
    throw new ApiError(400, "Choose a valid inclusive date range of 1 to 90 days.");
  }
  if (typeof reason !== "string" || reason.trim().length < 10 || reason.trim().length > 1000) {
    throw new ApiError(400, "Reason must contain 10 to 1000 characters.");
  }

  const employeeId = await employeeProfile(db, sub);
  await db.beginTransaction();
  try {
    // Lock employee to serialize requests and approvals for the same person.
    await db.execute("SELECT id FROM employees WHERE id = ? FOR UPDATE", [employeeId]);
    const [duplicates] = await db.execute(
      `SELECT id FROM employee_leave_requests
       WHERE employee_id = ? AND status IN ('pending','approved')
         AND start_date <= ? AND end_date >= ? LIMIT 1`,
      [employeeId, endDate, startDate]
    );
    if (duplicates.length) throw new ApiError(409, "An existing pending or approved leave request overlaps those dates.");

    const [result] = await db.execute(
      `INSERT INTO employee_leave_requests
       (employee_id, leave_type, start_date, end_date, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [employeeId, leaveType, startDate, endDate, reason.trim()]
    );
    await logAction(db, sub, employeeId, "LEAVE_REQUEST_SUBMITTED", {
      leaveRequestId: result.insertId, leaveType, startDate, endDate
    });
    await db.commit();
    return response(201, { message: "Leave request submitted for manager review.", id: result.insertId });
  } catch (error) { await db.rollback(); throw error; }
}

async function reviewLeave(db, sub, event) {
  const id = Number(event.pathParameters?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, "Invalid leave request ID.");
  const { decision, managerNote = "" } = bodyJSON(event);
  if (!["approved", "rejected"].includes(decision)) {
    throw new ApiError(400, "Decision must be approved or rejected.");
  }
  if (typeof managerNote !== "string" || managerNote.trim().length > 500) {
    throw new ApiError(400, "Manager note must be at most 500 characters.");
  }
  if (decision === "rejected" && managerNote.trim().length < 5) {
    throw new ApiError(400, "Please provide a short reason when rejecting leave.");
  }

  // Find employee ID before locking: all transactions lock employees first.
  const [initial] = await db.execute(
    "SELECT employee_id AS employeeId FROM employee_leave_requests WHERE id = ?", [id]
  );
  if (!initial.length) throw new ApiError(404, "Leave request not found.");
  const employeeId = initial[0].employeeId;

  await db.beginTransaction();
  try {
    await db.execute("SELECT id FROM employees WHERE id = ? FOR UPDATE", [employeeId]);
    const [rows] = await db.execute(
      `SELECT id, status,
              ${dateSQL("start_date")} AS startDate,
              ${dateSQL("end_date")} AS endDate
       FROM employee_leave_requests WHERE id = ? AND employee_id = ? FOR UPDATE`,
      [id, employeeId]
    );
    if (!rows.length || rows[0].status !== "pending") {
      throw new ApiError(409, "This request is no longer pending.");
    }
    const row = rows[0];
    if (decision === "approved") {
      const [overlap] = await db.execute(
        `SELECT id FROM employee_leave_requests
         WHERE employee_id = ? AND id <> ? AND status = 'approved'
           AND start_date <= ? AND end_date >= ? LIMIT 1`,
        [employeeId, id, row.endDate, row.startDate]
      );
      if (overlap.length) throw new ApiError(409, "This employee already has approved leave for overlapping dates.");
      // Whole-day leave should not silently hide real attendance on the same day.
      const [attended] = await db.execute(
        `SELECT id FROM attendance_records
         WHERE employee_id = ? AND work_date BETWEEN ? AND ? LIMIT 1`,
        [employeeId, row.startDate, row.endDate]
      );
      if (attended.length) {
        throw new ApiError(409, "Attendance exists on a requested leave date. Review the attendance first.");
      }
    }
    await db.execute(
      `UPDATE employee_leave_requests
       SET status = ?, manager_note = ?, reviewed_by_sub = ?, reviewed_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [decision, managerNote.trim() || null, sub, id]
    );
    await logAction(db, sub, employeeId, "LEAVE_REQUEST_REVIEWED", { leaveRequestId: id, decision });
    await db.commit();
    return response(200, { message: `Leave request ${decision}.`, id });
  } catch (error) { await db.rollback(); throw error; }
}

async function holidays(db, year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw new ApiError(400, "Year must be between 2000 and 2100.");
  }
  const [rows] = await db.execute(
    `SELECT ${dateSQL("holiday_date")} AS date, holiday_name AS name
     FROM public_holidays WHERE holiday_date BETWEEN ? AND ?
     ORDER BY holiday_date ASC`,
    [`${y}-01-01`, `${y}-12-31`]
  );
  return response(200, { year: y, holidays: rows });
}

async function saveHoliday(db, sub, event) {
  const { date, name } = bodyJSON(event);
  if (!validDate(date)) throw new ApiError(400, "Enter a valid holiday date.");
  if (typeof name !== "string" || !name.trim() || name.trim().length > 150) {
    throw new ApiError(400, "Holiday name must contain 1 to 150 characters.");
  }
  await db.beginTransaction();
  try {
    await db.execute(
      `INSERT INTO public_holidays (holiday_date, holiday_name, created_by_sub)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE holiday_name = VALUES(holiday_name)`,
      [date, name.trim(), sub]
    );
    await logAction(db, sub, null, "HOLIDAY_SAVED", { date, name: name.trim() });
    await db.commit();
    return response(200, { message: "Holiday saved.", date });
  } catch (error) { await db.rollback(); throw error; }
}

async function deleteHoliday(db, sub, event) {
  const date = event.pathParameters?.date;
  if (!validDate(date)) throw new ApiError(400, "Invalid holiday date.");
  await db.beginTransaction();
  try {
    const [result] = await db.execute("DELETE FROM public_holidays WHERE holiday_date = ?", [date]);
    if (!result.affectedRows) throw new ApiError(404, "Holiday not found.");
    await logAction(db, sub, null, "HOLIDAY_DELETED", { date });
    await db.commit();
    return response(200, { message: "Holiday deleted.", date });
  } catch (error) { await db.rollback(); throw error; }
}

export const handler = async event => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const roles = groups(claims);
  if (!claims?.sub || claims.token_use !== "access") {
    return response(403, { message: "Cognito access token required." });
  }
  const route = event.routeKey || "";
  const employeeRoute = route.startsWith("GET /attendance/leave-") || route.startsWith("POST /attendance/leave-");
  const managerRoute = route.startsWith("GET /manager/") || route.startsWith("POST /manager/") || route.startsWith("PATCH /manager/") || route.startsWith("DELETE /manager/");
  if ((employeeRoute && !roles.includes("employee")) ||
      (managerRoute && !roles.includes("manager"))) {
    return response(403, { message: "Not authorized for this action." });
  }
  if (!employeeRoute && !managerRoute) return response(404, { message: "Unknown route." });

  let db;
  try {
    db = await connect();
    switch (route) {
      case "GET /attendance/leave-requests": return await getMine(db, claims.sub);
      case "POST /attendance/leave-requests": return await submitLeave(db, claims.sub, event);
      case "GET /manager/leave-requests": {
        const [rows] = await db.query(leaveRowsQuery());
        return response(200, { requests: rows });
      }
      case "PATCH /manager/leave-requests/{id}": return await reviewLeave(db, claims.sub, event);
      case "GET /manager/holidays": {
        const year = event.queryStringParameters?.year || new Date().getUTCFullYear();
        return await holidays(db, year);
      }
      case "POST /manager/holidays": return await saveHoliday(db, claims.sub, event);
      case "DELETE /manager/holidays/{date}": return await deleteHoliday(db, claims.sub, event);
      default: return response(404, { message: "Unknown route." });
    }
  } catch (error) {
    if (error instanceof ApiError) return response(error.statusCode, { message: error.message });
    console.error("Leave/holiday API error:", { code: error.code || "UNKNOWN", message: error.message });
    return response(500, { message: "Unable to process request." });
  } finally {
    if (db) await db.end().catch(() => {});
  }
};
