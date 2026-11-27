import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export async function getMonthlyAttendanceReport(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Select a valid month.");
  }
  if (!API_BASE_URL) {
    throw new Error("Attendance API is not configured.");
  }
  const session = await fetchAuthSession();
  const accessToken = session.tokens?.accessToken?.toString();
  if (!accessToken) {
    throw new Error("Please sign in as a manager.");
  }

  const response = await fetch(
    `${API_BASE_URL}/manager/reports/monthly?month=${encodeURIComponent(month)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Report request failed (HTTP ${response.status}).`);
  }
  if (!data.summary || !Array.isArray(data.employees) || !Array.isArray(data.days)) {
    throw new Error("Invalid monthly report response.");
  }
  return data;
}
