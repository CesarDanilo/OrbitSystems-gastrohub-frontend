---
name: Hamburguerias
description: Painel operacional de restaurantes — a passagem da cozinha à noite.
colors:
  background: '#12100e'
  foreground: '#ede9e4'
  surface: '#1a1715'
  surface-elevated: '#221e1b'
  surface-muted: '#2a2522'
  border: '#2e2926'
  border-strong: '#433c37'
  input: '#433c37'
  muted-foreground: '#a39d96'
  sidebar: '#0c0b0a'
  sidebar-foreground: '#c9c3bc'
  sidebar-active: '#241e1a'
  primary: '#f2711c'
  primary-foreground: '#1a0f08'
  primary-muted: '#3a1f0f'
  success: '#6fcf8e'
  warning: '#e8b04a'
  destructive: '#f2857b'
  destructive-foreground: '#1f0c0a'
  info: '#8ab4f0'
  focus-ring: '#8ab4f0'
  light-background: '#f7f5f2'
  light-foreground: '#1c1917'
  light-surface: '#ffffff'
  light-surface-muted: '#f1eeea'
  light-border: '#e6e1db'
  light-muted-foreground: '#5f5851'
  light-sidebar: '#efebe6'
  light-primary: '#c2410c'
  light-focus-ring: '#2563eb'
typography:
  headline:
    fontFamily: 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.375rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '-0.01em'
  title:
    fontFamily: 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.4
  metric:
    fontFamily: 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: 'tnum'
  body:
    fontFamily: 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: '6px'
  md: '10px'
  lg: '14px'
  xl: '20px'
  full: '9999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.md}'
    height: '44px'
    padding: '0 16px'
  button-secondary:
    backgroundColor: '{colors.surface-muted}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    height: '44px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    height: '44px'
    padding: '0 14px'
  nav-item-active:
    backgroundColor: '{colors.sidebar-active}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    height: '40px'
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.lg}'
    padding: '20px'
  chip-selected:
    backgroundColor: '{colors.primary-muted}'
    textColor: '{colors.primary}'
    rounded: '{rounded.full}'
    height: '36px'
---

# Design System: Hamburguerias

## Overview

**Creative North Star: "A Passagem da Cozinha"**

O painel é o balcão de passagem de uma cozinha à noite: grafite quente e silencioso, onde só a comida e a
próxima ação têm cor. Quem opera no pico precisa saber onde está e o que fazer agora sem procurar; o visual
existe para sumir na tarefa. A identidade mora nos detalhes: o tom quente dos neutros, o laranja de fogo
usado com parcimônia, as fotos dos produtos como única cor abundante.

O tema escuro é o padrão; o claro é uma versão completa em papel quente, com o mesmo vocabulário. A loja do
cliente é outra superfície: sempre clara e na cor de cada restaurante (`[data-surface=store]`).

**Key Characteristics:**

- Neutros quentes em quatro degraus (sidebar, fundo, superfície, superfície elevada).
- Um único acento (laranja) para ação primária, seleção e contagem de pedidos novos.
- Estados sempre com texto ou ícone, além da cor.
- Elevação por borda; sombra só em camadas flutuantes.
- Fotos de produto em proporção fixa com placeholder honesto quando faltam.

## Colors

Restrita: neutros quentes tingidos do mesmo marrom-grafite e um acento de fogo; verde, âmbar e vermelho só
carregam estado. Todos os pares de texto passam WCAG AA nos dois temas (verificado: texto secundário ≥ 5.6:1,
laranja sobre fundo ≥ 4.7:1).

### Primary

