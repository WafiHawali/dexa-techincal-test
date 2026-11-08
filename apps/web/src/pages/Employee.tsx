import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, Check, Clock3, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AttendanceTable } from '../components/AttendanceTable';
import { Badge, Card, Detail, ErrorPanel, Loading, PageHeader, Pagination, StatCard } from '../components/ui';
import { attendanceApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatTime, initials, todayJakarta } from '../lib/dates';
import { useOwnOverview } from '../lib/queries';

export function EmployeeDashboard() {
  const { user } = useAuth();
  const query = useOwnOverview();
  const employee = user?.employee;
  const firstName = employee?.fullName?.split(' ')[0] || 'there';
  return <><PageHeader eyebrow="Your workday, at a glance" title={`Welcome back, ${firstName}.`} description={formatDate(todayJakarta(), true)} />
    {query.isPending ? <Loading /> : query.isError ? <ErrorPanel error={query.error} retry={() => void query.refetch()} /> : <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3"><StatCard label="Today’s attendance" value={query.today ? 'Checked in' : 'Not checked in'} note={query.today ? 'Your workday is recorded' : 'Ready when you are'} icon={<CalendarCheck size={20} />} /><StatCard label="Check-in time" value={query.today ? formatTime(query.today.checkInAt) : '—'} note="Server-recorded time · WIB" icon={<Clock3 size={20} />} /><StatCard label="Total check-ins" value={query.data.total} note="Your recorded attendance, all time" icon={<Check size={20} />} /></div>
      <div className="mb-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]"><section className="relative overflow-hidden rounded-2xl bg-brand-800 p-6 text-white sm:p-8"><div className="absolute -bottom-20 -right-12 h-64 w-64 rounded-full border-[40px] border-white/5" /><div className="relative"><span className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-brand-100"><span className="h-1.5 w-1.5 rounded-full bg-brand-200" />Work from home</span><h2 className="text-2xl font-semibold tracking-tight">{query.today ? 'You’re all set for today.' : 'Make today a great workday.'}</h2><p className="mt-3 max-w-md text-sm leading-6 text-brand-100/80">{query.today ? `Your check-in was recorded at ${formatTime(query.today.checkInAt)} WIB. Have a productive day, and stay connected with your team.` : 'Start with a quick check-in. Have your photo ready and allow location access when you submit.'}</p><Link to={query.today ? '/employee/history' : '/employee/attendance'} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-800 hover:bg-brand-50">{query.today ? 'View my attendance' : 'Check in now'}<ArrowRight size={17} /></Link></div></section>
      <Card className="p-6"><div className="mb-5 flex items-center justify-between"><h2 className="font-semibold text-ink">Your profile</h2><Link to="/employee/profile" className="text-xs font-semibold text-brand-700">View profile</Link></div><div className="flex items-center gap-3"><span className="avatar h-12 w-12">{initials(employee?.fullName)}</span><div><p className="font-semibold text-ink">{employee?.fullName}</p><p className="mt-1 text-xs text-slate-500">{employee?.position}</p></div></div><dl className="mt-6 grid grid-cols-2 gap-5"><Detail label="Employee ID">{employee?.employeeNumber}</Detail><Detail label="Department">{employee?.department}</Detail></dl></Card></div>
      <Card><div className="flex items-center justify-between border-b border-slate-100 px-5 py-5"><div><h2 className="font-semibold text-ink">Recent attendance</h2><p className="mt-1 text-xs text-slate-400">Your latest recorded workdays</p></div><Link to="/employee/history" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">View all<ArrowRight size={14} /></Link></div><AttendanceTable items={query.data.items.slice(0, 5)} /></Card>
    </>}<p className="mt-5 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={14} />Location is recorded at check-in only. We never track you in the background.</p></>;
}

export function AttendanceHistory() {
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const query = useQuery({ queryKey: ['attendances', 'mine', page, pageSize], queryFn: () => attendanceApi.mine({ page, pageSize }) });
  return <><PageHeader eyebrow="Employee workspace" title="Attendance history" description="A clear record of your workdays. Dates and times are displayed in WIB." action={<Link to="/employee/attendance" className="btn-primary"><CalendarCheck size={17} />Check in</Link>} /><Card><div className="border-b border-slate-100 px-5 py-5"><h2 className="font-semibold text-ink">My attendance</h2><p className="mt-1 text-xs text-slate-400">{query.data ? `${query.data.total} recorded check-ins` : 'Your attendance records'}</p></div>{query.isPending ? <Loading /> : query.isError ? <div className="p-5"><ErrorPanel error={query.error} retry={() => void query.refetch()} /></div> : <><AttendanceTable items={query.data.items} /><Pagination page={page} pageSize={pageSize} total={query.data.total} onChange={setPage} /></>}</Card></>;
}

export function EmployeeProfile() {
  const { user } = useAuth();
  const employee = user?.employee;
  return <><PageHeader eyebrow="Employee workspace" title="My profile" description="Your employee information, managed by the HR team." /><div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]"><Card className="p-7 text-center"><span className="avatar mx-auto h-24 w-24 rounded-3xl text-3xl">{initials(employee?.fullName)}</span><h2 className="mt-5 text-xl font-semibold text-ink">{employee?.fullName}</h2><p className="mt-2 text-sm text-slate-500">{employee?.position}</p><div className="mt-4"><Badge value={employee?.status || 'ACTIVE'} /></div><div className="mt-7 border-t border-slate-100 pt-5 text-xs text-slate-400">{employee?.employeeNumber}</div></Card><div className="space-y-6"><Card className="p-6 sm:p-8"><h2 className="flex items-center gap-2 font-semibold text-ink"><UserRound size={19} className="text-brand-600" />Employee information</h2><dl className="mt-7 grid gap-x-8 gap-y-7 sm:grid-cols-2"><Detail label="Full name">{employee?.fullName}</Detail><Detail label="Employee number">{employee?.employeeNumber}</Detail><Detail label="Work email">{employee?.email}</Detail><Detail label="Department">{employee?.department}</Detail><Detail label="Position">{employee?.position}</Detail><Detail label="Account role">Employee</Detail></dl></Card><div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-50 p-5 text-brand-800"><MapPin size={20} className="mt-0.5 shrink-0" /><div><h3 className="text-sm font-semibold">Your information stays protected</h3><p className="mt-2 text-xs leading-6">Need to update your profile or reset your password? Contact your HR team. Profile changes are managed centrally to keep employee records accurate.</p></div></div></div></div></>;
}
