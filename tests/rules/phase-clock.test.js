import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState, PHASES } from '../../gui/rules/state.js';
import { apply } from '../../gui/rules/reducer.js';
import { admit, availableTo } from '../../gui/rules/admission.js';
import { remainingMs, phaseMinutes } from '../../gui/rules/commands.js';

const data = await loadData();
const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };
const MINUTE = 60_000;

function fresh() {
  const state = createInitialState({ joinCode: 'MARS42X', seed: 1, data });
  state.seats.s9 = { id: 's9', token: 't', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
  return state;
}

/** Run a facilitator command at a given moment. */
function at(state, ts, verb, payload = {}) {
  const result = apply(state, data, { verb, payload }, FACILITATOR, { ts });
  if (!result.ok) throw new Error(`${verb} refused: ${result.reason}`);
  return result.state;
}

describe('the two ends of the game', () => {
  const asPlayer = (roleId) => ({ seatId: `s-${roleId}`, kind: 'player', roleId });

  const seatedFresh = () => {
    const state = fresh();
    state.seats.s1 = {
      id: 's1', token: 't1', name: 'Jo', roleId: null, kind: 'player',
      connected: true, lastSeen: 0,
    };
    return state;
  };

  it('holds the pregame at nothing rather than leaving it without a clock', () => {
    // A phase of no length, held. Not "no clock", which is what a null
    // deadline gives and which leaves the facilitator's controls dead.
    expect(fresh().phase).toMatchObject({
      name: 'lobby', turn: 0, paused: true, pausedRemainingMs: 0, endsAt: null,
    });
    expect(remainingMs(fresh().phase, 999)).toBe(0);
  });

  it('cannot run out, so nothing can be over time before the game starts', () => {
    // Held means held: however long the room takes to sit down, the pregame
    // never crosses a deadline and never beeps at anybody.
    const phase = fresh().phase;
    expect(remainingMs(phase, 0)).toBe(0);
    expect(remainingMs(phase, 10 * MINUTE)).toBe(0);
    expect(remainingMs(phase, 10_000 * MINUTE)).not.toBeLessThan(0);
  });

  it('still lets somebody take a lanyard at either end', () => {
    // The whole business of the pregame; and after time is called it changes
    // nothing on the board, so refusing it would only strand a reconnection.
    const state = seatedFresh();
    const claim = { verb: 'claim-role', payload: { roleId: 'C2' } };
    expect(admit(state, data, claim, { seatId: 's1', kind: 'player', roleId: null }))
      .toMatchObject({ ok: true });

    const over = at(state, 0, 'facilitator:end-game');
    expect(over.phase.name).toBe('epilogue');
    expect(admit(over, data, claim, { seatId: 's1', kind: 'player', roleId: null }))
      .toMatchObject({ ok: true });
  });

  it('leaves the facilitator every one of their own controls', () => {
    // Blocking play is about players. An umpire fixing the board before the
    // room sits down, or correcting the record afterwards, is the reason the
    // inspector exists.
    const state = seatedFresh();
    for (const phase of [state, at(state, 0, 'facilitator:end-game')]) {
      expect(admit(phase, data, {
        verb: 'facilitator:set', payload: { path: ['warProgress'], value: 5 },
      }, FACILITATOR)).toMatchObject({ ok: true });
    }
  });

  it('offers a player nothing out of play but taking a lanyard', () => {
    // What is listed, not what is legal: a console renders this list, so an
    // action still in it out of play is one a player can see and press and be
    // refused for.
    const state = seatedFresh();
    const offered = (s) => availableTo(s, data, asPlayer('C1')).map((e) => e.verb);
    expect(offered(state)).toEqual(['claim-role']);
    expect(offered(at(state, 0, 'facilitator:end-game'))).toEqual(['claim-role']);
  });
});

describe('the clock is a deadline, not a countdown', () => {
  it('sets an end time from the printed length of the phase', () => {
    const state = at(fresh(), 1_000_000, 'facilitator:advance-phase');
    expect(state.phase.name).toBe('team');
    // Five minutes, as printed in the facilitator handbook.
    expect(state.phase.endsAt).toBe(1_000_000 + 5 * MINUTE);
  });

  it('gives the action phase its full ten minutes', () => {
    let state = fresh();
    let now = 0;
    for (const phase of PHASES) {
      state = at(state, now, 'facilitator:advance-phase');
      expect(state.phase.name).toBe(phase);
      expect(state.phase.endsAt - now).toBe(phaseMinutes(data, phase) * MINUTE);
      now += 1000;
    }
    expect(state.phase.name).toBe('action');
    expect(phaseMinutes(data, 'action')).toBe(10);
    expect(phaseMinutes(data, 'team')).toBe(5);
    expect(phaseMinutes(data, 'negotiation')).toBe(5);
  });

  it('is derived from the wall clock, so a throttled tab cannot drift', () => {
    // Nothing accumulates. Whatever the tab was doing, the answer is always
    // "the deadline, minus what time it is now".
    const state = at(fresh(), 0, 'facilitator:advance-phase');
    expect(remainingMs(state.phase, 0)).toBe(5 * MINUTE);
    expect(remainingMs(state.phase, 4 * MINUTE)).toBe(MINUTE);
    // And it keeps going past zero rather than stopping, because a phase ends
    // when the facilitator says so.
    expect(remainingMs(state.phase, 7 * MINUTE)).toBe(-2 * MINUTE);
  });

  it('leaves the lobby and the epilogue without a deadline', () => {
    expect(fresh().phase.endsAt).toBe(null);
    // One advance out of the lobby lands in turn one's Team Phase; four turns
    // of three phases later the game is over: twelve advances after the
    // first, thirteen in all.
    let state = fresh();
    let now = 0;
    let advances = 0;
    while (state.phase.name !== 'epilogue' && advances < 40) {
      state = at(state, now, 'facilitator:advance-phase');
      now += 1000;
      advances += 1;
    }
    expect(advances).toBe(1 + Number(data.meta.turns) * PHASES.length);
    expect(state.phase).toMatchObject({ turn: 4, name: 'epilogue', endsAt: null });
    expect(admit(state, data, { verb: 'facilitator:advance-phase' }, FACILITATOR))
      .toMatchObject({ ok: false, reason: 'the game is over' });
  });
});

describe('pausing', () => {
  it('keeps what was left and hands it back', () => {
    // A five-minute argument about a rule must not eat the phase it
    // interrupted, so the remaining time is stored rather than the deadline.
    let state = at(fresh(), 0, 'facilitator:advance-phase');
    state = at(state, 2 * MINUTE, 'facilitator:pause-clock');
    expect(state.phase).toMatchObject({ paused: true, endsAt: null, pausedRemainingMs: 3 * MINUTE });

    // Time passes while paused, and none of it counts.
    expect(remainingMs(state.phase, 30 * MINUTE)).toBe(3 * MINUTE);

    state = at(state, 10 * MINUTE, 'facilitator:pause-clock');
    expect(state.phase).toMatchObject({ paused: false, pausedRemainingMs: null });
    expect(state.phase.endsAt).toBe(13 * MINUTE);
  });

  it('refuses when there is no clock to pause', () => {
    // The pregame is one of the two ends of the game, held at nothing. It
    // reads as paused, but starting it would run a zero-second phase straight
    // into overtime and beep at a room that has not sat down; the way out of
    // it is Next phase.
    expect(admit(fresh(), data, { verb: 'facilitator:pause-clock' }, FACILITATOR))
      .toMatchObject({ ok: false, reason: 'there is no clock running' });

    const over = at(fresh(), 0, 'facilitator:end-game');
    expect(admit(over, data, { verb: 'facilitator:pause-clock' }, FACILITATOR))
      .toMatchObject({ ok: false, reason: 'there is no clock running' });
    expect(admit(over, data, { verb: 'facilitator:extend-clock', payload: { minutes: 1 } },
      FACILITATOR)).toMatchObject({ ok: false, reason: 'there is no clock running' });
  });

  it('starts the next phase running, whatever the last one was doing', () => {
    let state = at(fresh(), 0, 'facilitator:advance-phase');
    state = at(state, MINUTE, 'facilitator:pause-clock');
    state = at(state, 2 * MINUTE, 'facilitator:advance-phase');
    expect(state.phase).toMatchObject({ name: 'negotiation', paused: false, pausedRemainingMs: null });
    expect(state.phase.endsAt).toBe(2 * MINUTE + 5 * MINUTE);
  });
});

describe('stretching a phase', () => {
  it('adds and removes minutes', () => {
    let state = at(fresh(), 0, 'facilitator:advance-phase');
    state = at(state, 0, 'facilitator:extend-clock', { minutes: 2 });
    expect(state.phase.endsAt).toBe(7 * MINUTE);
    state = at(state, 0, 'facilitator:extend-clock', { minutes: -3 });
    expect(state.phase.endsAt).toBe(4 * MINUTE);
  });

  it('will not push a deadline into the past', () => {
    let state = at(fresh(), 0, 'facilitator:advance-phase');
    state = at(state, MINUTE, 'facilitator:extend-clock', { minutes: -30 });
    expect(state.phase.endsAt).toBe(MINUTE);   // now, not before now
  });

  it('stretches the stored remainder while paused', () => {
    let state = at(fresh(), 0, 'facilitator:advance-phase');
    state = at(state, MINUTE, 'facilitator:pause-clock');
    state = at(state, MINUTE, 'facilitator:extend-clock', { minutes: 2 });
    expect(state.phase.pausedRemainingMs).toBe(6 * MINUTE);
  });

  it('wants to be told how many minutes', () => {
    const state = at(fresh(), 0, 'facilitator:advance-phase');
    expect(admit(state, data, { verb: 'facilitator:extend-clock', payload: {} }, FACILITATOR))
      .toMatchObject({ ok: false, reason: 'say how many minutes' });
    expect(admit(state, data, { verb: 'facilitator:extend-clock', payload: { minutes: 0 } },
      FACILITATOR).ok).toBe(false);
  });
});

describe('the turn', () => {
  it('rolls over after the action phase and resets the action cards', () => {
    let state = fresh();
    let now = 0;
    // lobby → team → negotiation → action.
    for (let i = 0; i <= PHASES.length - 1; i += 1) {
      state = at(state, now, 'facilitator:advance-phase');
      now += 1000;
    }
    expect(state.phase).toMatchObject({ turn: 1, name: 'action' });
    state.actionCards.C1 = { placed: 'earth_map', spent: true };

    state = at(state, now, 'facilitator:advance-phase');
    expect(state.phase).toMatchObject({ turn: 2, name: 'team' });
    expect(state.actionCards.C1).toEqual({ placed: null, spent: false });
  });

  it('replays to the same deadlines it had the first time', async () => {
    // The clock is in state, so a restored game is not merely at the right
    // phase — it is the right distance into it.
    const { replay } = await import('../../gui/rules/reducer.js');
    const { toSave } = await import('../../gui/rules/command-log.js');
    let state = at(fresh(), 500_000, 'facilitator:advance-phase');
    state = at(state, 600_000, 'facilitator:extend-clock', { minutes: 3 });
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    expect(rebuilt.phase).toMatchObject({ name: 'team', endsAt: state.phase.endsAt });
  });
});
