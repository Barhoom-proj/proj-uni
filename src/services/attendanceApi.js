import { fetchAuthSession } from 'aws-amplify/auth';
import { isAttendanceApiConfigured, isCognitoConfigured } from '../awsConfig.js';

/**
 * Requires your own API Gateway/Lambda implementation.
 * IMPORTANT: The Lambda must independently validate the authenticated user,
 * QR token, workplace radius, time and duplicate attendance. Never trust this client.
 * Expected success payload: { attendanceId: string, recordedAt: ISO8601 string, status?: string }
 */
export async function submitAttendance({ action, qrToken, latitude, longitude, accuracy }) {
  if (!isCognitoConfigured) throw new Error('Enable Amazon Cognito before submitting real attendance.');
  if (!isAttendanceApiConfigured) throw new Error('AWS attendance API is not configured yet. Scanning alone does not record attendance.');
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const path = action === 'check-out' ? '/attendance/check-out' : '/attendance/check-in';
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ qrToken, location: { latitude, longitude, accuracy } }),
  });
  if (!response.ok) {
    let message = `Attendance rejected (${response.status}).`;
    try { const body = await response.json(); if (body.message) message = body.message; } catch { /* no response JSON */ }
    throw new Error(message);
  }
  const result = await response.json();
  if (!result.attendanceId || !result.recordedAt) throw new Error('Backend response is missing attendanceId or recordedAt. Attendance confirmation cannot be shown.');
  return result;
}
