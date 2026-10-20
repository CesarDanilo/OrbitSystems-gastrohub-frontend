# QA do GastroHub — coordenador e agentes `code` e `functional`

A equipe de agentes de QA tem hoje um coordenador e dois agentes:

- `code`: qualidade do código do frontend (lint, formatação, typecheck, testes unitários, build);
- `functional`: testes de API do backend e testes E2E do frontend, contra o banco local `*_test`.

Os agentes visual e de performance ainda **não** existem. O agente `functional` só executa os
testes que já existem nos dois repositórios: ele não cria testes de produto.

## Como executar

```powershell
pnpm qa                               # agentes padrão (hoje: code)
pnpm qa --agents=code                 # só qualidade do código
pnpm qa --agents=functional           # só testes de API e E2E (migra e limpa o banco *_test)
pnpm qa --agents=code,functional      # os dois, nesta ordem
pnpm qa -- --agents=code              # mesma coisa; o "--" é aceito e ignorado
pnpm qa --help
pnpm qa:test                          # testes do próprio coordenador (runner nativo do Node)
```

`functional` não faz parte do padrão: ele recria os dados do banco de teste, então só roda quando
pedido. Um agente desconhecido (`--agents=visual`) é erro de uso, com código de saída 3. Os
mesmos comandos funcionam no PowerShell, no Linux e no CI.

## Pré-requisitos

Para o agente `code`: Node.js ≥ 22 (o CI usa 24), pnpm via corepack (`packageManager` do
`package.json`) e `pnpm install` no frontend. Não precisa de banco, backend, Docker nem `.env`.

Para o agente `functional`, além disso (o coordenador **não** faz nada disto sozinho: não sobe o
Docker, não instala dependências nem navegadores, não cria banco e não altera arquivos `.env`):

1. O backend clonado ao lado (`../gastrohub-backend`) ou indicado em `E2E_API_DIR`.
2. `pnpm install` no backend e no frontend.
3. O Chromium do Playwright: `pnpm exec playwright install chromium` no frontend.
4. O PostgreSQL de teste rodando, por exemplo `docker compose up -d postgres` no backend.
5. `TEST_DATABASE_URL` igual nos dois `.env` (ou definida uma vez no ambiente), apontando para um
   banco local cujo nome termina em `_test`, como no `.env.example` dos dois repositórios
   (`localhost:5442/gastrohub_test`).
6. As portas do E2E livres: 3341 (API) e 5181 (web), lidas do `playwright.config.ts`.

## Proteção do banco de teste

Os testes existentes alteram o banco: os testes de API aplicam migrations (`prisma migrate
deploy`), e o `globalSetup` do E2E aplica migrations, faz TRUNCATE de todas as tabelas e roda o
seed. Por isso, antes de qualquer teste, o agente `functional` prova que as duas suítes vão usar o
**mesmo banco local de teste**. A execução é recusada (verificações `not_run`, código de saída 2)
se qualquer regra falhar:

- a URL tem de ser PostgreSQL válida (`postgresql://` ou `postgres://`);
- o host tem de ser exatamente `localhost`, `127.0.0.1` ou `::1`. Hosts remotos são recusados
  mesmo quando o nome do banco termina em `_test`;
- o nome do banco tem de terminar em `_test` (por exemplo `gastrohub_test`; `gastrohub_testing`
  não serve);
- parâmetros de conexão que poderiam mudar o destino (como `host=`) são recusados; só são aceitos
  `schema`, `sslmode`, `connect_timeout`, `application_name`, `connection_limit` e `pool_timeout`;
- o valor usado pelo frontend e pelo backend tem de ser idêntico. A variável de ambiente vence os
  `.env` (o `process.loadEnvFile` dos testes nunca sobrescreve uma variável já definida); quando
  ela não existe, valem os `.env` de cada repositório, que precisam ser iguais;
- o PostgreSQL precisa aceitar conexão TCP nesse host e porta, antes dos testes de API e de novo
  antes do E2E.

A URL nunca aparece no terminal, nos logs nem nos relatórios. O alvo é mostrado só como
`host:porta/banco`, por exemplo `localhost:5442/gastrohub_test`. A URL validada chega aos testes
apenas pelo ambiente do processo filho (`TEST_DATABASE_URL` e `DATABASE_URL`), nunca como
argumento de linha de comando.

### Trava de concorrência

Antes dos testes, o agente cria uma trava exclusiva por banco em
`<pasta temporária do sistema>/gastrohub-qa-<host>-<porta>-<banco>.lock` (criação atômica), com
o PID, a máquina, o `runId` e o horário. Ela é liberada no fim da execução, mesmo após falhas.

