import { describe, expect, it } from 'vitest';
import { groupRule, selectionErrors, selectionPrice, toggleOption } from '../option-selection';
import { burger } from './fixtures';

const bread = burger.optionGroups[0]!;
const extras = burger.optionGroups[1]!;

describe('option selection', () => {
  it('replaces the choice in single-choice groups', () => {
    let selection = toggleOption({}, bread, 'trad');
    selection = toggleOption(selection, bread, 'brioche');
    expect(selection.bread).toEqual(['brioche']);
  });

  it('toggles and caps multi-choice groups at the maximum', () => {
    let selection = toggleOption({}, extras, 'bacon');
    selection = toggleOption(selection, extras, 'cheddar');
    selection = toggleOption(selection, extras, 'egg'); // ignored: max 2
    expect(selection.extras).toEqual(['bacon', 'cheddar']);
    selection = toggleOption(selection, extras, 'bacon');
    expect(selection.extras).toEqual(['cheddar']);
  });

  it('reports required groups that are missing', () => {
    expect(selectionErrors(burger, {})).toEqual({ bread: 'Escolha uma opção.' });
    expect(selectionErrors(burger, { bread: ['trad'] })).toEqual({});
  });

  it('adds option prices to the product price', () => {
    expect(selectionPrice(burger, { bread: ['brioche'], extras: ['bacon'] })).toBe(3800);
  });

  it('describes the group rule in plain words', () => {
    expect(groupRule(bread)).toBe('Escolha 1');
    expect(groupRule(extras)).toBe('Até 2');
  });
});
