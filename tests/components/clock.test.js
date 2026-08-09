// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { projectView } from '../../gui/rules/views.js';
import { apply } from '../../gui/rules/reducer.js';
import { formatDuration } from '../../gui/components/cm-phase-clock.js';
import '../../gui/components/cm-phase-clock.js';
import '../../gui/components/cm-action-list.js';

const data = await loadData();
const MINUTE = 60_000;

const mount = (tag) => {
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
};

/** A clock frozen at a chosen moment. */
function clockAt({ endsAt = null, paused = false, pausedRemainingMs = null,
  name = 'team', turn = 1 }, now) {
  const clock = mount('cm-phase-clock');
  clock.now = () => now;
  clock.phase = { turn, name, endsAt, paused, pausedRemainingMs };
  return clock;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('the clock saying when it has crossed a line', () => {
  /** Re-render at a moment, as a tick would, and collect what was raised. */
  const tick = (clock, at) => { clock.now = () => at; clock.phase = clock._phase; };

  const listening = (clock) => {
    const heard = [];
    for (const kind of ['cm-time-up', 'cm-overtime']) {
      clock.addEventListener(kind, (e) => heard.push(`${kind}@${Math.round(e.detail.overMs)}`));
    }
    return heard;
  };

  it('says nothing while there is time left', () => {
    const clock = clockAt({ endsAt: 5 * MINUTE }, 0);
    const heard = listening(clock);
    tick(clock, 4 * MINUTE);
    tick(clock, 5 * MINUTE - 1);
    expect(heard).toEqual([]);
  });

  it('says the time is up once, however often it is asked', () => {
    const clock = clockAt({ endsAt: 5 * MINUTE }, 0);
    const heard = listening(clock);
    tick(clock, 5 * MINUTE + 100);
    tick(clock, 5 * MINUTE + 600);
    tick(clock, 5 * MINUTE + 1_100);
    expect(heard).toEqual(['cm-time-up@100']);
  });

  it('marks each ten seconds of overtime, once each', () => {
    const clock = clockAt({ endsAt: 5 * MINUTE }, 0);
    const heard = listening(clock);
    tick(clock, 5 * MINUTE + 1_000);        // time up
    tick(clock, 5 * MINUTE + 9_000);        // still the first ten seconds
    tick(clock, 5 * MINUTE + 10_500);       // second step
    tick(clock, 5 * MINUTE + 15_000);       // same step, nothing new
    tick(clock, 5 * MINUTE + 21_000);       // third
    expect(heard).toEqual([
      'cm-time-up@1000', 'cm-overtime@10500', 'cm-overtime@21000',
    ]);
  });

  it('does not empty a backlog at a facilitator who was on Discord', () => {
    // The reason this counts steps rather than elapsed time. A background tab
    // is throttled and can come back a long way behind; three minutes away
    // should be one beep on return, not eighteen.
    const clock = clockAt({ endsAt: 5 * MINUTE }, 0);
    const heard = listening(clock);
    tick(clock, 5 * MINUTE + 500);
    tick(clock, 8 * MINUTE);
    expect(heard).toEqual(['cm-time-up@500', 'cm-overtime@180000']);
  });

  it('starts again on the next phase', () => {
    const clock = clockAt({ endsAt: 5 * MINUTE }, 0);
    const heard = listening(clock);
    // First sight of this clock is already twelve seconds over, which is one
    // crossing and not two: the step it landed in is the step it starts from.
    tick(clock, 5 * MINUTE + 12_000);
    expect(heard).toEqual(['cm-time-up@12000']);

    clock.phase = { turn: 1, name: 'negotiation', endsAt: 20 * MINUTE, paused: false };
    tick(clock, 20 * MINUTE + 300);
    expect(heard).toEqual(['cm-time-up@12000', 'cm-time-up@300']);
  });

  it('goes quiet while paused, and does not shout on resume', () => {
    // A paused clock is not running out of anything. And the pause has to
    // clear what was counted, or resuming into overtime would say nothing
    // until the step it was already past came round again.
    const clock = clockAt({ endsAt: 5 * MINUTE }, 0);
    const heard = listening(clock);
    clock.phase = { turn: 1, name: 'team', endsAt: 5 * MINUTE, paused: true, pausedRemainingMs: -5_000 };
    tick(clock, 9 * MINUTE);
    expect(heard).toEqual([]);

    clock.phase = { turn: 1, name: 'team', endsAt: 5 * MINUTE, paused: false };
    tick(clock, 9 * MINUTE);
    expect(heard).toEqual(['cm-time-up@240000']);
  });

  it('says nothing in the lobby or the epilogue, which have no deadline', () => {
    const clock = clockAt({ endsAt: null, name: 'lobby' }, 9 * MINUTE);
    const heard = listening(clock);
    tick(clock, 99 * MINUTE);
    expect(heard).toEqual([]);
  });
});

describe('<cm-phase-clock>', () => {
  it('reads the time off the wall rather than counting ticks', () => {
    // The reason the component takes a deadline: a background tab has its
    // timers throttled, and a clock built by accumulating intervals comes back
    // minutes wrong. Here, three minutes of being throttled changes nothing —
    // the answer only depends on what time it is.
    const clock = clockAt({ endsAt: 5 * MINUTE }, 2 * MINUTE);
    expect(clock.querySelector('time').textContent).toBe('3:00');
    clock.now = () => 4 * MINUTE + 30_000;
    clock.phase = clock._phase;         // a re-render, as a tick would do
    expect(clock.querySelector('time').textContent).toBe('0:30');
  });

  it('runs past zero into overtime instead of stopping', () => {
    // A phase ends when the facilitator says so. An app that cut a negotiation
    // off at zero would be wrong about the game and maddening besides.
    const clock = clockAt({ endsAt: 5 * MINUTE }, 6 * MINUTE + 5000);
    expect(clock.querySelector('time').textContent).toBe('+1:05');
    expect(clock.dataset.state).toBe('over');
    expect(clock.textContent).toContain('the facilitator will call it');
  });

  it('warns in the last minute', () => {
    expect(clockAt({ endsAt: 5 * MINUTE }, 4 * MINUTE + 10_000).dataset.state).toBe('soon');
    expect(clockAt({ endsAt: 5 * MINUTE }, MINUTE).dataset.state).toBe('running');
  });

  it('holds still while paused, however long that lasts', () => {
    const clock = clockAt({ paused: true, pausedRemainingMs: 3 * MINUTE }, 99 * MINUTE);
    expect(clock.querySelector('time').textContent).toBe('3:00');
    expect(clock.dataset.state).toBe('paused');
    expect(clock.textContent).toContain('Paused');
  });

  it('shows no time at all in the lobby', () => {
    const clock = clockAt({ name: 'lobby' }, 0);
    expect(clock.querySelector('time').textContent).toBe('');
    expect(clock.textContent).toContain('Waiting to begin');
    expect(clock.dataset.state).toBe('idle');
  });

  it('names the phase and says what it is for', () => {
    const clock = clockAt({ name: 'negotiation', turn: 3, endsAt: MINUTE }, 0);
    expect(clock.textContent).toContain('Turn 3');
    expect(clock.textContent).toContain('Negotiation Phase');
    expect(clock.textContent).toContain('Place your action card');
  });

  it('names the action phase and the epilogue in the game\'s own words', () => {
    const action = clockAt({ name: 'action', turn: 4, endsAt: MINUTE }, 0);
    expect(action.textContent).toContain('Action Phase');
    expect(action.textContent).toContain('initiative order');
    const over = clockAt({ name: 'epilogue' }, 0);
    expect(over.textContent).toContain('Time has been called');
  });

  it('formats as minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(10 * MINUTE)).toBe('10:00');
  });
});

