import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState, PHASES } from '../../gui/rules/state.js';
import { apply, replay } from '../../gui/rules/reducer.js';
import { admit } from '../../gui/rules/admission.js';
import { toSave } from '../../gui/rules/command-log.js';
import { unclassifiedPaths, auditProjection } from '../../gui/rules/views.js';

const data = await loadData();

const CANOPY = { seatId: 's1', kind: 'player', roleId: 'C1' };
const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };

function run(state, script) {
  return script.reduce((at, [actor, verb, payload]) => {
    const result = apply(at, data, { verb, payload }, actor, { ts: 0 });
    if (!result.ok) throw new Error(`${verb} refused: ${result.reason}`);
    return result.state;
  }, state);
}

/** A seated game advanced to a chosen phase of turn one. */
function at(phaseName) {
  let state = createInitialState({ joinCode: 'TESTING', seed: 42, data });
  state.seats.s1 = { id: 's1', token: 't1', name: 'A', roleId: null, kind: 'player', connected: true, lastSeen: 0 };
  state.seats.s9 = { id: 's9', token: 't9', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
  // Claimed through the pipeline, not written by hand: the replay assertions
  // below rebuild from the log, and a claim the log never saw would come
  // back null.
  state = run(state, [[{ seatId: 's1', kind: 'player', roleId: null },
    'claim-role', { roleId: 'C1' }]]);
  while (state.phase.name !== phaseName) {
    state = run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);
  }
  return state;
}

describe('placing the action card', () => {
  it('belongs to the Negotiation Phase and nowhere else', () => {
    const claim = { verb: 'place-action-card', payload: { mapId: 'earth_map' } };
    expect(admit(at('team'), data, claim, CANOPY).reason)
      .toContain('negotiation');
    expect(admit(at('action'), data, claim, CANOPY).reason)
      .toContain('negotiation');
    // And the lobby gets the lobby's own sentence, not a phase name.
    let lobby = createInitialState({ joinCode: 'T', seed: 1, data });
    lobby.seats.s1 = { id: 's1', token: 't', name: 'A', roleId: 'C1', kind: 'player', connected: true, lastSeen: 0 };
    expect(admit(lobby, data, claim, CANOPY).reason).toBe('the game has not begun yet');
  });

  it('places, and re-places until the phase ends', () => {
    // The print makes placement mandatory but not final: the last word
    // before the facilitator calls the phase is the one that counts.
    let state = at('negotiation');
    state = run(state, [[CANOPY, 'place-action-card', { mapId: 'earth_map' }]]);
    expect(state.actionCards.C1.placed).toBe('earth_map');
    state = run(state, [[CANOPY, 'place-action-card', { mapId: 'belt_map' }]]);
    expect(state.actionCards.C1.placed).toBe('belt_map');
  });

  it('refuses a map that is not one, and a lanyard with no card', () => {
    const state = at('negotiation');
    expect(admit(state, data,
      { verb: 'place-action-card', payload: { mapId: 'jupiter_map' } }, CANOPY).reason)
      .toBe('no such map');
    // The NPCs have hands, not action cards — even for the facilitator.
    const verdict = admit(state, data,
      { verb: 'place-action-card', payload: { roleId: 'N1', mapId: 'earth_map' } }, FACILITATOR);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('no action card');
  });

  it('hands every card back, unplaced, when the turn rolls over', () => {
    let state = at('negotiation');
    state = run(state, [
      [CANOPY, 'place-action-card', { mapId: 'mars_map' }],
      [FACILITATOR, 'facilitator:advance-phase', {}],   // action
      [FACILITATOR, 'facilitator:advance-phase', {}],   // turn 2, team
    ]);
    expect(state.phase).toMatchObject({ turn: 2, name: 'team' });
    expect(state.actionCards.C1).toEqual({ placed: null, spent: false });
  });
});

