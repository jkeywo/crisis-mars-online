// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { projectView } from '../../gui/rules/views.js';
import '../../gui/components/cm-hand.js';
import '../../gui/components/cm-role-card.js';
import '../../gui/components/cm-card-viewer.js';

const data = await loadData();

const mount = (tag, attrs = {}) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  document.body.append(element);
  return element;
};

/** A mid-game board: one loan out, one card spent. */
function stateInPlay() {
  const state = createInitialState({ joinCode: 'MARS42X', seed: 1, data });
  state.cards.rc_c1_1.holderCode = 'V1';           // C1's card, loaned to V1
  state.cards.rc_c1_2.state = 'spent';             // C1's card, in the discard
  return state;
}

const viewFor = (roleId) => projectView(stateInPlay(), data, {
  kind: 'player', seatId: 's1', roleId, teamId: data.roles.roles[roleId]?.factionId ?? null,
});

beforeEach(() => { document.body.innerHTML = ''; });

describe('<cm-hand>', () => {
  it('draws the hand, the loan and the discard in their own sections', () => {
    const hand = mount('cm-hand');
    hand.data = data;
    hand.view = viewFor('C1');

    // Five dealt, one loaned away, one spent: three left in hand.
    expect(hand.querySelectorAll('.cm-hand-held li[data-card]')).toHaveLength(3);
    expect(hand.querySelector('.cm-hand-loans li').dataset.card).toBe('rc_c1_1');
    expect(hand.querySelector('.cm-hand-loans').textContent).toContain('Viva Mars Hero');
    expect(hand.querySelector('.cm-hand-discard li').dataset.card).toBe('rc_c1_2');
  });

  it('badges a borrowed card with its owner', () => {
    const hand = mount('cm-hand');
    hand.data = data;
    hand.view = viewFor('V1');
    const borrowed = hand.querySelector('[data-card="rc_c1_1"]');
    expect(borrowed.querySelector('.cm-hand-loan-badge').textContent)
      .toContain('Canopy Corp C.E.O.');
    // Their own cards carry no badge.
    expect(hand.querySelector('[data-card="rc_v1_1"] .cm-hand-loan-badge')).toBeNull();
  });

  it('raises the three commands from its affordances', () => {
    const hand = mount('cm-hand');
    hand.data = data;
    hand.view = viewFor('C1');
    const raised = [];
    hand.addEventListener('cm-command', (e) => raised.push(e.detail));

    const select = hand.querySelector('[data-hand-to="rc_c1_3"]');
    select.value = 'V1';
    select.dispatchEvent(new Event('change'));
    hand.querySelector('[data-discard="rc_c1_3"]').click();
    hand.querySelector('[data-reclaim="rc_c1_1"]').click();

    expect(raised).toEqual([
      { verb: 'hand-card', payload: { cardId: 'rc_c1_3', toCode: 'V1' } },
      { verb: 'discard-card', payload: { cardId: 'rc_c1_3' } },
      { verb: 'reclaim-card', payload: { cardId: 'rc_c1_1' } },
    ]);
  });

  it('offers nothing to press when readonly', () => {
    const hand = mount('cm-hand', { readonly: '', code: 'C1' });
    hand.data = data;
    hand.view = viewFor('V1');
    expect(hand.querySelectorAll('[data-card]').length).toBeGreaterThan(0);
    expect(hand.querySelector('[data-hand-to], [data-discard], [data-reclaim]')).toBeNull();
  });

  it('stamps the acted-for role into every payload', () => {
    // The facilitator behind an NPC lanyard: same verbs, plus the roleId
    // subjectOf() reads to know whose hand is moving.
    const hand = mount('cm-hand', { 'acts-for': 'N1' });
    hand.data = data;
    hand.view = viewFor('C1');
    const raised = [];
    hand.addEventListener('cm-command', (e) => raised.push(e.detail));

    hand.querySelector('[data-discard="rc_n1_1"]').click();
    expect(raised[0].payload).toEqual({ roleId: 'N1', cardId: 'rc_n1_1' });
  });

  it('asks for a full-size look rather than deciding anything', () => {
    const hand = mount('cm-hand', { readonly: '', code: 'N2' });
    hand.data = data;
    hand.view = viewFor('C1');
    const asked = [];
    hand.addEventListener('cm-view-card', (e) => asked.push(e.detail.cardId));
    hand.querySelector('[data-view-card="rc_n2_1"]').click();
    expect(asked).toEqual(['rc_n2_1']);
  });
});

