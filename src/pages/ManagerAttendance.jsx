import React from 'react';
import { CalendarDays, Download, Clock3, Hourglass, XCircle } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { todayISO, workedHours } from '../data/demo.js';
import { AttendanceTable, Card, StatCard } from '../components/UI.jsx';

export default function ManagerAttendance(){
  const {attendance,employees}=useDemo();
  const [day,setDay]=React.useState(todayISO());
  const [status,setStatus]=React.useState('All');
  const [employee,setEmployee]=React.useState('All');
  const filtered=attendance.filter(r=>r.date===day&&(status==='All'||r.status===status)&&(employee==='All'||r.employeeId===employee)).sort((a,b)=>a.employeeId.localeCompare(b.employeeId));
  const present=filtered.filter(r=>r.status==='Present').length;
  const late=filtered.filter(r=>r.status==='Late').length;
  const absent=filtered.filter(r=>r.status==='Absent').length;
  const hours=filtered.reduce((n,r)=>n+workedHours(r),0);
  return <><div className="page-heading"><div><span className="eyebrow">ATTENDANCE MANAGEMENT</span><h1>Attendance Records</h1><p>Review employee check-ins, late arrivals, absences, and working hours.</p></div></div>
  <div className="stat-grid four"><StatCard label="Present" value={present} icon={CalendarDays} tone="green"/><StatCard label="Late" value={late} icon={Clock3} tone="amber"/><StatCard label="Absent" value={absent} icon={XCircle} tone="red"/><StatCard label="Recorded Hours" value={hours.toFixed(1)} icon={Hourglass}/></div>
  <Card className="filter-card"><div className="filters"><div className="field"><label htmlFor="mgr-date">Date</label><input type="date" id="mgr-date" value={day} onChange={e=>setDay(e.target.value)}/></div><div className="field"><label htmlFor="mgr-employee">Employee</label><select id="mgr-employee" value={employee} onChange={e=>setEmployee(e.target.value)}><option value="All">All employees</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div><div className="field"><label htmlFor="mgr-status">Status</label><select id="mgr-status" value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>Present</option><option>Late</option><option>Absent</option></select></div><button className="btn btn-outline" onClick={()=>{setDay(todayISO());setStatus('All');setEmployee('All');}}>Reset Filters</button></div></Card>
  <Card><div className="section-title"><h2>Team Attendance</h2><span className="muted-text">{filtered.length} records</span></div><AttendanceTable rows={filtered} showName employees={employees}/><p className="footnote">This prototype displays seeded/local data. In production, manager access must be restricted to authorized teams.</p></Card></>;
}
