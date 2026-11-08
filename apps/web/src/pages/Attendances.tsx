import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, Image, LockKeyhole, MapPin, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { AttendanceTable } from '../components/AttendanceTable';
import { ProtectedPhoto } from '../components/ProtectedPhoto';
import { Badge, Card, Detail, Empty, ErrorPanel, Loading, PageHeader, Pagination, SearchInput, useDebounce } from '../components/ui';
import { attendanceApi } from '../lib/api';
import { formatDate, formatTime, initials } from '../lib/dates';

export function Attendances() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const debounced = useDebounce(search);
  const date = params.get('date') || '';
  const rawPage = Number(params.get('page') || 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = 15;
  const query = useQuery({ queryKey: ['attendances', 'list', debounced, date, page, pageSize], queryFn: () => attendanceApi.list({ search: debounced || undefined, date: date || undefined, page, pageSize }) });
  function update(values: Record<string, string>) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
      return next;
    }, { replace: true });
  }
  return <><PageHeader eyebrow="People operations" title="Attendance monitor" description="Review employee check-ins, photo evidence, and recorded locations. All times are in WIB." /><div className="mb-5 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={16} className="text-brand-600" />Attendance records are read-only to preserve their integrity.</div><Card><div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5"><SearchInput value={search} onChange={(value) => { setSearch(value); update({ search: value, page: '' }); }} placeholder="Search employee name or number…" /><div className="flex flex-wrap items-center gap-3"><label htmlFor="attendance-date" className="flex items-center gap-2 text-xs font-medium text-slate-500"><CalendarDays size={16} />Date</label><input id="attendance-date" type="date" value={date} className="input w-auto" onChange={(e) => update({ date: e.target.value, page: '' })} />{(search || date) && <button className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear filters</button>}</div></div>
    {query.isPending ? <Loading /> : query.isError ? <div className="p-5"><ErrorPanel error={query.error} retry={() => void query.refetch()} /></div> : <><AttendanceTable items={query.data.items} hrd /><Pagination page={page} pageSize={pageSize} total={query.data.total} onChange={(next) => update({ page: String(next) })} /></>}</Card></>;
}

export function AttendanceDetail() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['attendances', 'detail', id], queryFn: () => attendanceApi.get(id!), enabled: !!id });
  if (query.isPending) return <Loading label="Loading attendance details…" />;
  if (query.isError) return <><PageHeader title="Attendance detail" back="/hrd/attendances" /><ErrorPanel error={query.error} retry={() => void query.refetch()} /></>;
  const item = query.data;
  const employee = item.employee;
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  const hasLocation = item.latitude != null && item.longitude != null && Number.isFinite(lat) && Number.isFinite(lng);
  return <><PageHeader eyebrow="Attendance record" title="Attendance detail" description={`${formatDate(item.attendanceDate, true)} · Check-in at ${formatTime(item.checkInAt)} WIB`} back="/hrd/attendances" action={<Badge value={item.status} />} /><div className="grid items-start gap-6 xl:grid-cols-[1fr_1.1fr]"><div className="space-y-6"><Card className="p-6"><div className="flex items-center gap-4"><span className="avatar h-14 w-14 text-lg">{initials(employee?.fullName)}</span><div><h2 className="text-lg font-semibold text-ink">{employee?.fullName || 'Employee'}</h2><p className="mt-1 text-xs text-slate-500">{employee?.employeeNumber || item.employeeId}</p></div></div><dl className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-100 pt-6"><Detail label="Department">{employee?.department}</Detail><Detail label="Position">{employee?.position}</Detail><Detail label="Attendance date">{formatDate(item.attendanceDate)}</Detail><Detail label="Check-in time">{formatTime(item.checkInAt)} WIB</Detail><Detail label="Work email">{employee?.email}</Detail><Detail label="Attendance ID"><span className="font-mono text-xs">{item.id}</span></Detail></dl></Card>
    <Card className="p-6"><h2 className="flex items-center gap-2 font-semibold text-ink"><MapPin size={19} className="text-brand-600" />Recorded location</h2><dl className="mt-6 grid grid-cols-2 gap-6"><Detail label="Latitude">{hasLocation ? lat.toFixed(6) : '—'}</Detail><Detail label="Longitude">{hasLocation ? lng.toFixed(6) : '—'}</Detail><Detail label="GPS accuracy">{item.gpsAccuracy != null ? `±${Math.round(Number(item.gpsAccuracy))} meters` : 'Not available'}</Detail><Detail label="Capture method">Single check-in capture</Detail></dl>{hasLocation && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-6"><ExternalLink size={15} />Open coordinates in Maps</a>}<p className="mt-4 text-xs leading-5 text-slate-400">Coordinates are reported by the employee’s device, not a guarantee of physical presence. Opening Maps shares these coordinates with Google.</p></Card><div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><LockKeyhole size={17} className="mt-0.5 shrink-0 text-slate-400" /><p className="text-xs leading-6 text-slate-500">This is a read-only record. The check-in timestamp is generated by the server and cannot be edited here.</p></div></div>
    <Card className="overflow-hidden"><div className="flex items-center gap-2 border-b border-slate-100 p-6"><Image size={19} className="text-brand-600" /><h2 className="font-semibold text-ink">Attendance evidence</h2><span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{item.photos?.length || 0} photo(s)</span></div>{item.photos?.length ? <div className="divide-y divide-slate-100">{item.photos.map((photo, index) => <figure key={photo.id}><ProtectedPhoto id={photo.id} alt={`Attendance evidence for ${employee?.fullName || 'employee'} on ${formatDate(item.attendanceDate)}, photo ${index + 1}`} /><figcaption className="flex items-center gap-2 px-5 py-4 text-xs text-slate-400"><ShieldCheck size={14} />Authenticated access only · Click photo to view full size</figcaption></figure>)}</div> : <Empty title="No photo available" description="No photo metadata was returned for this attendance record." />}</Card>
  </div></>;
}
