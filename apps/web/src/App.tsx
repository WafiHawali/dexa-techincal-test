import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { Shell } from './components/Shell';
import { Card, ErrorPanel, Loading } from './components/ui';
import { homeFor, useAuth } from './lib/auth';
import type { Role } from './lib/types';

const Login = lazy(() => import('./pages/Login').then((page) => ({ default: page.Login })));
const EmployeeDashboard = lazy(() => import('./pages/Employee').then((page) => ({ default: page.EmployeeDashboard })));
const AttendanceHistory = lazy(() => import('./pages/Employee').then((page) => ({ default: page.AttendanceHistory })));
const EmployeeProfile = lazy(() => import('./pages/Employee').then((page) => ({ default: page.EmployeeProfile })));
const CheckIn = lazy(() => import('./pages/CheckIn').then((page) => ({ default: page.CheckIn })));
const HrdDashboard = lazy(() => import('./pages/HrdDashboard').then((page) => ({ default: page.HrdDashboard })));
const Employees = lazy(() => import('./pages/Employees').then((page) => ({ default: page.Employees })));
const EmployeeEditor = lazy(() => import('./pages/Employees').then((page) => ({ default: page.EmployeeEditor })));
const Attendances = lazy(() => import('./pages/Attendances').then((page) => ({ default: page.Attendances })));
const AttendanceDetail = lazy(() => import('./pages/Attendances').then((page) => ({ default: page.AttendanceDetail })));

function Protected({ role }: { role: Role }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return <Outlet />;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

function NotFound() {
  const { user } = useAuth();
  return <div className="grid min-h-screen place-items-center bg-slate-50 p-6"><Card className="w-full max-w-lg p-10 text-center"><p className="text-sm font-semibold tracking-widest text-brand-600">404 · PAGE NOT FOUND</p><h1 className="mt-4 text-2xl font-semibold text-ink">This page isn’t in your workspace.</h1><p className="mt-3 text-sm leading-6 text-slate-500">The link may be incorrect, or the page may have moved.</p><Link to={user ? homeFor(user) : '/login'} className="btn-primary mt-7"><ArrowLeft size={16} />Back to workspace</Link></Card></div>;
}

export function App() {
  const { restoring, restoreError, retry, logout } = useAuth();
  if (restoring) return <div className="grid min-h-screen place-items-center bg-slate-50"><Loading label="Verifying your session…" /></div>;
  if (restoreError) return <div className="grid min-h-screen place-items-center bg-slate-50 p-6"><Card className="w-full max-w-lg space-y-5 p-8"><h1 className="text-xl font-semibold text-ink">We couldn’t verify your session</h1><p className="text-sm leading-6 text-slate-500">Your saved session must be validated before you can access your workspace.</p><ErrorPanel error={new Error(restoreError)} /><div className="flex flex-wrap gap-3"><button className="btn-primary" onClick={retry}><RefreshCw size={16} />Try again</button><button className="btn-secondary" onClick={logout}>Return to sign in</button></div></Card></div>;
  return <Suspense fallback={<Loading label="Opening your workspace…" />}><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
    <Route element={<Protected role="EMPLOYEE" />}><Route element={<Shell />}>
      <Route path="/employee" element={<Navigate to="/employee/dashboard" replace />} />
      <Route path="/employee/dashboard" element={<EmployeeDashboard />} />
      <Route path="/employee/attendance" element={<CheckIn />} />
      <Route path="/employee/history" element={<AttendanceHistory />} />
      <Route path="/employee/profile" element={<EmployeeProfile />} />
    </Route></Route>
    <Route element={<Protected role="HRD" />}><Route element={<Shell />}>
      <Route path="/hrd" element={<Navigate to="/hrd/dashboard" replace />} />
      <Route path="/hrd/dashboard" element={<HrdDashboard />} />
      <Route path="/hrd/employees" element={<Employees />} />
      <Route path="/hrd/employees/create" element={<EmployeeEditor />} />
      <Route path="/hrd/employees/:id/edit" element={<EmployeeEditor />} />
      <Route path="/hrd/attendances" element={<Attendances />} />
      <Route path="/hrd/attendances/:id" element={<AttendanceDetail />} />
    </Route></Route>
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense>;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Workplace rendering error', error, info.componentStack); }
  render() {
    if (this.state.failed) return <div className="grid min-h-screen place-items-center bg-slate-50 p-6"><Card className="max-w-lg p-8 text-center"><h1 className="text-xl font-semibold text-ink">Your workspace encountered a problem</h1><p className="mt-3 text-sm text-slate-500">Reload the page to try again. If this keeps happening, contact your administrator.</p><button className="btn-primary mt-6" onClick={() => window.location.reload()}><RefreshCw size={16} />Reload workspace</button></Card></div>;
    return this.props.children;
  }
}
