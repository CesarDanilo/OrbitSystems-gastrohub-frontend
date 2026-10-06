import { useEffect, useRef } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '../../lib/cn';

interface Toast {
  id: number;
  tone: 'success' | 'error';
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (tone: Toast['tone'], message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (tone, message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, tone, message }] });
    setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message: string) => useToastStore.getState().push('success', message),
  error: (message: string) => useToastStore.getState().push('error', message),
};

/**
 * Polite live region: announced by screen readers without stealing focus. Rendered as a manual
 * popover and re-shown on every toast, so it stays in the top layer above open dialogs.
 */
export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.showPopover !== 'function') return;
    if (el.matches(':popover-open')) el.hidePopover();
    if (toasts.length > 0) el.showPopover();
  }, [toasts]);

  return (
    <div
      ref={ref}
      popover="manual"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] bottom-auto m-0 h-auto w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent px-4 py-0 [&:popover-open]:flex sm:top-auto sm:bottom-6 sm:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto flex w-full max-w-sm animate-sheet-up items-center gap-3 rounded-md bg-fg py-3 pr-2 pl-4 text-sm font-medium text-bg shadow-lg',
          )}
        >
          {t.tone === 'success' ? (
            <CircleCheck aria-hidden className="size-5 shrink-0 text-green-400" />
          ) : (
            <CircleAlert aria-hidden className="size-5 shrink-0 text-red-400" />
          )}
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Fechar aviso"
            className="flex size-9 items-center justify-center rounded-sm opacity-70 hover:opacity-100"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
