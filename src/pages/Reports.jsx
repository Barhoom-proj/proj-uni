import React from 'react';
import { BarChart3, CheckCircle2, Clock3, Download, Gauge, XCircle } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { workedHours, todayISO } from '../data/demo.js';
import { Card, SectionTitle, StatCard } from '../components/UI.jsx';

function downloadCSV(rows){
  const headers=['employee_id','date','check_in','check_out','status','hours'];
  const lines=[headers.join(','),...rows.map(r=>[r.employeeId,r.date,r.checkIn||'',r.checkOut||'',r.status,workedHours(r).toFixed(2)].join(','))];
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='cloudtrek-demo-attendance.csv';link.click();URL.revokeObjectURL(url);
}
export default function Reports(){
  const {attendance,employees}=useDemo();
  const [department,setDepartment]=React.useState('All');
  const [range,setRange]=React.useState('30');
  const threshold=new Date();threshold.setDate(threshold.getDate()-(Number(range)-1));threshold.setHours(0,0,0,0);
  const filtered=attendance.filter(r=>new Date(`${r.date}T12:00:00`)>=threshold&&(department==='All'||employees.find(e=>e.id===r.employeeId)?.department===department));
  const present=filtered.filter(r=>r.status==='Present').length;
  const late=filtered.filter(r=>r.status==='Late').length;
  const absent=filtered.filter(r=>r.status==='Absent').length;
  const rate=filtered.length?((present+late)/filtered.length*100).toFixed(1):'0.0';
  const average=filtered.filter(r=>r.checkIn&&r.checkOut).length?filtered.reduce((n,r)=>n+workedHours(r),0)/filtered.filter(r=>r.checkIn&&r.checkOut).length:0;
  const days=Array.from({length:7},(_,index)=>{
    const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()-(6-index));
    const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const rows=filtered.filter(r=>r.date===key);
    return {label:date.toLocaleDateString('en-GB',{weekday:'short'}),present:rows.filter(r=>r.status==='Present').length,late:rows.filter(r=>r.status==='Late').length,absent:rows.filter(r=>r.status==='Absent').length};
  });
  const deptStats=[...new Set(employees.map(e=>e.department))].map(dep=>{
    const subset=filtered.filter(r=>employees.find(e=>e.id===r.employeeId)?.department===dep);
    return {name:dep,rate:subset.length?Math.round(subset.filter(r=>r.status!=='Absent').length/subset.length*100):0};
  });
  return <><div className="page-heading"><div><span className="eyebrow">ANALYTICS & INSIGHTS</span><h1>Attendance Reports</h1><p>Analyze team attendance and export a sample attendance report.</p></div><button className="btn btn-primary" onClick={()=>downloadCSV(filtered)}><Download size={17}/> Download CSV</button></div>
  <div className="stat-grid four"><StatCard label="Attendance Rate" value={`${rate}%`} icon={CheckCircle2} tone="green"/><StatCard label="Avg. Work Hours" value={`${average.toFixed(1)}h`} icon={Gauge}/><StatCard label="Late Arrivals" value={late} icon={Clock3} tone="amber"/><StatCard label="Absence Count" value={absent} icon={XCircle} tone="red"/></div>
  <Card className="filter-card"><div className="filters"><div className="field"><label htmlFor="report-range">Date range</label><select id="report-range" value={range} onChange={e=>setRange(e.target.value)}><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option></select></div><div className="field"><label htmlFor="report-dept">Department</label><select id="report-dept" value={department} onChange={e=>setDepartment(e.target.value)}><option>All</option>{[...new Set(employees.map(e=>e.department))].map(d=><option key={d}>{d}</option>)}</select></div></div></Card>
  <div className="two-column reports-layout"><Card><SectionTitle icon={BarChart3}>Attendance Trend (Last 7 Days)</SectionTitle><div className="group-bars report-bars">{days.map((d,i)=><div className="group-bar-item" key={i}><div className="group-bar"><div className="bar-p" style={{height:`${d.present/employees.length*100}%`}}/><div className="bar-l" style={{height:`${d.late/employees.length*100}%`}}/><div className="bar-a" style={{height:`${d.absent/employees.length*100}%`}}/></div><span>{d.label}</span></div>)}</div><div className="chart-legend"><span><i className="legend-blue"/>Present</span><span><i className="legend-amber"/>Late</span><span><i className="legend-red"/>Absent</span></div></Card><Card><SectionTitle icon={Gauge}>Monthly Breakdown</SectionTitle><div className="donut-layout report-donut"><div className="donut" style={{background:`conic-gradient(#2477ee 0 ${present/Math.max(filtered.length,1)*100}%,#f9b838 ${present/Math.max(filtered.length,1)*100}% ${(present+late)/Math.max(filtered.length,1)*100}%,#f36377 ${(present+late)/Math.max(filtered.length,1)*100}% 100%)`}}><div><strong>{rate}%</strong><small>Attendance</small></div></div><div className="donut-legend"><div><i className="legend-blue"/>Present <strong>{present}</strong></div><div><i className="legend-amber"/>Late <strong>{late}</strong></div><div><i className="legend-red"/>Absent <strong>{absent}</strong></div></div></div></Card></div>
  <Card><SectionTitle icon={BarChart3}>Department Overview</SectionTitle><div className="dept-grid">{deptStats.map(d=><div className="dept-meter" key={d.name}><div><strong>{d.name}</strong><span>{d.rate}%</span></div><div className="meter-track"><div style={{width:`${d.rate}%`}}/></div></div>)}</div><p className="footnote">Reports use demo data. Production reporting requires verified work schedules and a backend reporting API.</p></Card>
  </>;
}
