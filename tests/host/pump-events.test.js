import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply } from '../../gui/rules/reducer.js';
import { projectView } from '../../gui/rules/views.js';
import {
  publicDigest, deriveEvents, stampEvents, encodeBatch,
  EVENT_TYPES, ENVELOPE_KEYS, PUMP_SCHEMA_VERSION,
} from '../../gui/host/pump-events.js';

const data = await loadData();
const FACILITATOR = { seatId: 'sF', kind: 'facilitator', roleId: null };
const asPlayer = (code) => ({ seatId: `s-${code}`, kind: 'player', roleId: code });

function run(state, script) {
  return script.reduce((at, [actor, verb, payload]) => {
    const result = apply(at, data, { verb, payload }, actor, { ts: 100 + at.log.length });
    if (!result.ok) throw new Error(`${verb} refused: ${result.reason}`);
    return result.state;
  }, state);
}

const spectator = (state) => projectView(state, data,
  { kind: 'spectator', roleId: null, teamId: null });

/** A game deep enough that every digest field has something in it. */
function busy() {
  let state = createInitialState({ joinCode: 'PUMPED', seed: 5, data, playerCount: 8 });
  state.seats.s1 = { id: 's1', token: 'SECRET::tok', name: 'Alice', roleId: 'C1', kind: 'player', connected: true, lastSeen: 0 };
  state = run(state, [
    [FACILITATOR, 'facilitator:advance-phase', {}],
    [FACILITATOR, 'facilitator:publish-correspondence', {
      turn: 1, effects: [{ track: 'war_progress', set: 11 }],
    }],
    [FACILITATOR, 'facilitator:deliver-opportunity', {
      factionId: 'viva_mars', title: 'SECRET::title', optionA: 'a', optionB: 'b',
    }],
    [FACILITATOR, 'facilitator:advance-phase', {}],
    [asPlayer('C1'), 'place-action-card', { mapId: 'earth_map' }],
    [FACILITATOR, 'facilitator:advance-phase', {}],
    [FACILITATOR, 'facilitator:call-next', { mapId: 'earth_map' }],
    [asPlayer('C1'), 'declare-action',
      { actionId: 'a1', text: 'strike', allyCodes: [], cardIds: [] }],
    [FACILITATOR, 'facilitator:roll-consequence', { actionId: 'a1' }],
    [FACILITATOR, 'facilitator:narrate', { actionId: 'a1', text: 'The port burns.' }],
    [FACILITATOR, 'facilitator:close-action', { actionId: 'a1' }],
    [FACILITATOR, 'facilitator:begin-turn-update', {}],
  ]);
  return state;
}

describe('the digest', () => {
  it('is identical built from a spectator projection or from raw state', () => {
    // The structural guarantee: the digest reads only PUBLIC paths. Reach
    // for a private one and this goes red, because the projection would not
    // have it.
    const state = busy();
    expect(publicDigest(spectator(state), data)).toEqual(publicDigest(state, data));
  });

  it('carries no secret, whatever the game holds', () => {
    const json = JSON.stringify(publicDigest(spectator(busy()), data));
    expect(json).not.toContain('SECRET::');
    // The opportunity is present as a fact, without its words.
    expect(json).toContain('viva_mars');
  });

  it('labels a closed action with the band the room heard', () => {
    const digest = publicDigest(spectator(busy()), data);
    // Turn 1, no allies, no cards, maybe a boon: Insignificant or Minor.
    expect(['Insignificant', 'Minor']).toContain(digest.actions.a1.band);
    expect(digest.actions.a1).toMatchObject({
      mapId: 'earth_map', actorCode: 'C1', status: 'closed', narration: 'The port burns.',
    });
  });
});

