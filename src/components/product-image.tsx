import { useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Product photo with its box reserved up front (no layout shift). When there is no photo or it
 * fails to load, shows a neutral plate mark with the product's initial: clearly a placeholder,
 * never something that passes for a photo. The restaurant replaces it by uploading a photo in
 * the product editor.
 */
export function ProductImage({
  src,
  name,
  className,
  priority = false,
  size = 'md',
}: {
  src: string | null | undefined;
  /** Product name: used for the placeholder initial and the accessible fallback text. */
  name: string;
  className?: string;
  /** First visible images load eagerly with high priority; the rest load lazily. */
  priority?: boolean;
  size?: 'sm' | 'md';
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(src) && failedSrc !== src;

  return (
    <div
      className={cn('relative overflow-hidden bg-surface-muted', className)}
      data-image-state={showPhoto ? 'photo' : 'placeholder'}
    >
      {showPhoto ? (
        <img
          src={src!}
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src ?? null)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground/70">
          <UtensilsCrossed aria-hidden className={size === 'sm' ? 'size-4' : 'size-7'} />
          {size === 'md' && (
            <span aria-hidden className="text-xs font-semibold tracking-wide uppercase">
              {name.trim().slice(0, 1)}
            </span>
          )}
          <span className="sr-only">Sem foto</span>
        </div>
      )}
    </div>
  );
}
