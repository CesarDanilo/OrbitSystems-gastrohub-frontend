import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { changePasswordSchema } from '@orbitsystems/gastrohub-contracts';
import { api, errorMessage } from '../../lib/api';
import { Alert, Button, Dialog, Field, Input, toast } from '../../components/ui';

/**
 * Changes the signed-in user's password. The API asks for the current password and ends the
 * user's other sessions (other devices must log in again).
 */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };

  const save = useMutation({
    mutationFn: () => api.put('/auth/password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success('Senha alterada. Os outros aparelhos precisam entrar de novo.');
      reset();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const submit = () => {
    setError(null);
    if (next !== confirm) return setError('A confirmação não confere com a nova senha.');
    const parsed = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
    save.mutate();
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Alterar senha"
      description="Os outros aparelhos conectados com a sua conta serão desconectados."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Salvar nova senha
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Senha atual">
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            maxLength={128}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="Nova senha" hint="Pelo menos 8 caracteres.">
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            maxLength={128}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="Confirme a nova senha">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            maxLength={128}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
