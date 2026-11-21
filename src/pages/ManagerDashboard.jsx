import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, CalendarClock, CalendarDays, ChartNoAxesCombined, Clock3, UsersRound, XCircle } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { todayISO, fullDate, shortDate } from '../data/demo.js';
import { AttendanceTable, Avatar, Card, Pill, SectionTitle, StatCard } from '../components/UI.jsx';

export default function ManagerDashboard(){
  const {employees,attendance,requests}=useDemo();
  const today=attendance.filter(r=>r.date===todayISO());
  const present=today.filter(r=>r.status==='Present').length;
  const late=today.filter(r=>r.status==='Late').length;
  const absent=employees.length-present-late;
  const recent=[...today].sort((a,b)=>(a.checkIn||'99:99').localeCompare(b.checkIn||'99:99'));
  const days=Array.from({length:5},(_,i)=>{
    const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7)+i);
    const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const day=attendance.filter(r=>r.date===date);
    return {label:['Mon','Tue','Wed','Thu','Fri'][i],present:day.filter(r=>r.status==='Present').length,late:day.filter(r=>r.status==='Late').length,absent:day.filter(r=>r.status==='Absent').length};
  });
  return <>
    <div className="welcome-banner manager-welcome"><div><span className="eyebrow">MANAGER DASHBOARD</span><h1>Welcome back, <span className="accent">Ebrahim!</span></h1><p>Here is your team's attendance overview for today.</p></div><div className="today-date"><CalendarDays size={19}/>{fullDate(todayISO())}</div></div>
    <div className="stat-grid four"><StatCard label="Total Team" value={employees.length} icon={UsersRound} tone="blue"/><StatCard label="Present" value={present} icon={CalendarDays} tone="green"/><StatCard label="Late" value={late} icon={Clock3} tone="amber"/><StatCard label="Absent / No Record" value={absent} icon={XCircle} tone="red"/></div>
    <div className="manager-main-grid"><div className="manager-primary"><div className="two-column manager-charts"><Card><SectionTitle icon={ChartNoAxesCombined}>Attendance Overview</SectionTitle><div className="group-bars">{days.map(d=><div key={d.label} className="group-bar-item"><div className="group-bar"><div className="bar-p" style={{height:`${d.present/employees.length*100}%`}}/><div className="bar-l" style={{height:`${d.late/employees.length*100}%`}}/><div className="bar-a" style={{height:`${d.absent/employees.length*100}%`}}/></div><span>{d.label}</span></div>)}</div><div className="chart-legend"><span><i className="legend-blue"/>Present</span><span><i className="legend-amber"/>Late</span><span><i className="legend-red"/>Absent</span></div></Card><Card><SectionTitle icon={UsersRound}>Today's Team Status</SectionTitle><div className="donut-layout"><div className="donut" style={{background:`conic-gradient(#2477ee 0 ${present/employees.length*100}%,#f9b838 ${present/employees.length*100}% ${(present+late)/employees.length*100}%,#f36377 ${(present+late)/employees.length*100}% 100%)`}}><div><strong>{employees.length}</strong><small>Employees</small></div></div><div className="donut-legend"><div><i className="legend-blue"/>Present <strong>{present}</strong></div><div><i className="legend-amber"/>Late <strong>{late}</strong></div><div><i className="legend-red"/>Absent <strong>{absent}</strong></div></div></div></Card></div><Card><SectionTitle icon={CalendarClock} action={<Link to="/manager/attendance" className="text-link">View All <ArrowRight size={16}/></Link>}>Recent Attendance (Today)</SectionTitle><AttendanceTable rows={recent.slice(0,6)} showName employees={employees}/></Card></div>
    <div className="manager-secondary"><Card><SectionTitle icon={CalendarClock} action={<Link className="text-link" to="/manager/requests"><ArrowRight size={18}/></Link>}>Pending Requests ({requests.filter(r=>r.status==='Pending').length})</SectionTitle><div className="request-compact">{requests.filter(r=>r.status==='Pending').slice(0,4).map(r=><Link to="/manager/requests" key={r.id} className="compact-request"><div className="request-initial"><CalendarDays size={18}/></div><div><strong>{r.type}</strong><span>{employees.find(e=>e.id===r.employeeId)?.name||r.employeeId} • {shortDate(r.date)}</span></div><ArrowRight size={15}/></Link>)}{!requests.some(r=>r.status==='Pending')&&<p className="muted-text">All requests reviewed.</p>}</div></Card><Card><SectionTitle icon={Bell}>Notifications</SectionTitle><div className="notification-list"><p><span>●</span>{late} employees marked late today.</p><p><span>●</span>{requests.filter(r=>r.status==='Pending').length} requests require manager review.</p><p><span>●</span>Attendance summary ready to view.</p></div></Card></div></div>
  </>;
}
