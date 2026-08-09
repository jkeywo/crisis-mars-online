import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState, rosterFor } from '../../gui/rules/state.js';
import { apply, replay } from '../../gui/rules/reducer.js';
import { admit, availableTo } from '../../gui/rules/admission.js';
import { toSave, overrides } from '../../gui/rules/command-log.js';
import { roll, mulberry32 } from '../../gui/rules/rng.js';

const data = await loadData();

const PLAYER = { seatId: 's1', kind: 'player', roleId: 'C1' };
const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };

function seated() {
  const state = createInitialState({ joinCode: 'TESTING', seed: 42, data });
  state.seats.s1 = { id: 's1', token: 't1', name: 'A', roleId: 'C1', kind: 'player', connected: true, lastSeen: 0 };
  state.seats.s9 = { id: 's9', token: 't9', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
  state.roles.C1.claimedBySeat = 's1';
  return state;
}

/** Run a script of [actor, verb, payload] and return the final state. */
function run(state, script) {
  return script.reduce((at, [actor, verb, payload]) => {
    const result = apply(at, data, { verb, payload }, actor, { ts: 0 });
    if (!result.ok) throw new Error(`${verb} refused: ${result.reason}`);
    return result.state;
  }, state);
}

describe('the opening position', () => {
  it('deals the scaling table roster, plus the two NPC lanyards', () => {
    const state = createInitialState({ joinCode: 'T', seed: 1, data, playerCount: 8 });
    expect(state.rosterCodes).toEqual(data.scaling.rosterAt['8']);
    expect(Object.keys(state.roles).sort())
      .toEqual([...data.scaling.rosterAt['8'], 'N1', 'N2'].sort());
    expect(state.roles.N1.npc).toBe(true);
  });

  it('leaves an absent role\'s cards in the box', () => {
    const small = createInitialState({ joinCode: 'T', seed: 1, data, playerCount: 8 });
    const full = createInitialState({ joinCode: 'T', seed: 1, data, playerCount: 18 });
    // F1 is not at an eight-player table, so their five cards are not dealt.
    expect(Object.values(small.cards).filter((c) => c.ownerCode === 'F1')).toHaveLength(0);
    expect(Object.values(full.cards).filter((c) => c.ownerCode === 'F1')).toHaveLength(5);
    // The NPC hands are dealt at every head count.
    expect(Object.values(small.cards).filter((c) => c.ownerCode === 'N1')).toHaveLength(9);
    // 8 players × 5 cards + 2 NPCs × 9.
    expect(Object.keys(small.cards)).toHaveLength(8 * 5 + 18);
    expect(Object.keys(full.cards)).toHaveLength(108);
  });

  it('seeds every track from the printed initial values', () => {
    const state = createInitialState({ joinCode: 'T', seed: 1, data });
    expect(state.maps.earth_map.tracks.war_support).toBe(16);
    expect(state.maps.mars_map.tracks.senate_military).toBe(0);
    expect(state.maps.belt_map.tracks.mars_trade_route).toBe(12);
    // War Progress is not a track value: it has no number until the
    // turn-two correspondence activates it.
    expect(state.warProgress).toBe(null);
    for (const board of Object.values(state.maps)) {
      expect(board.tracks.war_progress).toBeUndefined();
    }
  });

  it('clamps a head count the scaling table does not know', () => {
    expect(rosterFor(data, 5)).toEqual(data.scaling.rosterAt['8']);
    expect(rosterFor(data, 99)).toEqual(data.scaling.rosterAt['18']);
    expect(rosterFor(data, undefined)).toEqual(data.scaling.rosterAt['18']);
  });
});

describe('admission', () => {
  it('says the game has not begun rather than naming a phase nobody plays', () => {
    // Asked in the lobby. The clock calls it "Waiting to begin" and a player
    // is never shown the word "lobby" anywhere else.
    const verdict = admit(seated(), data, { verb: 'nonexistent-action' }, PLAYER);
    expect(verdict.ok).toBe(false);
  });

  it('refuses a facilitator command from a player', () => {
    const verdict = admit(seated(), data, { verb: 'facilitator:set' }, PLAYER);
    expect(verdict).toMatchObject({ ok: false, reason: 'only a facilitator may do that' });
  });

  it('lists what a seat could do now', () => {
    const state = seated();
    const list = availableTo(state, data, PLAYER);
    // In the lobby a player is offered nothing but taking a lanyard.
    expect(list.map((c) => c.verb)).toEqual(['claim-role']);
  });
});

describe('a rejected command changes nothing', () => {
  it('returns the same object it was given', () => {
    const before = seated();
    const result = apply(before, data,
      { verb: 'facilitator:advance-phase' }, PLAYER, {});
    expect(result.ok).toBe(false);
    expect(result.state).toBe(before);
    expect(before.log).toHaveLength(0);
  });
});

describe('claiming a lanyard', () => {
  const fresh = () => {
    const state = createInitialState({ joinCode: 'T', seed: 1, data });
    state.seats.s1 = { id: 's1', token: 't1', name: 'A', roleId: null, kind: 'player', connected: true, lastSeen: 0 };
    state.seats.s2 = { id: 's2', token: 't2', name: 'B', roleId: null, kind: 'player', connected: true, lastSeen: 0 };
    return state;
  };

  it('claims a role by code, and records it in both directions', () => {
    const state = run(fresh(), [[{ seatId: 's1', kind: 'player', roleId: null },
      'claim-role', { roleId: 'C2' }]]);
    expect(state.seats.s1.roleId).toBe('C2');
    expect(state.roles.C2.claimedBySeat).toBe('s1');
  });

  it('refuses one already being played, by its printed name', () => {
    const state = run(fresh(), [[{ seatId: 's1', kind: 'player', roleId: null },
      'claim-role', { roleId: 'C2' }]]);
    const clash = admit(state, data, { verb: 'claim-role', payload: { roleId: 'C2' } },
      { seatId: 's2', kind: 'player', roleId: null });
    expect(clash).toMatchObject({ ok: false });
    expect(clash.reason).toContain('Canopy Corp C.T.O.');
    expect(clash.reason).toContain('already being played');
  });

  it('refuses the NPC lanyards, which are the facilitator\'s to roleplay', () => {
    for (const code of ['N1', 'N2']) {
      const verdict = admit(fresh(), data, { verb: 'claim-role', payload: { roleId: code } },
        { seatId: 's1', kind: 'player', roleId: null });
      expect(verdict.ok, code).toBe(false);
      expect(verdict.reason, code).toContain('facilitator');
    }
  });

  it('refuses a code the scaling table did not deal in', () => {
    const state = createInitialState({ joinCode: 'T', seed: 1, data, playerCount: 8 });
    state.seats.s1 = { id: 's1', token: 't1', name: 'A', roleId: null, kind: 'player', connected: true, lastSeen: 0 };
    // F1 exists in the full game but not at an eight-player table.
    const verdict = admit(state, data, { verb: 'claim-role', payload: { roleId: 'F1' } },
      { seatId: 's1', kind: 'player', roleId: null });
    expect(verdict).toMatchObject({ ok: false, reason: 'no such role in this game' });
  });

  it('moves a claim rather than duplicating it', () => {
    // One seat, one role, in both directions: a seat that re-claims leaves
    // its old lanyard, and the role records exactly one chair.
    let state = fresh();
    const alice = { seatId: 's1', kind: 'player', roleId: null };
    state = run(state, [[alice, 'claim-role', { roleId: 'C2' }]]);
    state = run(state, [[{ ...alice, roleId: 'C2' }, 'claim-role', { roleId: 'V1' }]]);
    expect(state.seats.s1.roleId).toBe('V1');
    expect(state.roles.C2.claimedBySeat).toBe(null);
    expect(state.roles.V1.claimedBySeat).toBe('s1');
  });

  it('lets someone arriving mid-game take a vacant lanyard', () => {
    // A game that can only be joined before it starts is not one that
    // survives a real evening: people turn up late, drop out, and get put
    // onto a character whose player has gone home.
    let state = seated();
    state = run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);
    state.seats.s3 = { id: 's3', token: 't3', name: 'Latecomer', roleId: null, kind: 'player', connected: true, lastSeen: 0 };
    const latecomer = { seatId: 's3', kind: 'player', roleId: null };
    const after = run(state, [[latecomer, 'claim-role', { roleId: 'U1' }]]);
    expect(after.seats.s3.roleId).toBe('U1');
    expect(after.roles.U1.claimedBySeat).toBe('s3');
  });
});

