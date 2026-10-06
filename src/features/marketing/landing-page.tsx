import { Link } from '@tanstack/react-router';
import { BarChart3, Check, MessageCircle, Smartphone, Sparkles, Store, Users } from 'lucide-react';
import { Logo } from './logo';

const benefits = [
  {
    icon: Store,
    title: 'Sua loja, sua marca',
    text: 'Link próprio com logo e cores do seu restaurante. Nada de vitrine de marketplace.',
  },
  {
    icon: Smartphone,
    title: 'Pedido em poucos toques',
    text: 'Seu cliente pede sem criar conta, no celular, e acompanha tudo em tempo real.',
  },
  {
    icon: Users,
    title: 'Os clientes são seus',
    text: 'Histórico, frequência e ticket de cada cliente para vender de novo.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp automático',
    text: 'Confirmação e atualizações do pedido direto no WhatsApp do cliente.',
  },
  {
    icon: BarChart3,
    title: 'O que está acontecendo agora',
    text: 'Faturamento, pedidos e horários de pico sem planilha.',
  },
  {
    icon: Sparkles,
    title: 'Insights com dados reais',
    text: 'Sugestões práticas baseadas nas suas vendas, nunca em achismo.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav aria-label="Principal" className="flex items-center gap-2">
          <Link
            to="/entrar"
            className="inline-flex h-11 items-center rounded-md px-4 text-sm font-semibold hover:bg-surface-2"
          >
            Entrar
          </Link>
          <Link
            to="/cadastro"
            className="inline-flex h-11 items-center rounded-md bg-brand px-4 text-sm font-semibold text-brand-fg"
          >
            Criar loja grátis
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 text-center sm:pt-20">
          <p className="mx-auto inline-flex rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">
            Para hamburguerias, pizzarias e lanchonetes
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Seu próprio canal de vendas. Sem comissão por pedido.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Receba pedidos pela sua loja online, fale com seus clientes no WhatsApp e entenda o que
            vende mais. Tudo em um só lugar.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/cadastro"
              className="inline-flex h-13 items-center rounded-md bg-brand px-6 text-base font-semibold text-brand-fg shadow-sm"
            >
              Começar grátis
            </Link>
            <Link
              to="/s/$slug"
              params={{ slug: 'brasa' }}
              className="inline-flex h-13 items-center rounded-md border border-border-strong bg-surface px-6 text-base font-semibold"
            >
              Ver loja de exemplo
            </Link>
          </div>
        </section>

        <section aria-labelledby="beneficios" className="border-y border-border bg-surface py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 id="beneficios" className="text-center text-2xl font-bold sm:text-3xl">
              Venda mais, dependa menos
            </h2>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {benefits.map((b) => (
                <li key={b.title} className="rounded-lg border border-border p-5">
                  <b.icon aria-hidden className="size-6 text-brand" />
                  <h3 className="mt-3 font-semibold">{b.title}</h3>
                  <p className="mt-1 text-[0.9375rem] text-muted">{b.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="planos" className="mx-auto max-w-4xl px-4 py-16">
          <h2 id="planos" className="text-center text-2xl font-bold sm:text-3xl">
            Comece grátis, cresça quando quiser
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <PlanCard
              name="Free"
              price="R$ 0"
              items={[
                'Loja online e QR Code',
                'Até 20 produtos e 5 categorias',
                'Até 50 pedidos por mês',
                'Painel de pedidos',
                'Dashboard básico',
              ]}
            />
            <PlanCard
              name="Pro"
              price="R$ 119/mês"
              highlight
              items={[
                'Produtos e pedidos ilimitados',
                'WhatsApp automático e IA',
                'Pix e cartão online',
                'Cupons e recompra',
                'Insights e relatórios avançados',
                'White-label completo e equipe',
              ]}
            />
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        © {new Date().getFullYear()} Hamburguerias
      </footer>
    </div>
  );
}

function PlanCard({
  name,
  price,
  items,
  highlight,
}: {
  name: string;
  price: string;
  items: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? 'rounded-xl border-2 border-brand bg-surface p-6 shadow-md'
          : 'rounded-xl border border-border bg-surface p-6'
      }
    >
      <h3 className="text-lg font-bold">{name}</h3>
      <p className="mt-2 text-3xl font-bold tabular">{price}</p>
      <ul className="mt-5 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[0.9375rem]">
            <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
            {item}
          </li>
        ))}
      </ul>
      <Link
        to="/cadastro"
        className={
          highlight
            ? 'mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-brand font-semibold text-brand-fg'
            : 'mt-6 inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong font-semibold'
        }
      >
        {highlight ? 'Começar com o Pro' : 'Começar grátis'}
      </Link>
    </div>
  );
}