Se a trava já existir, a execução é recusada, seja ela de outra execução ativa, de outra máquina,
ilegível ou órfã (o processo dono não existe mais). O agente **nunca** apaga uma trava que não é
dele: para uma trava órfã, confirme que nenhum `pnpm qa` está rodando e apague o arquivo.

**Limitação:** a trava só coordena execuções do `pnpm qa`. Um `pnpm test` no backend ou um
`pnpm test:e2e` manual ao mesmo tempo não é bloqueado. Não rode as duas coisas juntas: as duas
suítes usam o mesmo banco.

### Provedores externos

Os testes rodam com o ambiente do processo filho ajustado (o ambiente do PowerShell, do usuário e
do próprio coordenador não muda):

- forçados: `NODE_ENV=test`, `ANTHROPIC_API_KEY` vazio, `BILLING_PROVIDER=none`,
  `WHATSAPP_PROVIDER=console`, `PAYMENT_PROVIDER=fake`;
- removidos: `ASAAS_*`, `WHATSAPP_ACCESS_TOKEN`, `METRICS_TOKEN`.

Como definir uma variável não basta, o agente também confere no código do backend que, com esses
valores, só são criados provedores falsos ou locais (`src/config/env.ts`, `src/container.ts`), que
o seed não cria contas de gateway de pagamento e que nenhum E2E usa fluxos de gateway de pagamento
ou de CEP. Se alguma regra mudar, a execução é bloqueada até revisão. O servidor do E2E continua
com o provedor real de CEP (BrasilAPI/ViaCEP), mas nenhum E2E atual consulta CEP.

## Agente `code` (`agents/code.mjs`)

Roda, nesta ordem, os scripts que já existem no `package.json`:

| Verificação          | Script         | Observação                                                                     |
| -------------------- | -------------- | ------------------------------------------------------------------------------ |
| `frontend-lint`      | `lint`         | Avisos do ESLint (código de saída 0) viram `warning`                           |
| `frontend-format`    | `format:check` | Só verifica; nunca usa `format` (que escreve)                                  |
| `frontend-typecheck` | `typecheck`    |                                                                                |
| `frontend-test`      | `test`         | Vitest (unitários e componentes); **não** roda E2E                             |
| `frontend-build`     | `build`        | Depende do typecheck (o próprio `build` roda `tsc`): é `not_run` se ele falhar |

Por segurança, um script cuja definição pareça escrever arquivos, mexer no banco ou rodar E2E
(`--write`, `--fix`, `migrate`, `seed`, `reset`, `playwright`, `rimraf`, `rm -`, `del `) não é
executado pelo agente `code`: fica `not_run` com o motivo.

## Agente `functional` (`agents/functional.mjs`)

Verificações, nesta ordem e uma de cada vez:

| Verificação                 | O que faz                                                                |
| --------------------------- | ------------------------------------------------------------------------ |
| `functional-db-guard`       | valida o banco de teste (regras acima)                                   |
| `functional-providers`      | confirma que os provedores externos ficam desligados                     |
| `functional-backend-setup`  | backend presente, dependências instaladas, arquivos usados pelos testes  |
| `functional-frontend-setup` | Playwright, Vite, Chromium e `playwright.config.ts` com o relatório JSON |
| `functional-postgres`       | o PostgreSQL de teste aceita conexão                                     |
| `functional-ports`          | portas da API e do web do E2E livres                                     |
| `functional-lock`           | cria a trava exclusiva do banco                                          |
| `backend-api-tests`         | `pnpm run test` no backend, com reporter JSON do Vitest                  |
| `functional-pre-e2e`        | antes do E2E: banco ainda acessível e portas ainda livres                |
| `frontend-e2e`              | `pnpm run test:e2e` no frontend (desktop e mobile), com reporter JSON    |

Regras:

- Uma pré-checagem que falha deixa como `not_run` (classificação `infra`) as verificações que
  dependem dela, com o motivo. Nenhuma suíte roda sem a guarda do banco, a checagem de provedores
  e a trava.
- Os testes de API rodam primeiro. O E2E roda depois, **mesmo que a API tenha falhado**, desde
  que as proteções continuem válidas.
- Os scripts existentes são usados como estão, e o agente confere que continuam iguais
  (`vitest run` e `playwright test`). Se mudarem, a suíte fica `not_run` até revisão.
- Os argumentos do reporter do Vitest (`--reporter=default --reporter=json
--outputFile.json=<arquivo>`) são passados depois do nome do script, sem shell e sem alterar o
  `package.json` do backend. O Playwright grava o JSON quando o agente define `QA_RUN_DIR` no
  processo filho.
