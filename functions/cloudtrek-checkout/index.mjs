
import mysql from "mysql2/promise";
import { createHmac, timingSafeEqual } from "node:crypto";
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
    : String(raw).replace(/[\[\]"]/g, "").split(",");

  return groups.map(g => g.trim()).includes("employee");
}

function verifyQR(token) {
  if (
    typeof token !== "string" ||
    token.length > 4096
  ) {
    throw new Error("Invalid QR code");
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    throw new Error("Invalid QR format");
  }

  const [encoded, signature] = parts;

  const key = Buffer.from(
    process.env.QR_SIGNING_KEY_B64 || "",
    "base64"
  );

  if (key.length < 32) {
    throw new Error("Invalid QR signing key");
  }

  const expected = createHmac("sha256", key)
    .update(encoded)
    .digest();

  const actual = Buffer.from(signature, "base64url");

  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    throw new Error("Invalid QR signature");
  }

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8")
  );

  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt) ||
    payload.issuedAt > now + 5 ||
    payload.expiresAt <= now ||
    payload.expiresAt <= payload.issuedAt ||
    payload.expiresAt - payload.issuedAt > 60 ||
    typeof payload.nonce !== "string" ||
    !payload.nonce ||
    payload.workplaceId !== process.env.WORKPLACE_ID
  ) {
    throw new Error("QR code expired or invalid");
  }

  return payload;
}

function distanceInMeters(lat1, lon1, lat2, lon2) {
  const rad = value => value * Math.PI / 180;

  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) *
    Math.cos(rad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 6371000 * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

function mysqlUtc(date) {
  return date.toISOString()
    .slice(0, 23)
    .replace("T", " ");
}

export const handler = async event => {
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
    !process.env.DB_PASSWORD ||
    !process.env.QR_SIGNING_KEY_B64 ||
    !process.env.WORKPLACE_ID ||
    !process.env.WORKPLACE_NAME
  ) {
    return response(500, {
      message: "Backend configuration is incomplete."
    });
  }

  let request;

  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return response(400, {
      message: "Invalid request JSON."
    });
  }

  try {
    verifyQR(request.qrToken);
  } catch {
    return response(400, {
      message: "QR code is invalid or expired. Scan again."
    });
  }

  const loc = request.location || {};
  const latitude = Number(loc.latitude);
  const longitude = Number(loc.longitude);
  const accuracy = Number(loc.accuracy);

  if (
    loc.latitude == null ||
    loc.longitude == null ||
    loc.accuracy == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(accuracy) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    accuracy < 0 ||
    accuracy > 150
  ) {
    return response(400, {
      message: "Valid GPS location is required."
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

    // Find the authorized workplace.
    const [workplaces] = await db.execute(
      `SELECT id, latitude, longitude, allowed_radius_m
       FROM workplaces
       WHERE workplace_name = ?
         AND is_active = TRUE
       LIMIT 1`,
      [process.env.WORKPLACE_NAME]
    );

    if (!workplaces.length) {
      return response(503, {
        message: "Workplace is not configured."
      });
    }

    const workplace = workplaces[0];

    const distance = distanceInMeters(
      latitude,
      longitude,
      Number(workplace.latitude),
      Number(workplace.longitude)
    );

    if (distance > Number(workplace.allowed_radius_m)) {
      return response(403, {
        message: "You are outside the workplace area."
      });
    }

    // Identify the employee using the verified JWT.
    const [employees] = await db.execute(
      `SELECT id FROM employees
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
    const now = new Date();

    // Initial prototype: allow checkout for an open
    // attendance session started within 24 hours.
    const cutoff = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    );

    await db.beginTransaction();
    transactionStarted = true;

    // Lock the active record to avoid duplicate checkout.
    const [records] = await db.execute(
      `SELECT id FROM attendance_records
       WHERE employee_id = ?
         AND workplace_id = ?
         AND check_out_at IS NULL
         AND check_in_at >= ?
       ORDER BY check_in_at DESC
       LIMIT 1
       FOR UPDATE`,
      [employeeId, workplace.id, mysqlUtc(cutoff)]
    );

    if (!records.length) {
      await db.rollback();
      transactionStarted = false;

      return response(409, {
        message: "No active check-in found. You may already have checked out."
      });
    }

    const attendanceId = records[0].id;

    // Set checkout time using the AWS server clock.
    const [update] = await db.execute(
      `UPDATE attendance_records
       SET check_out_at = ?
       WHERE id = ?
         AND check_out_at IS NULL`,
      [mysqlUtc(now), attendanceId]
    );

    if (update.affectedRows !== 1) {
      throw new Error("Attendance update was not completed");
    }

    // Record the successful checkout.
    await db.execute(
      `INSERT INTO audit_logs
       (actor_cognito_sub, employee_id,
        action, result, details)
       VALUES (?, ?, 'check-out', 'success', ?)`,
      [
        claims.sub,
        employeeId,
        JSON.stringify({
          attendanceId,
          gpsAccuracyMeters: accuracy,
          distanceMeters: Math.round(distance)
        })
      ]
    );

    await db.commit();
    transactionStarted = false;

    return response(200, {
      message: "Check-out recorded successfully.",
      attendanceId,
      recordedAt: now.toISOString(),
      action: "check-out"
    });

  } catch (error) {
    if (transactionStarted) {
      await db?.rollback().catch(() => {});
    }

    console.error("Check-out error:", {
      code: error.code || "UNKNOWN",
      sqlState: error.sqlState || null
    });

    return response(500, {
      message: "Unable to record check-out."
    });

  } finally {
    if (db) {
      await db.end().catch(() => {});
    }
  }
};
