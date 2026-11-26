import React from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock3, FilePenLine, Hourglass, XCircle } from "lucide-react";
import { fullDate, formatHours } from "../data/demo.js";
import { Card, Dialog, SectionTitle, StatCard } from "../components/UI.jsx";
import { getAttendanceHistory } from "../services/attendanceApi.js";
import { createCorrectionRequest } from "../services/correctionApi.js";
import { getMyAttendanceStatuses } from "../services/myAttendanceStatusApi.js";

function time(value) {
  return value ? new Date(value).toLocaleTimeString("en-US", {
    timeZone: "Asia/Bahrain", hour: "2-digit", minute: "2-digit", hour12: true
  }) : "—";
}

function statusTone(status) {
  if (status === "Present") return "#167d46";
  if (status === "Late") return "#a96300";
  if (status === "Absent") return "#c62828";
  return "#526174";
}

export default function AttendanceHistory() {
  const [records, setRecords] = React.useState([]);
  const [statusData, setStatusData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [month, setMonth] = React.useState("All");
  const [status, setStatus] = React.useState("All");
  const [selected, setSelected] = React.useState(null);
  const [reason, setReason] = React.useState("");
  const [savingRequest, setSavingRequest] = React.useState(false);
  const [requestError, setRequestError] = React.useState("");
  const [requestSuccess, setRequestSuccess] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    async function loadHistory() {
      setLoading(true);
      setError("");
      try {
        const [history, daily] = await Promise.all([
          getAttendanceHistory(), getMyAttendanceStatuses(90)
        ]);
        if (active) {
          setRecords(history);
          setStatusData(daily);
        }
      } catch (err) {
        if (active) setError(err.message || "Unable to load attendance history.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadHistory();
    return () => { active = false; };
  }, [refresh]);

  const daily = statusData?.records || [];
  const recentDates = new Set(daily.map(row => row.date));

  // Keep all scheduled days and real check-ins within the 90-day window.
  // This includes days classified Absent, which have no attendance record ID.
  const calendarRows = daily.filter(row => row.scheduled || row.attendanceId != null);
  const olderRows = records
    .filter(row => !recentDates.has(row.date))
    .map(row => ({
      date: row.date,
      attendanceId: row.id,
      checkInAt: row.checkInAt,
      checkOutAt: row.checkOutAt,
      durationSeconds: row.durationSeconds,
      status: "Recorded (Outside Status Window)",
      scheduled: false
    }));
  const allRows = [...calendarRows, ...olderRows]
    .sort((a, b) => b.date.localeCompare(a.date));

  const months = [...new Set(allRows.map(row => row.date.slice(0, 7)))];
  const statuses = [...new Set(allRows.map(row => row.status))];
  const filtered = allRows.filter(row =>
    (month === "All" || row.date.startsWith(month)) &&
    (status === "All" || row.status === status)
  );
  const present = filtered.filter(row => row.status === "Present").length;
  const late = filtered.filter(row => row.status === "Late").length;
  const absent = filtered.filter(row => row.status === "Absent").length;
  const recordedHours = filtered.reduce((total, row) =>
    total + (Number(row.durationSeconds) || 0) / 3600, 0
  );

  function openCorrection(row) {
    if (row.attendanceId == null) return;
    setSelected(row);
    setReason("");
    setRequestError("");
    setRequestSuccess("");
  }
  function closeCorrection() {
    if (savingRequest) return;
    setSelected(null);
    setReason("");
    setRequestError("");
  }
  async function submit(event) {
    event.preventDefault();
    if (savingRequest || selected?.attendanceId == null) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10 || trimmed.length > 1000) {
      setRequestError("Reason must be between 10 and 1000 characters.");
      return;
    }
    setSavingRequest(true);
    setRequestError("");
    try {
      const result = await createCorrectionRequest({
        attendanceId: selected.attendanceId,
        reason: trimmed
      });
      setRequestSuccess(result.message || "Correction request submitted for review.");
      setSelected(null);
      setReason("");
      // The correction does not change attendance until a manager approves it.
    } catch (err) {
      setRequestError(err.message || "Unable to submit correction request.");
    } finally {
      setSavingRequest(false);
    }
  }

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">EMPLOYEE RECORDS</span>
        <h1>Attendance History</h1>
        <p>Review your schedule-based attendance status, recorded hours, and corrections.</p>
      </div>
      <Link className="btn btn-outline" to="/employee/corrections">My Correction Requests</Link>
    </div>

    <div className="stat-grid four">
      <StatCard label="Present Days" value={present} icon={CalendarDays} tone="green"/>
      <StatCard label="Late Days" value={late} icon={Clock3} tone="amber"/>
      <StatCard label="Absent Days" value={absent} icon={XCircle} tone="red"/>
      <StatCard label="Total Recorded Hours" value={formatHours(recordedHours)} icon={Hourglass} tone="blue"/>
    </div>

    <Card className="filter-card">
      <div className="filters">
        <div className="field">
          <label htmlFor="history-month">Month</label>
          <select id="history-month" value={month} onChange={e => setMonth(e.target.value)}>
            <option value="All">All months</option>
            {months.map(m => <option key={m} value={m}>
              {new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-GB", {
                timeZone: "UTC", month: "long", year: "numeric"
              })}
            </option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="history-status">Status</label>
          <select id="history-status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="All">All</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn btn-outline" type="button" onClick={() => { setMonth("All"); setStatus("All"); }}>Clear Filters</button>
        <button className="btn btn-outline" type="button" onClick={() => setRefresh(v => v + 1)}>Refresh</button>
      </div>
    </Card>

    <Card>
      <SectionTitle icon={CalendarDays}>Attendance Records</SectionTitle>
      {loading && <p>Loading attendance records...</p>}
      {error && <p role="alert" style={{ color: "#c62828" }}>{error}</p>}
      {requestSuccess && <p role="status" style={{ color: "#167d46" }}>{requestSuccess}</p>}
      {!loading && !error && <div className="table-wrap">
        <table className="data-table">
          <thead><tr>
            <th>Date</th><th>Check-In</th><th>Check-Out</th><th>Hours</th><th>Status</th><th>Action</th>
          </tr></thead>
          <tbody>
            {filtered.map(row => <tr key={`${row.date}-${row.attendanceId || "unrecorded"}`}>
              <td>{fullDate(row.date)}</td>
              <td>{time(row.checkInAt)}</td>
              <td>{time(row.checkOutAt)}</td>
              <td>{row.durationSeconds == null ? "—" : formatHours(row.durationSeconds / 3600)}</td>
              <td><span style={{ color: statusTone(row.status), fontWeight: 600 }}>{row.status}</span></td>
              <td>{row.attendanceId != null
                ? <button className="btn btn-outline btn-tiny" type="button" onClick={() => openCorrection(row)}>Request Correction</button>
                : <span className="muted-text">No recorded check-in</span>}
              </td>
            </tr>)}
            {filtered.length === 0 && <tr><td colSpan={6}>No attendance records match your filters.</td></tr>}
          </tbody>
        </table>
      </div>}
      <p className="footnote">Scheduled dates without check-ins are shown as provisional absences after shift end. Statuses are evaluated for the last 90 days. Older saved check-ins are listed as Recorded (Outside Status Window). Approved leave and holidays are not included yet.</p>
    </Card>

    {selected && <Dialog title="Request Attendance Correction" onClose={closeCorrection}>
      <form onSubmit={submit}>
        <p className="muted-text">Attendance date: <strong>{fullDate(selected.date)}</strong></p>
        <div className="field">
          <label htmlFor="correction-reason">Reason for correction</label>
          <textarea id="correction-reason" value={reason} onChange={e => setReason(e.target.value)}
            rows={4} minLength={10} maxLength={1000} required disabled={savingRequest}
            placeholder="Explain what is incorrect and the correct time you believe applies..."/>
        </div>
        {requestError && <p role="alert" style={{ color: "#c62828" }}>{requestError}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-outline" disabled={savingRequest} onClick={closeCorrection}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={savingRequest}>
            <FilePenLine size={16}/>{savingRequest ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </form>
    </Dialog>}
  </>;
}
