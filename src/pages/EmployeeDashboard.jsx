import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck2, Clock3, QrCode, ScanLine, TrendingUp, XCircle } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { todayISO, displayTime, workedHours, formatHours } from '../data/demo.js';
import { AttendanceTable, Card, Pill, SectionTitle, StatCard } from '../components/UI.jsx';

export default function EmployeeDashboard(){
  const {attendance,authMode,identity}=useDemo();
  const records=attendance.filter(r=>r.employeeId==='CT104').sort((a,b)=>b.date.localeCompare(a.date));
  const today=records.find(r=>r.date===todayISO());
  const present=records.filter(r=>r.status==='Present').length;
  const late=records.filter(r=>r.status==='Late').length;
  const absent=records.filter(r=>r.status==='Absent').length;
  const week=Array.from({length:7},(_,i)=>{
    const day=new Date();day.setHours(12,0,0,0);day.setDate(day.getDate()-((day.getDay()+6)%7)+i);
    const date=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
    const row=records.find(r=>r.date===date);
    return {label:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i],value:row?workedHours(row):0,late:row?.status==='Late'};
  });
  return <>
    <div className="welcome-banner"><div><span className="eyebrow">EMPLOYEE DASHBOARD</span><h1>Welcome back, <span className="accent">{authMode==='cognito'?(identity?.displayName || 'Employee').split(' ' )[0]:'Employee'}!</span></h1><p>Track your attendance, scan the office QR code, and view your records.</p></div><div className="welcome-landscape" aria-hidden="true"><span/><span/><span/></div></div>
    <div className="employee-feature-row">
      <Card className="today-card"><SectionTitle icon={CalendarCheck2}>Today's Attendance</SectionTitle><div className="today-status"><span className={today?.checkIn?'check-icon':'waiting-icon'}>{today?.checkIn?'✓':'◷'}</span><div><strong>{today?.checkOut?'Checked Out':today?.checkIn?'Checked In':'Not Checked In'}</strong><p>{today?.checkIn?'Your attendance has been recorded today.':'Scan the office QR code to record attendance.'}</p></div></div><div className="time-details"><div><span>Check-In</span><strong>{displayTime(today?.checkIn)}</strong></div><div><span>Check-Out</span><strong>{displayTime(today?.checkOut)}</strong></div><div><span>Working Hours</span><strong>{today?.checkOut?formatHours(workedHours(today)):'—'}</strong></div></div></Card>
      <Link to="/employee/scan" className="scan-cta"><ScanLine size={55} strokeWidth={1.8}/><h2>Scan QR Code</h2><p>Check in or check out securely using the office QR code.</p><span className="cta-button">Open Scanner <ArrowRight size={18}/></span></Link>
      <div className="summary-stack"><StatCard label="Present" value={present} sub="Days recorded" icon={CalendarCheck2} tone="green"/><StatCard label="Late" value={late} sub="Late arrivals" icon={Clock3} tone="amber"/><StatCard label="Absent" value={absent} sub="Days recorded" icon={XCircle} tone="red"/></div>
    </div>
    <div className="two-column bottom-grid"><Card><SectionTitle icon={TrendingUp} action={<Pill>This Week</Pill>}>Weekly Attendance Overview</SectionTitle><div className="chart-area"><div className="chart-y"><span>10h</span><span>8h</span><span>6h</span><span>4h</span><span>2h</span><span>0h</span></div><div className="bar-chart">{week.map(d=><div className="bar-column" key={d.label}><div className="bar-space"><div className={`bar ${d.late?'bar-amber':''}`} style={{height:`${Math.min(d.value/10,1)*100}%`}} title={`${d.value.toFixed(1)} hours`}/></div><span>{d.label}</span></div>)}</div></div><div className="chart-legend"><span><i className="legend-blue"/>Recorded hours</span><span><i className="legend-amber"/>Late</span></div></Card>
      <Card><SectionTitle icon={CalendarCheck2} action={<Link className="text-link" to="/employee/history">View All <ArrowRight size={16}/></Link>}>Recent Attendance</SectionTitle><AttendanceTable rows={records.slice(0,5)}/></Card></div>
  </>;
}
