import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import type { Attendance } from '../lib/types';
import { formatDate, formatTime, initials } from '../lib/dates';
import { Badge, Empty } from './ui';

export function AttendanceTable({ items, hrd = false }: { items: Attendance[]; hrd?: boolean }) {
  if (!items.length) return <Empty title="No attendance records yet" description={hrd ? 'No check-ins match this selection. Try another date or search.' : 'Your check-ins will appear here after you submit your first attendance.'} />;
  return <div className="overflow-x-auto"><table className="data-table"><thead><tr>{hrd && <th>Employee</th>}<th>Date</th><th>Check-in time</th><th>Status</th><th>Location</th>{hrd && <th><span className="sr-only">View detail</span></th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id}>{hrd && <td><div className="flex items-center gap-3"><span className="avatar h-9 w-9 shrink-0 text-xs">{initials(item.employee?.fullName)}</span><div><p className="font-medium text-ink">{item.employee?.fullName || 'Employee'}</p><p className="mt-0.5 text-xs text-slate-400">{item.employee?.employeeNumber || item.employeeId}</p></div></div></td>}<td className="font-medium text-slate-700">{formatDate(item.attendanceDate)}</td><td>{formatTime(item.checkInAt)} <span className="text-xs text-slate-400">WIB</span></td><td><Badge value={item.status} /></td><td><span className="font-mono text-xs text-slate-500">{Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}</span></td>{hrd && <td><Link to={`/hrd/attendances/${encodeURIComponent(item.id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900">Details<ArrowUpRight size={15} /></Link></td>}</tr>)}</tbody></table></div>;
}
