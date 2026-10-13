import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './button';

/**
 * Side navigation drawer for small screens, on the native <dialog>: focus trap, Escape and inert
 * background come from the browser; a click on the backdrop closes it; the page behind does not
 * scroll (html:has(dialog[open]) in styles.css). Focus returns to the menu button on close.
 */
export function Drawer({
  open,
  onClose,
  label,
  header,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
      onClose();
    };
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-foreground backdrop:animate-fade-in open:flex"
    >
      {open && (
        <div className="flex h-full w-[min(19rem,86vw)] animate-drawer-in flex-col bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-lg">
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 pr-2 pl-4">
            {header}
            <IconButton label="Fechar menu" onClick={() => ref.current?.close()}>
              <X aria-hidden className="size-5" />
            </IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
