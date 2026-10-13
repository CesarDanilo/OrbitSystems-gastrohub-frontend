import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicCategory, PublicProduct } from '@hamb/shared';
import { ProductImage } from '../../../../components/product-image';
import { burger } from '../../../store/__tests__/fixtures';
import { PosCatalog, countByProduct, filterProducts } from '../pos-catalog';
import { OrderTicket } from '../order-ticket';
import { ProductOptionsDialog, type TicketLine } from '../product-options-dialog';
import { addLine, setLineQuantity, ticketTotals } from '../ticket';

const product = (over: Partial<PublicProduct>): PublicProduct => ({
  ...burger,
  optionGroups: [],
  ...over,
});

const fries = product({
  id: 'fries',
  name: 'Batata Rústica',
  priceCents: 1490,
  categoryId: 'sides',
  imageUrl: 'https://img.example/batata.webp',
});
const rings = product({ id: 'rings', name: 'Onion Rings', priceCents: 1690, categoryId: 'sides' });
const soda = product({
  id: 'soda',
  name: 'Refrigerante lata',
  priceCents: 690,
  categoryId: 'drinks',
  available: false,
});
const xBacon = { ...burger, imageUrl: 'https://img.example/x-bacon.webp' };

const categories: PublicCategory[] = [
  { id: 'c1', name: 'Burgers', products: [xBacon] },
  { id: 'sides', name: 'Acompanhamentos', products: [fries, rings] },
  { id: 'drinks', name: 'Bebidas', products: [soda] },
];

const line = (over: Partial<TicketLine>): TicketLine => ({
  key: 'fries::',
  productId: 'fries',
  name: 'Batata Rústica',
  quantity: 1,
  optionIds: [],
  optionNames: [],
  notes: '',
  unitPriceCents: 1490,
  ...over,
});

