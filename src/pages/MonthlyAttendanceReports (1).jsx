import React from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  RefreshCw,
  UsersRound,
  XCircle
} from "lucide-react";
import { Card, SectionTitle, StatCard } from "../components/UI.jsx";
import { getMonthlyAttendanceReport } from "../services/monthlyReportsApi.js";

function currentBahrainMonth() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit"
    }).formatToParts(new Date()).map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}`;
}

function formatDate(value) {
  return value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short", year: "numeric"
  }) : "—";
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bahrain", hour: "2-digit", minute: "2-digit", hour12: false
  }) : "—";
}

function csvCell(value) {
  const text = String(value ?? "");
  // Prevent spreadsheet formulas from running when names or departments start with =, +, - or @.
  const safe = /^[\s\uFEFF]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportCSV(filename, headers, rows) {
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], {
    type: "text/csv;charset=utf-8"
  }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MonthlyAttendanceReports() {
  const [month, setMonth] = React.useState(currentBahrainMonth());
  const [report, setReport] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("All");
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setReport(null);

    getMonthlyAttendanceReport(month)
      .then(data => { if (active) setReport(data); })
      .catch(err => { if (active) setError(err.message || "Unable to load report."); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [month, refresh]);

  const summary = report?.summary || {};
  const searchText = search.trim().toLowerCase();
  const matchesEmployee = row =>
    row.employeeName?.toLowerCase().includes(searchText) ||
    row.department?.toLowerCase().includes(searchText);
  const employees = (report?.employees || []).filter(matchesEmployee);
  const days = (report?.days || []).filter(row =>
    matchesEmployee(row) && (status === "All" || row.status === status)
  );

  function exportSummary() {
    exportCSV(
      `cloudtrek-monthly-summary-${month}.csv`,
      ["Month", "Employee ID", "Employee", "Department", "Present", "Late", "Absent (provisional)", "On Leave", "Holiday", "Awaiting Check-In", "Upcoming", "Completed Shifts", "Attendance Rate (%)", "Recorded Hours"],
      employees.map(e => [month, e.employeeId, e.employeeName, e.department, e.present, e.late, e.absent, e.onLeave, e.holidays, e.awaitingCheckIn, e.upcoming, e.completedShifts, e.attendanceRate ?? "", e.recordedHours])
    );
  }

  function exportDetails() {
    exportCSV(
      `cloudtrek-daily-attendance-${month}.csv`,
      ["Date", "Employee ID", "Employee", "Department", "Shift Start (Bahrain)", "Shift End (Bahrain)", "Check-In (Bahrain)", "Check-Out (Bahrain)", "Recorded Hours", "Status", "Exception"],
      days.map(d => [d.date, d.employeeId, d.employeeName, d.department, d.shiftStart || "", d.shiftEnd || "", formatTime(d.checkInAt) === "—" ? "" : formatTime(d.checkInAt), formatTime(d.checkOutAt) === "—" ? "" : formatTime(d.checkOutAt), d.durationSeconds == null ? "" : (d.durationSeconds / 3600).toFixed(2), d.status, d.exceptionLabel || ""])
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MANAGER REPORTING</span>
          <h1>Monthly Attendance Reports</h1>
          <p>Review scheduled attendance and export reports for Excel.</p>
        </div>
      </div>

      <Card className="filter-card">
        <div className="filters">
          <div className="field">
            <label htmlFor="report-month">Report month</label>
            <input id="report-month" type="month" value={month}
              max={currentBahrainMonth()}
              onChange={event => setMonth(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="report-employee">Search employee</label>
            <input id="report-employee" type="search" value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Name or department" />
          </div>
          <div className="field">
            <label htmlFor="report-status">Daily status</label>
            <select id="report-status" value={status}
              onChange={event => setStatus(event.target.value)}>
              <option value="All">All statuses</option>
              {["Present", "Late", "Absent", "On Leave", "Holiday", "Worked on Holiday", "Check-In During Leave", "Awaiting Check-In", "Upcoming", "Unscheduled Check-In", "Recorded (No Schedule)"].map(value =>
                <option key={value} value={value}>{value}</option>
              )}
            </select>
          </div>
          <button className="btn btn-outline" type="button" disabled={loading}
            onClick={() => setRefresh(n => n + 1)}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </Card>

      {loading && <Card><p>Generating monthly report from AWS...</p></Card>}
      {error && <Card><p role="alert" style={{ color: "#c62828" }}>{error}</p></Card>}

      {!loading && !error && report && (
        <>
          <div className="stat-grid four">
            <StatCard label="Employees" value={summary.employees || 0}
              icon={UsersRound} tone="blue" />
            <StatCard label="Present Shifts" value={summary.present || 0}
              icon={CheckCircle2} tone="green" />
            <StatCard label="Late Shifts" value={summary.late || 0}
              icon={Clock3} tone="amber" />
            <StatCard label="Absent Shifts" value={summary.absent || 0}
              icon={XCircle} tone="red" />
          </div>

          <Card>
            <SectionTitle icon={FileSpreadsheet}>Monthly Overview</SectionTitle>
            <p className="muted-text">
              Reporting period: {formatDate(report.periodFrom)}–{formatDate(report.throughDate)}.
              On leave: {summary.onLeave || 0}. Holidays: {summary.holidays || 0}.
              Attendance rate: {summary.attendanceRate == null ? "Not yet available" : `${summary.attendanceRate}%`}.
              Recorded hours: {Number(summary.recordedHours || 0).toFixed(2)}.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <button type="button" className="btn btn-primary"
                onClick={exportSummary} disabled={employees.length === 0}>
                <Download size={16} /> Export Summary CSV
              </button>
              <button type="button" className="btn btn-outline"
                onClick={exportDetails} disabled={days.length === 0}>
                <Download size={16} /> Export Daily CSV
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Employee</th><th>Department</th><th>Present</th><th>Late</th><th>Absent</th><th>Leave</th><th>Holidays</th><th>Hours</th><th>Attendance rate</th></tr>
                </thead>
                <tbody>
                  {employees.map(e => (
                    <tr key={e.employeeId}>
                      <td>{e.employeeName}</td><td>{e.department}</td>
                      <td>{e.present}</td><td>{e.late}</td><td>{e.absent}</td><td>{e.onLeave || 0}</td><td>{e.holidays || 0}</td>
                      <td>{Number(e.recordedHours).toFixed(2)}</td>
                      <td>{e.attendanceRate == null ? "—" : `${e.attendanceRate}%`}</td>
                    </tr>
                  ))}
                  {employees.length === 0 && <tr><td colSpan={9}>No employees match your search.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle icon={CalendarDays}>Daily Attendance Details</SectionTitle>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Employee</th><th>Scheduled shift</th><th>Check-In</th><th>Check-Out</th><th>Hours</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {days.map(d => (
                    <tr key={`${d.employeeId}-${d.date}`}>
                      <td>{formatDate(d.date)}</td><td>{d.employeeName}</td>
                      <td>{d.shiftStart ? `${d.shiftStart}–${d.shiftEnd}` : "—"}</td>
                      <td>{formatTime(d.checkInAt)}</td><td>{formatTime(d.checkOutAt)}</td>
                      <td>{d.durationSeconds == null ? "—" : (d.durationSeconds / 3600).toFixed(2)}</td>
                      <td>{d.status}</td>
                    </tr>
                  ))}
                  {days.length === 0 && <tr><td colSpan={7}>No daily records for these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="footnote">
              Present and Late count completed scheduled attendance classifications; Absent means no recorded check-in after a scheduled shift ends.
              Approved leave and configured holidays are excluded from absence counts and the attendance-rate denominator. No check-in is not treated as absence before the shift ends.
              The summary CSV follows employee search; the daily CSV follows both employee search and status filters. Headline statistics summarize the full selected month.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
