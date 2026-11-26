'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, RotateCcw, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tx } from '@/i18n/tx';
import { uploadImageAction } from '@/server/actions/files';
import { Button } from './button';
import { Dialog } from './dialog';
import { useToast } from './toast';

type Folder = 'ids' | 'bills' | 'rooms' | 'branding';

/**
 * Shrink a photo in the browser before upload: phone photos are 4–8 MB, the server only needs ~300 KB.
 * Keeps PNG (with transparency) when asked, e.g. for a logo; everything else becomes JPEG.
 */
export async function prepareImage(file: Blob, { maxSize = 1600, keepPng = false }: { maxSize?: number; keepPng?: boolean } = {}): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const png = keepPng && file.type === 'image/png';
    if (scale === 1 && file.size < 900_000 && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    if (!png) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), png ? 'image/png' : 'image/jpeg', 0.85));
  } catch {
    // The browser cannot decode it (e.g. HEIC on Chrome): send as is and let the server explain.
    return file;
  }
}

export function useImageUpload(folder: Folder, options: { maxSize?: number; keepPng?: boolean } = {}) {
  const [count, setCount] = useState(0);
  const toast = useToast();
  const { maxSize, keepPng } = options;
  const upload = useCallback(
    async (file: Blob): Promise<string | null> => {
      setCount((n) => n + 1);
      try {
        const blob = await prepareImage(file, { maxSize, keepPng });
        const data = new FormData();
        data.set('folder', folder);
        data.set('file', blob, blob.type === 'image/png' ? 'photo.png' : 'photo.jpg');
        const result = await uploadImageAction(data);
        if (!result.ok) {
          toast.error(result.error);
          return null;
        }
        return result.data.url;
      } catch {
        toast.error('Upload failed. Check the connection and try again.');
        return null;
      } finally {
        setCount((n) => n - 1);
      }
    },
    [folder, maxSize, keepPng, toast],
  );
  return { upload, uploading: count > 0 };
}

/**
 * Webcam capture for the front desk (ID cards, passports). A card-shaped guide helps framing; the photo can be
 * retaken before it is used. Phones use the native camera through the file input instead.
 */
export function CameraDialog({ onCapture, onClose, title = 'Scan ID', guide = 'card' }: { onCapture: (blob: Blob) => void; onClose: () => void; title?: string; guide?: 'card' | 'none' }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      Promise.resolve().then(() => setError('This browser cannot open the camera. Use "Upload" instead.'));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().then(() => setReady(true)).catch(() => setReady(true));
        }
      })
      .catch((e: Error) => setError(e.name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera in the browser bar, or use "Upload".' : 'No camera found on this computer. Use "Upload" instead.'));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && setShot({ blob, url: URL.createObjectURL(blob) }), 'image/jpeg', 0.9);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      icon={<Camera className="h-5 w-5" />}
      title={title}
      description={shot ? 'Check that every word is readable.' : 'Hold the card flat inside the frame, in good light.'}
      footer={
        shot ? (
          <>
            <Button variant="outline" onClick={() => setShot(null)}>
              <RotateCcw className="h-4 w-4" /> Retake
            </Button>
            <Button
              onClick={() => {
                onCapture(shot.blob);
                onClose();
              }}
            >
              Use photo
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={capture} disabled={!ready || !!error}>
              <Camera className="h-4 w-4" /> Capture
            </Button>
          </>
        )
      }
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-ink-950">
        {error ? (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-200">{error}</p>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className={cn('h-full w-full object-cover', shot && 'invisible')} />
            {shot && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.url} alt="Captured" className="absolute inset-0 h-full w-full object-contain" />
            )}
            {!shot && guide === 'card' && ready && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="aspect-[1.586] w-[62%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
              </div>
            )}
            {!ready && !shot && <Loader2 className="absolute inset-0 m-auto h-7 w-7 animate-spin text-white/70" />}
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * A row of photos with add / remove (and "make cover" when `cover` is on). Used for guest IDs, room photos, logo.
 */
export function PhotoGrid({
  folder,
  value,
  onChange,
  max = 4,
  cover = false,
  webcam = false,
  keepPng = false,
  maxSize,
  tileClassName = 'h-24 w-32',
  fit = 'cover',
  addLabel = 'Add photo',
  scanLabel = 'Scan',
}: {
  folder: Folder;
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  cover?: boolean;
  /** Offer the webcam scanner (front desk) next to the file picker. */
  webcam?: boolean;
  keepPng?: boolean;
  /** Longest side in pixels after downscaling (default 1600). */
  maxSize?: number;
  tileClassName?: string;
  fit?: 'cover' | 'contain';
  addLabel?: string;
  scanLabel?: string;
}) {
  const { upload, uploading } = useImageUpload(folder, { keepPng, maxSize });
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Uploads finish one by one; keep the latest list in a ref so parallel uploads do not overwrite each other.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  async function add(files: Blob[]) {
    for (const file of files.slice(0, Math.max(0, max - latest.current.length))) {
      const url = await upload(file);
      if (url) {
        latest.current = [...latest.current, url];
        onChange(latest.current);
      }
    }
  }

  const full = value.length >= max;
  return (
    <div className="flex flex-wrap gap-2.5">
      {value.map((url, index) => (
        <div key={url} className={cn('group relative overflow-hidden rounded-xl bg-ink-100 ring-1 ring-ink-200', tileClassName)}>
          <a href={url} target="_blank" rel="noreferrer" className="block h-full w-full" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Photo ${index + 1}`} className={cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain p-2')} loading="lazy" />
          </a>
          {cover && index === 0 && <span className="absolute top-1.5 left-1.5 rounded-full bg-ink-900/75 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">{tx('Cover')}</span>}
          <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
            {cover && index > 0 && (
              <button
                type="button"
                onClick={() => onChange([url, ...value.filter((u) => u !== url)])}
                className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-ink-700 shadow hover:text-amber-600"
                aria-label="Make cover photo"
                title="Make cover photo"
              >
                <Star className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange(value.filter((u) => u !== url))}
              className="grid h-6 w-6 place-items-center rounded-full bg-white/90 text-ink-700 shadow hover:text-rose-600"
              aria-label={`Remove photo ${index + 1}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      {uploading && (
        <div className={cn('grid place-items-center rounded-xl bg-ink-50 ring-1 ring-ink-200', tileClassName)}>
          <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
        </div>
      )}
      {!full && (
        <div className="flex flex-col items-stretch justify-center gap-1.5">
          {webcam && (
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-ink-800"
            >
              <Camera className="h-4 w-4" /> {tx(scanLabel)}
            </button>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-300 text-xs font-semibold text-ink-600 transition hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700',
              webcam ? 'h-9 px-3' : tileClassName,
              !webcam && 'flex-col',
            )}
          >
            <ImagePlus className={webcam ? 'h-4 w-4' : 'h-5 w-5'} /> {tx(webcam ? 'Upload' : addLabel)}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple={max - value.length > 1}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) add(files);
            }}
          />
        </div>
      )}
      {cameraOpen && <CameraDialog onCapture={(blob) => add([blob])} onClose={() => setCameraOpen(false)} />}
    </div>
  );
}
