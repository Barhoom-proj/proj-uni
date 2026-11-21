import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { ArrowRight, CalendarCheck, Cloud, LockKeyhole, ShieldCheck, Smartphone, UsersRound } from 'lucide-react';
import { useDemo } from '../context/DemoContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function CognitoComplete() {
  const auth = useAuth();
  const navigate = useNavigate();
  React.useEffect(() => { void auth.refreshAuth(); }, [auth.refreshAuth]);
  React.useEffect(() => {
    if (auth.role) navigate(`/${auth.role}/dashboard`, { replace:true });
  }, [auth.role, navigate]);
  return <div className="auth-progress" role="status">Checking CloudTrek account permissions…</div>;
}

export default function Login(){
  const {login}=useDemo();
  const {mode}=useAuth();
  const navigate=useNavigate();
  const [role,setRole]=React.useState('employee');
  const enter=e=>{e.preventDefault();login(role);navigate(`/${role}/dashboard`);};
  return <div className="login-page">
    <div className="login-hero">
      <div className="login-brand"><Cloud size={42} fill="currentColor"/> CloudTrek</div>
      <div className="login-hero-copy"><span className="eyebrow light">SECURE EMPLOYEE ATTENDANCE</span><h1>Clock in securely <em>from your phone.</em></h1><p>Sign in, scan your office's QR code with your phone camera, and review your attendance at any time.</p><div className="login-hero-features"><span><Smartphone size={17}/> Designed for employee phones</span><span><CalendarCheck size={17}/> QR check-in and check-out</span><span><ShieldCheck size={17}/> Secure sign-in with Cognito</span></div></div>
      <div className="login-hero-footer">CloudTrek Secure Employee Attendance Tracking System</div>
    </div>
    <div className="login-side">
      {mode==='cognito' ? <div className="login-card login-card-cognito">
        <div className="login-lock"><LockKeyhole size={25}/></div>
        <h2>Sign in to CloudTrek</h2><p>Use your company account. You will be redirected to your employee or manager dashboard.</p>
        <Authenticator hideSignUp loginMechanisms={['email']}>
          {() => <CognitoComplete/>}
        </Authenticator>
        <p className="login-smallprint">Accounts are created by a CloudTrek administrator. Camera and location access will only be requested when needed for attendance.</p>
      </div> : <form className="login-card" onSubmit={enter}>
        <div className="login-lock"><LockKeyhole size={25}/></div>
        <h2>Welcome to CloudTrek</h2><p>Select a role to explore the mobile-friendly prototype.</p>
        <div className="role-picker"><button type="button" className={role==='employee'?'role-active':''} onClick={()=>setRole('employee')}><UsersRound size={18}/> Employee</button><button type="button" className={role==='manager'?'role-active':''} onClick={()=>setRole('manager')}><ShieldCheck size={18}/> Manager</button></div>
        <div className="login-demo-info"><strong>DEMO MODE — No AWS authentication</strong><span>Sample user • {role==='employee'?'Employee':'Manager'}</span><small>Add your Cognito User Pool ID and App Client ID to .env.local to enable real login.</small></div>
        <button className="btn btn-primary btn-block btn-lg" type="submit">Explore {role==='employee'?'Employee':'Manager'} Dashboard <ArrowRight size={18}/></button>
      </form>}
    </div>
  </div>;
}
