import React from 'react';
import { CalendarDays, Clock3, FilePenLine, Hourglass, XCircle } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { fullDate, todayISO, workedHours, formatHours } from '../data/demo.js';
import { AttendanceTable, Card, Dialog, SectionTitle, StatCard } from '../components/UI.jsx';
import { getAttendanceHistory } from "../services/attendanceApi.js";

export default function AttendanceHistory(){
  const {attendance,requestCorrection,notify}=useDemo();
  const [status,setStatus]=React.useState('All');
  const [selected,setSelected]=React.useState(null);
  const [reason,setReason]=React.useState('');
  const [month,setMonth]=React.useState('All');

const [records, setRecords] = React.useState([]);
const [loading, setLoading] = React.useState(true);
const [error, setError] = React.useState("");

React.useEffect(() => {
  let active = true;

  async function loadHistory() {
    setLoading(true);
    setError("");

    try {
      const data = await getAttendanceHistory();

      if (active) {
        setRecords(data);
        console.log("AWS attendance records:", data);
      }
    } catch (err) {
      if (active) {
        setError(err.message);
        console.error("Attendance history error:", err);
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

  
const formatTime = (value) => {
  if (!value) return null;

  return new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bahrain",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
};

const mine = records
  .map((record) => ({
    id: record.id,
    date: record.date,
    checkIn: formatTime(record.checkInAt),
    checkOut: formatTime(record.checkOutAt),
    durationSeconds: record.durationSeconds,
    status: "Present"
  }))
  .sort((a, b) => b.date.localeCompare(a.date));

  const months=[...new Set(mine.map(r=>r.date.slice(0,7)))];
  const filtered=mine.filter(r=>(status==='All'||r.status===status)&&(month==='All'||r.date.startsWith(month)));
  const present=filtered.filter(r=>r.status==='Present').length;
  const late=filtered.filter(r=>r.status==='Late').length;
  const absent=filtered.filter(r=>r.status==='Absent').length;

const hours = filtered.reduce(
  (total, record) =>
    total + (Number(record.durationSeconds) || 0) / 3600,
  0
);
  
  const submit=(e)=>{e.preventDefault();const result=requestCorrection({date:selected.date,reason});notify(result.message);if(result.ok){setSelected(null);setReason('');}};
  return <><div className="page-heading"><div><span className="eyebrow">EMPLOYEE RECORDS</span><h1>Attendance History</h1><p>Review past attendance, working hours, and request a correction when needed.</p></div></div>
  <div className="stat-grid four"><StatCard label="Present Days" value={present} icon={CalendarDays} tone="green"/><StatCard label="Late Days" value={late} icon={Clock3} tone="amber"/><StatCard label="Absent Days" value={absent} icon={XCircle} tone="red"/><StatCard label="Total Recorded Hours" value={formatHours(hours)} icon={Hourglass} tone="blue"/></div>
  <Card className="filter-card"><div className="filters"><div className="field"><label htmlFor="history-month">Month</label><select id="history-month" value={month} onChange={e=>setMonth(e.target.value)}><option value="All">All months</option>{months.map(m=><option key={m} value={m}>{new Date(`${m}-01T12:00:00`).toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</option>)}</select></div><div className="field"><label htmlFor="history-status">Status</label><select id="history-status" value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>Present</option><option>Late</option><option>Absent</option></select></div><button className="btn btn-outline" onClick={()=>{setMonth('All');setStatus('All');}}>Clear Filters</button></div></Card>
  <Card><SectionTitle icon={CalendarDays}>Attendance Records</SectionTitle>
{loading && <p>Loading attendance records...</p>}

{error && (
  <p role="alert" style={{ color: "red" }}>
    {error}
  </p>
)}
<AttendanceTable rows={filtered} showAction onCorrection={r=>setSelected(r)}/><p className="footnote">Records are read-only. Corrections are submitted for manager review.</p></Card>
  {selected&&<Dialog title="Request Attendance Correction" onClose={()=>setSelected(null)}><form onSubmit={submit}><p className="muted-text">Attendance date: <strong>{fullDate(selected.date)}</strong></p><div className="field"><label htmlFor="correction-reason">Reason for correction</label><textarea id="correction-reason" value={reason} onChange={e=>setReason(e.target.value)} rows="4" placeholder="Explain why this record needs correction..." required maxLength={500}/></div><div className="dialog-actions"><button type="button" className="btn btn-outline" onClick={()=>setSelected(null)}>Cancel</button><button className="btn btn-primary" type="submit"><FilePenLine size={16}/> Submit Request</button></div></form></Dialog>}</>;
}
