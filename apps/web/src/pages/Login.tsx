import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, Fingerprint, LoaderCircle, MapPin, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { z } from 'zod';
import { Brand } from '../components/Shell';
import { ErrorPanel, Field } from '../components/ui';
import { homeFor, useAuth } from '../lib/auth';

const schema = z.object({ email: z.string().trim().email('Enter a valid work email address.'), password: z.string().min(1, 'Enter your password.') });
type Values = z.infer<typeof schema>;

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });
  if (user) return <Navigate to={homeFor(user)} replace />;

  const submit = handleSubmit(async (values) => {
    setError(null);
    try { const current = await login(values); navigate(homeFor(current), { replace: true }); }
    catch (err) { setError(err); }
  });

  return <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
    <aside className="relative hidden flex-col overflow-hidden bg-brand-900 p-12 text-white lg:flex xl:p-16">
      <div className="pointer-events-none absolute -right-40 top-28 h-[520px] w-[520px] rounded-full border border-white/10" /><div className="pointer-events-none absolute -right-20 top-48 h-[360px] w-[360px] rounded-full border border-white/10" /><div className="relative"><Brand light /></div>
      <div className="relative my-auto py-20"><span className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-brand-100"><span className="h-1.5 w-1.5 rounded-full bg-brand-200" />A better way to work, together</span><h1 className="max-w-lg text-5xl font-semibold leading-[1.15] tracking-tight xl:text-6xl">Great work.<br />From anywhere.</h1><p className="mt-6 max-w-sm text-base leading-7 text-brand-100/75">Your workday starts here. Stay connected to your team with simple, secure work-from-home attendance.</p>
      <div className="mt-12 grid max-w-md grid-cols-2 gap-4"><div className="rounded-2xl border border-white/10 bg-white/5 p-5"><Fingerprint size={25} className="mb-5 text-brand-200" /><p className="text-sm font-medium">One simple check-in</p><p className="mt-2 text-xs leading-5 text-brand-100/65">A photo, your location, and you’re ready for the day.</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-5"><ShieldCheck size={25} className="mb-5 text-brand-200" /><p className="text-sm font-medium">Privacy by design</p><p className="mt-2 text-xs leading-5 text-brand-100/65">No live tracking. Your location is shared only at check-in.</p></div></div></div>
      <p className="relative text-xs text-brand-200/60">Dexa Workplace · People first, wherever they are.</p>
    </aside>
    <main className="flex min-h-screen flex-col px-6 py-8 sm:px-12"><div className="lg:hidden"><Brand /></div><div className="m-auto w-full max-w-sm py-16"><span className="mb-6 inline-flex rounded-2xl bg-brand-50 p-3 text-brand-700"><ShieldCheck size={28} strokeWidth={1.5} /></span><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Welcome to your workspace</p><h2 className="text-3xl font-semibold tracking-tight text-ink">Good to see you again.</h2><p className="mt-3 text-sm leading-6 text-slate-500">Sign in with your work account to get started.</p>
    <form onSubmit={submit} className="mt-8 space-y-5" noValidate>{error != null && <ErrorPanel error={error} />}<Field id="email" label="Work email" type="email" autoComplete="username" placeholder="you@company.com" required error={errors.email?.message} {...register('email')} /><div><label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Password <span className="text-red-500">*</span></label><div className="relative"><input id="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" className="input pr-11" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} {...register('password')} /><button type="button" onClick={() => setVisible(!visible)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600" aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{errors.password && <p id="password-error" className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>}</div><button disabled={isSubmitting} className="btn-primary w-full py-3">{isSubmitting ? <LoaderCircle className="animate-spin" size={18} /> : null}{isSubmitting ? 'Signing in…' : 'Sign in'}{!isSubmitting && <ArrowRight size={17} />}</button></form>
    <div className="mt-7 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs leading-5 text-slate-500">Need access or forgot your password? Contact your HR team to help you with your account.</div><p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400"><MapPin size={12} />Location is requested only when you check in.</p></div><p className="text-center text-[11px] text-slate-400">© {new Date().getFullYear()} Dexa Workplace. All rights reserved.</p></main>
  </div>;
}
