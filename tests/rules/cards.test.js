import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply, replay } from '../../gui/rules/reducer.js';
import { admit, availableTo } from '../../gui/rules/admission.js';
import { toSave } from '../../gui/rules/command-log.js';

const data = await loadData();

const CANOPY = { seatId: 's1', kind: 'player', roleId: 'C1' };
const VIVA = { seatId: 's2', kind: 'player', roleId: 'V1' };
const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };

/** A game already under way, with two seated players. */
function playing() {
  let state = createInitialState({ joinCode: 'TESTING', seed: 42, data });
  state.seats.s1 = { id: 's1', token: 't1', name: 'A', roleId: 'C1', kind: 'player', connected: true, lastSeen: 0 };
  state.seats.s2 = { id: 's2', token: 't2', name: 'B', roleId: 'V1', kind: 'player', connected: true, lastSeen: 0 };
  state.seats.s9 = { id: 's9', token: 't9', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
  state.roles.C1.claimedBySeat = 's1';
  state.roles.V1.claimedBySeat = 's2';
  state = run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);
  return state;
}

function run(state, script) {
  return script.reduce((at, [actor, verb, payload]) => {
    const result = apply(at, data, { verb, payload }, actor, { ts: 0 });
    if (!result.ok) throw new Error(`${verb} refused: ${result.reason}`);
    return result.state;
  }, state);
}

describe('the life of a loaned card', () => {
  it('hands, reclaims, and discards — ownership never moving', () => {
    let state = playing();
    // C1 loans a card to V1.
    state = run(state, [[CANOPY, 'hand-card', { cardId: 'rc_c1_1', toCode: 'V1' }]]);
    expect(state.cards.rc_c1_1).toMatchObject({
      ownerCode: 'C1', holderCode: 'V1', state: 'held',
    });

    // The owner takes it back without asking anybody.
    state = run(state, [[CANOPY, 'reclaim-card', { cardId: 'rc_c1_1' }]]);
    expect(state.cards.rc_c1_1.holderCode).toBe('C1');

    // And discards it, which parks it in the owner's pile.
    state = run(state, [[CANOPY, 'discard-card', { cardId: 'rc_c1_1' }]]);
    expect(state.cards.rc_c1_1).toMatchObject({
      ownerCode: 'C1', holderCode: 'C1', state: 'spent',
    });
  });

  it('lets a borrower pass the card on, and the owner still reclaim it', () => {
    // "Freely loanable" means the borrower can lend it onward; "the owner
    // reclaims until spent" means the chain never puts it out of reach.
    let state = playing();
    state = run(state, [
      [CANOPY, 'hand-card', { cardId: 'rc_c1_1', toCode: 'V1' }],
      [VIVA, 'hand-card', { cardId: 'rc_c1_1', toCode: 'B1' }],
    ]);
    expect(state.cards.rc_c1_1.holderCode).toBe('B1');
    state = run(state, [[CANOPY, 'reclaim-card', { cardId: 'rc_c1_1' }]]);
    expect(state.cards.rc_c1_1.holderCode).toBe('C1');
  });

  it('lets a borrower discard what they were loaned', () => {
    let state = playing();
    state = run(state, [
      [CANOPY, 'hand-card', { cardId: 'rc_c1_1', toCode: 'V1' }],
      [VIVA, 'discard-card', { cardId: 'rc_c1_1' }],
    ]);
    // Spent in V1's hands, but it is still C1's card and C1's discard pile.
    expect(state.cards.rc_c1_1).toMatchObject({ ownerCode: 'C1', state: 'spent' });
  });
});

describe('what the card verbs refuse', () => {
  it('refuses handing a card you are not holding', () => {
    const state = playing();
    const verdict = admit(state, data,
      { verb: 'hand-card', payload: { cardId: 'rc_v1_1', toCode: 'B1' } }, CANOPY);
    expect(verdict).toMatchObject({ ok: false });
    expect(verdict.reason).toContain('not holding');
  });

  it('refuses handing a spent card', () => {
    let state = playing();
    state = run(state, [[CANOPY, 'discard-card', { cardId: 'rc_c1_1' }]]);
    expect(admit(state, data,
      { verb: 'hand-card', payload: { cardId: 'rc_c1_1', toCode: 'V1' } }, CANOPY).reason)
      .toContain('spent');
  });

  it('refuses handing to nobody, and to yourself', () => {
    const state = playing();
    expect(admit(state, data,
      { verb: 'hand-card', payload: { cardId: 'rc_c1_1', toCode: 'Z9' } }, CANOPY).reason)
      .toContain('nobody by that code');
    expect(admit(state, data,
      { verb: 'hand-card', payload: { cardId: 'rc_c1_1', toCode: 'C1' } }, CANOPY).reason)
      .toContain('already in your hand');
  });

  it('refuses a reclaim once the card is spent', () => {
    // The printed line: the owner reclaims *until spent*. Spent via the
    // pencil here, because the loan chain is not what is under test.
    let state = playing();
    state = run(state, [
      [CANOPY, 'hand-card', { cardId: 'rc_c1_1', toCode: 'V1' }],
      [FACILITATOR, 'facilitator:set', { path: ['cards', 'rc_c1_1', 'state'], value: 'spent' }],
    ]);
    const verdict = admit(state, data,
      { verb: 'reclaim-card', payload: { cardId: 'rc_c1_1' } }, CANOPY);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('spent');
  });

  it('refuses reclaiming somebody else\'s card, or one already home', () => {
    let state = playing();
    expect(admit(state, data,
      { verb: 'reclaim-card', payload: { cardId: 'rc_v1_1' } }, CANOPY).reason)
      .toContain('not yours');
    expect(admit(state, data,
      { verb: 'reclaim-card', payload: { cardId: 'rc_c1_1' } }, CANOPY).reason)
      .toContain('already in your hand');
    state = run(state, [[CANOPY, 'discard-card', { cardId: 'rc_c1_2' }]]);
    expect(admit(state, data,
      { verb: 'discard-card', payload: { cardId: 'rc_c1_2' } }, CANOPY).reason)
      .toContain('already in the discard');
  });

  it('refuses the lot before the game begins', () => {
    const state = createInitialState({ joinCode: 'T', seed: 1, data });
    state.seats.s1 = { id: 's1', token: 't1', name: 'A', roleId: 'C1', kind: 'player', connected: true, lastSeen: 0 };
    for (const [verb, payload] of [
      ['hand-card', { cardId: 'rc_c1_1', toCode: 'V1' }],
      ['reclaim-card', { cardId: 'rc_c1_1' }],
      ['discard-card', { cardId: 'rc_c1_1' }],
    ]) {
      expect(admit(state, data, { verb, payload }, CANOPY).reason, verb)
        .toBe('the game has not begun yet');
    }
  });
});

