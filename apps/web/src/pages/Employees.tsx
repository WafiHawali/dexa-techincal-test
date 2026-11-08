import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Info, LoaderCircle, Pencil, Plus, Save, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { Badge, Card, Empty, ErrorPanel, Field, Loading, PageHeader, Pagination, SearchInput, useDebounce } from '../components/ui';
import { employeesApi } from '../lib/api';
import { initials } from '../lib/dates';
import type { Employee, EmployeeInput } from '../lib/types';

export function Employees() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();
  const notice: unknown = location.state?.notice;
  const debounced = useDebounce(search);
  const pageSize = 10;
  const query = useQuery({ queryKey: ['employees', debounced, page, pageSize], queryFn: () => employeesApi.list({ search: debounced || undefined, page, pageSize }) });
  return <><PageHeader eyebrow="People operations" title="Employees" description="The people behind your organization. Manage employee records and account access." action={<Link to="/hrd/employees/create" className="btn-primary"><Plus size={17} />Add employee</Link>} />
    {typeof notice === 'string' && !dismissed && <div role="status" className="mb-5 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-800"><CheckCircle2 size={18} /><p className="flex-1">{notice}</p><button aria-label="Dismiss notification" onClick={() => setDismissed(true)}><X size={16} /></button></div>}
    <Card><div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5"><div><h2 className="font-semibold text-ink">Employee directory</h2><p className="mt-1 text-xs text-slate-400">{query.data ? `${query.data.total} employees found` : 'Your organization’s employee records'}</p></div><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search name, number, or email…" /></div>
    {query.isPending ? <Loading /> : query.isError ? <div className="p-5"><ErrorPanel error={query.error} retry={() => void query.refetch()} /></div> : <>{query.data.items.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Employee</th><th>Employee number</th><th>Department / position</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{query.data.items.map((employee) => <tr key={employee.id}><td><div className="flex items-center gap-3"><span className="avatar shrink-0 text-xs">{initials(employee.fullName)}</span><div><p className="font-semibold text-ink">{employee.fullName}</p><p className="mt-1 text-xs text-slate-400">{employee.email}</p></div></div></td><td className="font-mono text-xs">{employee.employeeNumber}</td><td><p className="font-medium text-slate-700">{employee.department}</p><p className="mt-1 text-xs text-slate-400">{employee.position}</p></td><td><Badge value={employee.status} /></td><td><Link to={`/hrd/employees/${encodeURIComponent(employee.id)}/edit`} className="btn-icon" aria-label={`Edit ${employee.fullName}`}><Pencil size={16} /></Link></td></tr>)}</tbody></table></div> : <Empty title="No employees found" description={search ? 'Try a different name, employee number, or email address.' : 'Add your first employee to get your organization connected.'} action={!search && <Link to="/hrd/employees/create" className="btn-primary"><Plus size={16} />Add employee</Link>} />}<Pagination page={page} pageSize={pageSize} total={query.data.total} onChange={setPage} /></>}
    </Card></>;
}

export function EmployeeEditor() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['employees', 'detail', id], queryFn: () => employeesApi.get(id!), enabled: !!id });
  if (id && query.isPending) return <Loading label="Loading employee information…" />;
  if (id && query.isError) return <><PageHeader title="Edit employee" back="/hrd/employees" /><ErrorPanel error={query.error} retry={() => void query.refetch()} /></>;
  return <EmployeeForm key={id || 'create'} employee={id ? query.data : undefined} />;
}

