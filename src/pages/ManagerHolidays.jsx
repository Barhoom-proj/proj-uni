import React from "react";
import { CalendarDays } from "lucide-react";
import { Card, SectionTitle } from "../components/UI.jsx";
import { getHolidays, saveHoliday, removeHoliday } from "../services/leaveHolidayApi.js";

function currentYearBahrain() {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bahrain", year: "numeric"
  }).format(new Date()));
}

export default function ManagerHolidays() {
  const [year, setYear] = React.useState(currentYearBahrain());
  const [date, setDate] = React.useState(`${currentYearBahrain()}-01-01`);
  const [name, setName] = React.useState("");
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    getHolidays(year)
      .then(data => { if (active) setRows(data); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year, refresh]);

  async function addHoliday(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await saveHoliday(date, name.trim());
      setNotice("Holiday saved. Attendance reports will use this date.");
      setYear(Number(date.slice(0, 4)));
      setName("");
      setRefresh(v => v + 1);
    } catch (err) { setError(err.message || "Unable to save holiday."); }
    finally { setSaving(false); }
  }

  async function remove(dateToRemove) {
    if (saving || !window.confirm(`Remove the holiday for ${dateToRemove}?`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await removeHoliday(dateToRemove);
      setNotice("Holiday removed. Attendance statuses will be recalculated.");
      setRefresh(v => v + 1);
    } catch (err) { setError(err.message || "Unable to remove holiday."); }
    finally { setSaving(false); }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">MANAGER SETTINGS</span>
      <h1>Public Holidays</h1><p>Maintain verified holiday dates used by attendance calculations.</p></div></div>
    <Card><SectionTitle icon={CalendarDays}>Add or Update a Holiday</SectionTitle>
      <p>Only add confirmed dates used by your organization. A date entered again will update its name.</p>
      <form onSubmit={addHoliday}><div className="filters">
        <div className="field"><label htmlFor="holiday-date">Date</label>
          <input id="holiday-date" type="date" value={date} onChange={e => setDate(e.target.value)} required disabled={saving}/></div>
        <div className="field"><label htmlFor="holiday-name">Holiday name</label>
          <input id="holiday-name" type="text" value={name} onChange={e => setName(e.target.value)} maxLength={150} required disabled={saving} placeholder="Confirmed holiday name"/></div>
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Holiday"}</button>
      </div></form>
    </Card>
    <Card><SectionTitle icon={CalendarDays}>Holiday Calendar</SectionTitle>
      <div className="filters"><div className="field"><label htmlFor="holiday-year">Year</label>
        <input id="holiday-year" type="number" min={2000} max={2100} value={year} onChange={e => setYear(Number(e.target.value))}/></div>
        <button type="button" className="btn btn-outline" onClick={() => setRefresh(v => v + 1)}>Refresh</button>
      </div>
      {error && <p role="alert" style={{ color: "#c62828" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#167d46" }}>{notice}</p>}
      {loading ? <p>Loading holidays...</p> : <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Date</th><th>Holiday Name</th><th>Action</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.date}><td>{row.date}</td><td>{row.name}</td><td>
          <button type="button" className="btn btn-outline" onClick={() => remove(row.date)} disabled={saving}>Remove</button>
        </td></tr>)}
          {!rows.length && <tr><td colSpan={3}>No holiday dates configured for this year.</td></tr>}
        </tbody></table></div>}
      <p className="footnote">Holiday dates are entered manually; this application does not claim to know the official Bahrain holiday calendar automatically.</p>
    </Card>
  </>;
}
