import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export async function getMyAttendanceStatuses(days = 90) {
  if (!API_BASE_URL) {
    throw new Error("Attendance API is not configured.");
  }

  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) throw new Error("Please sign in again.");

  const response = await fetch(
    `${API_BASE_URL}/attendance/my-status?days=${encodeURIComponent(days)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || `Status request failed (${response.status}).`);
  }
  if (!Array.isArray(result.records) || !result.summary) {
    throw new Error("Invalid attendance status response.");
  }
  return result;
}
