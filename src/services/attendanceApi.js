
import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export async function submitAttendance({
  action,
  qrToken,
  latitude,
  longitude,
  accuracy
}) {
  // 1. Verify API configuration
  if (!API_BASE_URL) {
    throw new Error("AWS attendance API is not configured.");
  }

  // 2. Validate the attendance action
  if (action !== "check-in" && action !== "check-out") {
    throw new Error("Invalid attendance action.");
  }

  // 3. Validate QR token
  if (!qrToken) {
    throw new Error("Please scan the workplace QR again.");
  }

  // 4. Retrieve Cognito access token
  const session = await fetchAuthSession();

  const accessToken =
    session.tokens?.accessToken?.toString();

  if (!accessToken) {
    throw new Error("Please sign in again.");
  }

  // 5. Select the correct API endpoint
  const endpoint =
    action === "check-in"
      ? "/attendance/check-in"
      : "/attendance/check-out";

  // 6. Send attendance request to AWS
  const apiResponse = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        qrToken,
        location: {
          latitude,
          longitude,
          accuracy
        }
      }),
      cache: "no-store"
    }
  );

  // 7. Read the response
  const result = await apiResponse
    .json()
    .catch(() => ({}));

  // 8. Handle errors
  if (!apiResponse.ok) {
    throw new Error(
      result.message ||
      `Attendance request failed (HTTP ${apiResponse.status}).`
    );
  }

  // 9. Verify successful database recording
  if (
    result.attendanceId == null ||
    !result.recordedAt
  ) {
    throw new Error(
      "AWS did not confirm the attendance record."
    );
  }

  // 10. Return the result
  return result;
}
