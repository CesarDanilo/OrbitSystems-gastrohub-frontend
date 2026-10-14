import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <>
      <LoaderCircle aria-hidden className={cn('animate-spin', className ?? 'size-5')} />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}

export function PageSpinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-[40vh] items-center justify-center text-muted-foreground"
    >
      <Spinner className="size-6" label={label} />
    </div>
  );
}
