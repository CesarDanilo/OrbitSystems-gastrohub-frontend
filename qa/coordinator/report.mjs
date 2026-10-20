const STATUS_LABEL = {
  passed: '✅ passed',
  failed: '❌ failed',
  warning: '⚠️ warning',
  not_run: '⏭️ not_run',
};

export function formatDuration(ms) {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1).replace('.', ',')} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(Math.round(seconds % 60)).padStart(2, '0')} s`;
}

function commitLabel(commit, dirty, unavailable) {
  if (!commit) return `indisponível${unavailable ? ` (${unavailable})` : ''}`;
  return `\`${commit.slice(0, 12)}\`${dirty ? ' (com alterações locais não commitadas)' : ''}`;
}

function cell(text) {
  return String(text ?? '—')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

/** Fence that cannot be closed by the content (outputs may contain ```). */
function fenced(text) {
  return `\`\`\`\`text\n${text}\n\`\`\`\``;
}

const TEST_LABEL = {
  passed: '✅ passou',
  failed: '❌ falhou',
  flaky: '⚠️ instável (flaky)',
  skipped: '⏭️ ignorado',
};

const CLASSIFICATION_LABEL = {
  infra: 'infra (ambiente, banco, portas, servidores)',
  test: 'test (erro no código do teste)',
  product: 'product (comportamento do produto)',
  flaky: 'flaky (instável)',
  unknown: 'unknown (indeterminada)',
};

/** Evidence paths are relative to the run folder, where report.md lives. */
function evidenceLinks(files) {
  return files.length
    ? files.map((f) => `[${cell(f.split('/').at(-1))}](<${f}>)`).join('<br>')
    : '—';
}

function testRow(t) {
  return `| ${cell(t.title)} | ${cell(t.file)} | ${cell(t.project)} | ${TEST_LABEL[t.status]} | ${t.durationMs === null ? '—' : formatDuration(t.durationMs)} | ${t.retries ?? '—'} | ${t.classification ?? '—'} | ${evidenceLinks(t.evidence)} |`;
}

const TEST_HEADER = [
  '| Teste | Arquivo | Projeto | Status | Duração | Novas tentativas | Classificação sugerida | Evidências |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
];

/** Individual tests of a check (suites with a JSON reporter). */
function renderTests(c) {
  const out = [];
  const count = (status) => c.tests.filter((t) => t.status === status).length;
  out.push(
    `### Testes individuais — ${c.title}`,
    '',
    `Aprovados ${count('passed')} · Reprovados ${count('failed')} · Instáveis ${count('flaky')} · Ignorados ${count('skipped')} · Total ${c.tests.length}`,
    '',
  );
  const problems = c.tests.filter((t) => t.status === 'failed' || t.status === 'flaky');
  if (problems.length) {
    const byClass = new Map();
    for (const t of problems) {
      const key = t.classification ?? 'unknown';
      byClass.set(key, (byClass.get(key) ?? 0) + 1);
    }
    out.push('Falhas por classificação sugerida (para triagem; não muda o status):', '');
    for (const [key, n] of byClass) out.push(`- ${CLASSIFICATION_LABEL[key] ?? key}: ${n}`);
    out.push('', '#### Reprovados e instáveis', '', ...TEST_HEADER, ...problems.map(testRow), '');
    for (const t of problems) {
      if (t.error)
        out.push(`**${t.title}**${t.project ? ` (${t.project})` : ''}:`, '', fenced(t.error), '');
    }
  }
  const retried = c.tests.filter((t) => (t.retries ?? 0) > 0);
  if (retried.length) {
    out.push(
      `> ${retried.length} teste(s) tiveram novas tentativas feitas pela própria configuração do Playwright (o coordenador nunca repete uma suíte).`,
      '',
    );
  }
  out.push(
    '<details>',
    `<summary>Todos os ${c.tests.length} testes</summary>`,
    '',
    ...TEST_HEADER,
    ...c.tests.map(testRow),
    '',
    '</details>',
    '',
  );
  return out;
}

export function renderMarkdown(run) {
  const env = run.environment;
  const s = run.summary;
  const out = [
    `# Relatório de QA — ${run.runId}`,
    '',
    '| Campo | Valor |',
    '| --- | --- |',
    `| Execução | \`${run.runId}\` |`,
    `| Início (UTC) | ${run.startedAt} |`,
    `| Término (UTC) | ${run.finishedAt} |`,
    `| Duração total | ${formatDuration(run.durationMs)} |`,
    `| Commit do frontend | ${commitLabel(env.commitFront, env.frontDirty, 'não foi possível ler o Git')} |`,
    `| Commit do backend | ${commitLabel(env.commitBack, env.backDirty, env.backendStatus)} |`,
    `| Node.js | ${env.nodeVersion} |`,
    `| Sistema | ${env.platform} ${env.osRelease} (${env.arch}) |`,
    `| Gerenciador de pacotes | ${env.packageManager ?? 'não identificado'} |`,
    `| Agentes | ${run.requestedAgents.join(', ')} |`,
    '',
    `## Status geral: ${STATUS_LABEL[run.status]}${run.incomplete && run.status !== 'not_run' ? ' · execução incompleta' : ''} (código de saída ${run.exitCode})`,
    '',
  ];
  if (run.status === 'not_run') {
    out.push('> **Nenhuma verificação foi executada.** O resultado não indica aprovação.', '');
  } else if (run.incomplete) {
    const what =
      s.notRun > 0
        ? `${s.notRun} verificação(ões) não foram executadas`
        : 'um ou mais agentes não executaram verificações';
    const also = run.status === 'failed' ? ' Além disso, houve falhas (veja abaixo).' : '';
    out.push(
      `> **Execução incompleta:** ${what}. Verificações ausentes não contam como aprovadas.${also}`,
      '',
    );
  }
  for (const note of run.notes) out.push(`> ${note}`, '');

  out.push(
    '## Resumo',
    '',
    '| Aprovadas | Reprovadas | Com avisos | Não executadas | Total |',
    '| --- | --- | --- | --- | --- |',
    `| ${s.passed} | ${s.failed} | ${s.warning} | ${s.notRun} | ${s.total} |`,
    '',
  );

  for (const agent of run.agents) {
    out.push(
      `## Agente \`${agent.agent}\` — ${STATUS_LABEL[agent.status]} (${formatDuration(agent.durationMs)})`,
      '',
    );
    for (const note of agent.notes) out.push(`> ${note}`, '');
    if (agent.checks.length) {
      out.push(
        '| Verificação | Comando | Status | Duração | Código de saída | Resumo |',
        '| --- | --- | --- | --- | --- | --- |',
      );
      for (const c of agent.checks) {
        out.push(
          `| ${cell(c.title)} | \`${cell(c.command)}\` | ${STATUS_LABEL[c.status]} | ${c.status === 'not_run' ? '—' : formatDuration(c.durationMs)} | ${c.exitCode ?? '—'} | ${cell(c.summary ?? c.reason)} |`,
        );
      }
      out.push('');
    }

    const problems = agent.checks.filter((c) => c.status === 'failed' || c.status === 'warning');
    if (problems.length) {
      out.push('### Erros e avisos', '');
      for (const c of problems) {
        out.push(`#### ${STATUS_LABEL[c.status]} — ${c.title}`, '');
        out.push(`- Comando: \`${c.command}\``);
        if (c.error) out.push(`- Erro: ${c.error}`);
        if (c.classification)
          out.push(
            `- Classificação sugerida: ${CLASSIFICATION_LABEL[c.classification] ?? c.classification}`,
          );
        if (c.status === 'warning' && c.summary) out.push(`- Aviso: ${c.summary}`);
        if (c.logFile) out.push(`- Saída completa (com segredos mascarados): \`${c.logFile}\``);
        out.push('');
        if (c.outputTail) out.push('Últimas linhas da saída:', '', fenced(c.outputTail), '');
      }
    }

    for (const c of agent.checks) if (c.tests?.length) out.push(...renderTests(c));

    const withEvidence = agent.checks.filter((c) => c.evidence?.length);
    if (withEvidence.length) {
      out.push('### Evidências', '');
      for (const c of withEvidence) {
        out.push(`- **${c.title}** (${c.evidence.length} arquivo(s), relativos a esta pasta):`);
        for (const f of c.evidence) out.push(`  - [${f}](<${f}>)`);
      }
      out.push('');
    }

    const skipped = agent.checks.filter((c) => c.status === 'not_run');
    if (skipped.length) {
      out.push('### Não executadas', '');
      for (const c of skipped) {
        const kind = c.classification ? ` (classificação sugerida: ${c.classification})` : '';
        out.push(`- **${c.title}**: ${c.reason}${kind}`);
      }
      out.push('');
    }
  }
  return `${out.join('\n').trimEnd()}\n`;
}
