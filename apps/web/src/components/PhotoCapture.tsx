import { Camera, ImagePlus, LoaderCircle, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png'];

function validateFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return 'Only JPG and PNG photos are allowed.';
  if (file.size <= 0) return 'Your photo is empty. Choose another file.';
  if (file.size > MAX_BYTES) return 'Your photo must be 5 MB or smaller.';
  return null;
}

export function PhotoCapture({ id, value, onChange, disabled = false, description = 'JPG or PNG, maximum 5 MB' }: {
  id: string;
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  description?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!value) { setPreview(null); return; }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera(false);
    setStarting(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (!camera || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => setError('The camera preview could not start. Try again.'));
  }, [camera]);

  async function startCamera() {
    setError(null);
    if (!window.isSecureContext) {
      setError('Camera requires HTTPS or localhost. Open the app through HTTPS or localhost, or upload a photo instead.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support camera capture. Upload a photo instead.');
      return;
    }
    setStarting(true);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setCamera(true);
    } catch {
      setError('Camera permission was denied or no camera is available. Allow access or upload a photo instead.');
    } finally {
      setStarting(false);
    }
  }

  function choose(file: File | undefined) {
    if (!file) return;
    const problem = validateFile(file);
    if (problem) { setError(problem); return; }
    setError(null);
    onChange(file);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('The camera is still starting. Try again in a moment.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) { setError('This browser could not capture the camera image.'); return; }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { setError('The camera image could not be saved. Try again.'); return; }
      onChange(new File([blob], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      setError(null);
      stopCamera();
    }, 'image/jpeg', 0.9);
  }

  return <div className="space-y-3">
    {camera ? <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-900">
      <video ref={videoRef} autoPlay muted playsInline className="h-72 w-full object-cover" />
      <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-white p-3">
        <button type="button" onClick={capture} disabled={disabled} className="btn-primary flex-1"><Camera size={16} />Take photo</button>
        <button type="button" onClick={stopCamera} className="btn-secondary">Cancel</button>
      </div>
    </div> : preview ? <div className="relative overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
      <img src={preview} alt="Selected attendance photo preview" className="h-72 w-full object-contain" />
      <button type="button" onClick={() => { onChange(null); setError(null); }} disabled={disabled} className="absolute right-3 top-3 rounded-md bg-white p-2.5 text-slate-700 hover:bg-slate-100 disabled:opacity-50" aria-label="Remove photo"><X size={17} /></button>
      <div className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"><p className="truncate font-medium text-slate-700">{value?.name}</p><p className="mt-1">{((value?.size || 0) / 1024 / 1024).toFixed(2)} MB. Ready to upload</p></div>
    </div> : <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-lg border border-slate-200 bg-white text-brand-700"><ImagePlus size={23} /></span>
      <p className="text-sm font-semibold text-ink">Add a clear, recent photo</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled} className="btn-secondary"><Upload size={15} />Upload photo</button>
        <button type="button" onClick={startCamera} disabled={disabled || starting} className="btn-primary">{starting ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}{starting ? 'Opening camera…' : 'Use camera'}</button>
      </div>
      <input ref={fileRef} id={id} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={disabled} onChange={(event) => { const file = event.currentTarget.files?.[0]; choose(file); event.currentTarget.value = ''; }} />
    </div>}
    {error && <p role="alert" className="text-xs leading-5 text-red-600">{error}</p>}
  </div>;
}
