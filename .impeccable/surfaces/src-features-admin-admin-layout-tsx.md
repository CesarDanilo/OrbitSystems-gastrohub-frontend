---
version: 1
slug: 'src-features-admin-admin-layout-tsx'
primary_target: 'src/features/admin/admin-layout.tsx'
related_targets:
  ['src/features/admin/pos/pos-page.tsx', 'src/features/platform/platform-layout.tsx']
---

Scope: painel do restaurante (/admin) e a área da plataforma; modo Operate. Loja do cliente fora (continua clara).

Audience/task: equipe em serviço, lançando e acompanhando pedidos; dono configurando fora do pico.

## Direction contract

THESIS: O painel é a "passagem" da cozinha à noite: grafite quente e silencioso, onde só a comida e a próxima ação têm cor. Recusa o dashboard genérico de cards iguais com laranja espalhado em tudo.

OWN-WORLD: Fundo quase preto quente, sidebar um degrau mais escura, superfícies grafite em dois níveis, bordas raras. Um laranja de fogo (#f2711c no dark, #c2410c no light) só para ação primária, seleção e contagem de novos pedidos. Fotos de comida como única cor abundante. Plus Jakarta Sans em escala fixa, números tabulares. Light completo em papel quente, mesmo vocabulário.

STORY: Quem chega sabe onde está (sidebar com item ativo claro), vê o que exige ação (contagem de pedidos novos) e age sem procurar. No PDV encontra pela foto, toca, ajusta e cobra.

FIRST VIEWPORT: Sidebar à esquerda (expandida 16rem, recolhida 4.5rem só ícones com tooltip), conteúdo com cabeçalho compacto (título 22px, ação principal à direita). No PDV: catálogo em grade de fotos 4:3 à esquerda, ticket do pedido fixo à direita (24rem) com total e ação de cobrar no rodapé.

FORM: direção fixada pelo brief do usuário (dark padrão, laranja gastronômico, fotos, organização da referência 2). Sinal próprio: o contador de quantidade sobre a foto do produto já no pedido, que liga o catálogo ao ticket. seed: none (direção fixada pelo brief, roll não executado)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