- **Laranja de Fogo** (#f2711c no escuro, #c2410c no claro): botão da ação principal da tela, item/categoria
  selecionado, contador de pedidos novos, barra de pico no gráfico, chip de quantidade sobre a foto no PDV.

### Neutral

- **Carvão** (#0c0b0a): sidebar.
- **Grafite Noturno** (#12100e): fundo da página.
- **Grafite** (#1a1715): superfícies e cards.
- **Grafite Elevado** (#221e1b): diálogos, sheets, toasts, item ativo do seletor segmentado.
- **Cinza Brasa** (#2a2522): superfície discreta (botão secundário, skeleton, chip neutro).
- **Fumaça** (#ede9e4): texto principal; **Cinza Quente** (#a39d96): texto secundário.

### Estado

- **Verde Sóbrio** (#6fcf8e), **Âmbar** (#e8b04a), **Vermelho Controlado** (#f2857b), **Azul** (#8ab4f0, também
  o anel de foco). Cada um tem a variante `-soft` para fundo de badge/alerta.

### Named Rules

**A Regra da Única Voz.** O laranja aparece só onde há algo a fazer ou algo escolhido. Em listas, a ação
repetida de cada item é secundária; só a urgente (confirmar pedido novo, iniciar preparo) usa laranja.

**A Regra da Cor que Fala.** Nenhum estado é comunicado só por cor: mesa "Ocupada", "atrasado", "Falta R$ 5,00",
"Conferido", entrada/saída com sinal e ícone.

## Typography

**Body Font:** Plus Jakarta Sans (com ui-sans-serif, system-ui). Uma família para tudo.

**Character:** sans geométrica amigável, legível em tela de balcão; números sempre tabulares.

### Hierarchy

- **Headline** (600, 22px, 1.25): título da página (`PageHeader`).
- **Title** (600, 16px): títulos de seção e de card.
- **Metric** (600, 24px, tabular): valores de indicador; 30px só para "dinheiro esperado na gaveta" e "pedidos
  em andamento".
- **Body** (400, 16px, 1.5): campos (16px evita zoom no iOS) e texto corrido.
- **Label** (500, 14px): rótulos, abas, chips, texto secundário.
- **Cozinha**: itens a 18px e número do pedido a 24px, para leitura à distância.

### Named Rules

**A Regra Sem Sobretítulo.** Nada de rótulo pequeno em caixa alta acima de títulos; o título carrega o próprio peso.

## Layout

App shell com sidebar fixa (16rem expandida, 4.5rem recolhida, preferência salva em `hamb-sidebar`) e conteúdo em
`max-w-7xl` com 16/24/32px de margem lateral. Abaixo de 1024px a sidebar vira drawer (`Drawer`, `<dialog>`).
Grades fluidas com `minmax(0,1fr)` e filhos `min-w-0`; nenhuma página rola para o lado entre 320 e 1440px.
Tabelas largas viram lista abaixo de 768px. Ritmo de espaço em múltiplos de 4px.

O PDV divide catálogo (grade de fotos 2→5 colunas) e pedido (painel fixo 22–24rem) no desktop; no celular o
catálogo vem primeiro e o pedido abre num bottom sheet a partir de uma barra de resumo.

## Elevation & Depth

Plano por padrão: profundidade por degraus tonais e borda de 1px. Sombra só em camadas que flutuam sobre o
conteúdo.

### Shadow Vocabulary

- **xs** (`0 1px 2px rgb(var(--shadow-color) / 0.08)`): item ativo do seletor segmentado.
- **md** (`0 8px 24px -8px rgb(var(--shadow-color) / 0.22)`): chip de quantidade e botão sobre a foto, tooltip.
- **lg** (`0 24px 48px -16px rgb(var(--shadow-color) / 0.38)`): diálogos, sheets, drawer, toasts.

### Named Rules

**A Regra da Elevação Única.** Um elemento declara borda ou sombra, nunca as duas para a mesma camada.

## Shapes

Raios 6 / 10 / 14 / 20px: controles 10px, cards e fotos 14px, sheets 20px no topo. Pílula só para chips de
categoria, badges e contadores. Estados vazios em área tracejada (`border-dashed`), não em card cheio.

## Components

### Buttons

- **Shape:** 10px; altura 44px (md) ou 52px (lg, ações finais do PDV e da cozinha).
- **Primary:** laranja com texto escuro (claro: texto branco); só a ação principal.
- **Secondary:** cinza brasa; ações repetidas e de apoio (Lançar, Sangria, Marcar como pronto).
- **Outline / Ghost / Danger:** borda forte; sem fundo; vermelho com texto escuro.
- **Estados:** hover por brilho/fundo, `active:scale-[0.98]`, foco com anel azul de 2px, carregando com spinner.

### Chips (categorias do PDV)

- Selecionado: fundo `primary-muted`, texto laranja. Não selecionado: texto secundário, fundo só no hover. No
  celular rolam na horizontal com fade na borda.

### Cards / Containers

- 14px, fundo `surface`, borda 1px `border`, sem sombra, padding 16–20px. Indicadores agrupados num único
  container com divisórias finas (`MetricGroup`), nunca uma fileira de cards iguais.

### Inputs / Fields

- 44px, 16px de texto, borda `input`, fundo `surface`; foco com anel azul; erro com borda vermelha e mensagem
  ligada por `aria-describedby`. Busca com botão de limpar e Esc.

### Navigation

- Sidebar em `sidebar`; item ativo com fundo `sidebar-active` e ícone laranja; recolhida mostra só ícones com
  tooltip (portal, hover e foco). Celular: barra superior com menu, drawer lateral que fecha com Esc, backdrop,
  X ou ao navegar.

### ProductImage (assinatura)

- Foto em proporção fixa (4:3 no catálogo, quadrada em miniaturas), `lazy` exceto as 8 primeiras. Sem foto ou
  com link quebrado: ícone de prato e inicial sobre `surface-muted`, com "Sem foto" para leitores de tela.
  No PDV, o chip laranja com a quantidade já no pedido fica sobre a foto.

## Do's and Don'ts

### Do:

- **Do** usar os tokens semânticos (`bg-surface`, `text-muted-foreground`, `bg-primary`…); nunca hex no componente.
- **Do** escrever o estado em texto além da cor.
- **Do** manter alvos de toque operacionais com 44px.
- **Do** usar `ProductImage` em qualquer lugar que mostre produto.
- **Do** usar `confirm()` do kit em vez de `window.confirm`.

### Don't:

- **Don't** pintar ações repetidas de laranja.
- **Don't** colocar sobretítulos, texto em gradiente, vidro decorativo ou faixa colorida lateral em cards.
- **Don't** aninhar caixas: conteúdo com containers próprios usa `Section variant="plain"`.
- **Don't** mostrar placeholder como se fosse foto, nem inventar URLs de imagem.
