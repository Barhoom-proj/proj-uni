
import React from "react";

import {
  CalendarClock,
  Clock3,
  UsersRound
} from "lucide-react";

import {
  Card,
  SectionTitle
} from "../components/UI.jsx";

import {
  getWorkSchedules,
  saveWorkSchedule
} from "../services/workSchedulesApi.js";

// Days of the week
const weekdays = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" }
];

// Get current date in Bahrain
function todayBahrain() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bahrain",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date()).map(
      ({ type, value }) => [type, value]
    )
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export default function WorkSchedules() {
  // Employee data
  const [employees, setEmployees] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState("");

  // Schedule settings
  const [effectiveFrom, setEffectiveFrom] =
    React.useState(todayBahrain());

  const [workDays, setWorkDays] =
    React.useState([0, 1, 2, 3, 4]);

  const [startTime, setStartTime] =
    React.useState("09:00");

  const [endTime, setEndTime] =
    React.useState("17:00");

  const [graceMinutes, setGraceMinutes] =
    React.useState(10);

  // Page states
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  // Load registered employees and schedules from AWS
  React.useEffect(() => {
    let active = true;

    async function loadEmployees() {
      try {
        const data = await getWorkSchedules();

        if (!active) return;

        setEmployees(data);

        if (data.length) {
          setSelectedId(String(data[0].employeeId));
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

    loadEmployees();

    return () => {
      active = false;
    };
  }, []);

  // Load the selected employee's saved schedule
  React.useEffect(() => {
    const employee = employees.find(
      e => String(e.employeeId) === selectedId
    );

    if (!employee) return;

    setEffectiveFrom(
      employee.effectiveFrom &&
      employee.effectiveFrom >= todayBahrain()
        ? employee.effectiveFrom
        : todayBahrain()
    );

    setWorkDays(
      employee.effectiveFrom
        ? employee.workDays
        : [0, 1, 2, 3, 4]
    );

    setStartTime(employee.startTime || "09:00");
    setEndTime(employee.endTime || "17:00");

    setGraceMinutes(
      employee.graceMinutes ?? 10
    );

    setError("");
    setMessage("");
  }, [selectedId, employees]);

  // Select or deselect working days
  function toggleDay(day) {
    setWorkDays(previous =>
      previous.includes(day)
        ? previous.filter(value => value !== day)
        : [...previous, day].sort((a, b) => a - b)
    );
  }

  // Save the employee's schedule to AWS
  async function submit(event) {
    event.preventDefault();

    if (!selectedId || saving) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await saveWorkSchedule(
        Number(selectedId),
        {
          effectiveFrom,
          workDays,
          startTime,
          endTime,
          graceMinutes: Number(graceMinutes)
        }
      );

      setMessage(result.message);

      // Reload updated schedules from AWS
      const updated = await getWorkSchedules();
      setEmployees(updated);

    } catch (err) {
      setError(
        err.message || "Unable to save work schedule."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Page heading */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            MANAGER SCHEDULING
          </span>

          <h1>Employee Work Schedules</h1>

          <p>
            Assign weekly working days, shift times,
            and allowed arrival grace periods.
          </p>
        </div>
      </div>

      {/* Schedule editor */}
      <Card>
        <SectionTitle icon={CalendarClock}>
          Manage Employee Schedule
        </SectionTitle>

        {loading && (
          <p>Loading employees from AWS...</p>
        )}

        {error && (
          <p role="alert" style={{ color: "#c62828" }}>
            {error}
          </p>
        )}

        {message && (
          <p role="status" style={{ color: "#167d46" }}>
            {message}
          </p>
        )}

        {!loading && employees.length === 0 && (
          <p>
            No registered employees were found in MySQL.
          </p>
        )}

        {!loading && employees.length > 0 && (
          <form onSubmit={submit}>

            {/* Employee selection */}
            <div className="field">
              <label htmlFor="schedule-employee">
                Employee
              </label>

              <select
                id="schedule-employee"
                value={selectedId}
                onChange={event =>
                  setSelectedId(event.target.value)
                }
                disabled={saving}
              >
                {employees.map(employee => (
                  <option
                    key={employee.employeeId}
                    value={employee.employeeId}
                  >
                    {employee.employeeName}
                  </option>
                ))}
              </select>
            </div>

            {/* Effective date */}
            <div className="field">
              <label htmlFor="schedule-effective">
                Effective From
              </label>

              <input
                id="schedule-effective"
                type="date"
                min={todayBahrain()}
                value={effectiveFrom}
                onChange={event =>
                  setEffectiveFrom(event.target.value)
                }
                required
                disabled={saving}
              />
            </div>

            {/* Working days */}
            <div className="field">
              <label>Scheduled Workdays</label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "12px",
                  marginTop: "10px",
                  marginBottom: "18px"
                }}
              >
                {weekdays.map(day => (
                  <label
                    key={day.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={workDays.includes(day.value)}
                      onChange={() => toggleDay(day.value)}
                      disabled={saving}
                    />

                    {day.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Shift settings */}
            <div className="filters">
              <div className="field">
                <label htmlFor="shift-start">
                  Shift Start
                </label>

                <input
                  id="shift-start"
                  type="time"
                  value={startTime}
                  onChange={event =>
                    setStartTime(event.target.value)
                  }
                  required
                  disabled={saving}
                />
              </div>

              <div className="field">
                <label htmlFor="shift-end">
                  Shift End
                </label>

                <input
                  id="shift-end"
                  type="time"
                  value={endTime}
                  onChange={event =>
                    setEndTime(event.target.value)
                  }
                  required
                  disabled={saving}
                />
              </div>

              <div className="field">
                <label htmlFor="shift-grace">
                  Grace Period (Minutes)
                </label>

                <input
                  id="shift-grace"
                  type="number"
                  min={0}
                  max={60}
                  step={1}
                  value={graceMinutes}
                  onChange={event =>
                    setGraceMinutes(event.target.value)
                  }
                  required
                  disabled={saving}
                />
              </div>
            </div>

            {/* Save button */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              <Clock3 size={17} />

              {saving
                ? "Saving Schedule..."
                : "Save Employee Schedule"}
            </button>

            <p className="footnote">
              Times use Bahrain local time.
              Overnight shifts are not yet supported.
              Choose an effective date of today or later.
            </p>
          </form>
        )}
      </Card>

      {/* Employee schedule overview */}
      <Card>
        <SectionTitle icon={UsersRound}>
          Registered Employees
        </SectionTitle>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Effective Date</th>
                <th>Workdays</th>
                <th>Shift</th>
              </tr>
            </thead>

            <tbody>
              {employees.map(employee => (
                <tr key={employee.employeeId}>
                  <td>{employee.employeeName}</td>

                  <td>
                    {employee.effectiveFrom || "Not assigned"}
                  </td>

                  <td>
                    {employee.effectiveFrom
                      ? employee.workDays
                          .map(day => weekdays[day].label)
                          .join(", ") || "No workdays"
                      : "—"}
                  </td>

                  <td>
                    {employee.effectiveFrom
                      ? `${employee.startTime}–${employee.endTime}`
                      : "—"}
                  </td>
                </tr>
              ))}

              {employees.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    No employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
