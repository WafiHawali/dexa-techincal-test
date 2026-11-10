import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { z } from 'zod';
import { Brand } from '../components/Shell';
import { ErrorPanel, Field } from '../components/ui';
import { homeFor, useAuth } from '../lib/auth';

const schema = z.object({ identifier: z.string().trim().min(1, 'Enter your email or employee number.').max(191), password: z.string().min(1, 'Enter your password.') });
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

  return <div className="flex min-h-screen items-center justify-center bg-[#f5f7f9] px-5 py-10">
    <main className="w-full max-w-sm">
      <div className="mb-8 flex justify-center"><Brand label="Attendance System" /></div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use your work account to continue.</p>
        <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
          {error != null && <ErrorPanel error={error} />}
          <Field id="identifier" label="Email or employee number" type="text" autoComplete="username" placeholder="you@company.com or EMP-001" required error={errors.identifier?.message} {...register('identifier')} />
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Password <span className="text-red-600">*</span></label>
            <div className="relative">
              <input id="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" className="input pr-12" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} {...register('password')} />
              <button type="button" onClick={() => setVisible(!visible)} className="absolute right-1 top-1 rounded-md p-2.5 text-slate-600 hover:bg-slate-100" aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            {errors.password && <p id="password-error" className="mt-1.5 text-xs text-red-700">{errors.password.message}</p>}
          </div>
          <button disabled={isSubmitting} className="btn-primary w-full py-3">{isSubmitting ? <LoaderCircle className="animate-spin" size={18} /> : null}{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
      <p className="mt-6 text-center text-xs text-slate-600">© {new Date().getFullYear()} Attendance System</p>
    </main>
  </div>;
}
