const dayISO = (daysBack = 0) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysBack);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};

export const todayISO = () => dayISO(0);
export const employees = [
  { id: 'CT104', name: 'Ebrahim Ghareeb', department: 'IT Solutions', position: 'UX Designer', email: 'employee@cloudtrek.demo', color: 'blue' },
  { id: 'CT101', name: 'Ahmed Al Mulla', department: 'IT Solutions', position: 'Software Developer', email: 'ahmed@cloudtrek.demo', color: 'blue' },
  { id: 'CT115', name: 'Sara Khalid', department: 'Marketing', position: 'Coordinator', email: 'sara@cloudtrek.demo', color: 'purple' },
  { id: 'CT108', name: 'Hassan Ali', department: 'Events', position: 'Event Planner', email: 'hassan@cloudtrek.demo', color: 'amber' },
  { id: 'CT119', name: 'Noor Mohammed', department: 'Public Relations', position: 'PR Specialist', email: 'noor@cloudtrek.demo', color: 'pink' },
  { id: 'CT120', name: 'Yousef Hassan', department: 'Operations', position: 'Supervisor', email: 'yousef@cloudtrek.demo', color: 'green' },
  { id: 'CT122', name: 'Maryam Yusuf', department: 'Marketing', position: 'Designer', email: 'maryam@cloudtrek.demo', color: 'purple' },
  { id: 'CT132', name: 'Ali Jassim', department: 'Operations', position: 'Assistant', email: 'ali@cloudtrek.demo', color: 'amber' },
];

const defaultToday = [
  ['CT101','08:02','17:01','Present'],
  ['CT115','08:18','17:06','Late'],
  ['CT108','08:05','17:00','Present'],
  ['CT119',null,null,'Absent'],
  ['CT120','08:06','17:03','Present'],
  ['CT122','08:00','17:02','Present'],
  ['CT132','08:21','17:09','Late'],
];

export function makeSeedAttendance(){
  const rows=[];
  defaultToday.forEach(([employeeId,checkIn,checkOut,status]) => {
    rows.push({id:`att-${dayISO()}-${employeeId}`,employeeId,date:dayISO(),checkIn,checkOut,status});
  });
  for (let back=1;back<=14;back++) {
    if ([5,6,12,13].includes(back)) continue;
    employees.forEach((employee,index) => {
      const late = (back + index) % 8 === 0;
      const absent = (back + index) % 18 === 0;
      rows.push({
        id:`att-${dayISO(back)}-${employee.id}`,
        employeeId:employee.id,
        date:dayISO(back),
        checkIn: absent?null:(late?'08:19':'08:03'),
        checkOut: absent?null:'17:02',
        status:absent?'Absent':late?'Late':'Present'
      });
    });
  }
  return rows;
}

export const initialRequests = [
  {id:'req-1',employeeId:'CT115',type:'Leave Request',date:dayISO(2),reason:'Family appointment',status:'Pending',createdAt:dayISO(0)},
  {id:'req-2',employeeId:'CT108',type:'Attendance Correction',date:dayISO(1),reason:'Forgot to scan on arrival',status:'Pending',createdAt:dayISO(0)},
  {id:'req-3',employeeId:'CT119',type:'Leave Request',date:dayISO(4),reason:'Medical appointment',status:'Pending',createdAt:dayISO(0)},
];

export const fullDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
export const shortDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
export const timeToMinutes = value => {
  if(!value) return 0;
  const [h,m]=value.split(':').map(Number);
  return h*60+m;
};
export const workedHours = row => row?.checkIn&&row?.checkOut ? Math.max(0,(timeToMinutes(row.checkOut)-timeToMinutes(row.checkIn))/60) : 0;
export const formatHours = hours => `${Math.floor(hours)}h ${String(Math.round((hours%1)*60)).padStart(2,'0')}m`;
export const displayTime = t => {
  if(!t) return '—';
  const [h,m]=t.split(':').map(Number);
  return `${String(h%12||12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;
};
export const initials = name => name.split(' ').slice(0,2).map(s=>s[0]).join('').toUpperCase();
