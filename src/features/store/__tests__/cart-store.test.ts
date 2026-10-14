import { beforeEach, describe, expect, it } from 'vitest';
import { resolveCart, useCartStore } from '../cart-store';
import { burger, storeWith } from './fixtures';

describe('cart store', () => {
  beforeEach(() => {
    localStorage.clear();
    useCartStore.setState({ carts: {} });
  });

  it('merges identical lines and keeps different options apart', () => {
    const { add } = useCartStore.getState();
    add('loja', { productId: 'p1', quantity: 1, optionIds: ['trad'], notes: '' });
    add('loja', { productId: 'p1', quantity: 2, optionIds: ['trad'], notes: '' });
    add('loja', { productId: 'p1', quantity: 1, optionIds: ['brioche'], notes: '' });
    const lines = useCartStore.getState().carts.loja!;
    expect(lines).toHaveLength(2);
    expect(lines[0]!.quantity).toBe(3);
  });

  it('keeps carts separated per store and persists them', () => {
    const { add } = useCartStore.getState();
    add('loja-a', { productId: 'p1', quantity: 1, optionIds: [], notes: '' });
    expect(useCartStore.getState().carts['loja-b']).toBeUndefined();
    expect(localStorage.getItem('gastrohub:cart')).toContain('loja-a');
  });

  it('removes a line when its quantity reaches zero', () => {
    const { add, setQuantity } = useCartStore.getState();
    add('loja', { productId: 'p1', quantity: 1, optionIds: ['trad'], notes: '' });
    const key = useCartStore.getState().carts.loja![0]!.key;
    setQuantity('loja', key, 0);
    expect(useCartStore.getState().carts.loja).toEqual([]);
  });
});

describe('resolveCart', () => {
  it('prices lines with the current menu', () => {
    const cart = resolveCart(storeWith([burger]), [
      {
        key: 'k',
        productId: 'p1',
        quantity: 2,
        optionIds: ['brioche', 'bacon'],
        notes: '',
        addedAt: 0,
      },
    ]);
    expect(cart.subtotalCents).toBe(7600);
    expect(cart.lines[0]!.optionsLabel).toBe('Brioche, Bacon');
    expect(cart.hasProblems).toBe(false);
  });

  it('flags items that left the menu or became unavailable, and excludes them from the subtotal', () => {
    const cart = resolveCart(storeWith([{ ...burger, available: false }]), [
      { key: 'a', productId: 'p1', quantity: 1, optionIds: ['trad'], notes: '', addedAt: 0 },
      { key: 'b', productId: 'gone', quantity: 1, optionIds: [], notes: '', addedAt: 0 },
    ]);
    expect(cart.hasProblems).toBe(true);
    expect(cart.lines[0]!.problem).toMatch(/não está disponível/);
    expect(cart.lines[1]!.problem).toMatch(/não está mais no cardápio/);
    expect(cart.subtotalCents).toBe(0);
  });
});
