import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../button';
import { Field, Input } from '../field';
import { QuantityStepper } from '../quantity-stepper';
import { Tabs } from '../layout';

describe('Field', () => {
  it('links the label, hint and error to the control', () => {
    render(
      <Field label="E-mail" hint="Usamos para login." error="E-mail inválido.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('E-mail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('E-mail inválido.');
  });

  it('shows the hint when there is no error', () => {
    render(
      <Field label="Senha" hint="Pelo menos 8 caracteres.">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('Pelo menos 8 caracteres.');
  });
});

describe('Button', () => {
  it('is disabled and busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Salvar
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('QuantityStepper', () => {
  it('increments and lets the item be removed at the minimum', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <QuantityStepper value={1} onChange={onChange} label="X-Bacon" allowRemove />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade de X-Bacon' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    await userEvent.click(screen.getByRole('button', { name: 'Remover X-Bacon' }));
    expect(onChange).toHaveBeenLastCalledWith(0);

    rerender(<QuantityStepper value={1} onChange={onChange} label="X-Bacon" />);
    expect(screen.getByRole('button', { name: 'Diminuir quantidade de X-Bacon' })).toBeDisabled();
  });
});

describe('Tabs', () => {
  it('supports arrow-key navigation', async () => {
    const onChange = vi.fn();
    render(
      <Tabs
        label="Período"
        value="a"
        onChange={onChange}
        items={[
          { value: 'a', label: 'Hoje' },
          { value: 'b', label: '7 dias' },
        ]}
      />,
    );
    const first = screen.getByRole('tab', { name: 'Hoje' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
