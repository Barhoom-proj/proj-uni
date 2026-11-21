import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { submitAttendance } from '../services/attendanceApi.js';
import '../styles/workplace-qr.css';

const PENDING_QR_KEY = 'cloudtrek-pending-attendance-qr';

function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      reject(new Error('Location requires HTTPS and a compatible browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      }),
      (error) => reject(new Error(`Could not get your location: ${error.message}`)),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

/**
 * Public entry link: /attendance/scan?code=<opaque-token>
 * Save token for Cognito login, then remove it from the browser address bar.
 * A valid scan NEVER records attendance until the protected Lambda API confirms it.
 */
export default function AttendanceScan() {
  const { ready, mode, account } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [qrToken, setQrToken] = useState(() =>
    new URLSearchParams(window.location.search).get('code') ||
    sessionStorage.getItem(PENDING_QR_KEY) || ''
  );
  const [action, setAction] = useState('check-in');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const incoming = new URLSearchParams(location.search).get('code');
    if (incoming) {
      if (incoming.length > 512) {
        setError('Invalid QR link. Please scan the office QR again.');
        sessionStorage.removeItem(PENDING_QR_KEY);
        navigate('/attendance/scan', { replace: true });
        return;
      }
      sessionStorage.setItem(PENDING_QR_KEY, incoming);
      setQrToken(incoming);
      // Avoid leaving the QR token in the visible URL/history.
      navigate('/attendance/scan', { replace: true });
      return;
    }
    if (ready && mode === 'cognito' && !account) {
      navigate('/login', { replace: true });
    }
  }, [location.search, ready, mode, account, navigate]);

  async function confirmAttendance() {
    setError('');
    if (!qrToken) return setError('No QR code found. Scan the current office QR again.');
    if (mode !== 'cognito' || account?.role !== 'employee') {
      return setError('Please sign in with an employee account.');
    }
    setBusy(true);
    try {
      const deviceLocation = await getDeviceLocation();
      // Existing attendanceApi.js sends Cognito access token plus QR and GPS to AWS.
      // Its backend requires: { attendanceId, recordedAt } to confirm a real check-in.
      const serverResult = await submitAttendance({ action, qrToken, ...deviceLocation });
      sessionStorage.removeItem(PENDING_QR_KEY);
      navigate('/employee/confirmation', { replace: true, state: { action, serverResult } });
    } catch (e) {
      setError(e.message || 'Attendance could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="qr-phone-page">
      <div className="qr-phone-card">
        <div className="qr-mark">☁</div>
        <p className="qr-eyebrow">CLOUDTREK ATTENDANCE</p>
        <h1>Confirm Your Attendance</h1>
        <p className="qr-subtitle">Your phone has opened the workplace QR link.</p>

        <div className="qr-summary">
          <div><span>Account</span><strong>{account?.displayName || (ready ? 'Not signed in' : 'Loading…')}</strong></div>
          <div><span>QR code</span><strong>{qrToken ? 'Received (not yet verified)' : 'Missing'}</strong></div>
          <div><span>Location</span><strong>Checked when you confirm</strong></div>
        </div>

        <label className="qr-action-label">Choose your attendance action</label>
        <div className="qr-action-switch" role="group" aria-label="Attendance action">
          <button type="button" className={action === 'check-in' ? 'selected' : ''}
            onClick={() => setAction('check-in')} aria-pressed={action === 'check-in'}>Check In</button>
          <button type="button" className={action === 'check-out' ? 'selected' : ''}
            onClick={() => setAction('check-out')} aria-pressed={action === 'check-out'}>Check Out</button>
        </div>

        {error && <p className="qr-error" role="alert">{error}</p>}
        {mode !== 'cognito' && <p className="qr-error">Real Cognito login is required.</p>}
        {mode === 'cognito' && account?.role === 'manager' && <p className="qr-error">Please sign in as an employee to record attendance.</p>}
        {!import.meta.env.VITE_API_BASE_URL && <p className="qr-notice">AWS attendance API is not connected yet. This page will not create a fake record.</p>}

        <button className="qr-confirm-button" type="button" onClick={confirmAttendance}
          disabled={busy || !ready || mode !== 'cognito' || account?.role !== 'employee' || !qrToken || !import.meta.env.VITE_API_BASE_URL}>
          {busy ? 'Verifying with AWS…' : action === 'check-in' ? 'Verify & Check In' : 'Verify & Check Out'}
        </button>
        <p className="qr-disclaimer">CloudTrek requests your location only for this attendance attempt. The AWS backend decides whether to accept it.</p>
      </div>
    </main>
  );
}
