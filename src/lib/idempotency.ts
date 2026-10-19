import { useCallback, useMemo, useRef } from 'react';

/** Random key for the Idempotency-Key header. getRandomValues also works on plain-HTTP LAN tablets. */
export function newIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Key for creating an order. Sending the same content again (retry after "Sem conexão", double
 * tap) reuses the key, so the API returns the order the first attempt may already have created
 * instead of creating a duplicate. Changing the content, or calling `done()` after a success,
 * starts a new submission (an identical second order on purpose is a new order).
 */
export function useSubmissionKey() {
  const last = useRef<{ content: string; key: string } | null>(null);
  const keyFor = useCallback((content: unknown) => {
    const serialized = JSON.stringify(content);
    if (last.current?.content !== serialized) {
      last.current = { content: serialized, key: newIdempotencyKey() };
    }
    return last.current.key;
  }, []);
  const done = useCallback(() => {
    last.current = null;
  }, []);
  return useMemo(() => ({ keyFor, done }), [keyFor, done]);
}

export const idempotencyHeader = (key: string) => ({ 'idempotency-key': key });
