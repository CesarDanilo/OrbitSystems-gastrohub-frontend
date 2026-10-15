import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FEATURE_CATEGORIES,
  FEATURE_STATUS_LABEL,
  FEATURE_STATUSES,
  type FeatureDefinitionView,
  type FeatureStatus,
} from '@orbitsystems/gastrohub-contracts';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import {
  Badge,
  Button,
  Dialog,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Table,
  Td,
  Textarea,
  Th,
} from '../../components/ui';
import { platformQueries, usePlatformMutation } from './platform-api';

const STATUS_TONE = { AVAILABLE: 'success', BETA: 'warning', PLANNED: 'neutral' } as const;

/** Central catalog of features. "Planejada" never appears as available on the pricing page. */
export function PlatformFeaturesPage() {
  const query = useQuery(platformQueries.features);
  const [editing, setEditing] = useState<FeatureDefinitionView | null>(null);
  return (
    <>
      <PageHeader
        title="Funcionalidades"
        description="Catálogo técnico e estado real de implementação."
      />
      {query.isPending ? (
        <Skeleton className="h-96" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} />
      ) : (
        <Table label="Funcionalidades">
          <thead>
            <tr>
              <Th>Funcionalidade</Th>
              <Th>Categoria</Th>
              <Th>Estado</Th>
              <Th>Depende de</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {query.data.map((f) => (
              <tr key={f.key}>
                <Td>
                  <span className="font-semibold">{f.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.key} · {f.description}
                  </span>
                </Td>
                <Td>{f.category}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[f.status]}>{FEATURE_STATUS_LABEL[f.status]}</Badge>
                </Td>
                <Td>{f.dependsOn.join(', ') || '—'}</Td>
                <Td>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>
                    Editar
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <FeatureDialog feature={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function FeatureDialog({
  feature,
  onClose,
}: {
  feature: FeatureDefinitionView;
  onClose: () => void;
}) {
  const [name, setName] = useState(feature.name);
  const [description, setDescription] = useState(feature.description);
  const [category, setCategory] = useState(feature.category);
  const [status, setStatus] = useState<FeatureStatus>(feature.status);
  const save = usePlatformMutation(
    () => api.put(`/platform/features/${feature.key}`, { name, description, category, status }),
    'Funcionalidade atualizada',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={feature.key}
      footer={
        <Button
          block
          loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: onClose })}
        >
          Salvar
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Descrição">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Categoria">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {FEATURE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado" hint="Marque como disponível só o que está implementado e testado.">
          <Select value={status} onChange={(e) => setStatus(e.target.value as FeatureStatus)}>
            {FEATURE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FEATURE_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

export function PlatformAuditPage() {
  const [resource, setResource] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery(platformQueries.audit({ resource, page }));
  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Toda alteração administrativa, com responsável, motivo e antes/depois."
      />
      <Select
        aria-label="Recurso"
        className="mb-4 md:w-60"
        value={resource}
        onChange={(e) => {
          setResource(e.target.value);
          setPage(1);
        }}
      >
        <option value="">Tudo</option>
        <option value="Plan">Planos</option>
        <option value="Restaurant">Restaurantes</option>
        <option value="Feature">Funcionalidades</option>
      </Select>
      {query.isPending ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} />
      ) : (
        <>
          <ul className="space-y-2">
            {query.data.items.map((a) => (
              <li key={a.id} className="rounded-md border border-border bg-surface p-3 text-sm">
                <p>
                  <strong>{a.action}</strong> · {a.resource}{' '}
                  {a.resourceId && <code className="text-xs">{a.resourceId}</code>}
                </p>
                <p className="text-muted-foreground">
                  {a.adminEmail} · {formatDateTime(a.createdAt)} {a.reason && `· ${a.reason}`}
                </p>
                {(a.before != null || a.after != null) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-semibold">
                      Antes e depois
                    </summary>
                    <pre className="mt-1 max-h-60 overflow-auto rounded bg-surface-muted p-2 text-xs">
                      {JSON.stringify({ antes: a.before, depois: a.after }, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page * query.data.pageSize >= query.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
    </>
  );
}
