import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BrowserQRCodeReader } from '@zxing/browser';
import { Camera, CameraOff, Clock3, Info, MapPin, QrCode, ShieldCheck, Smartphone } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { todayISO, displayTime } from '../data/demo.js';
import { Alert, Card, Pill, SectionTitle } from '../components/UI.jsx';
import { submitAttendance } from '../services/attendanceApi.js';
import { isAttendanceApiConfigured } from '../awsConfig.js';

export default function ScanQR(){
  const {attendance,recordAttendance,authMode}=useDemo();
  const navigate=useNavigate();
  const [outcome,setOutcome]=React.useState('valid');
  const [result,setResult]=React.useState(null);
  const [cameraState,setCameraState]=React.useState('off');
  const [qrToken,setQrToken]=React.useState('');
  const [location,setLocation]=React.useState(null);
  const [locationState,setLocationState]=React.useState('not-requested');
  const [working,setWorking]=React.useState(false);
  // Never infer a real employee's attendance status from local demo records.
  const [liveAction,setLiveAction]=React.useState('check-in');
  const videoRef=React.useRef(null);
  const controlsRef=React.useRef(null);
  const cancelledRef=React.useRef(false);
  const seenRef=React.useRef(false);
  const today=attendance.find(r=>r.employeeId==='CT104'&&r.date===todayISO());
  const action=authMode==='cognito' ? liveAction : (today?.checkIn&&!today?.checkOut?'check-out':'check-in');

  const stopCamera=React.useCallback(()=>{
    cancelledRef.current=true;
    controlsRef.current?.stop();
    controlsRef.current=null;
    if(videoRef.current?.srcObject){
      videoRef.current.srcObject.getTracks().forEach(track=>track.stop());
      videoRef.current.srcObject=null;
    }
    setCameraState('off');
  },[]);
  React.useEffect(()=>()=>{cancelledRef.current=true;controlsRef.current?.stop();
    if(videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(track=>track.stop());
  },[]);

  async function startCamera(){
    setResult(null);setQrToken('');seenRef.current=false;cancelledRef.current=false;
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia){
      setResult({ok:false,message:'Phone camera requires HTTPS (or localhost on your computer). Deploy to a secure URL for phone testing.'});return;
    }
    setCameraState('starting');
    try {
      const reader=new BrowserQRCodeReader();
      const controls=await reader.decodeFromConstraints(
        {audio:false,video:{facingMode:{ideal:'environment'}}},
        videoRef.current,
        (decoded)=>{
          if(!decoded || seenRef.current || cancelledRef.current)return;
          seenRef.current=true;
          const raw=decoded.getText();
          stopCamera();
          setQrToken(raw);
          setResult({ok:true,message:'QR scanned successfully. It has NOT been verified by the backend yet.'});
        }
      );
      if(cancelledRef.current){controls.stop();return;}
      controlsRef.current=controls;
      setCameraState('on');
    }catch(error){
      stopCamera();
      setResult({ok:false,message:`Camera unavailable: ${error?.message || 'Allow camera access and try again.'}`});
    }
  }

  async function requestLocation(){
    setResult(null);setLocation(null);
    if(!window.isSecureContext || !navigator.geolocation){
      setLocationState('error');setResult({ok:false,message:'Location requires HTTPS and browser permission.'});return;
    }
    setLocationState('requesting');
    navigator.geolocation.getCurrentPosition(
      position=>{
        const {latitude,longitude,accuracy}=position.coords;
        setLocation({latitude,longitude,accuracy});
        setLocationState('obtained');
      },
      error=>{setLocationState('error');setResult({ok:false,message:`Location unavailable: ${error.message}`});},
      {enableHighAccuracy:true,timeout:12000,maximumAge:0}
    );
  }

  async function submit(){
    setResult(null);
    if(!qrToken){setResult({ok:false,message:'Scan the office QR code first.'});return;}
    if(!location){setResult({ok:false,message:'Select Check Location and allow one-time location access.'});return;}
    setWorking(true);
    try {
      const serverResult=await submitAttendance({action,qrToken,...location});
      setQrToken('');
      navigate('/employee/confirmation',{state:{action,serverResult}});
    }catch(error){setResult({ok:false,message:error?.message||'Attendance could not be recorded.'});}
    finally{setWorking(false);}
  }

  function simulate(){
    const response=recordAttendance(action,outcome);setResult(response);
    if(response.ok)navigate('/employee/confirmation',{state:{action, demo:true}});
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">MOBILE EMPLOYEE ATTENDANCE</span><h1>Scan QR Code</h1><p>Use your phone to scan the temporary QR code displayed at the workplace.</p></div><Pill tone="blue"><ShieldCheck size={15}/>{authMode==='demo'?'Prototype':'Cognito Sign-In'}</Pill></div>
    <div className="qr-layout"><Card className="scanner-card"><SectionTitle icon={QrCode}>Phone QR Scanner</SectionTitle>
      <div className={`camera-frame live-camera-frame ${cameraState==='on'?'camera-active':''}`}>
        <video ref={videoRef} autoPlay muted playsInline aria-label="Camera preview" className="camera-video"/>
        {cameraState==='off'&&<div className="camera-empty"><Camera size={45}/><strong>Camera is off</strong><span>Tap Start Camera and allow camera access on your phone.</span></div>}
        {cameraState==='starting'&&<div className="camera-empty">Starting your camera…</div>}
        <div className="scan-corner tl"/><div className="scan-corner tr"/><div className="scan-corner bl"/><div className="scan-corner br"/>
        <div className="scanner-caption">Align the workplace QR within the frame</div>
      </div>
      <div className="mobile-scan-actions">
        {cameraState==='off'?<button className="btn btn-primary" onClick={startCamera}><Camera size={18}/> Start Camera</button>:<button className="btn btn-outline" onClick={stopCamera}><CameraOff size={18}/> Stop Camera</button>}
      </div>
      {qrToken&&<Alert type="success">QR image read. Awaiting server verification.</Alert>}
      {result&&<div className="scan-result"><Alert type={result.ok?'success':'error'}>{result.message}</Alert></div>}
      <p className="footnote">Camera access requires permission. QR scanning happens on the phone, but fraud checks must happen on the server.</p>
    </Card>
    <div className="qr-side">
      <Card><SectionTitle icon={MapPin}>Verification Details</SectionTitle>
        <div className="detail-row"><MapPin size={22}/><div><strong>Workplace Location</strong><small>{locationState==='obtained'?`Location obtained (±${Math.round(location.accuracy)} m). Server validation pending.`:'Share your location only when checking in or out'}</small></div><Pill tone={locationState==='obtained'?'green':'amber'}>{locationState==='obtained'?'Obtained':'Not checked'}</Pill></div>
        <button className="btn btn-outline btn-block" onClick={requestLocation} disabled={locationState==='requesting'}><MapPin size={17}/>{locationState==='requesting'?'Requesting location…':'Check My Location'}</button>
        <div className="detail-row"><Camera size={22}/><div><strong>Phone Camera</strong><small>Rear-facing camera requested when possible</small></div><Pill tone={cameraState==='on'?'green':'muted'}>{cameraState==='on'?'On':'Off'}</Pill></div>
        <div className="detail-row"><Clock3 size={22}/><div><strong>Attendance Action</strong><small>{action==='check-in'?'Ready to check in':'Ready to check out'}</small></div><Pill tone="blue">{action==='check-in'?'Check In':'Check Out'}</Pill></div>
        {authMode==='cognito' && <div className="attendance-action-picker" role="group" aria-label="Attendance action"><button type="button" className={action==='check-in'?'action-selected':''} aria-pressed={action==='check-in'} onClick={()=>setLiveAction('check-in')}>Check In</button><button type="button" className={action==='check-out'?'action-selected':''} aria-pressed={action==='check-out'} onClick={()=>setLiveAction('check-out')}>Check Out</button></div>}
        {authMode==='cognito'?<>
          <button className="btn btn-primary btn-block" disabled={!qrToken||!location||working||!isAttendanceApiConfigured} onClick={submit}>{working?'Submitting…':action==='check-in'?'Verify & Check In':'Verify & Check Out'}</button>
          {!isAttendanceApiConfigured&&<Alert>Live attendance is disabled until API Gateway and Lambda are connected. Camera and GPS can still be tested on a phone.</Alert>}
        </>:<Alert>Preview mode: QR and location checks do not establish real attendance.</Alert>}
      </Card>
      {authMode==='demo'&&<Card><SectionTitle icon={Smartphone}>Prototype Simulation</SectionTitle><p className="muted-text">These buttons only demonstrate frontend states. No attendance is saved to AWS.</p><div className="field"><label htmlFor="demo-scenario">Demo outcome</label><select id="demo-scenario" value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="valid">Valid QR + location (simulated)</option><option value="expired">Expired QR (simulated)</option><option value="location">Outside office (simulated)</option></select></div><button className="btn btn-outline btn-block" onClick={simulate}>Simulate {action==='check-in'?'Check-In':'Check-Out'}</button></Card>}
      <Card><SectionTitle icon={Info}>Today's Attendance</SectionTitle><div className="time-details compact"><div><span>Check-In</span><strong>{authMode==='demo'?displayTime(today?.checkIn):'From API'}</strong></div><div><span>Check-Out</span><strong>{authMode==='demo'?displayTime(today?.checkOut):'From API'}</strong></div></div><p className="footnote">When backend integration is finished, this section should retrieve your own attendance record from the authenticated API.</p></Card>
    </div></div>
  </>;
}
