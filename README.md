# CloudTrek: Mobile-First Employee + AWS Authentication Starter

This extends the original React prototype. All manager screens remain included. Employee screens now have a mobile bottom navigation and phone-friendly login and QR scanner.

## Requirements
- Node.js LTS, npm
- An AWS account and Cognito User Pool for **email/password** authentication
- A Cognito **public SPA app client with no client secret**
- Users created by an administrator; **disable public sign-up**
- Cognito groups named exactly `employee` and `manager`, and assign each test user to one group

## Run
```bash
npm install
npm run dev
```
Visit the address shown by Vite, normally `http://localhost:5173`.

## DEMO mode (no AWS settings)
If the two Cognito values are blank, the app stays in demo mode. You can select employee/manager roles and try fake attendance scenarios. The QR page also allows **real camera scanning and geolocation**, but neither is server-validated or recorded as real attendance. Demo attendance persists only in your own browser.

## Enable REAL Cognito sign-in
1. Go to AWS Cognito User Pools. Create a user pool and SPA app client. Choose email sign-in, disable public sign-up, and ensure there is no client secret.
2. Under **Groups**, create groups `employee` and `manager`.
3. Create a test user and add it to one group; complete its temporary-password challenge on first login.
4. Copy `.env.example` to `.env.local` and enter `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_APP_CLIENT_ID`. Do not quote the values.
5. Restart `npm run dev` to reload environment settings.
6. Open `/login`. The AWS Authenticator replaces the role selector. Cognito group claims determine navigation.
7. Confirm that an employee cannot navigate to `/manager/*` and vice versa. This is **UI protection only**; enforce API authorization in Lambda too.

**Note:** In live mode, the Check In / Check Out selection is explicit because the starter does not yet have a live `GET /attendance/today` endpoint. The backend must reject invalid actions and enforce the actual attendance state.

**Note:** With Cognito enabled, login is real but attendance, manager reports, profile details and dashboards still use sample browser data. They must be replaced with authenticated API calls. Sample data is never real employee information. Manager mutations are disabled in Cognito mode.

## Test employee phone
Camera and GPS require a secure context. `http://localhost` works on the same computer, but `http://192.168.x.x` on a phone usually will not. Deploy to an HTTPS host such as AWS Amplify Hosting to test the QR camera and GPS on an employee phone. (You can also use a trusted HTTPS local development tunnel.)

1. On the phone, sign in with the assigned employee Cognito account.
2. Navigate using the bottom bar to **Scan QR**.
3. Choose **Check In** or **Check Out** (the server must verify the choice against the real attendance record). Tap **Start Camera**, grant camera access, scan a test QR code. A "QR image read" message means **decoded only**, not verified.
4. Tap **Check My Location**, grant permission. Coordinates remain in component state; no tracking or server submission occurs until **Verify & Check In/Out** is explicitly pressed.
5. Without `VITE_API_BASE_URL`, live attendance is disabled. This is intentional.

## When your AWS backend is ready
Set `VITE_API_BASE_URL` to the base URL of your API Gateway HTTP API (with CORS for your HTTPS frontend). The frontend calls:
- `POST /attendance/check-in`
- `POST /attendance/check-out`

Request headers: `Authorization: Bearer <Cognito ACCESS TOKEN>` and `Content-Type: application/json`.
Request JSON:
```json
{
  "qrToken": "opaque-token-from-scan",
  "location": {"latitude": 0, "longitude": 0, "accuracy": 12}
}
```
Expected successful response: `{ "attendanceId": "...", "recordedAt": "2026-11-19T09:02:00Z", "status": "Present" }`.

**Backend responsibilities:** Validate Cognito access JWT and groups, derive employee ID from claims/server records (never trust a submitted ID), validate QR token signature/randomness/expiry and replay rules, check workplace radius and reported GPS accuracy, reject duplicate check-ins, use server time, store record and audit log atomically, enforce access scope to data. Browser GPS can be spoofed, so geofencing does not prove physical presence.

`src/services/attendanceApi.js` is wired to the QR page, but cannot submit until you create those endpoints.

## Project files changed
- `src/context/AuthContext.jsx` **new** — Cognito session + group-based role
- `src/awsConfig.js` **new** — configure existing Cognito user pool
- `src/pages/Login.jsx` — mobile-friendly real login when configured, otherwise clearly labeled demo
- `src/pages/ScanQR.jsx` — phone camera QR scanner, one-time GPS request, safe API submission
- `src/services/attendanceApi.js` **new** — authenticated API Gateway request
- `src/pages/AttendanceConfirmation.jsx` — distinguishes server confirmation from simulated demo
- `src/context/DemoContext.jsx` — integrates Cognito roles; disables browser-only updates in live mode
- `src/components/Layout.jsx` — bottom navigation, Cognito sign-out, clear data mode banner
- `src/styles/mobile-auth.css` **new** — mobile-first adjustments
- `src/App.jsx`, `src/main.jsx`, `.env.example`, `package.json`

## Security limitations
This is NOT production-ready. Dashboard/history/report screens still display demo data even with Cognito login. Before handling employee data, replace every demo data access with authenticated APIs and backend validation. Do not save confidential credentials in frontend environment variables or check real keys into source control. Mobile browser permissions must be granted by the user. QR decoding and GPS collection are not fraud prevention by themselves.

Official resources:
- https://docs.amplify.aws/react/frontend/connect-to-existing-resources/
- https://docs.amplify.aws/react/frontend/auth/manage-user-sessions/
- https://github.com/zxing-js/browser
- https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
