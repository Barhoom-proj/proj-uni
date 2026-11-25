import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { employees, initialRequests, makeSeedAttendance, todayISO } from '../data/demo.js';
import { useAuth } from './AuthContext.jsx';

const Ctx = createContext(null);
const STORAGE_KEY = 'cloudtrek-frontend-demo-v1';

function makeInitial() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.attendance) && Array.isArray(saved.requests)) return saved;
  } catch { /* Ignore malformed browser demo state */ }
  return { attendance:makeSeedAttendance(), requests:initialRequests, activity:[], employeeStatus:'' };
}

export function DemoProvider({children}) {
  const auth = useAuth();
  const [session,setSession]=useState(()=>{
    const value = sessionStorage.getItem('cloudtrek-demo-role');
    return value==='employee'||value==='manager'?value:null;
  });
  const [data,setData]=useState(makeInitial);
  const [toast,setToast]=useState('');
  useEffect(()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));},[data]);
  useEffect(()=>{if(session)sessionStorage.setItem('cloudtrek-demo-role',session);else sessionStorage.removeItem('cloudtrek-demo-role');},[session]);

  const notify=useCallback(message=>{setToast(message);},[]);
  const closeToast=useCallback(()=>setToast(''),[]);
  const login=useCallback(role=>{
    if(auth.mode === 'demo') setSession(role);
  },[auth.mode]);
  const logout=useCallback(async ()=>{
    if(auth.mode === 'cognito') await auth.logout();
    else setSession(null);
  },[auth.mode, auth.logout]);

  const recordAttendance=useCallback((action, outcome='valid')=>{
    if(auth.mode !== 'demo') return {ok:false,message:'Live attendance requires the authenticated AWS API.'};
    if(outcome==='expired'){
      setData(prev=>({...prev,activity:[{id:crypto.randomUUID(),employeeId:'CT104',action:'QR scan rejected',detail:'Demo expired QR',at:new Date().toISOString()},...prev.activity]}));
      return {ok:false,message:'QR code expired. Ask for a new workplace QR code.'};
    }
    if(outcome==='location'){
      setData(prev=>({...prev,activity:[{id:crypto.randomUUID(),employeeId:'CT104',action:'Location rejected',detail:'Demo location verification failure',at:new Date().toISOString()},...prev.activity]}));
      return {ok:false,message:'Location could not be verified within the office area.'};
    }
    const date=todayISO();
    const now=new Date();
    const clock=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const current=data.attendance.find(r=>r.employeeId==='CT104'&&r.date===date);
    if(action==='check-in' && current?.checkIn) return {ok:false,message:'You have already checked in today.'};
    if(action==='check-out' && current?.checkOut) return {ok:false,message:'You have already checked out today.'};
    setData(prev=>{
      const found=prev.attendance.find(r=>r.employeeId==='CT104'&&r.date===date);
      const entry=action==='check-in'
        ?{id:`att-${date}-CT104`,employeeId:'CT104',date,checkIn:clock,checkOut:null,status:'Present'}
        :{...found,checkOut:clock};
      return {
        ...prev,
        attendance:[entry,...prev.attendance.filter(r=>r.id!==entry.id)],
        activity:[{id:crypto.randomUUID(),employeeId:'CT104',action:action==='check-in'?'Check-in':'Check-out',detail:'Demo QR + location validation',at:new Date().toISOString()},...prev.activity]
      };
    });
    return {ok:true,message:action==='check-in'?'Check-in recorded in demo data.':'Check-out recorded in demo data.'};
  },[data.attendance,auth.mode]);

  const requestCorrection=useCallback(({date,reason})=>{
    if(auth.mode !== 'demo') return {ok:false,message:'Correction requests require a connected AWS API.'};
    if(!reason.trim())return {ok:false,message:'Please provide a reason.'};
    setData(prev=>({...prev,requests:[{id:crypto.randomUUID(),employeeId:'CT104',type:'Attendance Correction',date,reason,status:'Pending',createdAt:todayISO()},...prev.requests]}));
    return {ok:true,message:'Correction request submitted (demo).'};
  },[auth.mode]);

  const decideRequest=useCallback((id,status)=>{
    if(auth.mode !== 'demo'){notify('Manager approvals require the AWS API.');return;}
    setData(prev=>{
      const req=prev.requests.find(r=>r.id===id);
      if(!req||req.status!=='Pending')return prev;
      return {...prev,requests:prev.requests.map(r=>r.id===id?{...r,status}:r),activity:[{id:crypto.randomUUID(),employeeId:req.employeeId,action:`Request ${status.toLowerCase()}`,detail:req.type,at:new Date().toISOString()},...prev.activity]};
    });
    notify(`Request ${status.toLowerCase()} (demo).`);
  },[notify, auth.mode]);

  const resetDemo=useCallback(()=>{setData({attendance:makeSeedAttendance(),requests:initialRequests,activity:[],employeeStatus:''});notify('Demo data reset.');},[notify]);

  const currentRole = auth.mode === 'cognito' ? auth.role : session;
  const value=useMemo(()=>({role:currentRole,authMode:auth.mode,identity:auth.account,login,logout,attendance:data.attendance,requests:data.requests,activity:data.activity,employees,recordAttendance,requestCorrection,decideRequest,resetDemo,notify,toast,closeToast}),[currentRole,auth.mode,auth.account,login,logout,data,recordAttendance,requestCorrection,decideRequest,resetDemo,notify,toast,closeToast]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useDemo(){const ctx=useContext(Ctx);if(!ctx)throw new Error('DemoProvider missing');return ctx;}
