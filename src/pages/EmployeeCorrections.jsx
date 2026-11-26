import React from "react";
import { Link } from "react-router-dom";

import {
  ArrowLeft,
  ClipboardList,
  Clock3,
  CheckCircle2,
  XCircle,
  RefreshCw
} from "lucide-react";

import {
  Card,
  SectionTitle,
  StatCard,
  StatusPill
} from "../components/UI.jsx";

import {
  getMyCorrectionRequests
} from "../services/correctionApi.js";

// Display dates in a readable format
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

// Display UTC timestamps in Bahrain local time
function formatDateTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Bahrain",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Display Check-In and Check-Out in Bahrain time
function formatTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: "Asia/Bahrain",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// Convert API status to a display status
function displayStatus(status) {
  switch (status) {
    case "pending":
      return "Pending";

    case "approved":
      return "Approved";

    case "rejected":
      return "Rejected";

    default:
      return "Unknown";
  }
}

export default function EmployeeCorrections() {
  const [requests, setRequests] = React.useState([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);
  const [filter, setFilter] = React.useState("All");

  // Fetch correction requests from AWS
  React.useEffect(() => {
    let active = true;

    async function loadRequests() {
      setLoading(true);
      setError("");

      try {
        const data = await getMyCorrectionRequests();

        if (active) {
          setRequests(data);
        }
      } catch (err) {
        if (active) {
          setError(
            err.message ||
            "Unable to load correction requests."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadRequests();

    return () => {
      active = false;
    };
  }, [refresh]);

  // Calculate summary counts
  const total = requests.length;

  const pending = requests.filter(
    r => r.status === "pending"
  ).length;

  const approved = requests.filter(
    r => r.status === "approved"
  ).length;

  const rejected = requests.filter(
    r => r.status === "rejected"
  ).length;

  // Filter requests by status
  const filtered = requests.filter(
    r =>
      filter === "All" ||
      displayStatus(r.status) === filter
  );

  return (
    <>
      {/* Page heading */}
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            EMPLOYEE RECORDS
          </span>

          <h1>My Correction Requests</h1>

          <p>
            Track your submitted attendance correction
            requests and manager decisions.
          </p>
        </div>

        <Link
          to="/employee/history"
          className="btn btn-outline"
        >
          <ArrowLeft size={17} />
          Attendance History
        </Link>
      </div>

      {/* Summary statistics */}
      <div className="stat-grid four">
        <StatCard
          label="Total Requests"
          value={total}
          icon={ClipboardList}
          tone="blue"
        />

        <StatCard
          label="Pending"
          value={pending}
          icon={Clock3}
          tone="amber"
        />

        <StatCard
          label="Approved"
          value={approved}
          icon={CheckCircle2}
          tone="green"
        />

        <StatCard
          label="Rejected"
          value={rejected}
          icon={XCircle}
          tone="red"
        />
      </div>

      {/* Filters */}
      <Card className="filter-card">
        <div className="filters">
          <div className="field">
            <label htmlFor="correction-filter">
              Request Status
            </label>

            <select
              id="correction-filter"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            >
              <option value="All">
                All Requests
              </option>

              <option value="Pending">
                Pending
              </option>

              <option value="Approved">
                Approved
              </option>

              <option value="Rejected">
                Rejected
              </option>
            </select>
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setRefresh(v => v + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </Card>

      {/* Correction request list */}
      <Card>
        <SectionTitle icon={ClipboardList}>
          Submitted Requests
        </SectionTitle>

        {loading && (
          <p>Loading your correction requests...</p>
        )}

        {error && (
          <div>
            <p
              role="alert"
              style={{ color: "#c62828" }}
            >
              {error}
            </p>

            <button
              className="btn btn-outline"
              type="button"
              onClick={() => setRefresh(v => v + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div>
            <p className="muted-text">
              No correction requests found.
            </p>

            <Link
              to="/employee/history"
              className="text-link"
            >
              Go to Attendance History
            </Link>
          </div>
        )}

        {!loading && !error && (
          <div
            style={{
              display: "grid",
              gap: "16px",
              marginTop: "12px"
            }}
          >
            {filtered.map(request => (
              <div
                key={request.id}
                className="request-detail"
                style={{
                  border: "1px solid #dce5f1",
                  borderRadius: "12px",
                  padding: "16px",
                  minWidth: 0
                }}
              >

                {/* Request heading */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap"
                  }}
                >
                  <div>
                    <h3>
                      Attendance Correction
                    </h3>

                    <p className="muted-text">
                      Request #{request.id}
                    </p>
                  </div>

                  <StatusPill
                    status={displayStatus(request.status)}
                  />
                </div>

                {/* Request information */}
                <p>
                  <strong>Attendance Date</strong>
                  <span>
                    {formatDate(request.date)}
                  </span>
                </p>

                <p>
                  <strong>Submitted On</strong>
                  <span>
                    {formatDateTime(request.createdAt)}
                  </span>
                </p>

                <p>
                  <strong>Reason</strong>
                  <span style={{ overflowWrap: "anywhere" }}>
                    {request.reason}
                  </span>
                </p>

                {/* Latest saved attendance times */}
                <p>
                  <strong>Recorded Check-In</strong>
                  <span>
                    {formatTime(request.checkInAt)}
                  </span>
                </p>

                <p>
                  <strong>Recorded Check-Out</strong>
                  <span>
                    {formatTime(request.checkOutAt)}
                  </span>
                </p>

                {/* Manager review details */}
                {request.status === "pending" && (
                  <p className="muted-text">
                    Your request is waiting for
                    manager review.
                  </p>
                )}

                {request.status !== "pending" && (
                  <>
                    <p>
                      <strong>Reviewed On</strong>
                      <span>
                        {formatDateTime(request.reviewedAt)}
                      </span>
                    </p>

                    <p>
                      <strong>Manager's Note</strong>
                      <span
                        style={{
                          overflowWrap: "anywhere"
                        }}
                      >
                        {request.managerNote ||
                          "No manager note available."}
                      </span>
                    </p>
                  </>
                )}

                {request.status === "approved" && (
                  <p className="muted-text">
                    The recorded attendance times above
                    reflect the approved correction.
                  </p>
                )}

                {request.status === "rejected" && (
                  <p className="muted-text">
                    This request was rejected.
                    Your attendance record was not
                    changed by this decision.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="footnote">
          Showing up to 100 recent requests.
          Times are displayed in Bahrain time.
          Only your correction requests are shown.
        </p>
      </Card>
    </>
  );
}