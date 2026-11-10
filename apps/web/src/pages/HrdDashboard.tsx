import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AttendanceTable } from '../components/AttendanceTable';
import { Card, ErrorPanel, Loading, PageHeader } from '../components/ui';
import { attendanceApi, employeesApi } from '../lib/api';
import { formatDate, todayJakarta } from '../lib/dates';

export function HrdDashboard() {
  const date = todayJakarta();
  const employees = useQuery({ queryKey: ['employees', 'summary'], queryFn: () => employeesApi.list({ page: 1, pageSize: 1 }) });
  const today = useQuery({ queryKey: ['attendances', 'today', date], queryFn: () => attendanceApi.list({ date, page: 1, pageSize: 6 }) });
  const all = useQuery({ queryKey: ['attendances', 'summary'], queryFn: () => attendanceApi.list({ page: 1, pageSize: 1 }) });
  return <>
    <PageHeader title="Attendance overview" description={`${formatDate(date, true)}. Attendance records are read-only.`} action={<Link to="/hrd/employees/create" className="btn-primary">Add employee</Link>} />
    <Card className="mb-6 p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600">Checked in today</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-ink tabular-nums">{today.isPending ? 'Loading' : today.isError ? 'Not available' : today.data.total}</p>
          <p className="mt-2 text-sm text-slate-600">{formatDate(date)}</p>
        </div>
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          <div><dt className="text-xs font-medium text-slate-600">Total employees</dt><dd className="mt-1 text-lg font-semibold text-ink tabular-nums">{employees.isPending ? 'Loading' : employees.isError ? 'Not available' : employees.data.total}</dd></div>
          <div><dt className="text-xs font-medium text-slate-600">Attendance records</dt><dd className="mt-1 text-lg font-semibold text-ink tabular-nums">{all.isPending ? 'Loading' : all.isError ? 'Not available' : all.data.total}</dd></div>
        </dl>
      </div>
      {(today.isError || employees.isError || all.isError) && <div className="mt-5"><ErrorPanel error={today.error ?? employees.error ?? all.error} retry={() => { void today.refetch(); void employees.refetch(); void all.refetch(); }} /></div>}
    </Card>
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div><h2 className="font-semibold text-ink">Today’s check-ins</h2><p className="mt-1 text-xs text-slate-600">{formatDate(date)}</p></div>
        <Link to={`/hrd/attendances?date=${date}`} className="text-xs font-semibold text-brand-800 hover:text-brand-900">Attendance monitor</Link>
      </div>
      {today.isPending ? <Loading /> : today.isError ? <div className="p-5"><ErrorPanel error={today.error} retry={() => void today.refetch()} /></div> : <AttendanceTable items={today.data.items} hrd />}
    </Card>
  </>;
}
