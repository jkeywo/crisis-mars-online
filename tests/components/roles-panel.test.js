// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import '../../gui/components/cm-roles-panel.js';
import '../../gui/components/cm-hand.js';

const data = await loadData();

const mount = () => {
  const element = document.createElement('cm-roles-panel');
  document.body.append(element);
  return element;
};

/** A ten-player game with one claimed seat and one loan out. */
function seated() {
  const state = createInitialState({ joinCode: 'ROLES1', seed: 4, data, playerCount: 10 });
  state.seats.s1 = { id: 's1', token: 't1', name: 'Alice', roleId: 'C1', kind: 'player', connected: true, lastSeen: 0 };
  state.roles.C1.claimedBySeat = 's1';
  state.cards.rc_v1_1.holderCode = 'C1';        // V1's card, on loan to C1
  state.cards.rc_c1_5.state = 'spent';          // one of C1's own, discarded
  return state;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('<cm-roles-panel>', () => {
  it('lists every player lanyard by faction with its claim, NPCs excluded', () => {
    const panel = mount();
    panel.data = data;
    panel.view = seated();

    const rows = [...panel.querySelectorAll('.cm-role-admin')];
    expect(rows).toHaveLength(10);
    expect(rows.some((row) => row.dataset.code === 'N1')).toBe(false);

    const claimed = panel.querySelector('[data-code="C1"]');
    expect(claimed.textContent).toContain('Alice');
    const unclaimed = panel.querySelector('[data-code="V1"]');
    expect(unclaimed.textContent).toContain('unclaimed');

    // An away seat says so.
    const away = seated();
    away.seats.s1.connected = false;
    panel.view = away;
    expect(panel.querySelector('[data-code="C1"]').textContent).toContain('Alice — away');
  });

  it('opens one management panel: hand, discard and actions in three columns', () => {
    const panel = mount();
    panel.data = data;
    panel.view = seated();

    panel.querySelector('[data-toggle="C1"]').click();
    const open = panel.querySelector('[data-open="true"]');
    expect(open.dataset.code).toBe('C1');
    const columns = [...open.querySelectorAll('.cm-role-admin-column')];
    expect(columns).toHaveLength(3);

    // Column one is the hand (and loans), read-only, the borrowed card
    // badged with its owner; column two is the discard pile alone.
    const [handColumn, discardColumn] = columns;
    const hand = handColumn.querySelector('cm-hand');
    expect(hand.hasAttribute('readonly')).toBe(true);
    expect(hand.getAttribute('sections')).toBe('held,loans');
    expect(hand.textContent).toContain('on loan from Viva Mars Hero');
    expect(hand.querySelector('.cm-hand-discard')).toBeNull();
    const discard = discardColumn.querySelector('cm-hand');
    expect(discard.querySelector('.cm-hand-discard li').dataset.card).toBe('rc_c1_5');
    expect(discard.querySelector('.cm-hand-held')).toBeNull();

    // Opening another closes the first.
    panel.querySelector('[data-toggle="V1"]').click();
    expect([...panel.querySelectorAll('[data-open="true"]')].map((r) => r.dataset.code))
      .toEqual(['V1']);
  });

  it('writes a private note against the character from the actions column', () => {
    const panel = mount();
    panel.data = data;
    const view = seated();
    view.notes.C1 = [{ ts: 0, text: 'Owes the Speaker a favour.' }];
    panel.view = view;
    const raised = [];
    panel.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    panel.querySelector('[data-toggle="C1"]').click();
    expect(panel.querySelector('[data-open="true"]').textContent)
      .toContain('Owes the Speaker a favour.');
    const input = panel.querySelector('[data-note-text="C1"]');
    input.value = 'Prepared for the future.';
    panel.querySelector('[data-note="C1"]').click();
    expect(raised).toEqual([{
      verb: 'facilitator:note', payload: { code: 'C1', text: 'Prepared for the future.' },
    }]);
    expect(input.value).toBe('');
  });

  it('gives a card from anywhere through the explicit move verb', () => {
    const panel = mount();
    panel.data = data;
    panel.view = seated();
    const raised = [];
    panel.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    panel.querySelector('[data-toggle="C1"]').click();
    // The picker offers cards not in this hand — a discard among them.
    const picker = panel.querySelector('[data-give-card="C1"]');
    const fromDiscard = [...picker.options].find((o) => o.value === 'rc_c1_5');
    expect(fromDiscard.textContent).toContain('discard');
    picker.value = 'rc_c1_5';
    panel.querySelector('[data-give="C1"]').click();
    expect(raised).toEqual([{
      verb: 'facilitator:move-card', payload: { cardId: 'rc_c1_5', to: 'C1' },
    }]);
  });

  it('takes a card to the discard, or returns a loan to its owner', () => {
    const panel = mount();
    panel.data = data;
    panel.view = seated();
    const raised = [];
    panel.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    panel.querySelector('[data-toggle="C1"]').click();
    const picker = panel.querySelector('[data-take-card="C1"]');
    picker.value = 'rc_c1_1';
    panel.querySelector('[data-take-discard="C1"]').click();
    picker.value = 'rc_v1_1';
    panel.querySelector('[data-take-return="C1"]').click();

    expect(raised).toEqual([
      { verb: 'facilitator:move-card', payload: { cardId: 'rc_c1_1', to: 'discard' } },
      { verb: 'facilitator:move-card', payload: { cardId: 'rc_v1_1', to: 'V1' } },
    ]);
  });

  it('assigns the action card from the role\'s own row', () => {
    const panel = mount();
    panel.data = data;
    panel.view = seated();
    const raised = [];
    panel.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    panel.querySelector('[data-toggle="U1"]').click();
    expect(panel.querySelector('[data-open="true"]').textContent).toContain('Not placed.');
    panel.querySelector('[data-assign="U1|mars_map"]').click();
    expect(raised).toEqual([{
      verb: 'facilitator:assign-action-card', payload: { code: 'U1', mapId: 'mars_map' },
    }]);
  });
});
