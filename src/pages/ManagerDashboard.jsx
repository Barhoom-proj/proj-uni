
import React from "react";
import { Link } from "react-router-dom";

import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  UsersRound
} from "lucide-react";

import { useAuth } from "../context/AuthContext.jsx";

import {
  getManagerAttendance
} from "../services/managerAttendanceApi.js";

import {
  Card,
  SectionTitle,
  StatCard
} from "../components/UI.jsx";

// Get today's date in Bahrain.
function todayBahrain() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bahrain",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

// Format UTC timestamps in Bahrain time.
function formatTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: "Asia/Bahrain",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// Format attendance date.
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

// Format working hours.
function formatDuration(seconds) {
  if (seconds == null) return "—";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export default function ManagerDashboard() {
  const { account } = useAuth();

  const [records, setRecords] = React.useState([]);
  const [employeeCount, setEmployeeCount] = React.useState(0);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  // Retrieve manager attendance records from AWS.
  React.useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const data = await getManagerAttendance();

        if (active) {
          setRecords(data.records);
          setEmployeeCount(data.employeeCount);
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

    loadDashboard();

    return () => {
      active = false;
    };
  }, [refresh]);

  if (loading) {
    return (
      <div className="page-heading">
        <h1>Manager Dashboard</h1>
        <p>Loading team attendance from AWS...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-heading">
        <h1>Manager Dashboard</h1>

        <p role="alert" style={{ color: "#c62828" }}>
          {error}
        </p>

        <button
          type="button"
          onClick={() => setRefresh(value => value + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  // Today's saved attendance records.
  const today = todayBahrain();

  const todayRecords = records.filter(
    record => record.date === today
  );

  const checkedInToday = new Set(
    todayRecords.map(record => record.employeeId)
  ).size;

  const checkedOutToday = new Set(
    todayRecords
      .filter(record => record.checkOutAt)
      .map(record => record.employeeId)
  ).size;

  // No record does not necessarily mean absent.
  const noCheckInToday = Math.max(
    0,
    employeeCount - checkedInToday
  );

  // Calculate Monday of the current week.
  const monday = new Date(`${today}T12:00:00Z`);

  const offset = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - offset);

  // Weekly overview: Monday through Friday.
  const week = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);

    const dateString = date.toISOString().slice(0, 10);

    const dayRecords = records.filter(
      record => record.date === dateString
    );

    const employeeIds = new Set(
      dayRecords.map(record => record.employeeId)
    );

    return {
      label: ["Mon", "Tue", "Wed", "Thu", "Fri"][index],
      checkedIn: employeeIds.size
    };
  });

  // Latest attendance records.
  const recent = [...records]
    .sort((a, b) =>
      (b.checkInAt || "").localeCompare(a.checkInAt || "")
    )
    .slice(0, 6);

  // Donut chart values.
  const checkedInPercent = employeeCount > 0
    ? Math.min(100, checkedInToday / employeeCount * 100)
    : 0;

  return (
    <>
      {/* Welcome section */}
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
            View your team's real attendance records
            and daily activity.
          </p>
        </div>

        <div className="today-date">
          <CalendarDays size={19} />
          {formatDate(today)}
        </div>
      </div>

      {/* Summary cards */}
      <div className="stat-grid four">

        <StatCard
          label="Total Team"
          value={employeeCount}
          icon={UsersRound}
          tone="blue"
        />

        <StatCard
          label="Checked In Today"
          value={checkedInToday}
          icon={CalendarDays}
          tone="green"
        />

        <StatCard
          label="Checked Out Today"
          value={checkedOutToday}
          icon={Clock3}
          tone="blue"
        />

        <StatCard
          label="No Check-In Today"
          value={noCheckInToday}
          icon={CalendarClock}
          tone="amber"
        />

      </div>

      <div className="manager-main-grid">
        <div className="manager-primary">

          {/* Charts */}
          <div className="two-column manager-charts">

            {/* Weekly attendance */}
            <Card>
              <SectionTitle icon={ChartNoAxesCombined}>
                Weekly Attendance Overview
              </SectionTitle>

              <div className="group-bars">
                {week.map(day => (
                  <div
                    key={day.label}
                    className="group-bar-item"
                  >
                    <div className="group-bar">
                      <div
                        className="bar-p"
                        style={{
                          height: `${
                            employeeCount > 0
                              ? Math.min(
                                  100,
                                  day.checkedIn / employeeCount * 100
                                )
                              : 0
                          }%`
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
            </Card>

            {/* Today's team status */}
            <Card>
              <SectionTitle icon={UsersRound}>
                Today's Team Status
              </SectionTitle>

              <div className="donut-layout">
                <div
                  className="donut"
                  style={{
                    background: `conic-gradient(
                      #2477ee 0% ${checkedInPercent}%,
                      #e2e8f0 ${checkedInPercent}% 100%
                    )`
                  }}
                >
                  <div>
                    <strong>{employeeCount}</strong>
                    <small>Employees</small>
                  </div>
                </div>

                <div className="donut-legend">
                  <div>
                    <i className="legend-blue" />
                    Checked In Today
                    <strong>{checkedInToday}</strong>
                  </div>

                  <div>
                    <i className="legend-red" />
                    No Check-In Record
                    <strong>{noCheckInToday}</strong>
                  </div>
                </div>
              </div>
            </Card>

          </div>

          {/* Recent attendance table */}
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
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {recent.map(record => (
                    <tr key={record.id}>
                      <td>{record.employeeName}</td>

                      <td>{formatDate(record.date)}</td>

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

                      <td>{record.status}</td>
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

        {/* Secondary cards */}
        <div className="manager-secondary">

          <Card>
            <SectionTitle icon={CalendarClock}>
              Attendance Requests
            </SectionTitle>

            <div className="request-compact">
              <p className="muted-text">
                Attendance correction requests will
                appear here once the request and approval
                backend is implemented.
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
                {checkedInToday} employees have
                checked in today.
              </p>

              <p>
                <span>●</span>
                {checkedOutToday} employees have
                checked out today.
              </p>

              <p>
                <span>●</span>
                {noCheckInToday} employees have no
                check-in record today.
              </p>
            </div>
          </Card>

        </div>
      </div>
    </>
  );
}
