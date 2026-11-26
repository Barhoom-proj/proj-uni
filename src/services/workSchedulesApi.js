
import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

// Make authenticated requests to AWS API Gateway
async function request(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error("AWS API is not configured.");
  }

  // Get the logged-in manager's Cognito access token
  const session = await fetchAuthSession();

  const token = session.tokens?.accessToken?.toString();

  if (!token) {
    throw new Error("Please sign in as a manager.");
  }

  // Send request to AWS API Gateway
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {})
      },
      cache: "no-store"
    }
  );

  // Parse the API response
  const data = await response.json().catch(() => ({}));

  // Handle API errors
  if (!response.ok) {
    throw new Error(
      data.message ||
      `Schedule request failed (HTTP ${response.status}).`
    );
  }

  return data;
}

// Retrieve employee schedules from AWS
export async function getWorkSchedules() {
  const data = await request("/manager/schedules");

  if (!Array.isArray(data.employees)) {
    throw new Error("Invalid employee schedule response.");
  }

  return data.employees;
}

// Save or update an employee's work schedule
export async function saveWorkSchedule(
  employeeId,
  schedule
) {
  return request(
    `/manager/schedules/${encodeURIComponent(employeeId)}`,
    {
      method: "PUT",
      body: JSON.stringify(schedule)
    }
  );
}
