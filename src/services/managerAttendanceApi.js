
import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export async function getManagerAttendance() {
  // 1. Check API configuration
  if (!API_BASE_URL) {
    throw new Error("AWS API is not configured.");
  }

  // 2. Retrieve the manager's Cognito access token
  const session = await fetchAuthSession();

  const accessToken =
    session.tokens?.accessToken?.toString();

  if (!accessToken) {
    throw new Error("Please sign in as a manager.");
  }

  // 3. Call the manager attendance API
  const response = await fetch(
    `${API_BASE_URL}/manager/attendance`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    }
  );

  // 4. Read the API response
  const result = await response.json().catch(() => ({}));

  // 5. Handle API errors
  if (!response.ok) {
    throw new Error(
      result.message ||
      `Manager attendance request failed (${response.status}).`
    );
  }

  // 6. Validate the returned records
  if (!Array.isArray(result.records)) {
    throw new Error("Invalid manager attendance response.");
  }

  // 7. Return real employee attendance records
  return {
    records: result.records,
    employeeCount: Number(result.employeeCount) || 0
  };
}
