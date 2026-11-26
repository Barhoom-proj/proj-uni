
import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

// Retrieve daily attendance statuses from AWS
export async function getManagerDailyAttendance(date) {
  // Check API configuration
  if (!API_BASE_URL) {
    throw new Error("AWS API is not configured.");
  }

  // Get the manager's Cognito access token
  const session = await fetchAuthSession();

  const token = session.tokens?.accessToken?.toString();

  if (!token) {
    throw new Error("Please sign in as a manager.");
  }

  // Call the daily attendance API
  const response = await fetch(
    `${API_BASE_URL}/manager/daily-attendance?date=${encodeURIComponent(date)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      },
      cache: "no-store"
    }
  );

  // Read the response
  const result = await response.json().catch(() => ({}));

  // Handle API errors
  if (!response.ok) {
    throw new Error(
      result.message ||
      `Unable to retrieve daily attendance (${response.status}).`
    );
  }

  // Validate returned data
  if (
    !Array.isArray(result.employees) ||
    !result.summary
  ) {
    throw new Error("Invalid daily attendance response.");
  }

  return result;
}