describe('recovering a discard', () => {
  /** In negotiation, with one of C1's cards already spent. */
  const spentOne = () => run(at('negotiation'),
    [[CANOPY, 'discard-card', { cardId: 'rc_c1_1' }]]);

  it('brings one card home, once', () => {
    let state = spentOne();
    state = run(state, [[CANOPY, 'recover-discard', { cardId: 'rc_c1_1' }]]);
    expect(state.cards.rc_c1_1).toMatchObject({ holderCode: 'C1', state: 'held' });
    expect(state.roles.C1.perTurn.recovered).toBe(1);

    // The second ask this phase is the one the rule exists to refuse.
    state = run(state, [[CANOPY, 'discard-card', { cardId: 'rc_c1_2' }]]);
    const verdict = admit(state, data,
      { verb: 'recover-discard', payload: { cardId: 'rc_c1_2' } }, CANOPY);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('already recovered');
  });

  it('reaches only your own pile, and only spent cards', () => {
    const state = spentOne();
    expect(admit(state, data,
      { verb: 'recover-discard', payload: { cardId: 'rc_c1_1' } },
      { seatId: 's2', kind: 'player', roleId: 'V1' }).reason)
      .toContain('only your own');
    expect(admit(state, data,
      { verb: 'recover-discard', payload: { cardId: 'rc_c1_2' } }, CANOPY).reason)
      .toContain('not in the discard');
  });

  it('belongs to the Negotiation Phase', () => {
    let state = spentOne();
    state = run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);   // action
    expect(admit(state, data,
      { verb: 'recover-discard', payload: { cardId: 'rc_c1_1' } }, CANOPY).reason)
      .toContain('negotiation');
  });

  it('refreshes with the turn', () => {
    let state = spentOne();
    state = run(state, [
      [CANOPY, 'recover-discard', { cardId: 'rc_c1_1' }],
      [CANOPY, 'discard-card', { cardId: 'rc_c1_2' }],
      [FACILITATOR, 'facilitator:advance-phase', {}],   // action
      [FACILITATOR, 'facilitator:advance-phase', {}],   // turn 2, team
    ]);
    expect(state.roles.C1.perTurn.recovered).toBe(0);
    state = run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);   // negotiation
    state = run(state, [[CANOPY, 'recover-discard', { cardId: 'rc_c1_2' }]]);
    expect(state.cards.rc_c1_2.state).toBe('held');
  });
});

describe('the record', () => {
  it('replays a turn boundary with placements and recoveries exactly', () => {
    let state = at('negotiation');
    state = run(state, [
      [CANOPY, 'place-action-card', { mapId: 'earth_map' }],
      [CANOPY, 'discard-card', { cardId: 'rc_c1_1' }],
      [CANOPY, 'recover-discard', { cardId: 'rc_c1_1' }],
      [FACILITATOR, 'facilitator:advance-phase', {}],   // action
      [FACILITATOR, 'facilitator:advance-phase', {}],   // turn 2, team
      [FACILITATOR, 'facilitator:advance-phase', {}],   // negotiation
      [CANOPY, 'place-action-card', { mapId: 'belt_map' }],
      [CANOPY, 'discard-card', { cardId: 'rc_c1_3' }],
      [CANOPY, 'recover-discard', { cardId: 'rc_c1_3' }],
    ]);
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    const { seats: _a, seatByToken: _b, ...expected } = state;
    const { seats: _c, seatByToken: _d, ...actual } = rebuilt;
    expect(actual).toEqual(expected);
  });

  it('classifies the per-turn allowances, publicly', () => {
    // The manifest's roles.** covers the new subtree; this pins that down so
    // a future narrowing of roles.* visibility has to reckon with it.
    const state = at('negotiation');
    expect(unclassifiedPaths(state)).toEqual([]);
    const paths = auditProjection(state, data,
      { kind: 'player', roleId: 'V1', teamId: 'viva_mars' });
    expect(paths).toContain('roles.C1.perTurn.recovered');
  });

  it('runs the whole game shape unchanged: four turns of three phases', () => {
    let state = createInitialState({ joinCode: 'T', seed: 1, data });
    state.seats.s9 = { id: 's9', token: 't', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
    let advances = 0;
    while (state.phase.name !== 'epilogue' && advances < 40) {
      state = run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);
      advances += 1;
    }
    expect(advances).toBe(1 + Number(data.meta.turns) * PHASES.length);
  });
});