describe('the recover affordance', () => {
  it('is offered on your pile in the Negotiation Phase, and raises the verb', () => {
    const hand = mount('cm-hand');
    hand.data = data;
    const view = viewFor('C1');
    view.phase = { ...view.phase, name: 'negotiation' };
    hand.view = view;

    const raised = [];
    hand.addEventListener('cm-command', (e) => raised.push(e.detail));
    hand.querySelector('[data-recover="rc_c1_2"]').click();
    expect(raised).toEqual([
      { verb: 'recover-discard', payload: { cardId: 'rc_c1_2' } },
    ]);
  });

  it('regain: the NPC hands restore any discard, any phase, as the umpire', () => {
    // Control's lanyards are not bound by the players' once-per-negotiation
    // recovery (gaps.js, npc-regain-unbound): with `regain` set, every
    // discarded card carries a one-click restore that goes through the
    // override-ledgered facilitator card mover, not the player verb.
    const state = stateInPlay();
    state.cards.rc_n1_1.state = 'spent';
    const hand = mount('cm-hand', { 'acts-for': 'N1', regain: '' });
    hand.data = data;
    hand.view = state;                       // team phase, recovery unused

    const raised = [];
    hand.addEventListener('cm-command', (e) => raised.push(e.detail));
    hand.querySelector('[data-regain="rc_n1_1"]').click();
    expect(raised).toEqual([{
      verb: 'facilitator:move-card', payload: { cardId: 'rc_n1_1', to: 'N1' },
    }]);
  });

  it('is not offered outside the phase, nor once the recovery is used', () => {
    const hand = mount('cm-hand');
    hand.data = data;
    hand.view = viewFor('C1');   // team phase: no button
    expect(hand.querySelector('[data-recover]')).toBeNull();

    const used = viewFor('C1');
    used.phase = { ...used.phase, name: 'negotiation' };
    used.roles.C1.perTurn.recovered = 1;
    hand.view = used;
    expect(hand.querySelector('[data-recover]')).toBeNull();
  });
});

describe('<cm-role-card>', () => {
  it('shows the owner their front, a flip, and the private back', () => {
    const card = mount('cm-role-card');
    card.data = data;
    card.view = viewFor('C1');

    expect(card.querySelector('.cm-lanyard').dataset.side).toBe('front');
    expect(card.querySelector('img').src).toContain('lanyard_role_c1-front.png');

    card.querySelector('[data-flip]').click();
    expect(card.querySelector('.cm-lanyard').dataset.side).toBe('back');
    expect(card.querySelector('img').src).toContain('lanyard_role_c1-back.png');
    // The words ride along beside the PNG: the private back, and the
    // faction's public goals from factions.json.
    expect(card.textContent).toContain(data.roles.roles.C1.private.personalGoal);
    expect(card.textContent).toContain(data.factions.factions.canopy_corp.goals[0].statement);
  });

  it('gives a non-owner the front and no way to turn it over', () => {
    // Structural, not polite: V1's projection carries V1's brief and nobody
    // else's, so a card told to draw C1 has no back to show.
    const card = mount('cm-role-card', { code: 'C1' });
    card.data = data;
    card.view = viewFor('V1');

    expect(card.querySelector('img').src).toContain('lanyard_role_c1-front.png');
    expect(card.querySelector('[data-flip]')).toBeNull();
    expect(card.textContent).not.toContain(data.roles.roles.C1.private.personalGoal);
  });
});

describe('<cm-card-viewer>', () => {
  it('opens a card full size with its printed words, and closes', () => {
    const viewer = mount('cm-card-viewer');
    viewer.data = data;
    expect(viewer.hidden).toBe(true);

    viewer.show('rc_c1_1');
    expect(viewer.hidden).toBe(false);
    expect(viewer.querySelector('img').src).toContain('rc_c1_1.png');
    expect(viewer.textContent).toContain('Political Contacts');

    viewer.querySelector('[data-close]').click();
    expect(viewer.hidden).toBe(true);
    expect(viewer.children).toHaveLength(0);
  });
});
