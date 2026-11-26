
import { fetchAuthSession } from "aws-amplify/auth";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

async function authorizedRequest(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error("AWS API is not configured.");
  }

  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();

  if (!token) {
    throw new Error("Please sign in as a manager.");
  }

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

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message ||
      `Request failed (HTTP ${response.status}).`
    );
  }

  return data;
}

// Retrieve manager correction requests
export async function getManagerCorrections() {
  const data = await authorizedRequest(
    "/manager/corrections"
  );

  if (!Array.isArray(data.requests)) {
    throw new Error("Invalid correction request response.");
  }

  return data.requests;
}

// Approve or reject a correction request
export async function reviewManagerCorrection(
  requestId,
  {
    decision,
    managerNote,
    checkInAt = null,
    checkOutAt = null
  }
) {
  return authorizedRequest(
    `/manager/corrections/${encodeURIComponent(requestId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        decision,
        managerNote,
        ...(decision === "approved"
          ? { checkInAt, checkOutAt }
          : {})
      })
    }
  );
}
