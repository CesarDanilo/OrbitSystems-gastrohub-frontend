import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError, api } from '../../../lib/api';
import { BlockUserDialog, ResetPasswordDialog } from '../user-actions';

vi.mock('../../../lib/api', async (original) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await original<typeof import('../../../lib/api')>();
  return { ...actual, api: { ...actual.api, post: vi.fn() } };
});
const post = vi.mocked(api.post);

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => post.mockReset());

describe('BlockUserDialog', () => {
  it('requires a reason before blocking', async () => {
    wrap(<BlockUserDialog userId="u1" userName="Ana" onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Bloquear usuário' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Motivo/), 'abc');
    expect(screen.getByRole('button', { name: 'Bloquear usuário' })).toBeDisabled();
  });

  it('asks for confirmation when the user is the only owner, then blocks anyway', async () => {
    const onClose = vi.fn();
    post
      .mockRejectedValueOnce(
        new ApiError(422, 'BusinessRuleError', 'SOLE_OWNER', 'único dono', {
          restaurants: [{ id: 'r1', name: 'Burger da Ana' }],
        }),
      )
      .mockResolvedValueOnce({});
    wrap(<BlockUserDialog userId="u1" userName="Ana" onClose={onClose} />);
    await userEvent.type(screen.getByLabelText(/Motivo/), 'fraude confirmada');
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear usuário' }));

    expect(await screen.findByText(/Burger da Ana/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Bloquear mesmo assim' });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Entendo que a empresa ficará sem dono/));
    await userEvent.click(confirm);

    expect(post).toHaveBeenLastCalledWith('/platform/users/u1/block', {
      reason: 'fraude confirmada',
      confirmSoleOwner: true,
    });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ResetPasswordDialog', () => {
  it('shows the temporary password once after the reset', async () => {
    post.mockResolvedValueOnce({ temporaryPassword: 'Tmp-abc123XYZ789' });
    wrap(<ResetPasswordDialog userId="u1" userName="Ana" onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Motivo/), 'esqueceu a senha');
    await userEvent.click(screen.getByRole('button', { name: 'Gerar senha temporária' }));
    expect(await screen.findByText('Tmp-abc123XYZ789')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/platform/users/u1/reset-password', {
      reason: 'esqueceu a senha',
    });
    expect(screen.queryByRole('button', { name: 'Gerar senha temporária' })).toBeNull();
  });
});
