import React, { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import QRCode from 'qrcode';
import '../styles/workplace-qr.css';

/**
 * Place this page on an authenticated manager-controlled workplace monitor.
 * Expected GET /qr/current response:
 * { token: 'opaque-random-token', expiresAt: '2026-11-21T12:00:00Z', workplaceName: 'CloudTrek Office' }
 * The backend must create, store, expire, and validate the token.
 */
export default function WorkplaceQR() {
  const [qr, setQr] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;

    async function loadQr() {
      if (inFlight) return;
      const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
      if (!base) {
        setLoading(false);
        setError('Attendance API is not configured. Add VITE_API_BASE_URL after creating your AWS backend.');
        return;
      }
      inFlight = true;
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.accessToken?.toString();
        if (!token) throw new Error('Please sign in with your manager account.');
        const response = await fetch(`${base}/qr/current`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || `Could not load QR (${response.status}).`);
        if (!body.token || !body.expiresAt || !Number.isFinite(Date.parse(body.expiresAt))) {
          throw new Error('QR API must return token and a valid expiresAt timestamp.');
        }
        const url = `${window.location.origin}/attendance/scan?code=${encodeURIComponent(body.token)}`;
        const dataUrl = await QRCode.toDataURL(url, {
          width: 340,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        if (!disposed) {
          setQr({ dataUrl, expiresAt: body.expiresAt, workplaceName: body.workplaceName || 'CloudTrek Office' });
          setError('');
        }
      } catch (e) {
        if (!disposed) {
          setError(e.message || 'QR code unavailable.');
          setQr(null); // Never display an expired or unverified QR code.
        }
      } finally {
        inFlight = false;
        if (!disposed) setLoading(false);
      }
    }

    loadQr();
    const refresh = window.setInterval(loadQr, 15000);
    return () => {
      disposed = true;
      window.clearInterval(refresh);
    };
  }, []);

  const remaining = qr ? Math.max(0, Math.ceil((Date.parse(qr.expiresAt) - now) / 1000)) : 0;

  return (
    <section className="qr-office-page">
      <p className="qr-eyebrow">CLOUDTREK • WORKPLACE ATTENDANCE</p>
      <h1>Scan to Check In or Out</h1>
      <p className="qr-subtitle">Use your phone's normal camera and open the CloudTrek link.</p>

      <div className="qr-office-card">
        <h2>{qr?.workplaceName || 'CloudTrek Office'}</h2>
        {loading && <p role="status">Loading current QR code…</p>}
        {error && <p className="qr-error" role="alert">{error}</p>}
        {!error && qr && remaining > 0 && (
          <>
            <img className="qr-display-image" src={qr.dataUrl} alt="Temporary CloudTrek attendance QR code" />
            <p className="qr-countdown">Code expires in <strong>{remaining} seconds</strong></p>
          </>
        )}
        {!error && !loading && remaining === 0 && (
          <p role="status">Refreshing attendance code…</p>
        )}
      </div>
      <p className="qr-disclaimer">Only signed-in employees can submit attendance. A QR scan alone does not record a check-in.</p>
    </section>
  );
}
