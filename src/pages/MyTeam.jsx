import React from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Search, UserPlus, UsersRound, CalendarCheck2, Clock3, XCircle } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { todayISO } from '../data/demo.js';
import { Avatar, Card, SectionTitle, StatCard, StatusPill } from '../components/UI.jsx';

export default function MyTeam(){
  const {employees,attendance,notify}=useDemo();
  const location=useLocation();
  const [search,setSearch]=React.useState(new URLSearchParams(location.search).get('q')||'');
  React.useEffect(()=>{setSearch(new URLSearchParams(location.search).get('q')||'');},[location.search]);
  const [department,setDepartment]=React.useState('All');
  const [status,setStatus]=React.useState('All');
  const today=attendance.filter(r=>r.date===todayISO());
  const getStatus=id=>today.find(r=>r.employeeId===id)?.status||'No Record';
  const matching=employees.filter(e=>(e.name.toLowerCase().includes(search.toLowerCase())||e.id.toLowerCase().includes(search.toLowerCase()))&&(department==='All'||e.department===department)&&(status==='All'||getStatus(e.id)===status));
  const departments=[...new Set(employees.map(e=>e.department))];
  return <><div className="page-heading"><div><span className="eyebrow">TEAM MANAGEMENT</span><h1>My Team</h1><p>View team members, work schedules, and today's attendance status.</p></div><button className="btn btn-primary" onClick={()=>notify('Adding employees requires a real manager API and authorization.')}><UserPlus size={17}/> Add Employee</button></div>
  <div className="stat-grid four"><StatCard label="Total Employees" value={employees.length} icon={UsersRound}/><StatCard label="Present Today" value={employees.filter(e=>getStatus(e.id)==='Present').length} icon={CalendarCheck2} tone="green"/><StatCard label="Late Today" value={employees.filter(e=>getStatus(e.id)==='Late').length} icon={Clock3} tone="amber"/><StatCard label="Absent / No Record" value={employees.filter(e=>!['Present','Late'].includes(getStatus(e.id))).length} icon={XCircle} tone="red"/></div>
  <Card><div className="filters"><div className="field grow"><label htmlFor="team-search">Search team</label><div className="search-input"><Search size={17}/><input id="team-search" placeholder="Name or employee ID..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="field"><label htmlFor="team-dept">Department</label><select id="team-dept" value={department} onChange={e=>setDepartment(e.target.value)}><option>All</option>{departments.map(d=><option key={d}>{d}</option>)}</select></div><div className="field"><label htmlFor="team-status">Status</label><select id="team-status" value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>Present</option><option>Late</option><option>Absent</option><option>No Record</option></select></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Employee ID</th><th>Department</th><th>Job Title</th><th>Today</th></tr></thead><tbody>{matching.map(e=><tr key={e.id}><td><div className="person-cell"><Avatar name={e.name} size="sm"/><strong>{e.name}</strong></div></td><td>{e.id}</td><td>{e.department}</td><td>{e.position}</td><td><StatusPill status={getStatus(e.id)}/></td></tr>)}</tbody></table>{matching.length===0&&<p className="empty-message">No employees match your filters.</p>}</div><p className="footnote">Showing {matching.length} of {employees.length} demo employees.</p></Card></>;
}