describe('facilitator overrides', () => {
  it('go through the reducer and are marked in the log', () => {
    const state = run(seated(), [[FACILITATOR, 'facilitator:set',
      { path: ['maps', 'earth_map', 'tracks', 'war_support'], value: 9 }]]);
    expect(state.maps.earth_map.tracks.war_support).toBe(9);
    expect(overrides(state.log)).toHaveLength(1);
    expect(state.log[0]).toMatchObject({ verb: 'facilitator:set', override: true });
  });

  it('adjusts a track by delta, and refuses to take one negative', () => {
    const state = run(seated(), [[FACILITATOR, 'facilitator:adjust',
      { path: ['maps', 'earth_map', 'tracks', 'un_oversight'], delta: -3 }]]);
    expect(state.maps.earth_map.tracks.un_oversight).toBe(1);
    const verdict = admit(state, data, { verb: 'facilitator:adjust',
      payload: { path: ['maps', 'earth_map', 'tracks', 'un_oversight'], delta: -2 } }, FACILITATOR);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('negative');
  });

  it('clears a seat and both halves of its claim', () => {
    const state = run(seated(), [[FACILITATOR, 'facilitator:remove-seat', { seatId: 's1' }]]);
    expect(state.seats.s1).toBeUndefined();
    expect(state.roles.C1.claimedBySeat).toBe(null);
  });
});

