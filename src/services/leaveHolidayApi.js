import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

async function request(path, options = {}) {
  if (!API_BASE_URL) throw new Error("AWS API URL is not configured.");
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) throw new Error("Please sign in again.");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (HTTP ${response.status}).`);
  return data;
}

// Employees: request leave and view their own decisions.
export async function getMyLeaveRequests() {
  const data = await request("/attendance/leave-requests");
  if (!Array.isArray(data.requests)) throw new Error("Invalid leave response.");
  return data.requests;
}
export function submitLeaveRequest(values) {
  return request("/attendance/leave-requests", {
    method: "POST", body: JSON.stringify(values)
  });
}

// Managers: review all leave requests.
export async function getManagerLeaveRequests() {
  const data = await request("/manager/leave-requests");
  if (!Array.isArray(data.requests)) throw new Error("Invalid manager leave response.");
  return data.requests;
}
export function reviewLeaveRequest(id, decision, managerNote) {
  return request(`/manager/leave-requests/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ decision, managerNote })
  });
}

// Managers: maintain verified company holiday dates.
export async function getHolidays(year) {
  const data = await request(`/manager/holidays?year=${encodeURIComponent(year)}`);
  if (!Array.isArray(data.holidays)) throw new Error("Invalid holiday response.");
  return data.holidays;
}
export function saveHoliday(date, name) {
  return request("/manager/holidays", {
    method: "POST", body: JSON.stringify({ date, name })
  });
}
export function removeHoliday(date) {
  return request(`/manager/holidays/${encodeURIComponent(date)}`, {
    method: "DELETE"
  });
}
