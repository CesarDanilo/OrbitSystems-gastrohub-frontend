import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicPlanView } from '../../contracts';
import { PricingCards } from './pricing';

const limits = {
  products: null,
  categories: null,
  orders_per_month: null,
  users: 3,
  tables: 0,
  cash_registers: 1,
};
const plan = (over: Partial<PublicPlanView>): PublicPlanView => ({
  code: 'X',
  name: 'X',
  description: null,
  tagline: null,
  audience: null,
  badge: null,
  highlighted: false,
  priceCents: 8900,
  yearlyPriceCents: 89000,
  yearlySavingsCents: 17800,
  trialDays: 0,
  highlights: [],
  limits,
  features: [
    {
      key: 'tables',
      name: 'Mesas',
      category: 'Atendimento presencial',
      included: false,
      beta: false,
    },
    {
      key: 'basic_pos',
      name: 'PDV de balcão',
      category: 'Atendimento presencial',
      included: true,
      beta: false,
    },
  ],
  ...over,
});

const plans = [
  plan({ code: 'ESSENCIAL', name: 'Essencial' }),
  plan({
    code: 'PRO',
    name: 'Profissional',
    highlighted: true,
    badge: 'Mais recomendado',
    priceCents: 17900,
    yearlyPriceCents: 179000,
    yearlySavingsCents: 35800,
    trialDays: 14,
    features: [
      {
        key: 'tables',
        name: 'Mesas',
        category: 'Atendimento presencial',
        included: true,
        beta: false,
      },
      {
        key: 'basic_pos',
        name: 'PDV de balcão',
        category: 'Atendimento presencial',
        included: true,
        beta: false,
      },
    ],
  }),
  plan({
    code: 'AVANCADO',
    name: 'Avançado',
    priceCents: 29900,
    yearlyPriceCents: null,
    yearlySavingsCents: 0,
  }),
];

afterEach(cleanup);

describe('PricingCards', () => {
  it('highlights the recommended plan with its badge and trial', () => {
    render(
      <PricingCards
        plans={plans}
        renderAction={(p) => <button type="button">Escolher {p.name}</button>}
      />,
    );
    expect(screen.getByText('Mais recomendado')).toBeInTheDocument();
    expect(screen.getByText('14 dias grátis para testar')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
  });

  it('switches to yearly prices and shows savings computed from real prices', async () => {
    render(<PricingCards plans={plans} renderAction={() => null} />);
    expect(screen.queryByText(/economia de/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Anual' }));
    expect(screen.getByText(/economia de R\$\s358,00 no ano/)).toBeInTheDocument();
    // Plans without a yearly price keep the monthly price (no invented discount).
    expect(screen.getAllByText('cobrado mensalmente')).toHaveLength(1);
  });

  it('shows what is not included instead of hiding it', () => {
    render(<PricingCards plans={plans} renderAction={() => null} />);
    const table = screen.getByRole('table');
    const row = within(table).getAllByRole('row', { name: /^Mesas/ })[0]!;
    expect(within(row).getAllByLabelText('Não incluído')).toHaveLength(2);
    expect(within(row).getAllByLabelText('Incluído')).toHaveLength(1);
  });
});
