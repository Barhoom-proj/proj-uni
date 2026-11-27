import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useDemo } from './context/DemoContext.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';
import ScanQR from './pages/ScanQR.jsx';
import AttendanceConfirmation from './pages/AttendanceConfirmation.jsx';
import AttendanceHistory from './pages/AttendanceHistory.jsx';
import EmployeeProfile from './pages/EmployeeProfile.jsx';
import ManagerDashboard from './pages/ManagerDashboard.jsx';
import MyTeam from './pages/MyTeam.jsx';
import ManagerAttendance from './pages/ManagerAttendance.jsx';
import Requests from './pages/Requests.jsx';
import ManagerProfile from './pages/ManagerProfile.jsx';
import WorkplaceQR from "./pages/WorkplaceQR.jsx";
import AttendanceScan from "./pages/AttendanceScan.jsx";
import ScanInstructions from "./pages/ScanInstructions.jsx";
import WorkplaceQRDisplay from "./pages/WorkplaceQRDisplay";
import EmployeeCorrections from "./pages/EmployeeCorrections.jsx";
import WorkSchedules from "./pages/WorkSchedules.jsx";
import DailyAttendanceStatus from "./pages/DailyAttendanceStatus.jsx";
import MonthlyAttendanceReports from "./pages/MonthlyAttendanceReports.jsx";

function RoleGate({role}){
  const {role:activeRole}=useDemo();
  if(!activeRole)return <Navigate to="/login" replace/>;
  if(activeRole!==role)return <Navigate to={`/${activeRole}/dashboard`} replace/>;
  return <Layout/>;
}
export default function App(){
  const {role}=useDemo();
  const {ready, mode, account, logout}=useAuth();
  if(!ready) return <div className="app-loading" role="status">Loading CloudTrek authentication…</div>;
  if(mode === 'cognito' && account && !role) return <div className="access-denied"><h1>Account access not assigned</h1><p>Your Cognito user is not a member of the <strong>employee</strong> or <strong>manager</strong> group. Please contact your administrator.</p><button className="btn btn-outline" onClick={()=>void logout()}>Sign out</button></div>;
  return <Routes>
    <Route
  path="/workplace/qr-display"
  element={<WorkplaceQRDisplay />}
/>

<Route
  path="/attendance/scan"
  element={<AttendanceScan />}
/>
    <Route path="/attendance/scan"element={<AttendanceScan />}/>
    <Route path="/" element={<Navigate to={role?`/${role}/dashboard`:'/login'} replace/>}/>
    
<Route
  path="/login"
  element={
    role ? (
      <Navigate
        to={
          role === "employee" &&
          sessionStorage.getItem("cloudtrek-pending-attendance-qr")
            ? "/attendance/scan"
            : `/${role}/dashboard`
        }
        replace
      />
    ) : (
      <Login />
    )
  }
/>


    <Route path="/employee" element={<RoleGate role="employee"/>}>
      <Route index element={<Navigate to="dashboard" replace/>}/>
      <Route path="dashboard" element={<EmployeeDashboard/>}/>
      <Route path="scan"element={<ScanInstructions />}/>
      <Route path="confirmation" element={<AttendanceConfirmation/>}/>
      <Route path="history" element={<AttendanceHistory/>}/>
      <Route
  path="corrections"
  element={<EmployeeCorrections />}
/>
      <Route path="profile" element={<EmployeeProfile/>}/>
    </Route>

    <Route path="/manager" element={<RoleGate role="manager"/>}>
      <Route index element={<Navigate to="dashboard" replace/>}/>
      <Route path="workplace-qr" element={<WorkplaceQR />} />
      <Route path="dashboard" element={<ManagerDashboard/>}/>
      <Route path="team" element={<MyTeam/>}/>
      <Route path="attendance" element={<ManagerAttendance/>}/>
      <Route path="requests" element={<Requests/>}/>
      <Route path="profile" element={<ManagerProfile/>}/>
      <Route
  path="reports"
  element={<MonthlyAttendanceReports />}
/>
      <Route
  path="schedules"
  element={<WorkSchedules />}
/>

<Route
  path="daily-attendance"
  element={<DailyAttendanceStatus />}
/>
    </Route>

    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>;
}
