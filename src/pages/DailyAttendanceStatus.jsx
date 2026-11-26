
import React from "react";
import { Link } from "react-router-dom";

import {
  CalendarDays,
  Clock3,
  CheckCircle2,
  XCircle,
  RefreshCw,
  CalendarClock
} from "lucide-react";

import {
  Card,
  SectionTitle,
  StatCard
} from "../components/UI.jsx";

import {
  getManagerDailyAttendance
} from "../services/dailyAttendanceApi.js";

// Get today's date in Bahrain
function todayBahrain() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date())
      .map(({ type, value }) => [type, value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Format Check-In and Check-Out in Bahrain time
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

// Format working hours
function formatDuration(seconds) {
  if (seconds == null) return "—";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

// Choose a color for each attendance status
function statusColor(status) {
  switch (status) {
    case "Present":
      return {
        bg: "#ddf7e9",
        text: "#166534"
      };

    case "Late":
      return {
        bg: "#fff0cd",
        text: "#92400e"
      };

    case "Absent":
      return {
        bg: "#ffe3e6",
        text: "#b42336"
      };

    case "Awaiting Check-In":
    case "Upcoming":
      return {
        bg: "#e4efff",
        text: "#205cbd"
      };

    default:
      return {
        bg: "#edf0f5",
        text: "#526174"
      };
  }
}

export default function DailyAttendanceStatus() {
  // Selected attendance date
  const [date, setDate] = React.useState(todayBahrain());

  // Attendance data from AWS
  const [data, setData] = React.useState(null);

  // Filter and page states
  const [filter, setFilter] = React.useState("All");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  // Retrieve daily attendance from AWS
  React.useEffect(() => {
    let active = true;

    async function loadAttendance() {
      setLoading(true);
      setError("");

      try {
        const result =
          await getManagerDailyAttendance(date);

        if (active) {
          setData(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err.message || "Unable to load attendance."
          );
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
  }, [date, refresh]);

  // Employee records
  const employees = data?.employees || [];

  // Attendance summary
  const summary = data?.summary || {
    totalEmployees: 0,
    scheduledEmployees: 0,
    present: 0,
    late: 0,
    absent: 0,
    awaitingCheckIn: 0,
    upcoming: 0,
    notScheduled: 0,
    noSchedule: 0
  };

  // Available attendance statuses
  const statuses = [
    "Present",
    "Late",
    "Absent",
    "Awaiting Check-In",
    "Upcoming",
    "Not Scheduled",
    "No Schedule",
    "Unscheduled Check-In",
    "Recorded (No Schedule)"
  ];

  // Filter employees by selected status
  const filtered = employees.filter(
    employee =>
      filter === "All" || employee.status === filter
  );

  return (
    <>
      {/* Page heading */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            MANAGER ATTENDANCE
          </span>

          <h1>Daily Attendance Status</h1>

          <p>
            Monitor employee attendance against assigned
            work schedules.
          </p>
        </div>

        <Link
          to="/manager/schedules"
          className="btn btn-outline"
        >
          <CalendarClock size={17} />
          Manage Schedules
        </Link>
      </div>

      {/* Attendance statistics */}
      <div className="stat-grid four">
        <StatCard
          label="Scheduled Employees"
          value={summary.scheduledEmployees}
          icon={CalendarDays}
          tone="blue"
        />

        <StatCard
          label="Present"
          value={summary.present}
          icon={CheckCircle2}
          tone="green"
        />

        <StatCard
          label="Late"
          value={summary.late}
          icon={Clock3}
          tone="amber"
        />

        <StatCard
          label="Absent"
          value={summary.absent}
          icon={XCircle}
          tone="red"
        />
      </div>

      {/* Attendance filters */}
      <Card className="filter-card">
        <div className="filters">

          {/* Date filter */}
          <div className="field">
            <label htmlFor="daily-date">
              Attendance Date
            </label>

            <input
              id="daily-date"
              type="date"
              value={date}
              onChange={event => {
                setDate(event.target.value);
                setFilter("All");
              }}
            />
          </div>

          {/* Status filter */}
          <div className="field">
            <label htmlFor="daily-status">
              Attendance Status
            </label>

            <select
              id="daily-status"
              value={filter}
              onChange={event =>
                setFilter(event.target.value)
              }
            >
              <option value="All">
                All Statuses
              </option>

              {statuses.map(status => (
                <option
                  key={status}
                  value={status}
                >
                  {status}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh button */}
          <button
            className="btn btn-outline"
            type="button"
            disabled={loading}
            onClick={() => setRefresh(v => v + 1)}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

        </div>
      </Card>

      {/* Attendance records table */}
      <Card>
        <SectionTitle icon={CalendarDays}>
          Employee Attendance Status
        </SectionTitle>

        <p className="muted-text">
          Date: {date}
        </p>

        {loading && (
          <p>
            Calculating attendance from AWS...
          </p>
        )}

        {error && (
          <p
            role="alert"
            style={{ color: "#c62828" }}
          >
            {error}
          </p>
        )}

        {!loading && !error && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th>Grace</th>
                  <th>Check-In</th>
                  <th>Check-Out</th>
                  <th>Hours</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(employee => {
                  const colors =
                    statusColor(employee.status);

                  return (
                    <tr key={employee.employeeId}>
                      <td>
                        {employee.employeeName}
                      </td>

                      <td>
                        {employee.scheduled
                          ? `${employee.shiftStart}–${employee.shiftEnd}`
                          : "—"}
                      </td>

                      <td>
                        {employee.scheduled
                          ? `${employee.graceMinutes} min`
                          : "—"}
                      </td>

                      <td>
                        {formatTime(employee.checkInAt)}
                      </td>

                      <td>
                        {formatTime(employee.checkOutAt)}
                      </td>

                      <td>
                        {formatDuration(
                          employee.durationSeconds
                        )}
                      </td>

                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: "20px",
                            fontWeight: 600,
                            fontSize: "12px",
                            background: colors.bg,
                            color: colors.text
                          }}
                        >
                          {employee.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      No matching attendance records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="footnote">
          Attendance uses Bahrain time.
          Absent means no recorded check-in after the
          scheduled shift ended.
          Leave and public holidays are not yet considered.
        </p>
      </Card>
    </>
  );
}
