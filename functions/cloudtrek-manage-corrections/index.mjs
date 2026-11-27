
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

function isoOrNull(value) {
  if (!value) return null;
  return `${String(value).slice(0, 23)}Z`;
}

function parseUTC(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)
  ) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function bahrainDate(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date).map(
      ({ type, value }) => [type, value]
    )
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function mysqlUTC(date) {
  return date.toISOString()
    .slice(0, 23)
    .replace("T", " ");
}

export const handler = async event => {
  const claims =
    event.requestContext?.authorizer?.jwt?.claims;

  // Only managers may review corrections.
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
  const isList = route === "GET /manager/corrections";
  const isDecision =
    route === "PATCH /manager/corrections/{id}";

  if (!isList && !isDecision) {
    return reply(404, { message: "Unknown route." });
  }

  if (
    !process.env.DB_HOST ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD
  ) {
    return reply(500, {
      message: "Database configuration incomplete."
    });
  }

  let id;
  let decision;
  let note;
  let checkIn;
  let checkOut;

  // Validate a manager's approval or rejection.
  if (isDecision) {
    id = Number(event.pathParameters?.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return reply(400, { message: "Invalid request ID." });
    }

    let body;

    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return reply(400, { message: "Invalid JSON." });
    }

    decision = body.decision;
    note = typeof body.managerNote === "string"
      ? body.managerNote.trim()
      : "";

    if (!["approved", "rejected"].includes(decision)) {
      return reply(400, {
        message: "Choose approve or reject."
      });
    }

    if (note.length < 5 || note.length > 500) {
      return reply(400, {
        message: "Manager note must contain 5–500 characters."
      });
    }

    if (decision === "approved") {
      checkIn = parseUTC(body.checkInAt);
      checkOut = body.checkOutAt == null
        ? null
        : parseUTC(body.checkOutAt);

      if (!checkIn || (body.checkOutAt != null && !checkOut)) {
        return reply(400, {
          message: "Valid UTC timestamps are required."
        });
      }

      if (
        checkOut &&
        (
          checkOut <= checkIn ||
          checkOut - checkIn > 24 * 3600 * 1000
        )
      ) {
        return reply(400, {
          message: "Check-Out must follow Check-In within 24 hours."
        });
      }

      if (
        checkIn.getTime() > Date.now() + 5 * 60 * 1000 ||
        (
          checkOut &&
          checkOut.getTime() > Date.now() + 5 * 60 * 1000
        )
      ) {
        return reply(400, {
          message: "Future attendance times are not allowed."
        });
      }
    }
  }

  let db;
  let transactionStarted = false;

  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME ||
        "cloudtrek_attendance",
      timezone: "Z",
      connectTimeout: 10000,
      ssl: {
        ca: readFileSync(
          new URL("./global-bundle.pem", import.meta.url)
        ),
        rejectUnauthorized: true
      }
    });

    // GET: Retrieve correction requests.
    if (isList) {
      const [rows] = await db.query(`
        SELECT
          c.id,
          c.attendance_id AS attendanceId,
          c.reason,
          c.status,
          c.manager_note AS managerNote,
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
          ) AS checkOutUTC
        FROM attendance_correction_requests c
        JOIN attendance_records a
          ON a.id = c.attendance_id
          AND a.employee_id = c.employee_id
        JOIN employees e
          ON e.id = c.employee_id
        ORDER BY
          (c.status = 'pending') DESC,
          c.created_at DESC
        LIMIT 100
      `);

      const requests = rows.map(row => ({
        id: row.id,
        attendanceId: row.attendanceId,
        employeeName: row.employeeName,
        department: row.department || "Not assigned",
        date: row.workDate,
        reason: row.reason,
        status: row.status,
        managerNote: row.managerNote,
        checkInAt: isoOrNull(row.checkInUTC),
        checkOutAt: isoOrNull(row.checkOutUTC)
      }));

      return reply(200, { requests });
    }

    // PATCH: Review one correction request.
    await db.beginTransaction();
    transactionStarted = true;

    const [requests] = await db.execute(
      `SELECT attendance_id, employee_id, status
       FROM attendance_correction_requests
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (!requests.length) {
      await db.rollback();
      transactionStarted = false;

      return reply(404, {
        message: "Correction request not found."
      });
    }

    const current = requests[0];

    if (current.status !== "pending") {
      await db.rollback();
      transactionStarted = false;

      return reply(409, {
        message: "This request has already been reviewed."
      });
    }

    // Lock and read the original attendance record.
    const [rows] = await db.execute(
      `SELECT
         DATE_FORMAT(work_date, '%Y-%m-%d') AS workDate,
         DATE_FORMAT(
           check_in_at, '%Y-%m-%dT%H:%i:%s.%f'
         ) AS previousCheckIn,
         DATE_FORMAT(
           check_out_at, '%Y-%m-%dT%H:%i:%s.%f'
         ) AS previousCheckOut
       FROM attendance_records
       WHERE id = ? AND employee_id = ?
       FOR UPDATE`,
      [current.attendance_id, current.employee_id]
    );

    if (!rows.length) {
      throw new Error("Related attendance record is missing.");
    }

    const old = rows[0];

    // Only approval changes the attendance timestamps.
    if (decision === "approved") {
      if (bahrainDate(checkIn) !== old.workDate) {
        await db.rollback();
        transactionStarted = false;

        return reply(400, {
          message:
            "Corrected Check-In must match the attendance work date in Bahrain."
        });
      }

      await db.execute(
        `UPDATE attendance_records
         SET check_in_at = ?, check_out_at = ?
         WHERE id = ? AND employee_id = ?`,
        [
          mysqlUTC(checkIn),
          checkOut ? mysqlUTC(checkOut) : null,
          current.attendance_id,
          current.employee_id
        ]
      );
    }

    // Record the manager decision.
    await db.execute(
      `UPDATE attendance_correction_requests
       SET status = ?,
           manager_note = ?,
           reviewed_by_sub = ?,
           reviewed_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [decision, note, claims.sub, id]
    );

    // Keep an audit trail of the decision.
    await db.execute(
      `INSERT INTO audit_logs
       (
         actor_cognito_sub,
         employee_id,
         action,
         result,
         details
       )
       VALUES (?, ?, ?, 'success', ?)`,
      [
        claims.sub,
        current.employee_id,
        decision === "approved"
          ? "correction-approved"
          : "correction-rejected",
        JSON.stringify({
          requestId: id,
          attendanceId: current.attendance_id,
          before: {
            checkInAt: isoOrNull(old.previousCheckIn),
            checkOutAt: isoOrNull(old.previousCheckOut)
          },
          after: decision === "approved"
            ? {
                checkInAt: checkIn.toISOString(),
                checkOutAt: checkOut?.toISOString() || null
              }
            : null
        })
      ]
    );

    await db.commit();
    transactionStarted = false;

    return reply(200, {
      message: `Correction request ${decision}.`,
      requestId: id,
      status: decision
    });

  } catch (error) {
    if (transactionStarted) {
      await db?.rollback().catch(() => {});
    }

    console.error("Manager correction error:", {
      code: error.code || "UNKNOWN",
      sqlState: error.sqlState || null
    });

    return reply(500, {
      message: "Unable to process manager correction request."
    });

  } finally {
    if (db) {
      await db.end().catch(() => {});
    }
  }
};
