# GastroHub — frontend

SPA (React + Vite) do GastroHub: site, painel do restaurante, plataforma e a loja de cada cliente em `/s/:slug`.
A API fica em [gastrohub-backend](https://github.com/OrbitSystems/gastrohub-backend).

1. Suba o backend (na pasta dele: `docker compose up -d --build`, API em :3340).
2. `pnpm install` e `pnpm dev` (http://localhost:5180; o proxy manda `/api` para :3340, `API_URL` muda o destino).

Qualidade: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
E2E: `cp .env.example .env`, deixe o backend clonado ao lado em `../gastrohub-backend` (ou defina `E2E_API_DIR`) e rode
`pnpm test:e2e`.

Regras de domínio e schemas compartilhados com o backend ficam em `src/contracts`; existe uma cópia igual no backend,
então ao mudar uma regra que existe nos dois lados, edite as duas.
