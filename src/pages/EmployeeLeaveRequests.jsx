import React from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ClipboardList } from "lucide-react";
import { Card, SectionTitle } from "../components/UI.jsx";
import { getMyLeaveRequests, submitLeaveRequest } from "../services/leaveHolidayApi.js";

function bahrainToday() {
  const pieces = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${pieces.year}-${pieces.month}-${pieces.day}`;
}

const leaveTypes = [
  ["annual", "Annual leave"], ["sick", "Sick leave"],
  ["unpaid", "Unpaid leave"], ["other", "Other leave"]
];

export default function EmployeeLeaveRequests() {
  const [requests, setRequests] = React.useState([]);
  const [leaveType, setLeaveType] = React.useState("annual");
  const [startDate, setStartDate] = React.useState(bahrainToday());
  const [endDate, setEndDate] = React.useState(bahrainToday());
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    getMyLeaveRequests()
      .then(rows => { if (active) setRequests(rows); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (endDate < startDate) { setError("End date must be on or after start date."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await submitLeaveRequest({ leaveType, startDate, endDate, reason: reason.trim() });
      setNotice(result.message || "Leave request submitted.");
      setReason("");
      setRefresh(v => v + 1);
    } catch (err) { setError(err.message || "Could not submit leave request."); }
    finally { setSaving(false); }
  }

  return <>
    <div className="page-heading">
      <div><span className="eyebrow">EMPLOYEE LEAVE</span><h1>Leave Requests</h1>
        <p>Request whole-day leave and track manager decisions.</p></div>
      <Link className="btn btn-outline" to="/employee/history">Attendance History</Link>
    </div>
    <Card>
      <SectionTitle icon={CalendarDays}>Request Leave</SectionTitle>
      {error && <p role="alert" style={{ color: "#c62828" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#167d46" }}>{notice}</p>}
      <form onSubmit={submit}>
        <div className="filters">
          <div className="field"><label htmlFor="leave-type">Leave type</label>
            <select id="leave-type" value={leaveType} onChange={e => setLeaveType(e.target.value)} disabled={saving}>
              {leaveTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></div>
          <div className="field"><label htmlFor="leave-start">First day</label>
            <input type="date" id="leave-start" value={startDate} onChange={e => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} required disabled={saving}/></div>
          <div className="field"><label htmlFor="leave-end">Last day (inclusive)</label>
            <input type="date" id="leave-end" min={startDate} value={endDate} onChange={e => setEndDate(e.target.value)} required disabled={saving}/></div>
        </div>
        <div className="field"><label htmlFor="leave-reason">Reason (10–1000 characters)</label>
          <textarea id="leave-reason" rows={3} minLength={10} maxLength={1000} required value={reason} onChange={e => setReason(e.target.value)} disabled={saving} placeholder="Explain the leave request..." style={{ width: "100%" }}/></div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Submitting..." : "Submit Leave Request"}</button>
        <p className="footnote">Your request must be approved before it affects attendance. Up to 90 consecutive calendar days per request.</p>
      </form>
    </Card>
    <Card><SectionTitle icon={ClipboardList}>My Leave Requests</SectionTitle>
      {loading ? <p>Loading leave requests...</p> :
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Type</th><th>From</th><th>To</th><th>Status</th><th>Reason</th><th>Manager Note</th></tr></thead>
          <tbody>{requests.map(row => <tr key={row.id}>
            <td>{leaveTypes.find(([key]) => key === row.leaveType)?.[1] || row.leaveType}</td>
            <td>{row.startDate}</td><td>{row.endDate}</td>
            <td><strong>{row.status}</strong></td><td>{row.reason}</td><td>{row.managerNote || "—"}</td>
          </tr>)}
            {!requests.length && <tr><td colSpan={6}>No leave requests submitted.</td></tr>}
          </tbody></table></div>}
    </Card>
  </>;
}
