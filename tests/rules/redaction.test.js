import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { projectView, unclassifiedPaths, auditProjection } from '../../gui/rules/views.js';
import { ruleFor, NOBODY } from '../../gui/rules/visibility.js';

const data = await loadData();

/**
 * A game in progress with every secret replaced by a unique sentinel, so a
 * leak is findable by string search rather than by knowing what to look for.
 *
 * Crisis Mars keeps very little from the table — the boards and the cards are
 * public in the room — so the secrets here are the machinery: tokens, the
 * seed, the log, and the umpire's own notes. The one per-player secret, the
 * lanyard back, is static data rather than state and is asserted separately.
 */
function loadedState() {
  const state = createInitialState({ joinCode: 'TESTING', seed: 7, data, playerCount: 12 });

  const seat = (id, token, name, roleId, kind = 'player') => ({
    id, token, name, roleId, kind, connected: true, lastSeen: 1,
  });
  state.seats = {
    s1: seat('s1', 'SECRET::token.c1', 'Canopy player', 'C1'),
    s2: seat('s2', 'SECRET::token.v1', 'Viva player', 'V1'),
    s3: seat('s3', 'SECRET::token.d1', 'Deimos player', 'D1'),
    s4: seat('s4', 'SECRET::token.facilitator', 'Facilitator', null, 'facilitator'),
  };
  state.seatByToken = {
    'SECRET::token.c1': 's1', 'SECRET::token.v1': 's2',
    'SECRET::token.d1': 's3', 'SECRET::token.facilitator': 's4',
  };
  state.roles.C1.claimedBySeat = 's1';
  state.roles.V1.claimedBySeat = 's2';
  state.roles.D1.claimedBySeat = 's3';

  state.phase = { turn: 2, name: 'action', endsAt: 1000, paused: false, pausedRemainingMs: null };

  // A loan, a spend and an active War Progress marker: the board mid-game.
  state.cards.rc_c1_1.holderCode = 'V1';
  state.cards.rc_v1_2.state = 'spent';
  state.warProgress = 9;
  state.actionCards.C1 = { placed: 'earth_map', spent: false };

  state.facilitatorNotes = { plan: 'SECRET::facilitatorNotes.plan' };
  state.notes = { C1: [{ ts: 1, text: 'SECRET::notes.c1' }] };
  state.log = [{ seq: 1, verb: 'claim-role', payload: 'SECRET::log.entry' }];
  state.lastSeq = { s1: 'SECRET::lastSeq.s1' };
  state.seed = 987654;

  return state;
}

const VIEWERS = {
  canopy: { kind: 'player', roleId: 'C1', teamId: 'canopy_corp' },
  viva: { kind: 'player', roleId: 'V1', teamId: 'viva_mars' },
  spectator: { kind: 'spectator', roleId: null, teamId: null },
};

describe('the manifest is complete', () => {
  it('classifies every path in a loaded game', () => {
    // The half of the guarantee that matters most. A field added without a
    // manifest entry fails here, which means the cost of forgetting is a red
    // build rather than a leak nobody notices for months.
    expect(unclassifiedPaths(loadedState())).toEqual([]);
  });

  it('classifies every path in a fresh game too', () => {
    expect(unclassifiedPaths(createInitialState({ joinCode: 'A', seed: 1, data }))).toEqual([]);
  });

  it('classifies every path at every head count the scaling table deals', () => {
    // The roster changes which cards and roles exist, and a path that only
    // appears at one head count would otherwise dodge the completeness walk.
    for (const count of Object.keys(data.scaling.rosterAt)) {
      expect(unclassifiedPaths(createInitialState({
        joinCode: 'A', seed: 1, data, playerCount: Number(count),
      })), `${count} players`).toEqual([]);
    }
  });
});

describe('no sentinel reaches a seat the manifest does not grant it', () => {
  const state = loadedState();

  /** Exactly what each seat is entitled to. Everything else is a leak. */
  const OWN = {
    canopy: [],
    viva: [],
    spectator: [],
  };

  it.each(Object.entries(VIEWERS))('%s', (name, viewer) => {
    const json = JSON.stringify(projectView(state, data, viewer));
    const leaked = [...new Set([...json.matchAll(/SECRET::[\w.]+/g)].map((m) => m[0]))];
    expect(leaked.sort()).toEqual([...OWN[name]].sort());
  });

  it('gives the facilitator everything, deliberately', () => {
    // They run the table and hold the only copy of the game. Hiding
    // anything from them would only make adjudication harder.
    const json = JSON.stringify(projectView(state, data, { kind: 'facilitator' }));
    for (const secret of ['SECRET::facilitatorNotes.plan', 'SECRET::log.entry',
      'SECRET::token.c1', 'SECRET::notes.c1']) {
      expect(json).toContain(secret);
    }
  });
});

describe('the specific things the game keeps quiet', () => {
  const state = loadedState();
  const view = (v) => projectView(state, data, VIEWERS[v]);

  it('keeps the seed and cursor from anyone who could roll ahead', () => {
    expect(view('canopy').seed).toBeUndefined();
    expect(view('canopy').rngCursor).toBeUndefined();
    expect(view('spectator').seed).toBeUndefined();
  });

  it('never sends a seat token to a player, in a value or in a key', () => {
    // A projection can redact a value but not a key, so seats are keyed by a
    // public seat id and the token lives inside the record. Getting this
    // wrong once at RBO is what put the check here.
    expect(ruleFor(['seats', 's1', 'token']).audience).toBe(NOBODY);
    expect(ruleFor(['seatByToken', 'anything']).audience).toBe(NOBODY);
    for (const [name, viewer] of Object.entries(VIEWERS)) {
      const json = JSON.stringify(projectView(state, data, viewer));
      expect(json, name).not.toContain('SECRET::token.');
    }
  });

  it('shows the whole board to everybody, spectators included', () => {
    // The paper game plays its hands face up: tracks, cards, loans and the
    // discard are all table facts, and the app keeps them that way.
    const seen = view('spectator');
    expect(seen.maps.earth_map.tracks.war_support).toBe(16);
    expect(seen.warProgress).toBe(9);
    expect(seen.cards.rc_c1_1).toMatchObject({ ownerCode: 'C1', holderCode: 'V1' });
    expect(seen.cards.rc_v1_2.state).toBe('spent');
    expect(seen.actionCards.C1.placed).toBe('earth_map');
  });

  it('hands a player their own lanyard back, and nobody else theirs', () => {
    // The brief is static data attached to its owner's projection — the same
    // accepted trade RBO made for briefs.json. It is not a state path, so the
    // check is that it arrives for the owner and is absent for everyone else.
    expect(view('canopy').brief.personalGoal).toBe(data.roles.roles.C1.private.personalGoal);
    const elsewhere = JSON.stringify({ ...view('viva'), brief: null });
    expect(elsewhere).not.toContain(data.roles.roles.C1.private.personalGoal.slice(0, 30));
    expect(view('spectator').brief).toBeNull();
  });
});

describe('audit', () => {
  it('reports the paths a viewer was given', () => {
    const paths = auditProjection(loadedState(), data, VIEWERS.canopy);
    expect(paths).toContain('maps.earth_map.tracks.war_support');
    expect(paths).toContain('roles.C1.claimedBySeat');
    expect(paths).not.toContain('seed');
    expect(paths).not.toContain('seats.s1.token');
  });
});
