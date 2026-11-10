import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { AttendanceTable } from '../components/AttendanceTable';
import { Badge, Card, Detail, ErrorPanel, Loading, PageHeader, Pagination } from '../components/ui';
import { attendanceApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatTime, initials, todayJakarta } from '../lib/dates';
import { useOwnOverview } from '../lib/queries';

export function EmployeeDashboard() {
  const { user } = useAuth();
  const query = useOwnOverview();
  const employee = user?.employee;
  const firstName = employee?.fullName?.split(' ')[0] || 'there';
  const today = query.today;
  const action = today
    ? today.checkOutAt ? { to: '/employee/history', label: 'View attendance' } : { to: '/employee/attendance', label: 'Clock out' }
    : { to: '/employee/attendance', label: 'Check in' };

  return <>
    <PageHeader title={`Welcome back, ${firstName}.`} description={formatDate(todayJakarta(), true)} />
    {query.isPending ? <Loading /> : query.isError ? <ErrorPanel error={query.error} retry={() => void query.refetch()} /> : <>
      <Card className="mb-6 p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600">Today</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">{today ? (today.checkOutAt ? 'Workday complete' : 'Checked in') : 'Not checked in'}</h2>
            {today ? <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
              <div><p className="text-xs font-medium text-slate-600">Check-in</p><p className="mt-1 text-sm font-semibold text-ink tabular-nums">{formatTime(today.checkInAt)} WIB</p></div>
              <div><p className="text-xs font-medium text-slate-600">Check-out</p><p className="mt-1 text-sm font-semibold text-ink tabular-nums">{today.checkOutAt ? `${formatTime(today.checkOutAt)} WIB` : 'Not set'}</p></div>
            </div> : <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">Record your attendance with a photo when you start work.</p>}
          </div>
          <Link to={action.to} className="btn-primary shrink-0">{action.label}</Link>
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><h2 className="font-semibold text-ink">Recent attendance</h2><p className="mt-1 text-xs text-slate-600">{query.data.total} recorded check-ins</p></div>
          <Link to="/employee/history" className="text-xs font-semibold text-brand-800 hover:text-brand-900">All attendance</Link>
        </div>
        <AttendanceTable items={query.data.items.slice(0, 5)} />
      </Card>
    </>}
  </>;
}

export function AttendanceHistory() {
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const query = useQuery({ queryKey: ['attendances', 'mine', page, pageSize], queryFn: () => attendanceApi.mine({ page, pageSize }) });
  return <>
    <PageHeader title="Attendance history" description="Your recorded check-ins and clock-outs in Asia/Jakarta time." action={<Link to="/employee/attendance" className="btn-primary">Check in</Link>} />
    <Card>
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-ink">Your records</h2><p className="mt-1 text-xs text-slate-600">{query.data ? `${query.data.total} recorded check-ins` : 'Loading your records'}</p></div>
      {query.isPending ? <Loading /> : query.isError ? <div className="p-5"><ErrorPanel error={query.error} retry={() => void query.refetch()} /></div> : <><AttendanceTable items={query.data.items} /><Pagination page={page} pageSize={pageSize} total={query.data.total} onChange={setPage} /></>}
    </Card>
  </>;
}

export function EmployeeProfile() {
  const { user } = useAuth();
  const employee = user?.employee;
  return <>
    <PageHeader title="My profile" description="Employee information managed by the HR team." />
    <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="p-6 text-center">
        <span className="avatar mx-auto h-20 w-20 rounded-xl text-2xl">{initials(employee?.fullName)}</span>
        <h2 className="mt-5 text-xl font-semibold text-ink">{employee?.fullName}</h2>
        <p className="mt-2 text-sm text-slate-600">{employee?.position}</p>
        <div className="mt-4"><Badge value={employee?.status || 'ACTIVE'} /></div>
        <p className="mt-6 border-t border-slate-200 pt-5 text-xs text-slate-600 tabular-nums">{employee?.employeeNumber}</p>
      </Card>
      <div className="space-y-5">
        <Card className="p-6 sm:p-8">
          <h2 className="font-semibold text-ink">Employee information</h2>
          <dl className="mt-7 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            <Detail label="Full name">{employee?.fullName}</Detail>
            <Detail label="Employee number">{employee?.employeeNumber}</Detail>
            <Detail label="Work email">{employee?.email}</Detail>
            <Detail label="Department">{employee?.department}</Detail>
            <Detail label="Position">{employee?.position}</Detail>
            <Detail label="Account role">Employee</Detail>
          </dl>
        </Card>
        <p className="text-xs leading-6 text-slate-600">Contact HR to update your profile or reset your password.</p>
      </div>
    </div>
  </>;
}
