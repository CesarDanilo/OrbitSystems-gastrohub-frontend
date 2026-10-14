import { Link } from '@tanstack/react-router';
import { BarChart3, MessageCircle, Smartphone, Sparkles, Store, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Logo } from './logo';
import { PricingCards, publicPlansQuery } from './pricing';

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
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <span className="sm:hidden">
          <Logo compact />
        </span>
        <span className="hidden sm:inline-flex">
          <Logo />
        </span>
        <nav aria-label="Principal" className="flex items-center gap-2">
          <Link
            to="/entrar"
            className="inline-flex h-11 items-center rounded-md px-4 text-sm font-semibold hover:bg-surface-muted"
          >
            Entrar
          </Link>
          <Link
            to="/cadastro"
            className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Criar loja grátis
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 text-center sm:pt-20">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Seu próprio canal de vendas. Sem comissão por pedido.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Para restaurantes, hamburguerias, pizzarias e lanchonetes: receba pedidos pela sua loja online, fale
            com seus clientes no WhatsApp e entenda o que vende mais. Tudo em um só lugar.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/cadastro"
              className="inline-flex h-13 items-center rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm"
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
                  <b.icon aria-hidden className="size-6 text-primary" />
                  <h3 className="mt-3 font-semibold">{b.title}</h3>
                  <p className="mt-1 text-[0.9375rem] text-muted-foreground">{b.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="planos" className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="planos" className="text-center text-2xl font-bold sm:text-3xl">
            Um plano para cada fase do seu restaurante
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            Sem comissão por pedido. Compare tudo na{' '}
            <Link to="/planos" className="font-semibold text-primary">
              página de planos
            </Link>
            .
          </p>
          <PlansPreview />
        </section>
      </main>
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} GastroHub
      </footer>
    </div>
  );
}

/** Plans from the catalog configured by the platform owner. */
function PlansPreview() {
  const plans = useQuery(publicPlansQuery);
  if (!plans.data || plans.data.length === 0) return null;
  return (
    <div className="mt-10">
      <PricingCards
        plans={plans.data}
        renderAction={(plan) => (
          <Link
            to="/cadastro"
            className={
              plan.highlighted
                ? 'inline-flex h-11 w-full items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground'
                : 'inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong font-semibold'
            }
          >
            {plan.trialDays > 0
              ? `Testar ${plan.trialDays} dias grátis`
              : `Começar com o ${plan.name}`}
          </Link>
        )}
      />
    </div>
  );
}
