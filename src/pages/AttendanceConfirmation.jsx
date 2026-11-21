import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarCheck2, CheckCircle2, Clock3, Home, MapPin, ShieldCheck } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { todayISO, displayTime, fullDate } from '../data/demo.js';
import { Card, Pill, SectionTitle, Alert } from '../components/UI.jsx';

export default function AttendanceConfirmation(){
  const {state}=useLocation();
  const {attendance, authMode}=useDemo();
  const isReal = authMode === 'cognito';
  const serverResult = state?.serverResult;
  const today=attendance.find(r=>r.employeeId==='CT104'&&r.date===todayISO());
  const action=state?.action==='check-out'?'Check-Out':'Check-In';
  const recordedTime=isReal
    ? (serverResult?.recordedAt ? new Date(serverResult.recordedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : null)
    : (action==='Check-In'?today?.checkIn:today?.checkOut);
  if(isReal && !serverResult?.attendanceId) return <Card><h2>No attendance confirmation available</h2><p>Only the backend can confirm a successful check-in or check-out.</p><Link className="btn btn-outline" to="/employee/scan">Return to scanner</Link></Card>;
  return <>
    <div className="page-heading"><div><span className="eyebrow">ATTENDANCE CONFIRMATION</span><h1>{action} Successful</h1><p>{isReal?'Attendance was confirmed by the backend.':'Attendance was simulated in the local frontend demo.'}</p></div></div>
    <div className="confirmation-wrap"><Card className="confirmation-card"><div className="confirmation-icon"><CheckCircle2 size={65}/></div><h2>{isReal?'Attendance Recorded Successfully!':'Demo Attendance Recorded'}</h2><p>{isReal?'The API returned a saved attendance record.':'Your local sample attendance was updated. This is not a real employee record.'}</p>
      <div className="confirmation-data"><div><CalendarCheck2 size={23}/><span>Date</span><strong>{isReal?new Date(serverResult.recordedAt).toLocaleDateString():fullDate(todayISO())}</strong></div><div><Clock3 size={23}/><span>Recorded Time</span><strong>{isReal?recordedTime:displayTime(recordedTime)}</strong></div><div><ShieldCheck size={23}/><span>Attendance Type</span><strong>{action}</strong></div></div>
      <div className="confirmation-buttons"><Link to="/employee/dashboard" className="btn btn-primary"><Home size={17}/> Back to Dashboard</Link><Link to="/employee/history" className="btn btn-outline"><CalendarCheck2 size={17}/> View Attendance History</Link></div>
    </Card><Card className="verification-card"><SectionTitle icon={ShieldCheck}>Verification Summary</SectionTitle><div className="detail-row"><ShieldCheck size={21}/><div><strong>QR Code</strong><small>{isReal?'Validated by your backend':'Demo outcome only'}</small></div><Pill tone={isReal?'green':'amber'}>{isReal?'API confirmed':'Simulated'}</Pill></div><div className="detail-row"><MapPin size={21}/><div><strong>Workplace Location</strong><small>{isReal?'Backend must validate location and GPS accuracy':'No live geofence enforcement'}</small></div><Pill tone={isReal?'green':'amber'}>{isReal?'API confirmed':'Simulated'}</Pill></div><div className="detail-row"><Clock3 size={21}/><div><strong>Recorded Time</strong><small>{isReal?'Timestamp supplied by backend':'Timestamp from the local browser'}</small></div><Pill>{isReal?recordedTime:displayTime(recordedTime)}</Pill></div>
      {!isReal&&<Alert>This is a simulated result. To record real attendance, connect Cognito, API Gateway, Lambda and the database.</Alert>}
    </Card></div>
  </>;
}
