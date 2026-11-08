import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Camera, Check, CheckCircle2, Clock3, ImagePlus, LoaderCircle, MapPin, ShieldCheck, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Card, ErrorPanel, Loading, PageHeader } from '../components/ui';
import { attendanceApi } from '../lib/api';
import { formatDate, formatTime, todayJakarta } from '../lib/dates';
import { getCheckInLocation, type Coordinates } from '../lib/geolocation';
import { useOwnOverview } from '../lib/queries';

const schema = z.object({
  photo: z.custom<FileList>().refine((files) => files?.length === 1, 'Choose a photo to continue.')
    .refine((files) => !files?.[0] || ['image/jpeg', 'image/png'].includes(files[0].type), 'Only JPG and PNG photos are allowed.')
    .refine((files) => !files?.[0] || files[0].size <= 5 * 1024 * 1024, 'Your photo must be 5 MB or smaller.')
    .refine((files) => !files?.[0] || files[0].size > 0, 'Your photo is empty. Choose another file.'),
  confirmed: z.boolean().refine(Boolean, 'Please confirm that the photo and location represent your work-from-home check-in.'),
});
type Values = z.infer<typeof schema>;

export function CheckIn() {
  const query = useOwnOverview();
  const client = useQueryClient();
  const [preview, setPreview] = useState<string | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [stage, setStage] = useState<'idle' | 'locating' | 'uploading'>('idle');
  const inFlight = useRef(false);
  const { register, watch, resetField, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { confirmed: false } });
  const photo = watch('photo')?.[0];
  useEffect(() => {
    if (!photo || !['image/jpeg', 'image/png'].includes(photo.type) || photo.size > 5 * 1024 * 1024) { setPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      setLocation(null);
      setStage('locating');
      try {
        const coords = await getCheckInLocation();
        setLocation(coords);
        setStage('uploading');
        const body = new FormData();
        body.append('photo', values.photo[0]);
        body.append('latitude', String(coords.latitude));
        body.append('longitude', String(coords.longitude));
        if (coords.gpsAccuracy !== null) body.append('gpsAccuracy', String(coords.gpsAccuracy));
        return await attendanceApi.checkIn(body);
      } finally { setStage('idle'); }
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['attendances'] }); },
    onError: () => { void client.invalidateQueries({ queryKey: ['attendances'] }); },
  });
  const submit = handleSubmit(async (values) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try { await mutation.mutateAsync(values); } catch { /* The mutation error is displayed inline. */ }
    finally { inFlight.current = false; }
  });
  const recorded = mutation.data || query.today;

  return <><PageHeader eyebrow="Employee workspace" title="Work-from-home check-in" description="A small step to start a productive day. Your attendance time is recorded securely by the server." back="/employee/dashboard" />
    {query.isPending ? <Loading /> : query.isError ? <ErrorPanel error={query.error} retry={() => void query.refetch()} /> : recorded ? <Card className="mx-auto max-w-2xl p-8 text-center sm:p-12"><div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-brand-50 text-brand-600"><CheckCircle2 size={40} strokeWidth={1.5} /></div><p className="text-xs font-semibold uppercase tracking-widest text-brand-700">Attendance recorded</p><h2 className="mt-3 text-2xl font-semibold text-ink">You’re checked in. Have a great day!</h2><p className="mt-3 text-sm leading-6 text-slate-500">Your attendance for {formatDate(recorded.attendanceDate)} was recorded at <strong className="text-ink">{formatTime(recorded.checkInAt)} WIB</strong>. Only one check-in is needed per day.</p><Link to="/employee/history" className="btn-primary mt-7">View attendance history<ArrowRight size={16} /></Link></Card> : <div className="grid items-start gap-6 xl:grid-cols-[1fr_320px]">
    <Card><div className="flex items-center justify-between border-b border-slate-100 p-6"><div className="flex items-center gap-3"><span className="rounded-xl bg-brand-50 p-2.5 text-brand-700"><Camera size={21} /></span><div><h2 className="font-semibold text-ink">Today’s check-in</h2><p className="mt-1 text-xs text-slate-400">{formatDate(todayJakarta(), true)}</p></div></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">Not submitted</span></div>
    <form onSubmit={submit} className="space-y-6 p-6" noValidate><fieldset disabled={mutation.isPending} className="space-y-6 disabled:opacity-75"><div><label htmlFor="photo" className="mb-2 block text-sm font-semibold text-slate-700">1. Add your attendance photo <span className="text-red-500">*</span></label><p className="mb-4 text-xs leading-5 text-slate-500">Upload a clear, recent photo showing you ready to work from home.</p>{preview ? <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={preview} alt="Your attendance photo preview" className="h-72 w-full object-contain" /><button type="button" onClick={() => { resetField('photo'); mutation.reset(); }} className="absolute right-3 top-3 rounded-full bg-white p-2 text-slate-600 shadow hover:bg-slate-100" aria-label="Remove photo"><X size={17} /></button><div className="border-t border-slate-100 bg-white px-4 py-3 text-xs text-slate-500"><p className="truncate font-medium text-slate-700">{photo?.name}</p><p className="mt-1">{((photo?.size || 0) / 1024 / 1024).toFixed(2)} MB · Ready to upload</p></div></div> : <label htmlFor="photo" className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-5 py-10 text-center transition hover:border-brand-500 hover:bg-brand-50/40"><span className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 text-brand-600"><ImagePlus size={26} /></span><span className="text-sm font-semibold text-ink">Click to choose a photo</span><span className="mt-2 text-xs text-slate-400">JPG or PNG · Maximum 5 MB</span><span className="btn-secondary mt-5 pointer-events-none"><Upload size={15} />Browse files</span></label>}<input id="photo" type="file" accept="image/jpeg,image/png" className="mt-3 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700" aria-invalid={!!errors.photo} aria-describedby={errors.photo ? 'photo-error' : undefined} {...register('photo')} />{errors.photo && <p id="photo-error" className="mt-2 text-xs text-red-600">{errors.photo.message}</p>}</div>
    <div className="rounded-xl border border-slate-200 p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><MapPin size={18} className="text-brand-600" />2. Share your check-in location</h3><p className="mt-2 text-xs leading-6 text-slate-500">Your browser will ask for location access after you press <strong>Confirm check-in</strong>. We capture your position once, never in the background. Location requires HTTPS or localhost.</p>{location && <p className="mt-3 rounded-lg bg-brand-50 p-3 font-mono text-xs text-brand-800" role="status">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}{location.gpsAccuracy !== null && ` · ±${Math.round(location.gpsAccuracy)} m`}</p>}</div>
    <div><label className="flex cursor-pointer items-start gap-3 text-xs leading-6 text-slate-500"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600" aria-invalid={!!errors.confirmed} aria-describedby={errors.confirmed ? 'confirmed-error' : undefined} {...register('confirmed')} /><span>I confirm this is my current work-from-home photo and consent to sharing my location for this check-in.</span></label>{errors.confirmed && <p id="confirmed-error" className="mt-2 text-xs text-red-600">{errors.confirmed.message}</p>}</div></fieldset>
    {mutation.isError && <ErrorPanel error={mutation.error} />}<button type="submit" disabled={mutation.isPending} className="btn-primary w-full py-3">{mutation.isPending ? <LoaderCircle size={18} className="animate-spin" /> : <Check size={18} />}{stage === 'locating' ? 'Getting your location…' : stage === 'uploading' ? 'Submitting attendance…' : 'Confirm check-in'}</button><p role="status" aria-live="polite" className="text-center text-xs text-slate-400">{mutation.isPending ? 'Please keep this page open until your check-in is complete.' : 'Your check-in time is set by the server, not your device.'}</p></form></Card>
    <div className="space-y-5"><Card className="p-6"><h3 className="font-semibold text-ink">A smooth start to your day</h3><ol className="mt-5 space-y-5">{[{ icon: Camera, title: 'Have a photo ready', text: 'Choose a clear JPG or PNG under 5 MB.' }, { icon: MapPin, title: 'Enable location', text: 'Allow location permission when your browser asks.' }, { icon: Clock3, title: 'Check in once', text: 'One check-in per day. No check-out needed.' }].map(({ icon: Icon, title, text }) => <li key={title} className="flex items-start gap-3"><span className="rounded-lg bg-slate-50 p-2 text-brand-600"><Icon size={17} /></span><div><h4 className="text-xs font-semibold text-slate-700">{title}</h4><p className="mt-1 text-xs leading-5 text-slate-400">{text}</p></div></li>)}</ol></Card><div className="rounded-xl bg-brand-50 p-5"><ShieldCheck size={23} className="text-brand-600" /><h3 className="mt-3 text-sm font-semibold text-brand-900">No background tracking</h3><p className="mt-2 text-xs leading-6 text-brand-800/80">GPS is requested only when you submit. Your photo and check-in details are accessible only to authorized users.</p></div></div>
    </div>}</>;
}
