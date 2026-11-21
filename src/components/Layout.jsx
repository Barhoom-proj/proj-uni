import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, ChartNoAxesCombined, ChevronDown, ClipboardList, ClipboardCheck, Clock, Cloud, FileBarChart2, LayoutDashboard, LogOut, Menu, QrCode, Search, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { Avatar } from './UI.jsx';

const employeeNav=[
  {to:'/employee/dashboard',label:'Dashboard',icon:LayoutDashboard},
  {to:'/employee/scan',label:'Scan QR',icon:QrCode},
  {to:'/employee/history',label:'Attendance History',icon:ClipboardList},
  {to:'/employee/profile',label:'Profile',icon:UserRound},
];
const managerNav=[
  {to:'/manager/dashboard',label:'Dashboard',icon:LayoutDashboard},
  {to:'/manager/team',label:'My Team',icon:UsersRound},
  {to:'/manager/attendance',label:'Attendance Records',icon:ClipboardCheck},
  {to:'/manager/requests',label:'Requests',icon:ClipboardList},
  {to:'/manager/reports',label:'Reports',icon:ChartNoAxesCombined},
  {to:'/manager/profile',label:'Profile',icon:UserRound},
];

export default function Layout(){
  const {role,logout,toast,closeToast,requests,authMode,identity}=useDemo();
  const navigate=useNavigate();
  const [mobileOpen,setMobileOpen]=React.useState(false);
  const [showNotifications,setShowNotifications]=React.useState(false);
  const [search,setSearch]=React.useState('');
  const links=role==='manager'?managerNav:employeeNav;
  const signOut=async()=>{try{await logout();navigate('/login');}catch(e){/* Auth context reports errors */}};
  return <div className="app-shell">
    {mobileOpen&&<button className="mobile-overlay" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen?'sidebar-open':''}`}>
      <div className="brand"><div className="brand-icon"><Cloud size={35} fill="currentColor" strokeWidth={1.5}/></div><div><strong>CloudTrek</strong><span>EMPLOYEE ATTENDANCE</span></div></div>
      <nav className="sidebar-nav" aria-label="Primary navigation">{links.map(({to,label,icon:Icon})=><NavLink key={to} to={to} onClick={()=>setMobileOpen(false)} className={({isActive})=>`nav-item ${isActive?'nav-active':''}`}><Icon size={19}/><span>{label}</span>{label==='Requests'&&role==='manager'&&requests.some(r=>r.status==='Pending')&&<span className="nav-dot"/>}</NavLink>)}</nav>
      <div className="sidebar-spacer"/>
      <div className="sidebar-footer"><button className="nav-item logout" onClick={signOut}><LogOut size={19}/>Logout</button><div className="sidebar-waves"/></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="topbar-title"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobileOpen(!mobileOpen)}><Menu size={22}/></button><span>{role==='manager'?'Manager Portal':'Employee Portal'}</span></div>
        <div className="topbar-actions">{role==='manager'&&<label className="top-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){navigate(`/manager/team?q=${encodeURIComponent(search)}`);setMobileOpen(false);}}} placeholder="Search employee (press Enter)" aria-label="Search employee by name or ID"/></label>}<div className="notification-area"><button className="icon-button bell" aria-label="Show notifications" aria-expanded={showNotifications} onClick={()=>setShowNotifications(v=>!v)}><Bell size={21}/>{role==='manager'&&requests.some(r=>r.status==='Pending')&&<i/>}</button>{showNotifications&&<div className="notification-panel"><strong>Notifications</strong><p>{role==='manager'?`${requests.filter(r=>r.status==='Pending').length} requests awaiting your review.`:'Your attendance and requests will appear in this demo.'}</p><button className="text-link" onClick={()=>{setShowNotifications(false);if(role==='manager')navigate('/manager/requests');}}> {role==='manager'?'Review requests':'Close'}</button></div>}</div><div className="topbar-user"><Avatar name={identity?.displayName || "Demo User"} size="sm"/><div><strong>{identity?.displayName || "Demo User"}</strong><small>{role==='manager'?'Manager':'Employee'}</small></div><ChevronDown size={16}/></div></div>
      </header>
      <div className="demo-bar"><ShieldCheck size={16}/><span>{authMode==='cognito' ? <><strong>Cognito connected:</strong> Login is real; attendance, manager reports and profile details still show sample data until API Gateway and the database are connected.</> : <><strong>Frontend demo:</strong> No AWS login or server-backed attendance. All attendance and security checks are simulated.</>}</span></div>
      <main className="page-content"><Outlet/></main>
      {role==='employee'&&<nav className="employee-bottom-nav" aria-label="Employee mobile navigation">{employeeNav.map(({to,label,icon:Icon})=><NavLink key={to} to={to} className={({isActive})=>`bottom-nav-link ${isActive?'bottom-nav-active':''}`}><Icon size={20}/><span>{label==='Attendance History'?'History':label}</span></NavLink>)}</nav>}
    </div>
    {toast&&<div className="toast" role="status"><span>{toast}</span><button onClick={closeToast} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div>;
}
