import React from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { Card, SectionTitle } from "../components/UI.jsx";
import { getManagerLeaveRequests, reviewLeaveRequest } from "../services/leaveHolidayApi.js";

export default function ManagerLeaveRequests() {
  const [requests, setRequests] = React.useState([]);
  const [filter, setFilter] = React.useState("pending");
  const [notes, setNotes] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [savingId, setSavingId] = React.useState(null);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    getManagerLeaveRequests()
      .then(rows => { if (active) setRequests(rows); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  async function review(id, decision) {
    if (savingId != null) return;
    const note = String(notes[id] || "").trim();
    if (decision === "rejected" && note.length < 5) {
      setError("Enter a manager note explaining the rejection (at least 5 characters).");
      return;
    }
    setSavingId(id); setError(""); setNotice("");
    try {
      const result = await reviewLeaveRequest(id, decision, note);
      setNotice(result.message || "Request reviewed.");
      setRefresh(v => v + 1);
    } catch (err) { setError(err.message || "Unable to review request."); }
    finally { setSavingId(null); }
  }

  const shown = requests.filter(row => filter === "all" || row.status === filter);
  return <>
    <div className="page-heading"><div><span className="eyebrow">MANAGER REVIEW</span>
      <h1>Employee Leave Requests</h1><p>Approve or reject requests before attendance exclusions apply.</p></div>
      <Link className="btn btn-outline" to="/manager/holidays">Public Holidays</Link></div>
    <Card>
      <SectionTitle icon={ClipboardList}>Leave Review Queue</SectionTitle>
      <div className="filters"><div className="field"><label htmlFor="leave-filter">Show requests</label>
        <select id="leave-filter" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="pending">Pending</option><option value="approved">Approved</option>
          <option value="rejected">Rejected</option><option value="all">All</option>
        </select></div>
        <button className="btn btn-outline" type="button" onClick={() => setRefresh(v => v + 1)}>Refresh</button>
      </div>
      {error && <p role="alert" style={{ color: "#c62828" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#167d46" }}>{notice}</p>}
      {loading ? <p>Loading employee leave requests...</p> :
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Reason</th><th>Status</th><th>Manager Note / Decision</th></tr></thead>
          <tbody>{shown.map(row => <tr key={row.id}>
            <td>{row.employeeName}</td><td>{row.leaveType}</td>
            <td>{row.startDate} to {row.endDate}</td><td>{row.reason}</td>
            <td><strong>{row.status}</strong></td>
            <td>{row.status === "pending" ? <div style={{ minWidth: 205, display: "grid", gap: 8 }}>
              <textarea rows={2} aria-label={`Manager note for ${row.employeeName}`} maxLength={500}
                value={notes[row.id] || ""} onChange={e => setNotes(v => ({ ...v, [row.id]: e.target.value }))}
                placeholder="Note (required to reject)" disabled={savingId != null}/>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" type="button" disabled={savingId != null} onClick={() => review(row.id, "approved")}>Approve</button>
                <button className="btn btn-outline" type="button" disabled={savingId != null} onClick={() => review(row.id, "rejected")}>Reject</button>
              </div>
            </div> : row.managerNote || "—"}</td>
          </tr>)}
            {!shown.length && <tr><td colSpan={6}>No leave requests match this filter.</td></tr>}
          </tbody></table></div>}
      <p className="footnote">Requests covering existing check-ins cannot be approved without first reviewing the attendance record. Leave does not change check-in data.</p>
    </Card>
  </>;
}