describe('the NPC hands', () => {
  it('are driven by the facilitator through the same verbs', () => {
    // The tithe: the Belt Union owes the Ambassador, but the Ambassador's own
    // giving runs the other way. The facilitator names the acting lanyard in
    // the payload, exactly as subjectOf() reads it.
    let state = playing();
    state = run(state, [[FACILITATOR, 'hand-card',
      { roleId: 'N1', cardId: 'rc_n1_1', toCode: 'C1' }]]);
    expect(state.cards.rc_n1_1).toMatchObject({ ownerCode: 'N1', holderCode: 'C1' });

    // And the Ambassador reclaims like any owner.
    state = run(state, [[FACILITATOR, 'reclaim-card', { roleId: 'N1', cardId: 'rc_n1_1' }]]);
    expect(state.cards.rc_n1_1.holderCode).toBe('N1');
  });

  it('offers the card verbs on a player\'s action list once the game is on', () => {
    const state = playing();
    const verbs = availableTo(state, data, CANOPY).filter((a) => a.ok).map((a) => a.verb);
    expect(verbs).toContain('hand-card');
    expect(verbs).toContain('discard-card');
    // Nothing is out on loan yet, so there is nothing to reclaim.
    expect(availableTo(state, data, CANOPY).find((a) => a.verb === 'reclaim-card').ok)
      .toBe(false);
  });
});

describe('the umpire moving cards', () => {
  it('moves any card into any hand, or to the discard, on the ledger', () => {
    let state = playing();
    // A discard restored to a different player entirely.
    state = run(state, [
      [CANOPY, 'discard-card', { cardId: 'rc_c1_1' }],
      [FACILITATOR, 'facilitator:move-card', { cardId: 'rc_c1_1', to: 'V1' }],
    ]);
    expect(state.cards.rc_c1_1).toMatchObject({ holderCode: 'V1', state: 'held', ownerCode: 'C1' });
    // A held card sent to the discard: spent where it stands, its owner's pile.
    state = run(state, [[FACILITATOR, 'facilitator:move-card',
      { cardId: 'rc_c1_1', to: 'discard' }]]);
    expect(state.cards.rc_c1_1.state).toBe('spent');
    // And every move is an override in the log.
    expect(state.log.filter((e) => e.verb === 'facilitator:move-card')
      .every((e) => e.override)).toBe(true);
  });

  it('refuses the destroyed, the absent, and the no-op', () => {
    let state = playing();
    expect(admit(state, data, {
      verb: 'facilitator:move-card', payload: { cardId: 'rc_zz_9', to: 'C1' },
    }, FACILITATOR).reason).toContain('no such card');
    expect(admit(state, data, {
      verb: 'facilitator:move-card', payload: { cardId: 'rc_c1_1', to: 'C1' },
    }, FACILITATOR).reason).toContain('already in that hand');
    state = run(state, [[FACILITATOR, 'facilitator:set',
      { path: ['cards', 'rc_c1_1', 'state'], value: 'destroyed' }]]);
    expect(admit(state, data, {
      verb: 'facilitator:move-card', payload: { cardId: 'rc_c1_1', to: 'V1' },
    }, FACILITATOR).reason).toContain('destroyed');
  });

  it('replays a shuffle of moves exactly', () => {
    let state = playing();
    state = run(state, [
      [FACILITATOR, 'facilitator:move-card', { cardId: 'rc_c1_2', to: 'B1' }],
      [FACILITATOR, 'facilitator:move-card', { cardId: 'rc_c1_2', to: 'discard' }],
      [FACILITATOR, 'facilitator:move-card', { cardId: 'rc_c1_2', to: 'N1' }],
    ]);
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    expect(rebuilt.cards).toEqual(state.cards);
  });
});

describe('replay', () => {
  it('rebuilds a game of loans and discards exactly', () => {
    let state = playing();
    state = run(state, [
      [CANOPY, 'hand-card', { cardId: 'rc_c1_1', toCode: 'V1' }],
      [VIVA, 'hand-card', { cardId: 'rc_v1_1', toCode: 'C1' }],
      [FACILITATOR, 'hand-card', { roleId: 'N1', cardId: 'rc_n1_1', toCode: 'V1' }],
      [VIVA, 'discard-card', { cardId: 'rc_c1_1' }],
      [CANOPY, 'discard-card', { cardId: 'rc_v1_1' }],
    ]);
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    expect(rebuilt.cards).toEqual(state.cards);
  });
});
