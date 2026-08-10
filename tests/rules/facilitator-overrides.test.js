import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply, replay } from '../../gui/rules/reducer.js';
import { toSave, overrides } from '../../gui/rules/command-log.js';

const data = await loadData();
const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };
const PLAYER = { seatId: 's1', kind: 'player', roleId: 'C1' };

function run(state, script) {
  return script.reduce((at, [actor, verb, payload]) => {
    const result = apply(at, data, { verb, payload }, actor, { ts: 0 });
    if (!result.ok) throw new Error(`${verb} refused: ${result.reason}`);
    return result.state;
  }, state);
}

function seated() {
  const state = createInitialState({ joinCode: 'PENCIL1', seed: 8, data });
  state.seats.s1 = { id: 's1', token: 't1', name: 'A', roleId: 'C1', kind: 'player', connected: true, lastSeen: 0 };
  state.seats.s9 = { id: 's9', token: 't9', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
  state.roles.C1.claimedBySeat = 's1';
  return state;
}

describe('the pencil and the ledger', () => {
  it('marks every facilitator command as an override, and no player command', () => {
    // The third law's whole point: "what did the umpire change?" must be
    // answerable off the log alone. Facilitator authorship is what tags an
    // entry, so the pencil, the clock and the adjudication all land in the
    // ledger — and a player's own act never does.
    let state = seated();
    state = run(state, [
      [FACILITATOR, 'facilitator:advance-phase', {}],
      [PLAYER, 'discard-card', { cardId: 'rc_c1_1' }],
      [FACILITATOR, 'facilitator:set', { path: ['warProgress'], value: 5 }],
      [FACILITATOR, 'facilitator:adjust',
        { path: ['maps', 'earth_map', 'tracks', 'war_support'], delta: -3 }],
    ]);
    const ledger = overrides(state.log);
    expect(ledger.map((entry) => entry.verb)).toEqual([
      'facilitator:advance-phase', 'facilitator:set', 'facilitator:adjust',
    ]);
    expect(state.log.find((entry) => entry.verb === 'discard-card').override).toBe(false);
  });

  it('reaches anywhere with set, and creates the path it needs', () => {
    const state = run(seated(), [[FACILITATOR, 'facilitator:set',
      { path: ['facilitatorNotes', 'ruling', 'depth'], value: 'as deep as needed' }]]);
    expect(state.facilitatorNotes.ruling.depth).toBe('as deep as needed');
  });

  it('adjusts against the live value and refuses to go negative', () => {
    let state = seated();
    state = run(state, [[FACILITATOR, 'facilitator:adjust',
      { path: ['maps', 'earth_map', 'tracks', 'un_oversight'], delta: -4 }]]);
    expect(state.maps.earth_map.tracks.un_oversight).toBe(0);
    const refused = apply(state, data, {
      verb: 'facilitator:adjust',
      payload: { path: ['maps', 'earth_map', 'tracks', 'un_oversight'], delta: -1 },
    }, FACILITATOR, { ts: 0 });
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('negative');
  });

  it('replays the pencil like everything else', () => {
    // An override that bypassed the reducer would be invisible to the log
    // and unrebuildable; this is the assertion that none does.
    let state = seated();
    state = run(state, [
      [FACILITATOR, 'facilitator:set', { path: ['warProgress'], value: 9 }],
      [FACILITATOR, 'facilitator:adjust',
        { path: ['maps', 'belt_map', 'tracks', 'ceres_prosperity'], delta: 2 }],
    ]);
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    expect(rebuilt.warProgress).toBe(9);
    expect(rebuilt.maps.belt_map.tracks.ceres_prosperity).toBe(14);
    expect(overrides(rebuilt.log)).toHaveLength(2);
  });
});
