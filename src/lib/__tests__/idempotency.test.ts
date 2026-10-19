import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { newIdempotencyKey, useSubmissionKey } from '../idempotency';

describe('submission key (Idempotency-Key)', () => {
  it('generates keys the API accepts', () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(newIdempotencyKey()).not.toBe(key);
  });

  it('reuses the key when the same content is sent again (retry)', () => {
    const { result } = renderHook(() => useSubmissionKey());
    const first = result.current.keyFor({ items: [{ id: 'fries', quantity: 2 }] });
    expect(result.current.keyFor({ items: [{ id: 'fries', quantity: 2 }] })).toBe(first);
  });

  it('starts a new submission when the content changes or after a success', () => {
    const { result } = renderHook(() => useSubmissionKey());
    const order = { items: [{ id: 'fries', quantity: 2 }] };
    const first = result.current.keyFor(order);

    const changed = result.current.keyFor({ items: [{ id: 'fries', quantity: 3 }] });
    expect(changed).not.toBe(first);

    result.current.done();
    expect(result.current.keyFor({ items: [{ id: 'fries', quantity: 3 }] })).not.toBe(changed);
  });
});
