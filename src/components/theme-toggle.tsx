import { Moon, Sun } from 'lucide-react';
import { cn } from '../lib/cn';
import { useTheme } from '../lib/preferences';
import { Tooltip } from './ui';

/** Switches between dark (default) and light without reloading; the choice is remembered. */
export function ThemeToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const [theme, setTheme] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'Usar tema claro' : 'Usar tema escuro';
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <Tooltip label={label} disabled={!compact}>
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={compact ? label : undefined}
        className={cn(
          'flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-active hover:text-foreground',
          compact && 'justify-center px-0',
          className,
        )}
      >
        <Icon aria-hidden className="size-[1.125rem] shrink-0" />
        {!compact && <span className="truncate">{label}</span>}
      </button>
    </Tooltip>
  );
}