describe('what the pump says', () => {
  it('opens with the position, not a diff', () => {
    const events = deriveEvents(null, publicDigest(spectator(busy()), data));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('game.opened');
    expect(events[0].data.seats[0]).toMatchObject({ seatId: 's1', name: 'Alice' });
  });

  it('tells the whole story of a busy stretch, in a deterministic order', () => {
    let state = createInitialState({ joinCode: 'PUMPED', seed: 5, data, playerCount: 8 });
    state.seats.s1 = { id: 's1', token: 't', name: 'Alice', roleId: 'C1', kind: 'player', connected: true, lastSeen: 0 };
    const before = publicDigest(spectator(state), data);
    const after = publicDigest(spectator(busy()), data);

    const types = deriveEvents(before, after).map((event) => event.type);
    expect(types).toEqual([
      'game.phase',
      'correspondence.published',
      'war.progress',
      'action.closed',
    ]);
    for (const type of types) expect(EVENT_TYPES).toContain(type);
  });

  it('announces a resolution without the faction\'s words', () => {
    let state = busy();
    const before = publicDigest(spectator(state), data);
    state = run(state, [
      [asPlayer('V1'), 'choose-opportunity', { opportunityId: 'o1', choice: 'A' }],
      [FACILITATOR, 'facilitator:resolve-opportunity', { opportunityId: 'o1', effects: [] }],
    ]);
    const events = deriveEvents(before, publicDigest(spectator(state), data));
    expect(events).toEqual([{
      type: 'opportunity.resolved',
      data: { opportunityId: 'o1', factionId: 'viva_mars', npcCode: null },
    }]);
  });

  it('reports each worksheet step as it lands, with what it applied', () => {
    let state = busy();
    const before = publicDigest(spectator(state), data);
    const step = state.turnUpdate.steps.find((s) => s.kind === 'war-progress');
    state = run(state, [[FACILITATOR, 'facilitator:confirm-update-step', { stepId: step.id }]]);
    const events = deriveEvents(before, publicDigest(spectator(state), data));
    const landed = events.find((event) => event.type === 'turn-update.step');
    expect(landed.data).toMatchObject({
      stepId: `t1:${step.id}`, kind: 'war-progress', status: 'confirmed',
    });
    // And the war moving is its own line.
    expect(events.some((event) => event.type === 'war.progress')).toBe(true);
  });

  it('says the game ended once, when time is called', () => {
    let state = busy();
    const before = publicDigest(spectator(state), data);
    state = run(state, [[FACILITATOR, 'facilitator:end-game', {}]]);
    const after = publicDigest(spectator(state), data);
    const types = deriveEvents(before, after).map((event) => event.type);
    expect(types).toContain('game.ended');
    // And nothing more from a quiet epilogue.
    expect(deriveEvents(after, after)).toEqual([]);
  });

  it('greets a return as a return, not an arrival', () => {
    const state = busy();
    const before = publicDigest(spectator(state), data);
    const away = structuredClone(state);
    away.seats.s1.connected = false;
    const gone = publicDigest(spectator(away), data);
    expect(deriveEvents(before, gone).map((event) => event.type)).toEqual(['seat.left']);
    expect(deriveEvents(gone, before).map((event) => event.type)).toEqual(['seat.returned']);
  });
});

describe('the envelope', () => {
  it('stamps monotonically and writes its keys in order', () => {
    const stamped = stampEvents(
      [{ type: 'game.phase', data: {} }, { type: 'war.progress', data: {} }],
      { game: 'PUMPED', at: 1234, seq: 7 });
    expect(stamped.map((envelope) => envelope.seq)).toEqual([7, 8]);
    for (const envelope of stamped) {
      expect(Object.keys(envelope)).toEqual(ENVELOPE_KEYS);
      expect(envelope.v).toBe(PUMP_SCHEMA_VERSION);
      expect(envelope.game).toBe('PUMPED');
    }
  });

  it('encodes as newline-terminated JSON a bot can split on', () => {
    const batch = encodeBatch(stampEvents(
      [{ type: 'game.phase', data: { turn: 1 } }], { game: 'G', at: 1, seq: 0 }));
    expect(batch.endsWith('\n')).toBe(true);
    expect(JSON.parse(batch.trim())).toMatchObject({ type: 'game.phase' });
  });
});
