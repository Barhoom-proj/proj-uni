import React from 'react';
import { CalendarDays, Check, ClipboardList, Clock3, MessageCircle, X } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { fullDate } from '../data/demo.js';
import { Avatar, Card, Empty, Pill, SectionTitle, StatCard, StatusPill } from '../components/UI.jsx';

export default function Requests(){
  const {requests,employees,decideRequest}=useDemo();
  const [tab,setTab]=React.useState('Pending');
  const [selected,setSelected]=React.useState(null);
  const filtered=requests.filter(r=>tab==='All'||r.status===tab);
  const current=filtered.find(r=>r.id===selected)||filtered[0];
  const person=id=>employees.find(e=>e.id===id);
  return <><div className="page-heading"><div><span className="eyebrow">MANAGER APPROVALS</span><h1>Attendance & Leave Requests</h1><p>Review and respond to employee requests with an auditable approval process.</p></div></div>
  <div className="stat-grid four"><StatCard label="Pending Requests" value={requests.filter(r=>r.status==='Pending').length} icon={Clock3} tone="amber"/><StatCard label="Approved" value={requests.filter(r=>r.status==='Approved').length} icon={Check} tone="green"/><StatCard label="Rejected" value={requests.filter(r=>r.status==='Rejected').length} icon={X} tone="red"/><StatCard label="Total Requests" value={requests.length} icon={ClipboardList}/></div>
  <div className="tabs" role="group" aria-label="Request status filter">{['Pending','Approved','Rejected','All'].map(t=><button key={t} type="button" className={tab===t?'tab-active':''} onClick={()=>{setTab(t);setSelected(null);}}>{t} <span>{t==='All'?requests.length:requests.filter(r=>r.status===t).length}</span></button>)}</div>
  <div className="two-column request-layout"><Card><SectionTitle icon={ClipboardList}>Requests</SectionTitle>{filtered.length?filtered.map(r=><button className={`request-row ${current?.id===r.id?'request-selected':''}`} key={r.id} onClick={()=>setSelected(r.id)}><Avatar name={person(r.employeeId)?.name||r.employeeId} size="sm"/><div><strong>{person(r.employeeId)?.name||r.employeeId}</strong><small>{r.type} • {fullDate(r.date)}</small></div><StatusPill status={r.status}/></button>):<Empty message="No requests in this category."/>}</Card><Card><SectionTitle icon={MessageCircle}>Request Details</SectionTitle>{current?<div className="request-detail"><h3>{current.type}</h3><p><strong>Employee</strong><span>{person(current.employeeId)?.name} ({current.employeeId})</span></p><p><strong>Requested date</strong><span>{fullDate(current.date)}</span></p><p><strong>Reason</strong><span>{current.reason}</span></p><p><strong>Status</strong><StatusPill status={current.status}/></p>{current.status==='Pending'&&<div className="request-actions"><button className="btn btn-primary" onClick={()=>decideRequest(current.id,'Approved')}><Check size={17}/> Approve</button><button className="btn btn-outline danger-outline" onClick={()=>decideRequest(current.id,'Rejected')}><X size={17}/> Reject</button></div>}<p className="footnote">Approval updates request status only. It does not automatically edit attendance timestamps.</p></div>:<Empty message="Select a request to view details."/>}</Card></div></>;
}