describe('<cm-action-list>', () => {
  /** A seated player, projected, with the game moved to a chosen phase. */
  function seated(phaseName) {
    let state = createInitialState({ joinCode: 'MARS42X', seed: 1, data });
    state.seats.s1 = { id: 's1', token: 't', name: 'A', roleId: 'C1', kind: 'player', connected: true, lastSeen: 0 };
    state.seats.s9 = { id: 's9', token: 'f', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
    state.roles.C1.claimedBySeat = 's1';
    const facilitator = { seatId: 's9', kind: 'facilitator', roleId: null };
    while (state.phase.name !== phaseName) {
      state = apply(state, data, { verb: 'facilitator:advance-phase', payload: {} },
        facilitator, { ts: 0 }).state;
    }
    return projectView(state, data, {
      kind: 'player', seatId: 's1', roleId: 'C1', teamId: 'canopy_corp',
    });
  }

  it('never offers a facilitator command to a player', () => {
    const list = mount('cm-action-list');
    list.data = data;
    list.view = seated('team');
    const verbs = [...list.querySelectorAll('[data-verb]')].map((b) => b.dataset.verb);
    expect(verbs.some((v) => v.startsWith('facilitator:'))).toBe(false);
  });

  it('says a talking phase has nothing to click rather than showing nothing', () => {
    // The skeleton has no player verbs beyond the lobby's, and claim-role has
    // its own control — so every playing phase is honest about being for
    // talking, instead of a blank rail nobody can interpret.
    const list = mount('cm-action-list');
    list.data = data;
    list.view = seated('negotiation');
    expect(list.textContent).toContain('for talking');
  });

  it('says the game is over in the epilogue\'s own words', () => {
    const list = mount('cm-action-list');
    list.data = data;
    const view = seated('team');
    view.phase = { ...view.phase, name: 'epilogue' };
    list.view = view;
    expect(list.textContent).toContain('Time has been called');
  });
});
