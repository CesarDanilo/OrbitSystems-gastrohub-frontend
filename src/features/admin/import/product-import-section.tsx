import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Download, FileUp, RefreshCw } from 'lucide-react';
import type { ProductInput } from '@orbitsystems/gastrohub-contracts';
import { api, errorMessage } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { formatBRL } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { Alert, Badge, Button, Section, Switch } from '../../../components/ui';
import { ProductImage } from '../../../components/product-image';
import { useCan, useSession } from '../../auth/session';
import { adminQueries, type AdminCategory, type AdminProduct } from '../api';
import { importTemplateCsv, readImportFile, type ImportRow } from './product-import';

const key = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Keeps what the import does not touch (options, availability, combo) when updating. */
function updateInput(p: AdminProduct, row: ImportRow, categoryId: string): ProductInput {
  return {
    name: row.name,
    description: row.description ?? p.description,
    priceCents: row.priceCents!,
    imageUrl: row.imageUrl ?? p.imageUrl,
    categoryId,
    active: row.active,
    featured: row.featured,
    availableDays: p.availableDays,
    availableFrom: p.availableFrom,
    availableTo: p.availableTo,
    optionGroups: p.optionGroups.map((g) => ({
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        name: o.name,
        priceCents: o.priceCents,
        available: o.available,
      })),
    })),
    isCombo: p.isCombo,
    allowCoupons: p.allowCoupons,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    comboItems: p.comboItems.map((c) => ({
      productId: c.componentProductId,
      quantity: c.quantity,
    })),
  };
}

interface Result {
  created: number;
  updated: number;
  skipped: number;
  failed: { line: number; name: string; message: string }[];
}

/**
 * Import products from another system: CSV (recommended) or XML. Categories that do not exist
 * are created; products with the same name are updated (optional) or skipped.
 */
