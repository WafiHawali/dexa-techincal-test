import { CalendarCheck, ClipboardList, LayoutDashboard, LogOut, Menu, UserRound, UsersRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/dates';

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

export function Brand({ light = false, label = 'Attendance System' }: { light?: boolean; label?: string }) {
  return <span className={`block max-w-[13rem] text-lg font-semibold leading-6 tracking-tight ${light ? 'text-white' : 'text-ink'}`}>{label}</span>;
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
    <aside aria-label="Main navigation" className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:visible lg:translate-x-0 ${open ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
      <div className="flex min-h-24 items-center justify-between gap-3 px-6 py-5"><Brand label={isHrd ? 'Employee Attendance Management System' : 'Employee Attendance Portal'} /><button className="btn-icon lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <nav aria-label="Workspace" className="space-y-1 px-4 pt-4">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100 hover:text-ink'}`}><Icon size={19} strokeWidth={1.7} />{label}</NavLink>)}</nav>
      <div className="mt-auto p-5"><div className="flex items-center gap-3 border-t border-slate-200 pt-5"><span className="avatar">{initials(user?.employee?.fullName)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{user?.employee?.fullName || 'Workspace user'}</p><p className="mt-0.5 text-xs text-slate-600">{isHrd ? 'HRD Administrator' : 'Employee'}</p></div><button className="btn-icon" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></div></div>
    </aside>
    <div className="lg:pl-72">
      <header className="flex h-20 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3"><button className="btn-icon lg:hidden" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={20} /></button><span className="truncate text-sm font-medium text-slate-700">{active?.label || 'Workspace'}</span></div>
        <div className="flex items-center gap-4"><Link to={isHrd ? '/hrd/dashboard' : '/employee/profile'} aria-label="My workspace" className="avatar h-9 w-9 text-xs">{initials(user?.employee?.fullName)}</Link></div>
      </header>
      <main id="main-content" className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 sm:py-9"><Outlet /></main>
      <footer className="mx-auto flex max-w-[1480px] flex-wrap justify-between gap-2 px-5 pb-6 text-xs text-slate-600 sm:px-8"><span>© {new Date().getFullYear()} Attendance System</span></footer>
    </div>
  </div>;
}
