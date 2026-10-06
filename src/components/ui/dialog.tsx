import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 'sheet' slides from the bottom on phones and becomes a side panel on desktop. */
  variant?: 'dialog' | 'sheet';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Built on the native <dialog>: focus trap, Escape to close, inert background and top layer come
 * from the browser. Focus returns to the trigger on close.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'dialog',
  size = 'md',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement;
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      document.body.style.overflow = '';
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
      onClose();
    };
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close(); // click on backdrop
      }}
      className={cn(
        'm-0 max-h-none max-w-none bg-transparent p-0 text-fg backdrop:animate-fade-in open:flex',
        'h-dvh w-full items-end justify-center sm:items-center',
        variant === 'sheet' && 'sm:items-stretch sm:justify-end',
      )}
    >
      {open && (
        <div
          className={cn(
            'flex max-h-[92dvh] w-full flex-col bg-surface shadow-lg',
            variant === 'sheet'
              ? 'animate-sheet-up rounded-t-xl sm:h-dvh sm:max-h-none sm:max-w-md sm:rounded-none'
              : cn('animate-sheet-up rounded-t-xl sm:animate-pop sm:rounded-xl', widths[size]),
          )}
        >
          <header className="flex items-start gap-3 border-b border-border px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1 pt-1.5">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <IconButton label="Fechar" onClick={() => ref.current?.close()}>
              <X className="size-5" aria-hidden />
            </IconButton>
          </header>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && (
            <footer className="border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
