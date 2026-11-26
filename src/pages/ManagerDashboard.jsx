import React from "react";
import { Link } from "react-router-dom";

import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  UsersRound,
  XCircle
} from "lucide-react";

import { useAuth } from "../context/AuthContext.jsx";

import {
  getManagerAttendance
} from "../services/managerAttendanceApi.js";

import {
  getManagerDailyAttendance
} from "../services/dailyAttendanceApi.js";

import {
  Card,
  SectionTitle,
  StatCard
} from "../components/UI.jsx";

// Get today's date in Bahrain
function todayBahrain() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Format attendance date
function formatDate(value) {
  if (!value) return "—";

  return new Date(`${value}T12:00:00Z`)
    .toLocaleDateString("en-GB", {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
}

// Convert UTC attendance timestamps to Bahrain time
function formatTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleTimeString(
    "en-US",
    {
      timeZone: "Asia/Bahrain",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }
  );
}

// Format recorded working hours
function formatDuration(seconds) {
  if (seconds == null) return "—";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

// Protect chart percentages against division by zero
function percentage(value, total) {
  if (total <= 0) return 0;

  return Math.min(
    100,
    Math.max(0, (value / total) * 100)
  );
}

export default function ManagerDashboard() {
  const { account } = useAuth();

  // Real attendance records
  const [records, setRecords] = React.useState([]);

  // Real schedule-based daily attendance
  const [dailyData, setDailyData] = React.useState(null);

  const [employeeCount, setEmployeeCount] =
    React.useState(0);

  // Page state
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  const today = todayBahrain();

  // Load both AWS APIs
  React.useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const [
          attendanceResult,
          dailyResult
        ] = await Promise.all([
          getManagerAttendance(),
          getManagerDailyAttendance(today)
        ]);

        if (!active) return;

        setRecords(attendanceResult.records);
        setEmployeeCount(
          attendanceResult.employeeCount
        );

        setDailyData(dailyResult);

      } catch (err) {
        if (active) {
          setError(
            err.message ||
            "Unable to retrieve dashboard data."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [today, refresh]);

  if (loading) {
    return (
      <div className="page-heading">
        <h1>Manager Dashboard</h1>
        <p>Loading attendance data from AWS...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-heading">
        <h1>Manager Dashboard</h1>

        <p
          role="alert"
          style={{ color: "#c62828" }}
        >
          {error}
        </p>

        <button
          type="button"
          className="btn btn-outline"
          onClick={() => setRefresh(v => v + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  // Real status counts from the Daily Attendance Lambda
  const summary = dailyData?.summary || {};

  const totalTeam =
    Number(summary.totalEmployees ?? employeeCount);

  const scheduled =
    Number(summary.scheduledEmployees || 0);

  const present = Number(summary.present || 0);
  const late = Number(summary.late || 0);
  const absent = Number(summary.absent || 0);

  const awaiting =
    Number(summary.awaitingCheckIn || 0);

  const upcoming =
    Number(summary.upcoming || 0);

  // Employees with a scheduled shift but not yet
  // classified Present, Late, or Absent
  const otherScheduled = Math.max(
    0,
    scheduled - present - late - absent
  );

  // Build weekly check-in activity from real records.
  // This chart counts check-ins, not lateness or absence.
  const monday = new Date(`${today}T12:00:00Z`);

  monday.setUTCDate(
    monday.getUTCDate() -
    ((monday.getUTCDay() + 6) % 7)
  );

  const week = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);

    date.setUTCDate(
      monday.getUTCDate() + index
    );

    const dateString = date.toISOString().slice(0, 10);

    const dayRecords = records.filter(
      record =>
        record.date === dateString &&
        Boolean(record.checkInAt)
    );

    const checkedIn = new Set(
      dayRecords.map(record => record.employeeId)
    ).size;

    return {
      label: ["Mon", "Tue", "Wed", "Thu", "Fri"][index],
      checkedIn
    };
  });

  // Latest actual attendance records
  const recent = [...records]
    .sort((a, b) =>
      (b.checkInAt || "").localeCompare(
        a.checkInAt || ""
      )
    )
    .slice(0, 6);

  // Donut chart percentages (scheduled employees only)
  const presentPct = percentage(present, scheduled);
  const latePct = percentage(late, scheduled);
  const absentPct = percentage(absent, scheduled);

  const lateEnd = presentPct + latePct;
  const absentEnd = lateEnd + absentPct;

  return (
    <>
      {/* Welcome banner */}
      <div className="welcome-banner manager-welcome">
        <div>
          <span className="eyebrow">
            MANAGER DASHBOARD
          </span>

          <h1>
            Welcome back,{" "}
            <span className="accent">
              {account?.displayName || "Manager"}!
            </span>
          </h1>

          <p>
            Monitor your team's attendance using real
            employee schedules and recorded check-ins.
          </p>
        </div>

        <div className="today-date">
          <CalendarDays size={19} />
          {formatDate(today)}
        </div>
      </div>

      {/* Real attendance statistics */}
      <div className="stat-grid four">

        <StatCard
          label="Total Team"
          value={totalTeam}
          sub={`${scheduled} scheduled today`}
          icon={UsersRound}
          tone="blue"
        />

        <StatCard
          label="Present"
          value={present}
          sub="On-time check-ins"
          icon={CalendarDays}
          tone="green"
        />

        <StatCard
          label="Late"
          value={late}
          sub="After grace period"
          icon={Clock3}
          tone="amber"
        />

        <StatCard
          label="Absent"
          value={absent}
          sub="No check-in after shift"
          icon={XCircle}
          tone="red"
        />

      </div>

      <div className="manager-main-grid">
        <div className="manager-primary">

          <div className="two-column manager-charts">

            {/* Weekly check-in chart */}
            <Card>
              <SectionTitle icon={ChartNoAxesCombined}>
                Weekly Check-In Activity
              </SectionTitle>

              <div className="group-bars">
                {week.map(day => (
                  <div
                    className="group-bar-item"
                    key={day.label}
                  >
                    <div className="group-bar">
                      <div
                        className="bar-p"
                        style={{
                          height:
                            `${percentage(
                              day.checkedIn,
                              totalTeam
                            )}%`
                        }}
                        title={
                          `${day.checkedIn} employees checked in`
                        }
                      />
                    </div>

                    <span>{day.label}</span>
                  </div>
                ))}
              </div>

              <div className="chart-legend">
                <span>
                  <i className="legend-blue" />
                  Employees checked in
                </span>
              </div>

              <p className="footnote">
                Based on saved check-ins from the
                recent attendance records.
              </p>
            </Card>

            {/* Today's schedule-based attendance chart */}
            <Card>
              <SectionTitle
                icon={UsersRound}
                action={
                  <Link
                    to="/manager/daily-attendance"
                    className="text-link"
                  >
                    View Details
                    <ArrowRight size={16} />
                  </Link>
                }
              >
                Today's Team Status
              </SectionTitle>

              <div className="donut-layout">
                <div
                  className="donut"
                  style={{
                    background: `conic-gradient(
                      #2477ee 0% ${presentPct}%,
                      #f9b838 ${presentPct}% ${lateEnd}%,
                      #f36377 ${lateEnd}% ${absentEnd}%,
                      #e2e8f0 ${absentEnd}% 100%
                    )`
                  }}
                >
                  <div>
                    <strong>{scheduled}</strong>
                    <small>Scheduled</small>
                  </div>
                </div>

                <div className="donut-legend">
                  <div>
                    <i className="legend-blue" />
                    Present
                    <strong>{present}</strong>
                  </div>

                  <div>
                    <i className="legend-amber" />
                    Late
                    <strong>{late}</strong>
                  </div>

                  <div>
                    <i className="legend-red" />
                    Absent
                    <strong>{absent}</strong>
                  </div>

                  <div>
                    Other / Pending
                    <strong>{otherScheduled}</strong>
                  </div>
                </div>
              </div>

            </Card>
          </div>

          {/* Recent attendance records */}
          <Card>
            <SectionTitle
              icon={CalendarClock}
              action={
                <Link
                  to="/manager/attendance"
                  className="text-link"
                >
                  View All
                  <ArrowRight size={16} />
                </Link>
              }
            >
              Recent Attendance
            </SectionTitle>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Check-In</th>
                    <th>Check-Out</th>
                    <th>Hours</th>
                    <th>Session</th>
                  </tr>
                </thead>

                <tbody>
                  {recent.map(record => (
                    <tr key={record.id}>
                      <td>
                        {record.employeeName}
                      </td>

                      <td>
                        {formatDate(record.date)}
                      </td>

                      <td>
                        {formatTime(record.checkInAt)}
                      </td>

                      <td>
                        {formatTime(record.checkOutAt)}
                      </td>

                      <td>
                        {formatDuration(
                          record.durationSeconds
                        )}
                      </td>

                      <td>
                        {record.status}
                      </td>
                    </tr>
                  ))}

                  {recent.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        No attendance records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

        </div>

        {/* Secondary information */}
        <div className="manager-secondary">

          <Card>
            <SectionTitle
              icon={CalendarClock}
              action={
                <Link
                  to="/manager/requests"
                  className="text-link"
                >
                  View Requests
                  <ArrowRight size={16} />
                </Link>
              }
            >
              Attendance Corrections
            </SectionTitle>

            <div className="request-compact">
              <p className="muted-text">
                Review employee attendance correction
                requests and approval decisions.
              </p>
            </div>
          </Card>

          <Card>
            <SectionTitle icon={Bell}>
              Attendance Notifications
            </SectionTitle>

            <div className="notification-list">
              <p>
                <span>●</span>
                {late} employees arrived late today.
              </p>

              <p>
                <span>●</span>
                {absent} employees have no check-in
                after their scheduled shift ended.
              </p>

              <p>
                <span>●</span>
                {awaiting + upcoming} scheduled
                employees are awaiting their shift
                or check-in.
              </p>
            </div>
          </Card>

        </div>
      </div>

      <p className="footnote">
        Attendance classifications are calculated
        from employee schedules and saved check-ins.
        Absence counts are provisional until approved
        leave and holidays are integrated.
      </p>
    </>
  );
}