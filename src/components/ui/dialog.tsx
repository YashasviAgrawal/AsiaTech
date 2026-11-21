'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonVariant } from './button';
import { Field, Input } from './fields';

function useBodyLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
}

/** Open dialogs, newest last: Escape closes only the top one when dialogs are stacked (e.g. camera over check-in). */
const escapeStack: symbol[] = [];

function useEscape(open: boolean, onClose: () => void) {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    escapeStack.push(token);
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && escapeStack[escapeStack.length - 1] === token) latest.current();
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      escapeStack.splice(escapeStack.indexOf(token), 1);
    };
  }, [open]);
}

const noop = () => () => {};

/** Renders into <body> once hydrated (false on the server and during hydration, so both sides match). */
function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: ReactNode;
}) {
  const titleId = useId();
  useBodyLock(open);
  useEscape(open, onClose);
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-[2px]" onClick={onClose} />
        <div
          className={cn(
            'relative flex max-h-[92vh] w-full animate-pop flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:rounded-2xl',
            widths[size],
          )}
        >
          <div className="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
            {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base font-bold text-ink-900">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
            </div>
            <button onClick={onClose} className="-mr-1 rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

/**
 * Safe actions (rule 8): explain what will happen, optionally show a preview, optionally require a reason.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  // Mounted only while open, so the typed reason starts empty every time.
  if (!props.open) return null;
  return <ConfirmDialogInner {...props} />;
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  title: ReactNode;
  description?: ReactNode;
  preview?: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
}

function ConfirmDialogInner({
  open,
  onClose,
  onConfirm,
  title,
  description,
  preview,
  confirmLabel = 'Confirm',
  variant = 'danger',
  requireReason,
  reasonLabel = 'Reason',
  loading,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={preview ? 'lg' : 'sm'}
      icon={
        variant === 'danger' ? (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
        ) : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Go back
          </Button>
          <Button variant={variant} loading={loading} disabled={requireReason && reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {preview}
      {requireReason && (
        <Field label={reasonLabel} required className={preview ? 'mt-4' : undefined}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Type a short reason" autoFocus />
        </Field>
      )}
      {!preview && !requireReason && <p className="text-sm text-ink-600">You can undo this from the notification that appears.</p>}
    </Dialog>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  useBodyLock(open);
  useEscape(open, onClose);
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };
  return (
    <Portal>
      <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
        <div className="absolute inset-0 animate-fade-in bg-ink-950/40" onClick={onClose} />
        <aside className={cn('absolute inset-y-0 right-0 flex w-full animate-enter flex-col bg-white shadow-lift', widths[width])}>
          <div className="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-ink-900">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>}
        </aside>
      </div>
    </Portal>
  );
}