- Os relatórios brutos dos reporters ficam numa pasta temporária, que é apagada no fim: o JSON do
  Playwright inclui a configuração dos servidores, com as variáveis de ambiente.
- Nenhuma suíte é repetida para detectar intermitência. Só o reporter do Playwright indica um
  teste instável (`flaky`), quando a própria configuração do projeto faz uma nova tentativa (hoje,
  apenas com `CI` definido).
- Tempo limite: 30 minutos para os testes de API e 40 minutos para o E2E.

### Classificação de falhas

Cada teste reprovado recebe uma **sugestão** de causa, para triagem humana. Ela nunca muda o
status nem o código de saída.

| Classificação | Quando                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `infra`       | `ECONNREFUSED`, `EADDRINUSE`, Prisma `P1001`/`P1000`, falha do `webServer` ou do `globalSetup`, navegador |
| `test`        | `TypeError`/`ReferenceError`/`SyntaxError` lançado no código do teste ou helper; seletor ambíguo (strict) |
| `product`     | uma expectativa explícita falhou na própria mensagem de erro (`expect(...)`, `Expected`/`Received`)       |
| `flaky`       | só quando o Playwright informa que o teste falhou e passou numa nova tentativa                            |
| `unknown`     | qualquer outro caso, como timeouts, ou quando há dúvida                                                   |

Uma pré-checagem que impede a execução aparece como `not_run` com classificação `infra`.

## Onde ficam os relatórios e as evidências

Cada execução cria uma pasta nova, que nunca sobrescreve as anteriores:

```
qa/results/<runId>/
  report.md            relatório legível
  run.json             dados estruturados (validados contra qa/schema/qa-run.schema.json)
  logs/<check>.log     saída completa de cada verificação, com segredos mascarados
  evidence/e2e/...     evidências do E2E, com a mesma estrutura de test-results/
```

O `runId` tem o formato `qa-AAAAMMDD-HHMMSS-<commit>-<aleatório>`, com horário UTC. A pasta
`qa/results` fica fora do Git (só o `.gitkeep` é versionado) e fora do Prettier.

Para os testes do E2E que falham, o Playwright guarda screenshot, vídeo e trace em
`test-results/`. O agente copia para `evidence/e2e/` os screenshots, os vídeos e o contexto do
erro (`error-context.md`, com segredos mascarados). Os caminhos no relatório e no `run.json` são
relativos à pasta da execução. **Não são anexados:**

- traces (`trace.zip`), porque contêm as senhas de teste e os cookies de sessão. Para examinar um
  trace, rode o E2E manualmente e use `pnpm exec playwright show-trace`;
- nenhum arquivo dos specs que mostram segredos de MFA na tela (hoje, `platform.spec.ts`);
- arquivos de execuções anteriores, de tipos desconhecidos ou grandes demais.

O relatório diz quantos arquivos ficaram de fora e por quê.

### Conteúdo do relatório

- status geral, código de saída e aviso de execução incompleta;
- commits do frontend e do backend (com indicação de alterações locais), ambiente, início, fim e
  duração;
- resumo e tabela das verificações de cada agente;
- erros e avisos com as últimas linhas da saída e a classificação sugerida;
- testes individuais: contagens, reprovados e instáveis (arquivo, projeto desktop/mobile, duração,
  novas tentativas, classificação, evidências), falhas por classificação e a lista completa;
- evidências, verificações não executadas com o motivo, riscos e limitações.

O `run.json` traz os mesmos dados (`schemaVersion: 2`). Cada verificação pode ter `tests[]`,
`evidence[]` e `classification`. Um relatório da versão 1 continua válido no mesmo schema. Campos
que o reporter não fornece ficam `null` (por exemplo, o Vitest não informa novas tentativas).

### Codificação

`report.md`, `run.json` e os logs são gravados em UTF-8 sem BOM. O PowerShell 5.1 lê esses
arquivos como ANSI por padrão e mostra os acentos quebrados. Para ler corretamente:

```powershell
Get-Content -Encoding UTF8 .\qa\results\<runId>\report.md
```

O VS Code e o PowerShell 7 já leem UTF-8 sem configuração.

## Como interpretar os status

| Status    | Verificação                                 | Agente / execução                                            |
| --------- | ------------------------------------------- | ------------------------------------------------------------ |
| `passed`  | o comando terminou com código 0             | todas as verificações rodaram e passaram                     |
| `failed`  | código ≠ 0, erro ao iniciar ou tempo limite | ao menos uma verificação executada falhou                    |
| `warning` | passou, mas com avisos relevantes           | sem falhas, mas há avisos **ou** verificações não executadas |
| `not_run` | não executada (o motivo é registrado)       | nada foi executado                                           |

