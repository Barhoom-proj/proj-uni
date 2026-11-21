import React from 'react';
import { BadgeCheck, Check, Clock3, XCircle, Info, Inbox } from 'lucide-react';
import { displayTime, formatHours, workedHours } from '../data/demo.js';

export function Card({children,className='',...props}){return <section className={`card ${className}`} {...props}>{children}</section>;}
export function Pill({children,tone='muted'}){return <span className={`pill pill-${tone}`}>{children}</span>;}
export function StatusPill({status}){
  const tone=status==='Present'||status==='Approved'?'green':status==='Late'||status==='Pending'?'amber':status==='Absent'||status==='Rejected'?'red':'muted';
  const Icon=status==='Late'||status==='Pending'?Clock3:status==='Present'||status==='Approved'?Check:status==='Absent'||status==='Rejected'?XCircle:Info;
  return <Pill tone={tone}><Icon size={13}/>{status||'No Record'}</Pill>;
}
export function StatCard({label,value,sub,icon:Icon,tone='blue'}){return <Card className="stat-card"><div className={`stat-icon tone-${tone}`}><Icon size={24}/></div><div className="stat-copy"><div className="stat-label">{label}</div><strong className="stat-value">{value}</strong>{sub&&<div className="stat-sub">{sub}</div>}</div></Card>;}
export function SectionTitle({icon:Icon,children,action}){return <div className="section-title"><div className="section-title-left">{Icon&&<Icon className="section-title-icon" size={22}/>}<h2>{children}</h2></div>{action}</div>;}
export function Avatar({name,size='md'}){return <div aria-label={name} title={name} className={`avatar avatar-${size}`}>{name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</div>;}
export function Empty({message='No records found.'}){return <div className="empty"><Inbox size={30}/><p>{message}</p></div>;}
export function AttendanceTable({rows,showName=false,employees=[],showAction=false,onCorrection}){
  return <div className="table-wrap"><table className="data-table"><thead><tr>{showName&&<><th>Employee</th><th>Department</th></>}<th>Date</th><th>Check-In</th><th>Check-Out</th><th>Hours</th><th>Status</th>{showAction&&<th>Action</th>}</tr></thead><tbody>{rows.map(r=>{
    const person=employees.find(e=>e.id===r.employeeId);
    return <tr key={r.id}>{showName&&<><td className="cell-strong">{person?.name||r.employeeId}</td><td>{person?.department||'—'}</td></>}<td>{new Date(`${r.date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td><td>{displayTime(r.checkIn)}</td><td>{displayTime(r.checkOut)}</td><td>{r.checkIn&&r.checkOut?formatHours(workedHours(r)):'—'}</td><td><StatusPill status={r.status}/></td>{showAction&&<td><button type="button" className="btn btn-outline btn-tiny" onClick={()=>onCorrection?.(r)}>Request Correction</button></td>}</tr>;
  })}</tbody></table>{rows.length===0&&<Empty/>}</div>;
}
export function Dialog({title,children,onClose}){return <div className="dialog-backdrop" onMouseDown={onClose} role="presentation"><div className="dialog" onMouseDown={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}><div className="dialog-heading"><h2>{title}</h2><button type="button" onClick={onClose} className="icon-button" aria-label="Close dialog"><XCircle size={20}/></button></div>{children}</div></div>;}
export function Alert({type='info',children}){return <div className={`alert alert-${type}`}>{type==='success'?<BadgeCheck size={19}/>:<Info size={19}/>}<span>{children}</span></div>;}
