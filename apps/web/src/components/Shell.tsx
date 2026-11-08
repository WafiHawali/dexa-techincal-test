import { CalendarCheck, ChevronRight, ClipboardList, LayoutDashboard, LogOut, Menu, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { formatDate, initials, todayJakarta } from '../lib/dates';

const employeeLinks = [
  { to: '/employee/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/employee/attendance', label: 'Check in', icon: CalendarCheck },
  { to: '/employee/history', label: 'Attendance history', icon: ClipboardList },
  { to: '/employee/profile', label: 'My profile', icon: UserRound },
];
const hrdLinks = [
  { to: '/hrd/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/hrd/employees', label: 'Employees', icon: UsersRound },
  { to: '/hrd/attendances', label: 'Attendance monitor', icon: ClipboardList },
];

export function Brand({ light = false }: { light?: boolean }) {
  return <div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${light ? 'bg-white/15 text-white' : 'bg-brand-700 text-white'}`}><span className="text-2xl font-bold leading-none">d<span className="text-brand-200">.</span></span></span><span><span className={`block text-xl font-bold leading-5 tracking-tight ${light ? 'text-white' : 'text-ink'}`}>dexa<span className={light ? 'text-brand-200' : 'text-brand-600'}> workplace</span></span><span className={`mt-1 block text-[10px] font-medium uppercase tracking-[0.2em] ${light ? 'text-brand-200' : 'text-slate-400'}`}>Connected, wherever you work</span></span></div>;
}

export function Shell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isHrd = user?.role === 'HRD';
  const links = isHrd ? hrdLinks : employeeLinks;
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [open]);
  const active = links.find((item) => location.pathname.startsWith(item.to));

  return <div className="min-h-screen bg-[#f5f7f9]">
    <a href="#main-content" className="sr-only z-50 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-white focus:p-4">Skip to content</a>
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)} />}
    <aside aria-label="Main navigation" className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200/80 bg-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-24 items-center justify-between px-6"><Brand /><button className="btn-icon lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <div className="px-5 pt-5"><p className="mb-4 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{isHrd ? 'People operations' : 'Employee workspace'}</p><nav className="space-y-1.5">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-ink'}`}><Icon size={19} strokeWidth={1.7} />{label}</NavLink>)}</nav></div>
      <div className="mt-auto p-5"><div className="mb-5 rounded-xl border border-brand-100 bg-brand-50/60 p-4"><ShieldCheck size={23} className="mb-2 text-brand-600" /><p className="text-xs font-semibold text-brand-900">Your workspace, protected</p><p className="mt-1.5 text-xs leading-5 text-brand-800/75">{isHrd ? 'Attendance records are read-only. Employee data stays within your organization.' : 'Location is shared only when you check in. No background tracking.'}</p></div>
      <div className="flex items-center gap-3 border-t border-slate-100 pt-5"><span className="avatar">{initials(user?.employee?.fullName)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{user?.employee?.fullName || 'Workplace user'}</p><p className="mt-0.5 text-xs text-slate-400">{isHrd ? 'HRD Administrator' : 'Employee'}</p></div><button className="btn-icon" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></div></div>
    </aside>
    <div className="lg:pl-72"><header className="flex h-20 items-center justify-between gap-4 border-b border-slate-200/70 bg-white/90 px-5 sm:px-8"><div className="flex min-w-0 items-center gap-3"><button className="btn-icon lg:hidden" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={20} /></button><div className="flex items-center gap-2 text-sm"><span className="hidden text-slate-400 sm:inline">{isHrd ? 'HRD Portal' : 'Employee Portal'}</span><ChevronRight size={14} className="hidden text-slate-300 sm:block" /><span className="font-medium text-slate-600">{active?.label || 'Workspace'}</span></div></div><div className="flex items-center gap-4"><span className="hidden text-xs text-slate-500 md:block">{formatDate(todayJakarta())} <span className="ml-1 text-slate-400">WIB</span></span><Link to={isHrd ? '/hrd/dashboard' : '/employee/profile'} aria-label="My workspace" className="avatar h-9 w-9 text-xs">{initials(user?.employee?.fullName)}</Link></div></header>
      <main id="main-content" className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 sm:py-9"><Outlet /></main>
      <footer className="mx-auto flex max-w-[1480px] flex-wrap justify-between gap-2 px-5 pb-6 text-[11px] text-slate-400 sm:px-8"><span>© {new Date().getFullYear()} Dexa Workplace</span><span>All attendance times are in Asia/Jakarta (WIB)</span></footer>
    </div>
  </div>;
}
