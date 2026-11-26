
import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export async function createCorrectionRequest({
  attendanceId,
  reason
}) {
  if (!API_BASE_URL) {
    throw new Error("Attendance API is not configured.");
  }

  const session = await fetchAuthSession();

  const accessToken =
    session.tokens?.accessToken?.toString();

  if (!accessToken) {
    throw new Error("Please sign in again.");
  }

  const response = await fetch(
    `${API_BASE_URL}/attendance/corrections`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        attendanceId,
        reason
      }),
      cache: "no-store"
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.message ||
      `Correction request failed (${response.status}).`
    );
  }

  if (result.requestId == null) {
    throw new Error(
      "AWS did not confirm that the request was saved."
    );
  }

  return result;
}

// Retrieve the logged-in employee's correction requests
export async function getMyCorrectionRequests() {
  if (!API_BASE_URL) {
    throw new Error("Attendance API is not configured.");
  }

  const session = await fetchAuthSession();

  const accessToken =
    session.tokens?.accessToken?.toString();

  if (!accessToken) {
    throw new Error("Please sign in again.");
  }

  const response = await fetch(
    `${API_BASE_URL}/attendance/corrections`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.message ||
      `Unable to load correction requests (${response.status}).`
    );
  }

  if (!Array.isArray(result.requests)) {
    throw new Error("Invalid correction request response.");
  }

  return result.requests;
}
