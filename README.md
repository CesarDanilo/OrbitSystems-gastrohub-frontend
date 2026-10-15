# GastroHub — frontend

SPA (React + Vite) do GastroHub: site, painel do restaurante, plataforma e a loja de cada cliente em `/s/:slug`.

1. `pnpm install` (os contratos vêm do GitHub Packages: exporte `NODE_AUTH_TOKEN` com `read:packages`).
2. Com o backend rodando na porta 3340: `pnpm dev` (porta 5180; `API_URL` muda o destino do proxy).

Qualidade: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
E2E: `cp .env.example .env`, clone o backend ao lado (ou defina `E2E_API_DIR`) e rode `pnpm test:e2e`.