describe('ProductImage', () => {
  it('shows the real photo when there is one', () => {
    const { container } = render(<ProductImage src="https://img.example/a.webp" name="X-Bacon" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://img.example/a.webp');
    expect(container.firstChild).toHaveAttribute('data-image-state', 'photo');
  });

  it('falls back to a placeholder without a photo or when it fails to load', () => {
    const { container, rerender } = render(<ProductImage src={null} name="Refrigerante" />);
    expect(screen.getByText('Sem foto')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();

    rerender(<ProductImage src="https://img.example/broken.webp" name="Refrigerante" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.firstChild).toHaveAttribute('data-image-state', 'placeholder');
    expect(screen.getByText('Sem foto')).toBeInTheDocument();
  });

  it('loads lazily unless marked as priority', () => {
    const { container, rerender } = render(
      <ProductImage src="https://img.example/a.webp" name="A" />,
    );
    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy');
    rerender(<ProductImage src="https://img.example/a.webp" name="A" priority />);
    expect(container.querySelector('img')).toHaveAttribute('loading', 'eager');
  });
});

describe('ticket rules', () => {
  it('filters by category and by name ignoring accents', () => {
    expect(filterProducts(categories, 'rustica', null).map((p) => p.id)).toEqual(['fries']);
    expect(filterProducts(categories, '', 'sides').map((p) => p.id)).toEqual(['fries', 'rings']);
    expect(filterProducts(categories, 'bacon', 'sides')).toEqual([]);
  });

  it('adds up identical lines, changes quantity, removes at zero and totals', () => {
    let lines = addLine([], line({}));
    lines = addLine(lines, line({ quantity: 2 }));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(3);
    lines = addLine(lines, line({ key: 'rings::', productId: 'rings', unitPriceCents: 1690 }));
    expect(ticketTotals(lines, null)).toEqual({
      subtotal: 6160,
      discount: 0,
      total: 6160,
      count: 4,
    });
    expect(ticketTotals(lines, 10_000).total).toBe(0);
    expect(countByProduct(lines).get('fries')).toBe(3);
    lines = setLineQuantity(lines, 'fries::', 0);
    expect(lines.map((l) => l.key)).toEqual(['rings::']);
  });
});

function CatalogHarness({ onPick = vi.fn() }: { onPick?: (p: PublicProduct) => void }) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  return (
    <PosCatalog
      categories={categories}
      query={query}
      onQueryChange={setQuery}
      categoryId={categoryId}
      onCategoryChange={setCategoryId}
      counts={new Map([['fries', 2]])}
      onPick={onPick}
      canEditMenu={false}
    />
  );
}

describe('PosCatalog', () => {
  it('shows every product with its photo or placeholder, price and quantity in the order', () => {
    const { container } = render(<CatalogHarness />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(container.querySelectorAll('[data-image-state="photo"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-image-state="placeholder"]')).toHaveLength(2);
    const friesTile = screen.getByRole('button', { name: /Batata Rústica/ });
    expect(friesTile).toHaveTextContent('R$ 14,90');
    expect(within(friesTile).getByText('no pedido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /X-Bacon/ })).toHaveTextContent('Com opções');
  });

  it('picks available products and blocks unavailable ones', async () => {
    const onPick = vi.fn();
    render(<CatalogHarness onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: /Batata Rústica/ }));
    expect(onPick).toHaveBeenCalledWith(fries);
    const sodaTile = screen.getByRole('button', { name: /Refrigerante lata/ });
    expect(sodaTile).toBeDisabled();
    expect(sodaTile).toHaveTextContent('Indisponível');
  });

  it('filters by category and search, with a useful empty result', async () => {
    render(<CatalogHarness />);
    await userEvent.click(screen.getByRole('tab', { name: 'Acompanhamentos' }));
    expect(screen.getByRole('tab', { name: 'Acompanhamentos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar produto' }), 'pizza');
    expect(screen.getByText('Nada encontrado para "pizza"')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Limpar busca' }).at(-1)!);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('tab', { name: 'Tudo' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('explains an empty menu', () => {
    render(
      <PosCatalog
        categories={[]}
        query=""
        onQueryChange={vi.fn()}
        categoryId={null}
        onCategoryChange={vi.fn()}
        counts={new Map()}
        onPick={vi.fn()}
        canEditMenu={false}
      />,
    );
    expect(screen.getByText('Nenhum produto no cardápio')).toBeInTheDocument();
  });
});

function TicketHarness({ initial }: { initial: TicketLine[] }) {
  const [lines, setLines] = useState(initial);
  const [discount, setDiscount] = useState('');
  const totals = ticketTotals(lines, discount ? Number(discount) * 100 : null);
  return (
    <OrderTicket
      modes={[
        { value: 'counter', label: 'Balcão' },
        { value: 'table', label: 'Mesa' },
      ]}
      mode="counter"
      onModeChange={vi.fn()}
      target={null}
      lines={lines}
      images={new Map([['fries', null]])}
      onQuantityChange={(key, q) => setLines((current) => setLineQuantity(current, key, q))}
      notes=""
      onNotesChange={vi.fn()}
      discount={discount}
      onDiscountChange={setDiscount}
      discountReason=""
      onDiscountReasonChange={vi.fn()}
      discountCents={totals.discount}
      discountInvalid={false}
      canDiscount
      actions={<button type="button">Lançar e cobrar</button>}
      onClear={() => setLines([])}
    />
  );
}

describe('OrderTicket', () => {
  it('starts empty', () => {
    render(<TicketHarness initial={[]} />);
    expect(screen.getByText('Pedido vazio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lançar e cobrar' })).not.toBeInTheDocument();
  });

  it('changes quantities, updates the total and removes items', async () => {
    render(<TicketHarness initial={[line({ quantity: 2 })]} />);
    expect(screen.getByText('R$ 29,80', { selector: 'dd' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar Batata Rústica' }));
    expect(screen.getByText('R$ 44,70', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText(/3 itens/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir Batata Rústica' }));
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir Batata Rústica' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remover Batata Rústica' }));
    expect(screen.getByText('Pedido vazio')).toBeInTheDocument();
  });

  it('shows subtotal and discount when a discount is given', async () => {
    render(<TicketHarness initial={[line({ quantity: 2 })]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Observação e desconto' }));
    await userEvent.type(screen.getByLabelText('Desconto (R$)'), '5');
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('−R$ 5,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 24,80', { selector: 'dd' })).toBeInTheDocument();
  });
});

describe('ProductOptionsDialog', () => {
  it('requires the mandatory option and adds the line with its options and price', async () => {
    const onAdd = vi.fn();
    render(<ProductOptionsDialog product={burger} onClose={vi.fn()} onAdd={onAdd} />);
    const add = screen.getByRole('button', { name: /^Adicionar/ });
    expect(add).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Brioche/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Bacon/ }));
    expect(add).toBeEnabled();
    await userEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'p1',
        optionIds: ['brioche', 'bacon'],
        optionNames: ['Brioche', 'Bacon'],
        unitPriceCents: 3800,
        quantity: 1,
      }),
    );
  });
});

describe('formatWait', () => {
  it('keeps kitchen waits readable at any length', async () => {
    const { formatWait } = await import('../../../../lib/format');
    expect(formatWait(12)).toBe('12 min');
    expect(formatWait(125)).toBe('2 h 05');
    expect(formatWait(10230)).toBe('7 dias');
  });
});