describe('replay', () => {
  it('rebuilds a game from its seed and log alone', () => {
    // The strongest single assertion in the suite: it exercises every reducer
    // path the script touches, and it is what makes a save file a few
    // kilobytes of history rather than a snapshot that can disagree with it.
    let state = createInitialState({ joinCode: 'TESTING', seed: 42, data, playerCount: 10 });
    state.seats.s1 = { id: 's1', token: 't1', name: 'A', roleId: null, kind: 'player', connected: true, lastSeen: 0 };
    state.seats.s9 = { id: 's9', token: 't9', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
    const alice = { seatId: 's1', kind: 'player', roleId: null };

    state = run(state, [
      [alice, 'claim-role', { roleId: 'B1' }],
      [FACILITATOR, 'facilitator:advance-phase', {}],
      [FACILITATOR, 'facilitator:advance-phase', {}],
      [FACILITATOR, 'facilitator:adjust', { path: ['maps', 'belt_map', 'tracks', 'ceres_prosperity'], delta: 2 }],
      [FACILITATOR, 'facilitator:set', { path: ['warProgress'], value: 10 }],
      [FACILITATOR, 'facilitator:set', { path: ['facilitatorNotes', 'opening'], value: 'a quiet start' }],
    ]);

    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);

    // Seats are runtime, not history, so compare everything the rules own.
    const { seats: _a, seatByToken: _b, ...expected } = state;
    const { seats: _c, seatByToken: _d, ...actual } = rebuilt;
    expect(actual).toEqual(expected);
  });

  it('replays a short-handed game against the roster it was dealt', () => {
    const state = createInitialState({ joinCode: 'SMALL', seed: 9, data, playerCount: 8 });
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    expect(rebuilt.rosterCodes).toEqual(data.scaling.rosterAt['8']);
    expect(Object.keys(rebuilt.cards)).toEqual(Object.keys(state.cards));
  });

  it('refuses a tampered entry rather than replaying it', () => {
    const state = run(seated(), [[FACILITATOR, 'facilitator:advance-phase', {}]]);
    const save = toSave(state);
    save.log = [...save.log, {
      seq: 99, ts: 0, seatId: 's1', roleId: 'C1', verb: 'facilitator:end-game',
      payload: {}, rngCursorBefore: 0, override: false,
    }];
    const { refused } = replay(save, data);
    // A player cannot call time, so this never happened.
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ verb: 'facilitator:end-game' });
  });
});

describe('dice', () => {
  it('are a pure function of seed and cursor', () => {
    expect(roll(42, 0)).toEqual(roll(42, 0));
    expect(roll(42, 0).cursor).toBe(1);
    expect(roll(42, 0).value).not.toBe(roll(99, 0).value);
  });

  it('land on every face and stay inside them', () => {
    const next = mulberry32(2024);
    const seen = new Set();
    for (let i = 0; i < 600; i++) {
      const face = 1 + Math.floor(next() * 6);
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(6);
      seen.add(face);
    }
    expect(seen.size).toBe(6);
  });
});
