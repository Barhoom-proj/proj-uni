
import React from "react";
import { Link } from "react-router-dom";

import {
  ArrowRight,
  CalendarCheck2,
  Clock3,
  ScanLine,
  TrendingUp,
  ClipboardCheck
} from "lucide-react";

import { useAuth } from "../context/AuthContext.jsx";

import {
  getAttendanceHistory
} from "../services/attendanceApi.js";

import {
  AttendanceTable,
  Card,
  Pill,
  SectionTitle,
  StatCard
} from "../components/UI.jsx";

// Current date in Bahrain
function getBahrainDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bahrain",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(p => [p.type, p.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

// Format server timestamps in Bahrain time
function formatTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: "Asia/Bahrain",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// Format timestamps as HH:mm for the existing table
function formatTableTime(value) {
  if (!value) return null;

  return new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bahrain",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
}

// Calculate hours and minutes
function formatDuration(seconds) {
  if (seconds == null) return "—";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export default function EmployeeDashboard() {
  const { account } = useAuth();

  const [records, setRecords] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // Retrieve actual attendance records from AWS
  React.useEffect(() => {
    let active = true;

    async function loadAttendance() {
      try {
        setLoading(true);
        setError("");

        const data = await getAttendanceHistory();

        if (active) {
          setRecords(data);
        }
      } catch (err) {
        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAttendance();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="page-heading">
        <h1>Employee Dashboard</h1>
        <p>Loading your attendance records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-heading">
        <h1>Employee Dashboard</h1>
        <p role="alert" style={{ color: "#c62828" }}>
          {error}
        </p>
        <button onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  const todayDate = getBahrainDate();

  // Find today's attendance record
  const today = records.find(
    record => record.date === todayDate
  );

  // Calculate summary statistics
  const present = records.filter(
    record => Boolean(record.checkInAt)
  ).length;

  const completed = records.filter(
    record => Boolean(record.checkOutAt)
  ).length;

  const active = records.filter(
    record => record.checkInAt && !record.checkOutAt
  ).length;

  // Generate current week's dates, Monday to Sunday
  const monday = new Date(
    `${todayDate}T12:00:00Z`
  );

  const dayOffset = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - dayOffset);

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);

    const dayISO = date.toISOString().slice(0, 10);

    const dayRecords = records.filter(
      record => record.date === dayISO
    );

    const seconds = dayRecords.reduce(
      (total, record) =>
        total + (Number(record.durationSeconds) || 0),
      0
    );

    return {
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
      value: seconds / 3600
    };
  });

  // Prepare records for the existing CloudTrek table
  const recentRecords = [...records]
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      (b.checkInAt || "").localeCompare(a.checkInAt || "")
    )
    .slice(0, 5)
    .map(record => ({
      id: record.id,
      date: record.date,
      checkIn: formatTableTime(record.checkInAt),
      checkOut: formatTableTime(record.checkOutAt),
      status: "Present"
    }));

  // Determine today's attendance status
  const todayStatus = today?.checkOutAt
    ? "Checked Out"
    : today?.checkInAt
      ? "Checked In"
      : "Not Checked In";

  return (
    <>
      {/* Welcome section */}
      <div className="welcome-banner">
        <div>
          <span className="eyebrow">
            EMPLOYEE DASHBOARD
          </span>

          <h1>
            Welcome back,{" "}
            <span className="accent">
              {account?.displayName || "Employee"}!
            </span>
          </h1>

          <p>
            Track your attendance, scan the office QR code,
            and view your records.
          </p>
        </div>

        <div
          className="welcome-landscape"
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </div>
      </div>

      {/* Main dashboard cards */}
      <div className="employee-feature-row">

        {/* Today's Attendance */}
        <Card className="today-card">
          <SectionTitle icon={CalendarCheck2}>
            Today's Attendance
          </SectionTitle>

          <div className="today-status">
            <span
              className={
                today?.checkInAt
                  ? "check-icon"
                  : "waiting-icon"
              }
            >
              {today?.checkInAt ? "✓" : "◷"}
            </span>

            <div>
              <strong>{todayStatus}</strong>

              <p>
                {today?.checkInAt
                  ? "Your attendance has been recorded today."
                  : "Scan the office QR code to record attendance."}
              </p>
            </div>
          </div>

          <div className="time-details">
            <div>
              <span>Check-In</span>
              <strong>
                {formatTime(today?.checkInAt)}
              </strong>
            </div>

            <div>
              <span>Check-Out</span>
              <strong>
                {formatTime(today?.checkOutAt)}
              </strong>
            </div>

            <div>
              <span>Working Hours</span>
              <strong>
                {formatDuration(today?.durationSeconds)}
              </strong>
            </div>
          </div>
        </Card>

        {/* QR scanning instructions */}
        <Link to="/employee/scan" className="scan-cta">
          <ScanLine size={55} strokeWidth={1.8} />

          <h2>Scan QR Code</h2>

          <p>
            Use your phone camera to scan the workplace
            QR code and record attendance.
          </p>

          <span className="cta-button">
            Scan Instructions
            <ArrowRight size={18} />
          </span>
        </Link>

        {/* Attendance summary */}
        <div className="summary-stack">
          <StatCard
            label="Present"
            value={present}
            sub="Recorded attendance days"
            icon={CalendarCheck2}
            tone="green"
          />

          <StatCard
            label="Completed"
            value={completed}
            sub="Completed attendance sessions"
            icon={ClipboardCheck}
            tone="blue"
          />

          <StatCard
            label="Checked In"
            value={active}
            sub="Sessions awaiting check-out"
            icon={Clock3}
            tone="amber"
          />
        </div>
      </div>

      {/* Bottom dashboard section */}
      <div className="two-column bottom-grid">

        {/* Weekly chart */}
        <Card>
          <SectionTitle
            icon={TrendingUp}
            action={<Pill>This Week</Pill>}
          >
            Weekly Attendance Overview
          </SectionTitle>

          <div className="chart-area">
            <div className="chart-y">
              <span>10h</span>
              <span>8h</span>
              <span>6h</span>
              <span>4h</span>
              <span>2h</span>
              <span>0h</span>
            </div>

            <div className="bar-chart">
              {week.map(day => (
                <div
                  className="bar-column"
                  key={day.label}
                >
                  <div className="bar-space">
                    <div
                      className="bar"
                      style={{
                        height:
                          `${Math.min(day.value / 10, 1) * 100}%`
                      }}
                      title={`${day.value.toFixed(2)} hours`}
                    />
                  </div>

                  <span>{day.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-legend">
            <span>
              <i className="legend-blue" />
              Recorded working hours
            </span>
          </div>
        </Card>

        {/* Recent attendance */}
        <Card>
          <SectionTitle
            icon={CalendarCheck2}
            action={
              <Link
                className="text-link"
                to="/employee/history"
              >
                View All
                <ArrowRight size={16} />
              </Link>
            }
          >
            Recent Attendance
          </SectionTitle>

          <AttendanceTable rows={recentRecords} />
        </Card>
      </div>
    </>
  );
}
