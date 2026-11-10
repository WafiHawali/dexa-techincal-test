import { Link } from 'react-router';
import type { Attendance } from '../lib/types';
import { formatDate, formatTime, initials } from '../lib/dates';
import { Badge, Empty } from './ui';

export function AttendanceTable({ items, hrd = false }: { items: Attendance[]; hrd?: boolean }) {
  if (!items.length) return <Empty title="No attendance records yet" description={hrd ? 'No check-ins match this selection. Try another date or search.' : 'Your check-ins will appear here after you submit your first attendance.'} />;
  return <div className="overflow-x-auto"><table className="data-table"><thead><tr>{hrd && <th>Employee</th>}<th>Date</th><th>Check-in</th><th>Check-out</th><th>Status</th>{hrd && <th><span className="sr-only">View detail</span></th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id}>{hrd && <td><div className="flex items-center gap-3"><span className="avatar h-9 w-9 shrink-0 text-xs">{initials(item.employee?.fullName)}</span><div><p className="font-medium text-ink">{item.employee?.fullName || 'Employee'}</p><p className="mt-0.5 text-xs text-slate-600">{item.employee?.employeeNumber || item.employeeId}</p></div></div></td>}<td className="font-medium text-slate-700">{formatDate(item.attendanceDate)}</td><td className="tabular-nums">{formatTime(item.checkInAt)} <span className="text-xs text-slate-600">WIB</span></td><td className="tabular-nums">{item.checkOutAt ? <>{formatTime(item.checkOutAt)} <span className="text-xs text-slate-600">WIB</span></> : <span className="text-slate-600">Not set</span>}</td><td><Badge value={item.status} /></td>{hrd && <td><Link to={`/hrd/attendances/${encodeURIComponent(item.id)}`} className="text-xs font-semibold text-brand-800 hover:text-brand-900">Details</Link></td>}</tr>)}</tbody></table></div>;
}
