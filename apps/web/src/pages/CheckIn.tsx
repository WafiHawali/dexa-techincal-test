import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { PhotoCapture } from '../components/PhotoCapture';
import { Badge, Card, ErrorPanel, Loading, PageHeader } from '../components/ui';
import { attendanceApi } from '../lib/api';
import { formatDate, formatTime, todayJakarta } from '../lib/dates';
import { useOwnOverview } from '../lib/queries';

const schema = z.object({
  confirmed: z.boolean().refine(Boolean, 'Confirm that this photo is your attendance evidence for today.'),
});
type Values = z.infer<typeof schema>;

export function CheckIn() {
  const query = useOwnOverview();
  const client = useQueryClient();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [checkoutPhoto, setCheckoutPhoto] = useState<File | null>(null);
  const [checkoutPhotoError, setCheckoutPhotoError] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'uploading'>('idle');
  const inFlight = useRef(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { confirmed: false } });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!photo) throw new Error('Choose or take a photo to continue.');
      setStage('uploading');
      try {
        const body = new FormData();
        body.append('photo', photo);
        return await attendanceApi.checkIn(body);
      } finally { setStage('idle'); }
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['attendances'] }); },
    onError: () => { void client.invalidateQueries({ queryKey: ['attendances'] }); },
  });
  const checkoutMutation = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('photo', file);
      return attendanceApi.checkOut(body);
    },
    onSuccess: () => {
      setCheckoutPhoto(null);
      setCheckoutPhotoError(null);
      void client.invalidateQueries({ queryKey: ['attendances'] });
    },
  });
  const submit = handleSubmit(async () => {
    if (!photo) { setPhotoError('Choose or take a photo to continue.'); return; }
    if (inFlight.current) return;
    setPhotoError(null);
    inFlight.current = true;
    try { await mutation.mutateAsync(); } catch { /* The mutation error is displayed inline. */ }
    finally { inFlight.current = false; }
  });
  const recorded = checkoutMutation.data ?? mutation.data ?? query.today;

  return <>
    <PageHeader title="Attendance" description="Check in when you start work. Clock out with a second photo when you finish." back="/employee/dashboard" />
    {query.isPending ? <Loading /> : query.isError ? <ErrorPanel error={query.error} retry={() => void query.refetch()} /> : recorded ? <Card className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-medium text-slate-600">{formatDate(recorded.attendanceDate, true)}</p><h2 className="mt-2 text-xl font-semibold text-ink">{recorded.checkOutAt ? 'Workday complete' : 'Checked in'}</h2></div>
        <Badge value="PRESENT" />
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-200 pt-6">
        <div><dt className="text-xs font-medium text-slate-600">Check-in</dt><dd className="mt-1 text-sm font-semibold text-ink tabular-nums">{formatTime(recorded.checkInAt)} WIB</dd></div>
        <div><dt className="text-xs font-medium text-slate-600">Check-out</dt><dd className="mt-1 text-sm font-semibold text-ink tabular-nums">{recorded.checkOutAt ? `${formatTime(recorded.checkOutAt)} WIB` : 'Not set'}</dd></div>
      </dl>
      {!recorded.checkOutAt && <div className="mt-6 border-t border-slate-200 pt-6">
        <p className="text-sm font-semibold text-ink">Clock-out photo</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">Take a selfie or upload a JPG/PNG under 5 MB.</p>
        <div className="mt-4"><PhotoCapture id="checkout-photo" value={checkoutPhoto} onChange={(file) => { setCheckoutPhoto(file); setCheckoutPhotoError(null); checkoutMutation.reset(); }} disabled={checkoutMutation.isPending} description="JPG or PNG, maximum 5 MB" /></div>
        {checkoutPhotoError && <p role="alert" className="mt-2 text-xs text-red-700">{checkoutPhotoError}</p>}
        {checkoutMutation.isError && <div className="mt-3"><ErrorPanel error={checkoutMutation.error} /></div>}
        <button type="button" onClick={() => { if (!checkoutPhoto) { setCheckoutPhotoError('Add a clock-out photo first.'); return; } setCheckoutPhotoError(null); checkoutMutation.mutate(checkoutPhoto); }} disabled={checkoutMutation.isPending} className="btn-primary mt-4 w-full py-3">{checkoutMutation.isPending ? <LoaderCircle size={18} className="animate-spin" /> : null}{checkoutMutation.isPending ? 'Clocking out…' : 'Clock out'}</button>
      </div>}
      <div className="mt-6"><Link to="/employee/history" className="btn-secondary">Attendance history</Link></div>
    </Card> : <Card className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-6">
        <div><h2 className="font-semibold text-ink">Today’s check-in</h2><p className="mt-1 text-sm text-slate-600">{formatDate(todayJakarta(), true)}</p></div>
        <span className="text-xs font-medium text-slate-600">Not submitted</span>
      </div>
      <form onSubmit={submit} className="space-y-6 p-6" noValidate>
        <fieldset disabled={mutation.isPending} className="space-y-6 disabled:opacity-75">
          <div>
            <p className="mb-1 text-sm font-semibold text-ink">Attendance photo <span className="text-red-600">*</span></p>
            <p className="mb-4 text-xs leading-5 text-slate-600">Take a selfie or upload a clear, recent JPG/PNG under 5 MB.</p>
            <PhotoCapture id="photo" value={photo} onChange={(file) => { setPhoto(file); setPhotoError(null); mutation.reset(); }} disabled={mutation.isPending} description="JPG or PNG, maximum 5 MB" />
            {photoError && <p role="alert" className="mt-2 text-xs text-red-700">{photoError}</p>}
          </div>
          <div>
            <label className="flex cursor-pointer items-start gap-3 text-xs leading-6 text-slate-700"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 rounded border-slate-500 accent-brand-700" aria-invalid={!!errors.confirmed} aria-describedby={errors.confirmed ? 'confirmed-error' : undefined} {...register('confirmed')} /><span>I confirm this photo is my attendance evidence for today.</span></label>
            {errors.confirmed && <p id="confirmed-error" className="mt-2 text-xs text-red-700">{errors.confirmed.message}</p>}
          </div>
        </fieldset>
        {mutation.isError && <ErrorPanel error={mutation.error} />}
        <button type="submit" disabled={mutation.isPending} className="btn-primary w-full py-3">{mutation.isPending ? <LoaderCircle size={18} className="animate-spin" /> : null}{stage === 'uploading' ? 'Submitting attendance…' : 'Confirm check-in'}</button>
        <p role="status" aria-live="polite" className="text-center text-xs text-slate-600">{mutation.isPending ? 'Keep this page open until check-in completes.' : 'Your check-in time is recorded by the server.'}</p>
      </form>
    </Card>}
  </>;
}
