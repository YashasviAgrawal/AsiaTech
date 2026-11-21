'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTr } from '@/i18n/client';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void | Promise<void> };
  duration: number;
}

interface ToastApi {
  show: (toast: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => void;
  success: (title: string, options?: { description?: string; action?: ToastItem['action'] }) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: TriangleAlert };
const ICON_COLORS = { success: 'text-emerald-500', error: 'text-rose-500', info: 'text-sky-500', warning: 'text-amber-500' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // false during SSR and hydration, true afterwards: the portal only renders in the browser.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const idRef = useRef(0);
  const tr = useTr();

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi['show']>(
    (toast) => {
      const id = ++idRef.current;
      // Undo toasts stay longer so there is time to react.
      const duration = toast.duration ?? (toast.action ? 8000 : 4000);
      setToasts((list) => [...list.slice(-3), { ...toast, id, duration }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, options) => show({ tone: 'success', title, ...options }),
      error: (title, description) => show({ tone: 'error', title, description }),
      info: (title, description) => show({ tone: 'info', title, description }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 p-4 sm:items-end" aria-live="polite">
            {toasts.map((toast) => {
              const Icon = ICONS[toast.tone];
              return (
                <div
                  key={toast.id}
                  className="pointer-events-auto relative flex w-full max-w-sm animate-fade-up items-start gap-3 overflow-hidden rounded-2xl border border-ink-200/80 bg-white/95 p-3.5 shadow-lift backdrop-blur"
                  role="status"
                >
                  {toast.action && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand-500/70" style={{ animation: `toast-countdown ${toast.duration}ms linear forwards` }} />
                  )}
                  <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_COLORS[toast.tone])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{tr(toast.title)}</p>
                    {toast.description && <p className="mt-0.5 text-xs text-ink-500">{tr(toast.description)}</p>}
                  </div>
                  {toast.action && (
                    <button
                      className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
                      onClick={async () => {
                        dismiss(toast.id);
                        await toast.action?.onClick();
                      }}
                    >
                      {tr(toast.action.label)}
                    </button>
                  )}
                  <button onClick={() => dismiss(toast.id)} className="shrink-0 text-ink-300 transition hover:text-ink-600" aria-label="Dismiss">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value;
}
