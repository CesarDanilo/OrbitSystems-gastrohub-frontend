import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

/**
 * Label shown beside a control on hover or keyboard focus (Escape hides it). The control keeps
 * its own accessible name, so the bubble is visual only. Rendered in a portal with fixed
 * position, so scrolling containers never clip it.
 */
export function Tooltip({
  label,
  children,
  disabled = false,
  className,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!disabled && rect) setAnchor({ x: rect.right + 10, y: rect.top + rect.height / 2 });
  };
  const hide = () => setAnchor(null);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
    };
  }, [anchor]);

  useEffect(() => {
    if (disabled) hide();
  }, [disabled]);

  return (
    <span
      ref={ref}
      className={cn('block', className)}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {anchor &&
        createPortal(
          <span
            aria-hidden
            className="pointer-events-none fixed z-50 -translate-y-1/2 animate-fade-in rounded-sm bg-foreground px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-background shadow-md"
            style={{ left: anchor.x, top: anchor.y }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
