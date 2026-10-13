import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

/** Dropdown menu with keyboard support (arrows, Home/End, Escape) following the WAI-ARIA menu pattern. */
export function Menu({
  trigger,
  items,
  align = 'end',
}: {
  trigger: (props: {
    onClick: () => void;
    'aria-expanded': boolean;
    'aria-haspopup': 'menu';
    'aria-controls': string;
  }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus();
    const onDocument = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocument);
    return () => document.removeEventListener('mousedown', onDocument);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ??
        []),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (i: number) => buttons[(i + buttons.length) % buttons.length]?.focus();
    if (e.key === 'ArrowDown') focus(index + 1);
    else if (e.key === 'ArrowUp') focus(index - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(buttons.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      (ref.current?.querySelector('[aria-haspopup]') as HTMLElement | null)?.focus();
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div ref={ref} className="relative inline-block">
      {trigger({
        onClick: () => setOpen((v) => !v),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        'aria-controls': id,
      })}
      {open && (
        <div
          ref={listRef}
          id={id}
          role="menu"
          onKeyDown={onKeyDown}
          className={cn(
            'absolute z-50 mt-1 min-w-48 animate-pop rounded-md border border-border bg-surface p-1 shadow-md',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-sm font-medium hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-50',
                item.danger && 'text-danger',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
