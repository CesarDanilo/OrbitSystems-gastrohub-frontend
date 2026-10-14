import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../../theme-toggle';
import { usePreference } from '../../../lib/preferences';
import { ConfirmHost, confirm } from '../confirm';
import { Drawer } from '../drawer';
import { Tooltip } from '../tooltip';

describe('ThemeToggle', () => {
  it('starts dark, switches to light without reload and remembers the choice', async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Usar tema claro' });
    await userEvent.click(button);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('gastrohub-theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Usar tema escuro' })).toBeInTheDocument();
  });

  it('reads the saved preference', () => {
    localStorage.setItem('gastrohub-theme', 'light');
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Usar tema escuro' })).toBeInTheDocument();
  });
});

describe('usePreference', () => {
  function Sidebar() {
    const [state, setState] = usePreference('gastrohub-sidebar', 'expanded', [
      'expanded',
      'collapsed',
    ] as const);
    return (
      <button
        type="button"
        onClick={() => setState(state === 'expanded' ? 'collapsed' : 'expanded')}
      >
        {state}
      </button>
    );
  }

  it('persists and shares the value between components', async () => {
    render(
      <>
        <Sidebar />
        <Sidebar />
      </>,
    );
    await userEvent.click(screen.getAllByRole('button')[0]!);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'collapsed',
      'collapsed',
    ]);
    expect(localStorage.getItem('gastrohub-sidebar')).toBe('collapsed');
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem('gastrohub-sidebar', 'giant');
    render(<Sidebar />);
    expect(screen.getByRole('button')).toHaveTextContent('expanded');
  });
});

describe('Drawer', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir menu
        </button>
        <Drawer open={open} onClose={() => setOpen(false)} label="Menu do painel">
          <a href="#pedidos">Pedidos</a>
        </Drawer>
        <p>{open ? 'aberto' : 'fechado'}</p>
      </>
    );
  }

  it('opens on demand and closes with the close button, returning focus', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir menu' });
    await userEvent.click(trigger);
    expect(screen.getByText('aberto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedidos' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar menu' }));
    expect(screen.getByText('fechado')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes with Escape', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    await userEvent.click(screen.getByRole('link', { name: 'Pedidos' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('fechado')).toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('shows the label on keyboard focus and hides it with Escape', async () => {
    render(
      <Tooltip label="Pedidos">
        <a href="#pedidos" aria-label="Pedidos">
          P
        </a>
      </Tooltip>,
    );
    await userEvent.tab();
    expect(screen.getByText('Pedidos', { selector: 'span' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Pedidos', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('stays hidden while disabled (expanded sidebar)', async () => {
    render(
      <Tooltip label="Pedidos" disabled>
        <a href="#pedidos">Pedidos</a>
      </Tooltip>,
    );
    await userEvent.tab();
    expect(screen.queryByText('Pedidos', { selector: 'span' })).not.toBeInTheDocument();
  });
});

describe('confirm', () => {
  it('resolves true on confirm and false on back', async () => {
    render(<ConfirmHost />);
    let result: Promise<boolean>;
    act(() => {
      result = confirm({ title: 'Excluir a categoria?', confirmLabel: 'Excluir categoria' });
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir categoria' }));
    await expect(result!).resolves.toBe(true);

    act(() => {
      result = confirm({ title: 'Fechar Mesa 4?', confirmLabel: 'Fechar mesa' });
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Voltar' }));
    await expect(result!).resolves.toBe(false);
  });
});

describe('Switch', () => {
  it('is named by its visible label, or by an explicit name in lists', async () => {
    const { Switch } = await import('../choice');
    const { rerender } = render(
      <Switch
        checked
        onChange={() => undefined}
        label="Ativar WhatsApp"
        description="Envia o status."
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Ativar WhatsApp' });
    expect(toggle).toHaveAccessibleDescription('Envia o status.');
    rerender(
      <Switch
        checked={false}
        onChange={() => undefined}
        label="Pausado"
        ariaLabel="X-Bacon disponível"
      />,
    );
    expect(screen.getByRole('switch', { name: 'X-Bacon disponível' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
