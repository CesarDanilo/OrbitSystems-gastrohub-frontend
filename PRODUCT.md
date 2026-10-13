# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Equipe do restaurante** (dono, gerente, atendente de balcão, garçom, cozinha): operam pedidos durante o serviço,
  em pé, com pressa, em tablet, notebook no balcão ou celular. Precisam lançar uma venda, ver um pedido novo, mudar um
  status ou fechar uma mesa em segundos.
- **Dono/gerente fora do pico:** configura cardápio, frete, pagamentos, equipe, estoque e plano; lê relatórios.
- **Cliente final:** pede pela loja do restaurante (`/s/<slug>`) ou pelo QR da mesa, quase sempre no celular.
- **Dono do SaaS:** administra restaurantes, planos e auditoria em `/platform-admin` (identidade separada, MFA).

## Product Purpose

SaaS white-label para hamburguerias, pizzarias e lanchonetes: canal próprio de vendas sem comissão por pedido
(loja online, QR na mesa), operação do salão e do balcão (PDV, mesas, comandas, caixa, cozinha em tempo real) e gestão
(cardápio com combos, estoque com ficha técnica, frete por CEP/distância, relatórios, crescimento). Sucesso: o
restaurante vende mais pelo próprio canal e opera o serviço sem travar.

## Positioning

Um único motor de pedidos para todos os canais (loja online, PDV, garçom, QR da mesa), com o mesmo cardápio e as
mesmas regras de preço calculadas no servidor; planos com preço contratado que não muda em silêncio.

## Operating Context

- Uso em horário de pico, com várias telas abertas (PDV no balcão, cozinha numa TV/tablet, pedidos no celular do
  dono).
- Atualização em tempo real por SSE, com polling de reserva.
- QR das mesas impresso.
- Pagamentos: dinheiro, cartão na entrega, Pix/cartão online via Mercado Pago do próprio restaurante (sandbox
  pendente).

## Capabilities and Constraints

- Stack fixa: React 19, TypeScript, Vite, TanStack Router e Query, Tailwind 4, kit próprio em `src/components/ui`,
  lucide-react. Sem shadcn/Radix.
- Permissões por papel (`useCan`) e funcionalidades por plano (`FeatureGate`); a navegação esconde o que o plano não
  tem.
- Preços e totais exibidos no frontend são prévia; a API recalcula.
- Imagens de produto: `imageUrl` opcional, upload pelo painel, convertido no servidor para WebP de até 1600 px. Não
  há variantes menores (pendente, backend).
- Nesta frente de trabalho: só frontend; backend, banco e contratos intocados.

## Brand Commitments

- Nome **Hamburguerias**, logo atual (`src/features/marketing/logo.tsx`).
- Identidade escura atual com acento laranja gastronômico; **dark é o tema padrão** do painel e o light deve ser
  completo (decisão do usuário, 13/10/2026).
- A loja do cliente continua clara, com a cor de cada restaurante (decisão do usuário, 13/10/2026).
- Referências dadas pelo usuário: painel light de catálogo com fotos e fatura à direita (organização), app de receitas
  dark com fotos e laranja (atmosfera). Princípios, não cópia. Qualidade de Linear/Stripe.
- Português do Brasil, valores em R$, datas brasileiras.

## Evidence on Hand

- Fotos de produto só onde o restaurante cadastrou. O seed de demonstração (Brasa) traz 7 fotos de banco de imagens;
  sem foto para refrigerante e para o produto da Bella.
- Não existem depoimentos, clientes reais nem métricas públicas: não inventar.

## Product Principles

1. Operação primeiro: no pico, cada tela responde "o que faço agora" sem procurar.
2. Um sistema, todas as telas: o mesmo vocabulário visual em PDV, cozinha, gestão e plataforma.
3. Verdade do servidor: o frontend nunca simula regra de negócio nem dado inexistente.
4. Celular é posto de trabalho, não versão reduzida.

## Accessibility & Inclusion

WCAG 2.1 AA: contraste nos dois temas, foco visível, alvos de toque ≥ 44 px nas ações operacionais, estados que não
dependem só de cor, respeito a `prefers-reduced-motion`.
