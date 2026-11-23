
import { useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { QRCodeSVG } from "qrcode.react";
import "../styles/workplace-display.css";

const API_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

const WEBSITE_URL = (
  import.meta.env.VITE_PUBLIC_APP_URL ||
  window.location.origin
).replace(/\/+$/, "");

function getExpirationTime(value) {
  if (!value) return NaN;

  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const number = Number(value);
    return number < 1e12 ? number * 1000 : number;
  }

  return Date.parse(value);
}

export default function WorkplaceQRDisplay() {
  const [qr, setQr] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;

    async function loadQRCode() {
      try {
        if (!API_URL) {
          throw new Error("API URL is not configured.");
        }

        const session = await fetchAuthSession();
        const accessToken =
          session.tokens?.accessToken?.toString();

        if (!accessToken) {
          throw new Error("Please sign in to display the QR code.");
        }

        const response = await fetch(
          `${API_URL}/qr/current`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`
            },
            cache: "no-store"
          }
        );

        if (!response.ok) {
          throw new Error(
            `QR request failed (HTTP ${response.status}).`
          );
        }

        const data = await response.json();
        const expiration = getExpirationTime(data.expiresAt);

        if (
          !data.token ||
          !Number.isFinite(expiration) ||
          expiration <= Date.now()
        ) {
          throw new Error("Invalid QR response from AWS.");
        }

        const scanUrl =
          `${WEBSITE_URL}/attendance/scan?code=` +
          encodeURIComponent(data.token);

        if (active) {
          setQr({
            url: scanUrl,
            expiresAt: expiration,
            workplaceName:
              data.workplaceName || "CloudTrek Office"
          });
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load QR code.");
          setQr(null);
        }
      }
    }

    loadQRCode();

    const refreshTimer = setInterval(loadQRCode, 45000);
    const countdownTimer = setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () => {
      active = false;
      clearInterval(refreshTimer);
      clearInterval(countdownTimer);
    };
  }, []);

  const secondsLeft = qr
    ? Math.max(
        0,
        Math.ceil((qr.expiresAt - now) / 1000)
      )
    : 0;

  return (
    <main className="workplace-display">
      <header className="display-header">
        <h2>CloudTrek</h2>
        <span>Workplace Attendance</span>
      </header>

      <section className="display-content">
        <h1>Scan to Check In or Out</h1>

        <p>
          Open your phone camera and scan the QR code
        </p>

        {qr && secondsLeft > 0 ? (
          <>
            <div className="display-qr">
              <QRCodeSVG
                value={qr.url}
                size={400}
                level="M"
                marginSize={2}
              />
            </div>

            <h3>{qr.workplaceName}</h3>

            <p className="display-countdown">
              QR code expires in {secondsLeft} seconds
            </p>

            <p>New QR codes are generated automatically.</p>
          </>
        ) : (
          <div className="display-error">
            {error || "Loading a new QR code..."}
          </div>
        )}
      </section>

      <footer className="display-footer">
        <span>CloudTrek Secure Attendance System</span>

        <button
          type="button"
          onClick={() =>
            document.documentElement.requestFullscreen?.()
          }
        >
          Fullscreen
        </button>
      </footer>
    </main>
  );
}
