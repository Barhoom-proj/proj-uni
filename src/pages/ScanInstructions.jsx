import React from 'react';
import '../styles/workplace-qr.css';

/** Replaces the old in-app phone-camera scanner at /employee/scan. */
export default function ScanInstructions() {
  return (
    <section className="qr-instructions">
      <p className="qr-eyebrow">EMPLOYEE ATTENDANCE</p>
      <h1>Scan the Office QR Code</h1>
      <p className="qr-subtitle">Use your phone's normal camera app. No in-app scanner is needed.</p>
      <ol className="qr-steps">
        <li>Make sure you are signed in to CloudTrek on your phone.</li>
        <li>Go to the office QR display on the workplace monitor.</li>
        <li>Open your phone camera and point it at the QR code.</li>
        <li>Tap the CloudTrek link that appears on your phone.</li>
        <li>Choose Check In or Check Out and allow location access.</li>
        <li>Wait for the AWS-verified attendance confirmation.</li>
      </ol>
      <p className="qr-disclaimer">If the QR has expired, scan the new one shown on the monitor.</p>
    </section>
  );
}
