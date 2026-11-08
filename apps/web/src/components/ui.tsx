import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Inbox, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import { Link } from 'react-router';
import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { errorMessage } from '../lib/api';

export function PageHeader({ eyebrow, title, description, action, back }: { eyebrow?: string; title: string; description?: string; action?: ReactNode; back?: string }) {
  return <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div>{back && <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft size={15} />Back</Link>}
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>}
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>}
    </div>{action && <div className="shrink-0">{action}</div>}
  </header>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-soft ${className}`}>{children}</section>;
}

export function StatCard({ label, value, note, icon }: { label: string; value: ReactNode; note: string; icon: ReactNode }) {
  return <Card className="p-5"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-slate-500">{label}</p><span className="rounded-xl bg-brand-50 p-2.5 text-brand-700">{icon}</span></div><p className="mt-4 text-3xl font-semibold tracking-tight text-ink">{value}</p><p className="mt-2 text-xs text-slate-500">{note}</p></Card>;
}

export function Badge({ value }: { value: string }) {
  const positive = ['ACTIVE', 'PRESENT', 'CHECKED_IN', 'ON_TIME', 'WFH'].includes(value.toUpperCase());
  const negative = ['INACTIVE', 'ABSENT'].includes(value.toUpperCase());
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${positive ? 'bg-emerald-50 text-emerald-700' : negative ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</span>;
}

export function Loading({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div role="status" className="flex min-h-52 items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin text-brand-600" size={22} />{label}</div>;
}

export function ErrorPanel({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={19} className="shrink-0" /><p className="min-w-0 flex-1">{errorMessage(error)}</p>{retry && <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold hover:bg-red-100"><RefreshCw size={14} />Retry</button>}</div>;
}

export function Empty({ title = 'No records found', description = 'Try adjusting your filters or check back later.', action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center px-5 py-14 text-center"><span className="mb-4 rounded-2xl bg-slate-50 p-4 text-slate-400"><Inbox size={28} /></span><h3 className="font-semibold text-ink">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-500"><p>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}` : '0'} of {total} records</p><div className="flex items-center gap-3"><button aria-label="Previous page" className="btn-icon" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /></button><span>Page {page} of {pages}</span><button aria-label="Next page" className="btn-icon" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={16} /></button></div></div>;
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="relative w-full sm:max-w-sm"><Search size={17} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pl-10 pr-9" />{value && <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>}</div>;
}

export function Field({ label, error, id, children, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; children?: ReactNode }) {
  return <div><label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">{label}{props.required && <span className="ml-1 text-red-500">*</span>}</label>{children ?? <input id={id} className="input" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...props} />}{error && <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">{error}</p>}</div>;
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1.5 break-words text-sm font-medium text-ink">{children || '—'}</dd></div>;
}

export function useDebounce(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return debounced;
}
