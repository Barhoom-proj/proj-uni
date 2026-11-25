
import React from "react";

import {
  CalendarDays,
  UsersRound,
  Clock3,
  ClipboardCheck
} from "lucide-react";

import {
  Card,
  SectionTitle,
  StatCard
} from "../components/UI.jsx";

import {
  getManagerAttendance
} from "../services/managerAttendanceApi.js";

// Format attendance dates
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

// Convert UTC timestamps to Bahrain time
function formatTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: "Asia/Bahrain",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// Calculate working hours
function formatDuration(seconds) {
  if (seconds == null) return "—";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

// Get today's date in Bahrain
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

export default function ManagerAttendance() {
  // Attendance records from AWS
  const [records, setRecords] = React.useState([]);
  const [employeeCount, setEmployeeCount] = React.useState(0);

  // Loading and error states
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // Search and filter states
  const [search, setSearch] = React.useState("");
  const [month, setMonth] = React.useState("All");
  const [status, setStatus] = React.useState("All");
  const [refresh, setRefresh] = React.useState(0);

  // Fetch real attendance records from AWS
  React.useEffect(() => {
    let active = true;

    async function loadAttendance() {
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

    loadAttendance();

    return () => {
      active = false;
    };
  }, [refresh]);

  // Filter records by employee, month, and status
  const filtered = records.filter(record => {
    const name = (record.employeeName || "").toLowerCase();
    const department = (record.department || "").toLowerCase();
    const query = search.toLowerCase().trim();

    const matchesSearch =
      name.includes(query) || department.includes(query);

    const matchesMonth =
      month === "All" || record.date.startsWith(month);

    const matchesStatus =
      status === "All" || record.status === status;

    return matchesSearch && matchesMonth && matchesStatus;
  });

  // Available attendance months
  const months = [
    ...new Set(records.map(record => record.date.slice(0, 7)))
  ];

  // Calculate attendance statistics
  const today = todayBahrain();

  const todaysRecords = records.filter(
    record => record.date === today
  ).length;

  const completed = records.filter(
    record => record.status === "Completed"
  ).length;

  const openRecords = records.filter(
    record => record.status === "Checked In"
  ).length;

  return (
    <>
      {/* Page heading */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            MANAGER ATTENDANCE
          </span>

          <h1>Employee Attendance Records</h1>

          <p>
            View recorded employee check-ins, check-outs,
            and working hours.
          </p>
        </div>
      </div>

      {/* Attendance statistics */}
      <div className="stat-grid four">
        <StatCard
          label="Registered Employees"
          value={employeeCount}
          icon={UsersRound}
          tone="blue"
        />

        <StatCard
          label="Today's Records"
          value={todaysRecords}
          icon={CalendarDays}
          tone="green"
        />

        <StatCard
          label="Completed Records"
          value={completed}
          icon={ClipboardCheck}
          tone="blue"
        />

        <StatCard
          label="Open Records"
          value={openRecords}
          icon={Clock3}
          tone="amber"
        />
      </div>

      {/* Search and filters */}
      <Card className="filter-card">
        <div className="filters">
          <div className="field">
            <label htmlFor="manager-search">
              Search Employee
            </label>

            <input
              id="manager-search"
              type="search"
              placeholder="Employee name or department"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="manager-month">
              Month
            </label>

            <select
              id="manager-month"
              value={month}
              onChange={e => setMonth(e.target.value)}
            >
              <option value="All">All months</option>

              {months.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="manager-status">
              Status
            </label>

            <select
              id="manager-status"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="All">
                All statuses
              </option>

              <option value="Completed">
                Completed
              </option>

              <option value="Checked In">
                Checked In
              </option>
            </select>
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setRefresh(v => v + 1)}
          >
            Refresh Records
          </button>
        </div>
      </Card>

      {/* Attendance table */}
      <Card>
        <SectionTitle icon={CalendarDays}>
          Attendance Records
        </SectionTitle>

        {loading && (
          <p>Loading employee attendance records...</p>
        )}

        {error && (
          <p role="alert" style={{ color: "#c62828" }}>
            {error}
          </p>
        )}

        {!loading && !error && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Date</th>
                  <th>Check-In</th>
                  <th>Check-Out</th>
                  <th>Hours</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(record => (
                  <tr key={record.id}>
                    <td>{record.employeeName}</td>

                    <td>{record.department}</td>

                    <td>{formatDate(record.date)}</td>

                    <td>{formatTime(record.checkInAt)}</td>

                    <td>{formatTime(record.checkOutAt)}</td>

                    <td>
                      {formatDuration(record.durationSeconds)}
                    </td>

                    <td>{record.status}</td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      No attendance records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="footnote">
          Showing up to 200 recent records.
          Times are displayed in Bahrain time.
          Attendance records are read-only.
        </p>
      </Card>
    </>
  );
}
