import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, CalendarCheck2, Clock3, ScanLine, TrendingUp, XCircle
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { getAttendanceHistory } from "../services/attendanceApi.js";
import { getMyAttendanceStatuses } from "../services/myAttendanceStatusApi.js";
import { AttendanceTable, Card, Pill, SectionTitle, StatCard } from "../components/UI.jsx";

function bahrainToday() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date()).map(x => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}`;
}

function clock(value) {
  return value ? new Date(value).toLocaleTimeString("en-US", {
    timeZone: "Asia/Bahrain", hour: "2-digit", minute: "2-digit", hour12: true
  }) : "—";
}

function tableClock(value) {
  return value ? new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bahrain", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }) : null;
}

function duration(seconds) {
  if (seconds == null) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export default function EmployeeDashboard() {
  const { account } = useAuth();
  const [records, setRecords] = React.useState([]);
  const [statusData, setStatusData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [history, status] = await Promise.all([
          getAttendanceHistory(), getMyAttendanceStatuses(90)
        ]);
        if (active) {
          setRecords(history);
          setStatusData(status);
        }
      } catch (err) {
        if (active) setError(err.message || "Unable to load attendance.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [refresh]);

  if (loading) return <div className="page-heading"><h1>Employee Dashboard</h1><p>Loading attendance records...</p></div>;
  if (error) return <div className="page-heading"><h1>Employee Dashboard</h1><p role="alert" style={{ color: "#c62828" }}>{error}</p><button className="btn btn-outline" onClick={() => setRefresh(v => v + 1)}>Retry</button></div>;

  const today = bahrainToday();
  const days = statusData?.records || [];
  const summary = statusData?.summary || {};
  const todayStatus = days.find(day => day.date === today);
  const dayMap = new Map(days.map(day => [day.date, day]));
  const present = Number(summary.present || 0);
  const late = Number(summary.late || 0);
  const absent = Number(summary.absent || 0);

  const recent = [...records].sort((a, b) =>
    (b.checkInAt || "").localeCompare(a.checkInAt || "")
  ).slice(0, 5).map(record => ({
    id: record.id,
    date: record.date,
    checkIn: tableClock(record.checkInAt),
    checkOut: tableClock(record.checkOutAt),
    status: dayMap.get(record.date)?.status || "Recorded"
  }));

  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const day = dayMap.get(iso);
    return {
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
      hours: (day?.durationSeconds || 0) / 3600,
      late: day?.status === "Late"
    };
  });

  const statusText = todayStatus?.checkOutAt
    ? `${todayStatus.status} • Checked Out`
    : todayStatus?.checkInAt
      ? `${todayStatus.status} • Checked In`
      : todayStatus?.status || "No Schedule";

  return <>
    <div className="welcome-banner">
      <div>
        <span className="eyebrow">EMPLOYEE DASHBOARD</span>
        <h1>Welcome back, <span className="accent">{account?.displayName || "Employee"}!</span></h1>
        <p>Track your attendance, scan the office QR code, and view your records.</p>
      </div>
      <div className="welcome-landscape" aria-hidden="true"><span/><span/><span/></div>
    </div>

    <div className="employee-feature-row">
      <Card className="today-card">
        <SectionTitle icon={CalendarCheck2}>Today's Attendance</SectionTitle>
        <div className="today-status">
          <span className={todayStatus?.checkInAt ? "check-icon" : "waiting-icon"}>{todayStatus?.checkInAt ? "✓" : "◷"}</span>
          <div>
            <strong>{statusText}</strong>
            <p>{todayStatus?.checkInAt ? "Your attendance was recorded today." : "Your status is based on your assigned work schedule."}</p>
          </div>
        </div>
        <div className="time-details">
          <div><span>Check-In</span><strong>{clock(todayStatus?.checkInAt)}</strong></div>
          <div><span>Check-Out</span><strong>{clock(todayStatus?.checkOutAt)}</strong></div>
          <div><span>Working Hours</span><strong>{duration(todayStatus?.durationSeconds)}</strong></div>
        </div>
      </Card>

      <Link to="/employee/scan" className="scan-cta">
        <ScanLine size={55} strokeWidth={1.8}/>
        <h2>Scan QR Code</h2>
        <p>Use your phone camera to scan the workplace QR code.</p>
        <span className="cta-button">Scan Instructions <ArrowRight size={18}/></span>
      </Link>

      <div className="summary-stack">
        <StatCard label="Present" value={present} sub="On-time days (last 90)" icon={CalendarCheck2} tone="green"/>
        <StatCard label="Late" value={late} sub="Late arrivals (last 90)" icon={Clock3} tone="amber"/>
        <StatCard label="Absent" value={absent} sub="Provisional absences (last 90)" icon={XCircle} tone="red"/>
      </div>
    </div>

    <div className="two-column bottom-grid">
      <Card>
        <SectionTitle icon={TrendingUp} action={<Pill>This Week</Pill>}>Weekly Attendance Overview</SectionTitle>
        <div className="chart-area">
          <div className="chart-y"><span>10h</span><span>8h</span><span>6h</span><span>4h</span><span>2h</span><span>0h</span></div>
          <div className="bar-chart">
            {week.map(day => <div className="bar-column" key={day.label}>
              <div className="bar-space">
                <div className={`bar ${day.late ? "bar-amber" : ""}`}
                  style={{ height: `${Math.min(day.hours / 10, 1) * 100}%` }}
                  title={`${day.hours.toFixed(2)} hours`}/>
              </div>
              <span>{day.label}</span>
            </div>)}
          </div>
        </div>
        <div className="chart-legend"><span><i className="legend-blue"/>Recorded hours</span><span><i className="legend-amber"/>Late</span></div>
      </Card>
      <Card>
        <SectionTitle icon={CalendarCheck2} action={<Link className="text-link" to="/employee/history">View All <ArrowRight size={16}/></Link>}>Recent Attendance</SectionTitle>
        <AttendanceTable rows={recent}/>
      </Card>
    </div>
    <p className="footnote">Late and absent statuses are schedule-based. Absences are provisional until leave and holidays are integrated.</p>
  </>;
}