export function ProductImportSection() {
  const session = useSession();
  const rid = session.restaurant.id;
  const { can } = useCan();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [existing, setExisting] = useState<Map<string, AdminProduct>>(new Map());
  const [readError, setReadError] = useState<string | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const canWrite = can('catalog:write');

  const valid = rows?.filter((r) => r.errors.length === 0) ?? [];
  const invalid = rows?.filter((r) => r.errors.length > 0) ?? [];
  const toUpdate = valid.filter((r) => existing.has(key(r.name)));
  const toCreate = valid.length - toUpdate.length;
  const willImport = updateExisting ? valid.length : toCreate;

  const onFile = async (file: File) => {
    setResult(null);
    setReadError(null);
    setFileName(file.name);
    if (file.size > 5 * 1024 * 1024) {
      setRows(null);
      return setReadError('O arquivo pode ter no máximo 5 MB.');
    }
    try {
      const text = await file.text();
      const parsed = readImportFile(file.name, text);
      if (parsed.length === 0)
        throw new Error(
          'Nenhum produto encontrado. Confira se a primeira linha tem os nomes das colunas.',
        );
      if (parsed.length > 1000) throw new Error('Importe no máximo 1000 produtos por arquivo.');
      const products = await queryClient.fetchQuery(adminQueries.products(rid));
      setExisting(new Map(products.map((p) => [key(p.name), p])));
      setRows(parsed);
    } catch (error) {
      setRows(null);
      setReadError(error instanceof Error ? error.message : 'Não foi possível ler o arquivo.');
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(
      new Blob([importTemplateCsv()], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-importacao-produtos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const run = async () => {
    stopRef.current = false;
    const out: Result = { created: 0, updated: 0, skipped: 0, failed: [] };
    const work = valid.filter((r) => updateExisting || !existing.has(key(r.name)));
    out.skipped = valid.length - work.length;
    setProgress({ done: 0, total: work.length });
    try {
      const categories = await queryClient.fetchQuery(adminQueries.categories(rid));
      const categoryIds = new Map(categories.map((c) => [key(c.name), c.id]));
      for (const name of new Set(work.map((r) => r.category))) {
        if (categoryIds.has(key(name))) continue;
        const created = await api.post<AdminCategory>('/admin/categories', { name });
        categoryIds.set(key(name), created.id);
      }
      for (const [index, row] of work.entries()) {
        if (stopRef.current) {
          out.skipped += work.length - index;
          break;
        }
        const categoryId = categoryIds.get(key(row.category))!;
        const current = existing.get(key(row.name));
        try {
          if (current) {
            await api.put(`/admin/products/${current.id}`, updateInput(current, row, categoryId));
            out.updated++;
          } else {
            await api.post('/admin/products', {
              name: row.name,
              description: row.description,
              priceCents: row.priceCents,
              imageUrl: row.imageUrl,
              categoryId,
              active: row.active,
              featured: row.featured,
            });
            out.created++;
          }
        } catch (error) {
          out.failed.push({ line: row.line, name: row.name, message: errorMessage(error) });
        }
        setProgress({ done: index + 1, total: work.length });
      }
    } catch (error) {
      out.failed.push({ line: 0, name: 'Categorias', message: errorMessage(error) });
    } finally {
      await Promise.all(
        [
          queryKeys.admin.products(rid),
          queryKeys.admin.categories(rid),
          queryKeys.admin.usage(rid),
          queryKeys.store(session.restaurant.slug),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      setProgress(null);
      setRows(null);
      setFileName(null);
      setResult(out);
    }
  };

  return (
    <Section
      title="Importar produtos"
      description="Traga o cardápio de outro sistema de uma vez, por planilha CSV ou arquivo XML."
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Recomendado: exporte os produtos do sistema antigo como <strong>CSV</strong> (todo sistema
          e planilha gera) com as colunas <code className="text-foreground">nome</code>,{' '}
          <code className="text-foreground">categoria</code> e{' '}
          <code className="text-foreground">preco</code>. Descrição, link da foto, ativo e destaque
          são opcionais. Nomes de coluna em inglês também são reconhecidos. Categorias que não
          existem são criadas; complementos você ajusta depois em cada produto.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            leftIcon={<Download aria-hidden className="size-4" />}
            onClick={downloadTemplate}
          >
            Baixar modelo CSV
          </Button>
          <Button
            leftIcon={<FileUp aria-hidden className="size-4" />}
            onClick={() => inputRef.current?.click()}
            disabled={!canWrite || progress !== null}
          >
            Escolher arquivo
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,.xml,text/csv,application/xml,text/xml"
            className="sr-only"
            aria-label="Arquivo de produtos (CSV ou XML)"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = '';
            }}
          />
        </div>
        {!canWrite && (
          <Alert tone="info">Só quem pode editar o cardápio consegue importar produtos.</Alert>
        )}
        {readError && (
          <Alert tone="danger" title={fileName ?? undefined}>
            {readError}
          </Alert>
        )}

        {rows && !progress && (
          <div className="space-y-4 border-t border-border pt-4">
            <p className="text-sm">
              <span className="font-medium">{fileName}</span>:{' '}
              <span className="tabular">{rows.length}</span> linhas ·{' '}
              <span className="text-success tabular">{toCreate} novos</span> ·{' '}
              <span className="tabular">{toUpdate.length} já existem</span>
              {invalid.length > 0 && (
                <>
                  {' '}
                  · <span className="text-destructive tabular">{invalid.length} com erro</span>
                </>
              )}
            </p>
            {toUpdate.length > 0 && (
              <Switch
                checked={updateExisting}
                onChange={setUpdateExisting}
                label="Atualizar os produtos que já existem"
                description="Pelo nome. Preço, categoria, descrição e foto vêm do arquivo; complementos são mantidos."
              />
            )}
            <ul
              aria-label="Prévia da importação"
              className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border"
            >
              {rows.slice(0, 200).map((row) => {
                const exists = existing.has(key(row.name));
                return (
                  <li key={row.line} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <ProductImage
                      src={row.imageUrl}
                      name={row.name || '?'}
                      size="sm"
                      className="size-10 shrink-0 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{row.name || '(sem nome)'}</p>
                      <p className="truncate text-muted-foreground">
                        Linha {row.line} · {row.category}
                        {row.errors.length > 0 && (
                          <span className="text-destructive"> · {row.errors.join(', ')}</span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular">
                      {row.priceCents === null ? '—' : formatBRL(row.priceCents)}
                    </span>
                    <Badge
                      tone={row.errors.length > 0 ? 'danger' : exists ? 'neutral' : 'success'}
                      className="shrink-0"
                    >
                      {row.errors.length > 0
                        ? 'Erro'
                        : exists
                          ? updateExisting
                            ? 'Atualizar'
                            : 'Ignorar'
                          : 'Novo'}
                    </Badge>
                  </li>
                );
              })}
            </ul>
            {rows.length > 200 && (
              <p className="text-sm text-muted-foreground">
                Mostrando 200 de {rows.length} linhas; todas serão importadas.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void run()} disabled={willImport === 0}>
                Importar {willImport} {willImport === 1 ? 'produto' : 'produtos'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRows(null);
                  setFileName(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {progress && (
          <div className="space-y-2 border-t border-border pt-4" aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-medium">
              <RefreshCw aria-hidden className="size-4 animate-spin" />
              Importando {progress.done} de {progress.total}…
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-label="Progresso da importação"
              className="h-2 overflow-hidden rounded-full bg-surface-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => (stopRef.current = true)}>
              Parar
            </Button>
          </div>
        )}

        {result && (
          <div
            role="status"
            className={cn(
              'rounded-lg border p-4 text-sm',
              result.failed.length > 0 ? 'border-warning/50' : 'border-success/50',
            )}
          >
            <p className="flex items-center gap-2 font-medium">
              {result.failed.length > 0 ? (
                <CircleAlert aria-hidden className="size-4 text-warning" />
              ) : (
                <CircleCheck aria-hidden className="size-4 text-success" />
              )}
              Importação concluída: {result.created} criados, {result.updated} atualizados
              {result.skipped > 0 && `, ${result.skipped} ignorados`}
              {result.failed.length > 0 && `, ${result.failed.length} com erro`}.
            </p>
            {result.failed.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-muted-foreground">
                {result.failed.map((f) => (
                  <li key={`${f.line}-${f.name}`}>
                    {f.line > 0 && `Linha ${f.line} · `}
                    <span className="text-foreground">{f.name}</span>: {f.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