function EmployeeForm({ employee }: { employee?: Employee }) {
  const editing = !!employee;
  const navigate = useNavigate();
  const client = useQueryClient();
  const schema = z.object({
    employeeNumber: z.string().trim().min(1, 'Employee number is required.').max(50),
    fullName: z.string().trim().min(2, 'Enter the employee’s full name.').max(150),
    email: z.string().trim().email('Enter a valid work email.').max(254),
    department: z.string().trim().min(1, 'Department is required.').max(100),
    position: z.string().trim().min(1, 'Position is required.').max(100),
    password: z.string().max(72, 'Use no more than 72 characters.').refine((value) => editing && value === '' || value.length >= 8, 'Use at least 8 characters.'),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  });
  type Values = z.infer<typeof schema>;
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { employeeNumber: employee?.employeeNumber || '', fullName: employee?.fullName || '', email: employee?.email || '', department: employee?.department || '', position: employee?.position || '', password: '', status: employee?.status || 'ACTIVE' },
  });
  const mutation = useMutation({
    mutationFn: (values: Values) => {
      const payload: EmployeeInput = { employeeNumber: values.employeeNumber, fullName: values.fullName, email: values.email, department: values.department, position: values.position, ...(values.password ? { password: values.password } : {}), ...(editing ? { status: values.status } : {}) };
      return employee ? employeesApi.update(employee.id, payload) : employeesApi.create(payload);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['employees'] });
      navigate('/hrd/employees', { replace: true, state: { notice: editing ? 'Employee information updated successfully.' : 'Employee created successfully. Their account is ready to use.' } });
    },
  });
  return <><PageHeader eyebrow="Employee management" title={editing ? 'Edit employee' : 'Add a new employee'} description={editing ? 'Keep employee details and account access up to date.' : 'Create an employee profile and a secure account for their workspace.'} back="/hrd/employees" /><div className="grid items-start gap-6 xl:grid-cols-[1fr_300px]"><Card><div className="flex items-center gap-3 border-b border-slate-100 p-6"><span className="rounded-xl bg-brand-50 p-2.5 text-brand-700"><UserRound size={21} /></span><div><h2 className="font-semibold text-ink">{editing ? employee.fullName : 'Employee details'}</h2><p className="mt-1 text-xs text-slate-400">Fields marked * are required</p></div></div>
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="p-6" noValidate><fieldset disabled={mutation.isPending} className="space-y-7"><div className="grid gap-5 sm:grid-cols-2"><Field id="employeeNumber" label="Employee number" placeholder="e.g. DX-001" required error={errors.employeeNumber?.message} {...register('employeeNumber')} /><Field id="fullName" label="Full name" autoComplete="name" placeholder="Employee’s full name" required error={errors.fullName?.message} {...register('fullName')} /><div className="sm:col-span-2"><Field id="email" label="Work email" type="email" autoComplete="email" placeholder="name@company.com" required error={errors.email?.message} {...register('email')} /></div><Field id="department" label="Department" placeholder="e.g. Information Technology" required error={errors.department?.message} {...register('department')} /><Field id="position" label="Position" placeholder="e.g. Software Engineer" required error={errors.position?.message} {...register('position')} /></div>
    <div className="border-t border-slate-100 pt-6"><h3 className="mb-5 text-sm font-semibold text-ink">Account access</h3><div className="grid gap-5 sm:grid-cols-2"><div><Field id="employeePassword" label={editing ? 'New password (optional)' : 'Initial password'} type="password" autoComplete="new-password" placeholder={editing ? 'Leave blank to keep current password' : 'At least 8 characters'} required={!editing} error={errors.password?.message} {...register('password')} /><p className="mt-2 text-xs leading-5 text-slate-400">{editing ? 'Only enter a password if you need to reset account access.' : 'Share credentials securely with the employee. Do not send passwords in public channels.'}</p></div>{editing ? <div><label htmlFor="status" className="mb-2 block text-sm font-medium text-slate-700">Account status</label><select id="status" className="input" {...register('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><p className="mt-2 text-xs leading-5 text-slate-400">Inactive accounts cannot access the workspace.</p></div> : <div><p className="mb-2 text-sm font-medium text-slate-700">Account role</p><div className="input bg-slate-50 text-slate-500">Employee</div><p className="mt-2 text-xs text-slate-400">New accounts always have the Employee role.</p></div>}</div></div></fieldset>
    {mutation.isError && <div className="mt-6"><ErrorPanel error={mutation.error} /></div>}<div className="mt-7 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-6"><button type="button" className="btn-secondary" disabled={mutation.isPending} onClick={() => { if (!isDirty || window.confirm('Discard your unsaved employee changes?')) navigate('/hrd/employees'); }}>Cancel</button><button className="btn-primary" disabled={mutation.isPending}>{mutation.isPending ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}{mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create employee'}</button></div></form>
    </Card><div className="rounded-xl border border-brand-100 bg-brand-50 p-5"><Info size={22} className="text-brand-600" /><h3 className="mt-3 text-sm font-semibold text-brand-900">A connected employee record</h3><p className="mt-2 text-xs leading-6 text-brand-800/80">Employee numbers and work emails identify each person in your organization. Make sure these are accurate before saving.</p><p className="mt-3 text-xs leading-6 text-brand-800/80">Employee accounts can check in and view their own attendance. HRD access cannot be granted from this form.</p></div></div></>;
}
