import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, errorMessage } from '../../lib/api';
import { Alert, Button, Checkbox, Dialog, Field, Textarea, toast } from '../../components/ui';
import { platformKeys, usePlatformMutation } from './platform-api';

interface UserActionProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Motivo" hint="Obrigatório. Fica registrado na auditoria.">
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
    </Field>
  );
}

/**
 * Blocks the person in every company. When they are the only active owner of a company the API
 * refuses with SOLE_OWNER and the dialog asks for an explicit confirmation before retrying.
 */
export function BlockUserDialog({ userId, userName, onClose }: UserActionProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [soleOwnerOf, setSoleOwnerOf] = useState<{ id: string; name: string }[] | null>(null);
  const [understood, setUnderstood] = useState(false);
  const block = useMutation({
    mutationFn: (confirmSoleOwner: boolean) =>
      api.post(`/platform/users/${userId}/block`, {
        reason: reason.trim(),
        ...(confirmSoleOwner ? { confirmSoleOwner: true } : {}),
      }),
    onSuccess: () => {
      toast.success('Usuário bloqueado');
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'SOLE_OWNER') {
        const details = error.details as { restaurants?: { id: string; name: string }[] };
        setSoleOwnerOf(details?.restaurants ?? []);
        return;
      }
      toast.error(errorMessage(error));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: platformKeys.all }),
  });
  const valid = reason.trim().length >= 5;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Bloquear ${userName}`}
      description="O acesso é encerrado na hora, em todas as empresas. Nenhum dado é apagado."
      footer={
        soleOwnerOf ? (
          <Button
            block
            variant="danger"
            disabled={!valid || !understood}
            loading={block.isPending}
            onClick={() => block.mutate(true)}
          >
            Bloquear mesmo assim
          </Button>
        ) : (
          <Button
            block
            variant="danger"
            disabled={!valid}
            loading={block.isPending}
            onClick={() => block.mutate(false)}
          >
            Bloquear usuário
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <ReasonField value={reason} onChange={setReason} />
        {soleOwnerOf && (
          <>
            <Alert tone="warning" title="Único dono ativo">
              {soleOwnerOf.map((r) => r.name).join(', ')} ficará sem ninguém para administrar.
            </Alert>
            <Checkbox
              label="Entendo que a empresa ficará sem dono ativo"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
          </>
        )}
      </div>
    </Dialog>
  );
}

export function UnblockUserDialog({ userId, userName, onClose }: UserActionProps) {
  const [reason, setReason] = useState('');
  const run = usePlatformMutation(
    () => api.post(`/platform/users/${userId}/unblock`, { reason: reason.trim() }),
    'Usuário desbloqueado',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Desbloquear ${userName}`}
      description="A pessoa volta a conseguir entrar com a senha atual."
      footer={
        <Button
          block
          disabled={reason.trim().length < 5}
          loading={run.isPending}
          onClick={() => run.mutate(undefined, { onSuccess: onClose })}
        >
          Desbloquear
        </Button>
      }
    >
      <ReasonField value={reason} onChange={setReason} />
    </Dialog>
  );
}

export function RevokeSessionsDialog({ userId, userName, onClose }: UserActionProps) {
  const [reason, setReason] = useState('');
  const run = usePlatformMutation(
    () => api.post(`/platform/users/${userId}/revoke-sessions`, { reason: reason.trim() }),
    'Sessões encerradas',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Desconectar ${userName}`}
      description="Encerra o acesso em todos os aparelhos. A pessoa pode entrar de novo com a senha."
      footer={
        <Button
          block
          disabled={reason.trim().length < 5}
          loading={run.isPending}
          onClick={() => run.mutate(undefined, { onSuccess: onClose })}
        >
          Encerrar sessões
        </Button>
      }
    >
      <ReasonField value={reason} onChange={setReason} />
    </Dialog>
  );
}

/** The temporary password exists only in this dialog: it is never stored or shown again. */
export function ResetPasswordDialog({ userId, userName, onClose }: UserActionProps) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState<string | null>(null);
  const run = usePlatformMutation((input: { reason: string }) =>
    api.post<{ temporaryPassword: string }>(`/platform/users/${userId}/reset-password`, input),
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Redefinir senha de ${userName}`}
      description="Gera uma senha temporária e desconecta todos os aparelhos. No próximo acesso a pessoa escolhe uma senha nova."
      footer={
        password ? (
          <Button block variant="outline" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <Button
            block
            disabled={reason.trim().length < 5}
            loading={run.isPending}
            onClick={() =>
              run.mutate(
                { reason: reason.trim() },
                { onSuccess: (r) => setPassword(r.temporaryPassword) },
              )
            }
          >
            Gerar senha temporária
          </Button>
        )
      }
    >
      {password ? (
        <div className="space-y-3">
          <Alert tone="warning" title="Copie agora">
            Esta senha não será exibida de novo. Envie para a pessoa por um canal seguro.
          </Alert>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <code className="font-mono text-base break-all select-all">{password}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(password)
                  .then(() => toast.success('Senha copiada'))
              }
            >
              Copiar
            </Button>
          </div>
        </div>
      ) : (
        <ReasonField value={reason} onChange={setReason} />
      )}
    </Dialog>
  );
}
