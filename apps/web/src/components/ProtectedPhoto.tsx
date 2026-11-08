import { ImageOff, LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { attendanceApi, errorMessage } from '../lib/api';

export function ProtectedPhoto({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setUrl(null);
    setError(null);
    void attendanceApi.photo(id, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      if (!['image/jpeg', 'image/png'].includes(blob.type.split(';')[0])) throw new Error('The server did not return a supported image.');
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(errorMessage(err)); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, attempt]);
  if (error) return <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center text-sm text-slate-500"><ImageOff size={28} /><p>{error}</p><button className="btn-secondary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={15} />Retry image</button></div>;
  if (!url) return <div role="status" className="grid min-h-64 place-items-center bg-slate-50 text-brand-600"><LoaderCircle className="animate-spin" aria-label="Loading protected photo" /></div>;
  return <a href={url} target="_blank" rel="noreferrer" title="Open full-size photo"><img src={url} alt={alt} className="max-h-[520px] w-full bg-slate-100 object-contain" /></a>;
}
