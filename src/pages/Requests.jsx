import React from "react";
import {
  Check,
  ClipboardList,
  Clock3,
  MessageCircle,
  X
} from "lucide-react";
import { fullDate } from "../data/demo.js";
import {
  Avatar,
  Card,
  Dialog,
  Empty,
  SectionTitle,
  StatCard,
  StatusPill
} from "../components/UI.jsx";
import {
  getManagerCorrections,
  reviewManagerCorrection
} from "../services/managerCorrectionsApi.js";

const TABS = ["Pending", "Approved", "Rejected", "All"];

function displayStatus(value) {
  const status = String(value || "").toLowerCase();
  return status === "pending" || status === "approved" || status === "rejected"
    ? status[0].toUpperCase() + status.slice(1)
    : "Unknown";
}

function formatTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: "Asia/Bahrain",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// Convert an API UTC timestamp to the value of a Bahrain datetime-local input.
function toBahrainInput(value) {
  if (!value) return "";

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(new Date(value))
      .map(({ type, value: partValue }) => [type, partValue])
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Bahrain stays at UTC+03:00 throughout the year.
function bahrainInputToUTC(value) {
  if (!value) return null;

  const date = new Date(`${value}:00+03:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Enter a valid attendance date and time.");
  }

  return date.toISOString();
}

export default function Requests() {
  const [requests, setRequests] = React.useState([]);
  const [tab, setTab] = React.useState("Pending");
  const [selectedId, setSelectedId] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [reload, setReload] = React.useState(0);

  // Review dialog state
  const [reviewing, setReviewing] = React.useState(null);
  const [decision, setDecision] = React.useState("approved");
  const [checkIn, setCheckIn] = React.useState("");
  const [checkOut, setCheckOut] = React.useState("");
  const [managerNote, setManagerNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState("");

  // Load real requests from API Gateway / RDS, never from DemoContext.
  React.useEffect(() => {
    let active = true;

    async function loadRequests() {
      setLoading(true);
      setError("");
      setRequests([]);

      try {
        const data = await getManagerCorrections();
        if (active) setRequests(data);
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load correction requests.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRequests();
    return () => { active = false; };
  }, [reload]);

  const filtered = requests.filter(
    request => tab === "All" || displayStatus(request.status) === tab
  );

  const current = filtered.find(
    request => String(request.id) === String(selectedId)
  ) || filtered[0];

  const countStatus = status => requests.filter(
    request => displayStatus(request.status) === status
  ).length;

  function startReview(request, nextDecision) {
    setReviewing(request);
    setDecision(nextDecision);
    setCheckIn(toBahrainInput(request.checkInAt));
    setCheckOut(toBahrainInput(request.checkOutAt));
    setManagerNote("");
    setFormError("");
  }

  function closeReview() {
    if (saving) return;
    setReviewing(null);
    setFormError("");
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!reviewing || saving) return;

    if (managerNote.trim().length < 5 || managerNote.trim().length > 500) {
      setFormError("Please enter a manager note of 5 to 500 characters.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const payload = {
        decision,
        managerNote: managerNote.trim()
      };

      if (decision === "approved") {
        if (!checkIn) {
          throw new Error("Corrected Check-In is required for approval.");
        }

        payload.checkInAt = bahrainInputToUTC(checkIn);
        payload.checkOutAt = bahrainInputToUTC(checkOut);
      }

      const result = await reviewManagerCorrection(reviewing.id, payload);

      setNotice(result.message || "Manager decision saved successfully.");
      setReviewing(null);
      setSelectedId(null);
      setReload(value => value + 1);
    } catch (err) {
      setFormError(err.message || "Unable to save your decision.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MANAGER APPROVALS</span>
          <h1>Attendance Correction Requests</h1>
          <p>Review employee attendance corrections with an auditable approval process.</p>
        </div>
      </div>

      <div className="stat-grid four">
        <StatCard label="Pending Requests" value={countStatus("Pending")} icon={Clock3} tone="amber" />
        <StatCard label="Approved" value={countStatus("Approved")} icon={Check} tone="green" />
        <StatCard label="Rejected" value={countStatus("Rejected")} icon={X} tone="red" />
        <StatCard label="Total Requests" value={requests.length} icon={ClipboardList} />
      </div>

      <div className="tabs" role="group" aria-label="Request status filter">
        {TABS.map(item => (
          <button
            key={item}
            type="button"
            className={tab === item ? "tab-active" : ""}
            onClick={() => {
              setTab(item);
              setSelectedId(null);
            }}
          >
            {item} <span>{item === "All" ? requests.length : countStatus(item)}</span>
          </button>
        ))}
        <button type="button" onClick={() => setReload(value => value + 1)} disabled={loading}>
          Refresh
        </button>
      </div>

      {notice && (
        <p role="status" style={{ color: "#167d46", marginBottom: 14 }}>
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "#c62828", marginBottom: 14 }}>
          {error}
        </p>
      )}

      <div className="two-column request-layout">
        <Card>
          <SectionTitle icon={ClipboardList}>Requests</SectionTitle>

          {loading ? (
            <p className="muted-text">Loading requests from AWS...</p>
          ) : error ? (
            <Empty message="Unable to load requests. Try Refresh." />
          ) : filtered.length ? (
            filtered.map(request => {
              const name = request.employeeName || "Employee";
              return (
                <button
                  type="button"
                  className={`request-row ${current?.id === request.id ? "request-selected" : ""}`}
                  key={request.id}
                  onClick={() => setSelectedId(request.id)}
                >
                  <Avatar name={name} size="sm" />
                  <div>
                    <strong>{name}</strong>
                    <small>Attendance Correction • {fullDate(request.date)}</small>
                  </div>
                  <StatusPill status={displayStatus(request.status)} />
                </button>
              );
            })
          ) : (
            <Empty message="No correction requests in this category." />
          )}
        </Card>

        <Card>
          <SectionTitle icon={MessageCircle}>Request Details</SectionTitle>

          {!loading && !error && current ? (
            <div className="request-detail">
              <h3>Attendance Correction</h3>
              <p><strong>Employee</strong><span>{current.employeeName || "Employee"}</span></p>
              <p><strong>Department</strong><span>{current.department || "Not assigned"}</span></p>
              <p><strong>Attendance Date</strong><span>{fullDate(current.date)}</span></p>
              <p><strong>Current Check-In</strong><span>{formatTime(current.checkInAt)}</span></p>
              <p><strong>Current Check-Out</strong><span>{formatTime(current.checkOutAt)}</span></p>
              <p><strong>Reason</strong><span>{current.reason}</span></p>
              <p><strong>Status</strong><StatusPill status={displayStatus(current.status)} /></p>

              {current.managerNote && (
                <p><strong>Manager Note</strong><span>{current.managerNote}</span></p>
              )}

              {displayStatus(current.status) === "Pending" && (
                <div className="request-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => startReview(current, "approved")}
                  >
                    <Check size={17} /> Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline danger-outline"
                    onClick={() => startReview(current, "rejected")}
                  >
                    <X size={17} /> Reject
                  </button>
                </div>
              )}

              <p className="footnote">
                Approval applies the manager's corrected timestamps to the attendance record.
                Rejection leaves the original times unchanged. Both decisions are audit-logged.
              </p>
            </div>
          ) : (
            <Empty message={loading ? "Loading request details..." : "Select a request to view details."} />
          )}
        </Card>
      </div>

      {reviewing && (
        <Dialog title={`Review Correction #${reviewing.id}`} onClose={closeReview}>
          <form onSubmit={submitReview}>
            <p className="muted-text">
              <strong>{reviewing.employeeName || "Employee"}</strong> — {fullDate(reviewing.date)}
            </p>
            <p className="muted-text">Reason: {reviewing.reason}</p>

            <div className="field">
              <label htmlFor="review-decision">Decision</label>
              <select
                id="review-decision"
                value={decision}
                disabled={saving}
                onChange={e => setDecision(e.target.value)}
              >
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
              </select>
            </div>

            {decision === "approved" && (
              <>
                <p className="muted-text">Enter the corrected times in Bahrain time (UTC+03:00).</p>
                <div className="field">
                  <label htmlFor="review-checkin">Corrected Check-In</label>
                  <input
                    id="review-checkin"
                    type="datetime-local"
                    value={checkIn}
                    onChange={e => setCheckIn(e.target.value)}
                    disabled={saving}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="review-checkout">Corrected Check-Out (optional; blank clears it)</label>
                  <input
                    id="review-checkout"
                    type="datetime-local"
                    value={checkOut}
                    onChange={e => setCheckOut(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </>
            )}

            <div className="field">
              <label htmlFor="review-note">Manager Note</label>
              <textarea
                id="review-note"
                rows={3}
                value={managerNote}
                onChange={e => setManagerNote(e.target.value)}
                placeholder="Explain why this correction is approved or rejected..."
                minLength={5}
                maxLength={500}
                disabled={saving}
                required
              />
            </div>

            {formError && <p role="alert" style={{ color: "#c62828" }}>{formError}</p>}

            <div className="dialog-actions">
              <button type="button" className="btn btn-outline" onClick={closeReview} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving Decision..." : decision === "approved" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
