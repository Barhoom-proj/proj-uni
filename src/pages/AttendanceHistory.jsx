
import React from "react";
import {
  CalendarDays,
  Clock3,
  FilePenLine,
  Hourglass,
  XCircle
} from "lucide-react";

import {
  fullDate,
  formatHours
} from "../data/demo.js";

import {
  AttendanceTable,
  Card,
  Dialog,
  SectionTitle,
  StatCard
} from "../components/UI.jsx";

import {
  getAttendanceHistory
} from "../services/attendanceApi.js";

import {
  createCorrectionRequest
} from "../services/correctionApi.js";

export default function AttendanceHistory() {
  const [status, setStatus] = React.useState("All");
  const [selected, setSelected] = React.useState(null);
  const [reason, setReason] = React.useState("");
  const [month, setMonth] = React.useState("All");

  // Real AWS attendance records
  const [records, setRecords] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // Real correction request states
  const [savingRequest, setSavingRequest] =
    React.useState(false);
  const [requestError, setRequestError] =
    React.useState("");
  const [requestSuccess, setRequestSuccess] =
    React.useState("");

  // Load attendance records from AWS
  React.useEffect(() => {
    let active = true;

    async function loadHistory() {
      setLoading(true);
      setError("");

      try {
        const data = await getAttendanceHistory();

        if (active) {
          setRecords(data);
        }
      } catch (err) {
        if (active) {
          setError(
            err.message ||
            "Unable to load attendance records."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, []);

  // Convert UTC timestamps to Bahrain time
  function formatTime(value) {
    if (!value) return null;

    return new Date(value).toLocaleTimeString(
      "en-GB",
      {
        timeZone: "Asia/Bahrain",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    );
  }

  // Convert AWS records for existing AttendanceTable
  const mine = records
    .map(record => ({
      id: record.id,
      date: record.date,
      checkIn: formatTime(record.checkInAt),
      checkOut: formatTime(record.checkOutAt),
      durationSeconds: record.durationSeconds,
      status: "Present"
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Month and status filters
  const months = [
    ...new Set(
      mine.map(record => record.date.slice(0, 7))
    )
  ];

  const filtered = mine.filter(record =>
    (status === "All" || record.status === status) &&
    (month === "All" || record.date.startsWith(month))
  );

  // Attendance statistics
  const present = filtered.filter(
    record => record.status === "Present"
  ).length;

  const late = filtered.filter(
    record => record.status === "Late"
  ).length;

  const absent = filtered.filter(
    record => record.status === "Absent"
  ).length;

  const hours = filtered.reduce(
    (total, record) =>
      total +
      (Number(record.durationSeconds) || 0) / 3600,
    0
  );

  // Open correction request dialog
  function openCorrection(record) {
    setSelected(record);
    setReason("");
    setRequestError("");
    setRequestSuccess("");
  }

  // Close correction dialog
  function closeCorrection() {
    if (savingRequest) return;

    setSelected(null);
    setReason("");
    setRequestError("");
  }

  // Submit correction request to AWS
  async function submit(e) {
    e.preventDefault();

    if (savingRequest) return;

    if (selected?.id == null) {
      setRequestError(
        "Please select a valid attendance record."
      );
      return;
    }

    const trimmedReason = reason.trim();

    if (
      trimmedReason.length < 10 ||
      trimmedReason.length > 1000
    ) {
      setRequestError(
        "Please enter a reason between 10 and 1000 characters."
      );
      return;
    }

    setSavingRequest(true);
    setRequestError("");

    try {
      // Submit the selected MySQL record ID
      const result = await createCorrectionRequest({
        attendanceId: selected.id,
        reason: trimmedReason
      });

      // Display success only after AWS confirms saving
      setRequestSuccess(
        result.message ||
        "Correction request submitted for manager review."
      );

      setSelected(null);
      setReason("");

    } catch (err) {
      setRequestError(
        err.message ||
        "Unable to submit correction request."
      );

    } finally {
      setSavingRequest(false);
    }
  }

  return (
    <>
      {/* Page heading */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            EMPLOYEE RECORDS
          </span>

          <h1>Attendance History</h1>

          <p>
            Review past attendance, working hours,
            and request a correction when needed.
          </p>
        </div>
      </div>

      {/* Attendance statistics */}
      <div className="stat-grid four">
        <StatCard
          label="Present Days"
          value={present}
          icon={CalendarDays}
          tone="green"
        />

        <StatCard
          label="Late Days"
          value={late}
          icon={Clock3}
          tone="amber"
        />

        <StatCard
          label="Absent Days"
          value={absent}
          icon={XCircle}
          tone="red"
        />

        <StatCard
          label="Total Recorded Hours"
          value={formatHours(hours)}
          icon={Hourglass}
          tone="blue"
        />
      </div>

      {/* Filters */}
      <Card className="filter-card">
        <div className="filters">

          <div className="field">
            <label htmlFor="history-month">
              Month
            </label>

            <select
              id="history-month"
              value={month}
              onChange={e => setMonth(e.target.value)}
            >
              <option value="All">All months</option>

              {months.map(m => (
                <option key={m} value={m}>
                  {new Date(
                    `${m}-01T12:00:00`
                  ).toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric"
                  })}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="history-status">
              Status
            </label>

            <select
              id="history-status"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option>All</option>
              <option>Present</option>
              <option>Late</option>
              <option>Absent</option>
            </select>
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setMonth("All");
              setStatus("All");
            }}
          >
            Clear Filters
          </button>

        </div>
      </Card>

      {/* Attendance records */}
      <Card>
        <SectionTitle icon={CalendarDays}>
          Attendance Records
        </SectionTitle>

        {loading && (
          <p>Loading attendance records...</p>
        )}

        {error && (
          <p role="alert" style={{ color: "#c62828" }}>
            {error}
          </p>
        )}

        {requestSuccess && (
          <p role="status" style={{ color: "#167d46" }}>
            {requestSuccess}
          </p>
        )}

        {!loading && !error && (
          <AttendanceTable
            rows={filtered}
            showAction
            onCorrection={openCorrection}
          />
        )}

        <p className="footnote">
          Records are read-only. Correction requests
          are sent to a manager for review.
        </p>
      </Card>

      {/* Correction request dialog */}
      {selected && (
        <Dialog
          title="Request Attendance Correction"
          onClose={closeCorrection}
        >
          <form onSubmit={submit}>

            <p className="muted-text">
              Attendance date:{" "}
              <strong>
                {fullDate(selected.date)}
              </strong>
            </p>

            <div className="field">
              <label htmlFor="correction-reason">
                Reason for correction
              </label>

              <textarea
                id="correction-reason"
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={4}
                placeholder="Explain what is incorrect and the time you believe is correct..."
                required
                minLength={10}
                maxLength={1000}
                disabled={savingRequest}
              />
            </div>

            {/* Display backend errors */}
            {requestError && (
              <p
                role="alert"
                style={{ color: "#c62828" }}
              >
                {requestError}
              </p>
            )}

            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={closeCorrection}
                disabled={savingRequest}
              >
                Cancel
              </button>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={savingRequest}
              >
                <FilePenLine size={16} />

                {savingRequest
                  ? "Submitting..."
                  : "Submit Request"}
              </button>
            </div>

          </form>
        </Dialog>
      )}
    </>
  );
}