Uma verificação ausente nunca conta como aprovada. Testes instáveis deixam a verificação como
`warning`. Uma suíte que termina com código 0 mas cujo relatório registra testes reprovados fica
`failed`.

A política de código de saída é determinística, avaliada nesta ordem:

| Código de saída | Quando                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| 3               | erro de uso (argumento ou agente inválido) ou do coordenador, incluindo resultado fora do schema; vence todos |
| 1               | ao menos uma verificação falhou, mesmo que outras não tenham sido executadas                                  |
| 2               | nenhuma falha, mas a execução está incompleta ou nenhuma verificação foi executada                            |
| 0               | execução completa sem falhas (`passed` ou `warning` só com avisos não bloqueantes)                            |

Quando há falhas **e** verificações não executadas, o código é 1, o status geral é `failed` e a
execução também fica marcada como incompleta (`incomplete: true` no `run.json`, "execução
incompleta" no cabeçalho do relatório e no terminal).

## Regras gerais de execução

- Cada verificação roda uma única vez, em sequência: não há nova tentativa que transforme falha
  em sucesso.
- Uma falha é registrada e as verificações independentes seguintes continuam rodando.
- Tempo limite padrão de 20 minutos por verificação. Ao estourar, o comando e os subprocessos dele
  são encerrados: no Windows com `taskkill /T /F`; no Linux/macOS o comando roda no próprio grupo
  de processos, que recebe SIGTERM e, 5 s depois, SIGKILL. Um Ctrl+C no coordenador também
  encerra os comandos em andamento.
- Os agentes não corrigem código, não instalam pacotes e não alteram `.env`, Docker ou workflows.

## Privacidade

A saída mostrada ao vivo no terminal, os logs, o `run.json`, o relatório, as evidências de texto
e as mensagens de erro interno passam por uma máscara. Ela troca por `***`:

- senhas em URLs;
- tokens `Bearer`;
- valores de `*SECRET*`, `*TOKEN*`, `*PASSWORD*` e `*API_KEY*`;
- tokens conhecidos (GitHub, Anthropic).

O relatório mostra só as últimas linhas de cada falha. O ambiente dos processos nunca é impresso
nem gravado.

## Arquitetura

```
qa/
  coordinator/
    run.mjs           CLI: argumentos, ambiente, execução dos agentes, gravação dos resultados
    checks.mjs        execução sequencial de verificações e regras de status
    exec.mjs          execução de comandos (sem shell sob pnpm), tempo limite, máscara de segredos
    db-guard.mjs      validação do banco de teste, conexão TCP e trava de concorrência
    report.mjs        relatório Markdown
    schema-check.mjs  validador mínimo do schema (sem dependências)
  agents/
    index.mjs         registro dos agentes e agentes padrão
    code.mjs          agente de qualidade do código
    functional.mjs    agente de testes de API e E2E
  schema/qa-run.schema.json
  test/*.test.mjs     testes do coordenador e dos agentes (node:test, sem banco real)
  results/            saídas das execuções (ignoradas pelo Git)
```

Tudo é JavaScript ESM com módulos nativos do Node.js, sem dependências novas. O coordenador lê os
commits dos dois repositórios (o backend é procurado em `E2E_API_DIR` ou em
`../gastrohub-backend`), executa os agentes pedidos um após o outro, recalcula o status de cada
um a partir das verificações, valida o resultado contra o schema e grava o `run.json` e o
`report.md`. Ele não inicia servidores por conta própria, não altera o ambiente do usuário, não
acessa serviços externos e não faz nada no GitHub.

## Como adicionar um agente

1. Crie `qa/agents/<nome>.mjs` exportando `name`, `description` e `run(context)`.
   - O `context` traz `runId`, `runDir`, `root`, `backendDir`, `environment`, `now`,
     `saveLog(id, texto)`, `onOutput` e `onCheckStart`.
   - O `run` deve devolver um resultado de agente no formato de `$defs.agent` do schema.
   - Para rodar comandos, use `runChecks` (`coordinator/checks.mjs`) e `runCommand`
     (`coordinator/exec.mjs`), que já tratam dependências, scripts ausentes, tempo limite,
     diretório e ambiente por verificação e segredos.
2. Registre o agente em `qa/agents/index.mjs` (e em `DEFAULT_AGENTS`, se ele for seguro para rodar
   sempre).
3. Adicione testes em `qa/test/`.
