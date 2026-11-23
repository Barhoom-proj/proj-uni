
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
  // 1. Check API configuration
  if (!API_BASE_URL) {
    throw new Error("AWS attendance API is not configured.");
  }

  // 2. Validate the requested action
  if (action !== "check-in" && action !== "check-out") {
    throw new Error("Invalid attendance action.");
  }

  // Check-out Lambda will be implemented next
  if (action === "check-out") {
    throw new Error(
      "Check-out is not connected yet. Please use Check In."
    );
  }

  // 3. Check QR token
  if (!qrToken) {
    throw new Error(
      "QR code is missing. Please scan the workplace QR again."
    );
  }

  // 4. Retrieve the Cognito access token
  const session = await fetchAuthSession();

  const accessToken =
    session.tokens?.accessToken?.toString();

  if (!accessToken) {
    throw new Error(
      "Your login session has expired. Please sign in again."
    );
  }

  // 5. Prepare attendance request
  const requestBody = {
    qrToken,
    location: {
      latitude,
      longitude,
      accuracy
    }
  };

  // 6. Send request to AWS API Gateway
  const apiResponse = await fetch(
    `${API_BASE_URL}/attendance/check-in`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      cache: "no-store"
    }
  );

  // 7. Read backend response
  const result = await apiResponse
    .json()
    .catch(() => ({}));

  // 8. Handle rejected attendance requests
  if (!apiResponse.ok) {
    throw new Error(
      result.message ||
      `Attendance request failed (HTTP ${apiResponse.status}).`
    );
  }

  // 9. Require confirmation from AWS
  if (
    result.attendanceId == null ||
    !result.recordedAt
  ) {
    throw new Error(
      "AWS did not confirm that attendance was saved."
    );
  }

  // 10. Return successful attendance record
  return result;
}
