import { create } from 'zustand';
import { Button } from './button';
import { Dialog } from './dialog';

interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
  /** 'danger' for destructive or irreversible actions. */
  tone?: 'danger' | 'primary';
}

interface ConfirmState {
  request: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null;
  open: (request: ConfirmRequest) => Promise<boolean>;
  settle: (ok: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  open: (request) =>
    new Promise<boolean>((resolve) => {
      get().request?.resolve(false);
      set({ request: { ...request, resolve } });
    }),
  settle: (ok) => {
    get().request?.resolve(ok);
    set({ request: null });
  },
}));

/** Replaces window.confirm with a themed, accessible dialog. Resolves true on confirm. */
export const confirm = (request: ConfirmRequest) => useConfirmStore.getState().open(request);

export function ConfirmHost() {
  const { request, settle } = useConfirmStore();
  return (
    <Dialog
      open={request !== null}
      onClose={() => settle(false)}
      title={request?.title ?? ''}
      description={request?.description}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => settle(false)}>
            Voltar
          </Button>
          <Button
            variant={request?.tone === 'primary' ? 'primary' : 'danger'}
            onClick={() => settle(true)}
            autoFocus
          >
            {request?.confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      }
    >
      {null}
    </Dialog>
  );
}
