
import mysql from "mysql2/promise";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

// Standard API response
const response = (statusCode, data) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  },
  body: JSON.stringify(data)
});

// Check Cognito employee group
function hasEmployeeRole(claims) {
  const raw = claims["cognito:groups"] || "";

  const groups = Array.isArray(raw)
    ? raw
    : String(raw).replace(/[\[\]"]/g, "").split(",");

  return groups
    .map(value => value.trim())
    .includes("employee");
}

// Verify dynamic QR signature and expiration
function verifyQR(token) {
  if (typeof token !== "string" || token.length > 4096) {
    throw new Error("Invalid QR token");
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    throw new Error("Invalid QR format");
  }

  const [encoded, receivedSignature] = parts;

  const key = Buffer.from(
    process.env.QR_SIGNING_KEY_B64,
    "base64"
  );

  if (key.length < 32) {
    throw new Error("QR signing key is invalid");
  }

  const expected = createHmac("sha256", key)
    .update(encoded)
    .digest();

  const actual = Buffer.from(
    receivedSignature,
    "base64url"
  );

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
    throw new Error("Expired or invalid QR code");
  }

  return payload;
}

// Calculate distance between employee and workplace
function distanceInMeters(lat1, lon1, lat2, lon2) {
  const rad = degrees => degrees * Math.PI / 180;

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

// Get workplace date in Bahrain time
function bahrainDate(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bahrain",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

// Main Lambda function
export const handler = async event => {
  // Get authenticated user from API Gateway
  const claims =
    event.requestContext?.authorizer?.jwt?.claims;

  if (
    !claims?.sub ||
    claims.token_use !== "access" ||
    !hasEmployeeRole(claims)
  ) {
    return response(403, {
      message: "Employee authorization required."
    });
  }

  // Verify environment configuration
  if (
    !process.env.QR_SIGNING_KEY_B64 ||
    !process.env.DB_HOST ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD ||
    !process.env.WORKPLACE_ID ||
    !process.env.WORKPLACE_NAME
  ) {
    return response(500, {
      message: "Backend configuration is incomplete."
    });
  }

  // Parse request
  let request;

  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return response(400, {
      message: "Invalid request JSON."
    });
  }

  // Validate QR code
  try {
    verifyQR(request.qrToken);
  } catch {
    return response(400, {
      message: "QR code is invalid or expired. Scan again."
    });
  }

  // Validate GPS location
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
      message: "Valid, accurate GPS location is required."
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

    // Get registered workplace
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

    // Calculate employee distance from workplace
    const distance = distanceInMeters(
      latitude,
      longitude,
      Number(workplace.latitude),
      Number(workplace.longitude)
    );

    // Reject employees outside workplace radius
    if (distance > Number(workplace.allowed_radius_m)) {
      return response(403, {
        message: "You are outside the workplace area."
      });
    }

    // Find employee using Cognito identity
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

    // Generate server-side timestamp
    const now = new Date();
    const workDate = bahrainDate(now);

    const dbTimestamp = now
      .toISOString()
      .slice(0, 23)
      .replace("T", " ");

    // Begin transaction
    await db.beginTransaction();
    transactionStarted = true;

    // Record employee check-in
    const [result] = await db.execute(
      `INSERT INTO attendance_records
       (
         employee_id,
         workplace_id,
         work_date,
         check_in_at,
         status
       )
       VALUES (?, ?, ?, ?, 'present')`,
      [
        employeeId,
        workplace.id,
        workDate,
        dbTimestamp
      ]
    );

    // Record successful check-in in audit logs
    await db.execute(
      `INSERT INTO audit_logs
       (
         actor_cognito_sub,
         employee_id,
         action,
         result,
         details
       )
       VALUES (?, ?, 'check-in', 'success', ?)`,
      [
        claims.sub,
        employeeId,
        JSON.stringify({
          attendanceId: result.insertId,
          gpsAccuracyMeters: accuracy,
          distanceMeters: Math.round(distance)
        })
      ]
    );

    // Save database changes
    await db.commit();
    transactionStarted = false;

    return response(200, {
      message: "Check-in recorded successfully.",
      attendanceId: result.insertId,
      recordedAt: now.toISOString(),
      action: "check-in"
    });

  } catch (error) {
    if (transactionStarted) {
      await db?.rollback().catch(() => {});
    }

    // Prevent duplicate attendance
    if (error.code === "ER_DUP_ENTRY") {
      return response(409, {
        message: "You have already checked in today."
      });
    }

    console.error(
      "Check-in error:",
      error.code || "UNKNOWN"
    );

    return response(500, {
      message: "Unable to record attendance."
    });

  } finally {
    if (db) {
      await db.end().catch(() => {});
    }
  }
};
