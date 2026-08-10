import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply, replay } from '../../gui/rules/reducer.js';
import { admit } from '../../gui/rules/admission.js';
import { toSave } from '../../gui/rules/command-log.js';
import { unclassifiedPaths } from '../../gui/rules/views.js';
import { computeTurnUpdate, conditionHolds } from '../../gui/rules/turn-update.js';

const data = await loadData();
const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };

function run(state, script) {
  return script.reduce((at, [actor, verb, payload]) => {
    const result = apply(at, data, { verb, payload }, actor, { ts: 7000 + at.log.length });
    if (!result.ok) throw new Error(`${verb} refused: ${result.reason}`);
    return result.state;
  }, state);
}

/** A fresh game walked into turn one's Action Phase. */
function actionPhase() {
  let state = createInitialState({ joinCode: 'TESTING', seed: 42, data });
  state.seats.s9 = { id: 's9', token: 'f', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
  for (let i = 0; i < 3; i += 1) {
    state = run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);
  }
  return state;
}

const set = (state, trackId, value) => {
  for (const board of Object.values(state.maps)) {
    if (trackId in board.tracks) board.tracks[trackId] = value;
  }
};

describe('the printed conditions', () => {
  it('reads both shapes the gamespec prints', () => {
    const state = actionPhase();
    expect(conditionHolds(state, 'earth_trade_route < 4')).toBe(false);
    set(state, 'earth_trade_route', 3);
    expect(conditionHolds(state, 'earth_trade_route < 4')).toBe(true);
    // ceres 12 against 3 + 12 = 15: not over. Drop mars trade to 2: 12 > 5.
    expect(conditionHolds(state, 'ceres_prosperity > earth_trade_route + mars_trade_route')).toBe(false);
    set(state, 'mars_trade_route', 2);
    expect(conditionHolds(state, 'ceres_prosperity > earth_trade_route + mars_trade_route')).toBe(true);
  });
});

describe('the proposals', () => {
  it('proposes the leads and the unpaid tithe at the printed opening', () => {
    // At initial values no trade route is below four, neither prosperity is
    // over its cap, war support and oversight sit between their thresholds —
    // so the worksheet is the tithe reminder (nothing was paid in this bare
    // fixture) and the two lead triggers; the war is not begun, so no war
    // step either.
    const steps = computeTurnUpdate(actionPhase(), data);
    expect(steps.map((s) => s.kind)).toEqual(['tithe', 'opportunity', 'opportunity']);
    expect(steps.every((s) => s.status === 'proposed')).toBe(true);
    expect(steps[0]).toMatchObject({ paid: 0, owed: 1, refused: false });
  });

  it('drops the tithe reminder once the due is met, and names a refusal', () => {
    const paid = actionPhase();
    paid.tithe.paidCardIds = ['rc_b1_1'];
    expect(computeTurnUpdate(paid, data).some((s) => s.kind === 'tithe')).toBe(false);

    const refused = actionPhase();
    refused.tithe.refused = true;
    const step = computeTurnUpdate(refused, data).find((s) => s.kind === 'tithe');
    expect(step).toMatchObject({ refused: true, paid: 0, owed: 1 });
    expect(step.printed).toContain('Shipping Control');
  });

  it('hands the two opening leads to the two NPCs, facilitator-targeted', () => {
    // Senate control: politicians 12 over people 0 — the Speaker's moment.
    // Shipping control: UN 12 over Belt Union 4, lead 8 — the Ambassador's.
    const steps = computeTurnUpdate(actionPhase(), data);
    const senate = steps.find((s) => s.triggerId === 'senate_control_lead');
    const shipping = steps.find((s) => s.triggerId === 'shipping_control_lead');
    expect(senate).toMatchObject({ kind: 'opportunity', npcCode: 'N2', factionId: null });
    expect(senate.note).toContain('leads by 12');
    expect(shipping).toMatchObject({ kind: 'opportunity', npcCode: 'N1', factionId: null });
    expect(shipping.note).toContain('leads by 8');
  });

  it('falls to the otherwise branch when nobody leads by the margin', () => {
    const state = actionPhase();
    set(state, 'senate_control_people', 9);   // politicians 12: lead 3 < 4
    const steps = computeTurnUpdate(state, data);
    const senate = steps.find((s) => s.triggerId === 'senate_control_lead');
    expect(senate.kind).toBe('otherwise');
    expect(senate.text).toContain('unrest');
  });

  it('fires the thresholds when a track crosses its printed line', () => {
    const state = actionPhase();
    set(state, 'war_support', 19);            // > 18: the UNSS's moment
    set(state, 'un_oversight', 1);            // < 2: Canopy's
    const steps = computeTurnUpdate(state, data);
    expect(steps.find((s) => s.triggerId === 'war_support_high'))
      .toMatchObject({ kind: 'opportunity', factionId: 'unss' });
    expect(steps.find((s) => s.triggerId === 'un_oversight_low'))
      .toMatchObject({ kind: 'opportunity', factionId: 'canopy_corp' });
    expect(steps.find((s) => s.triggerId === 'war_support_low')).toBeUndefined();
  });

  it('surfaces the printed trade-route damage and prosperity caps as zero-suggestion steps', () => {
    const state = actionPhase();
    set(state, 'earth_trade_route', 3);       // hurts Luna, caps Ceres sooner
    set(state, 'mars_trade_route', 2);        // hurts the terraforming
    const steps = computeTurnUpdate(state, data);
    const qualitative = steps.filter((s) => s.kind === 'qualitative');
    expect(qualitative.map((s) => s.trackId).sort()).toEqual(
      ['ceres_prosperity', 'luna_prosperity', 'terraforming_project', 'vesta_and_pallas_prosperity']);
    for (const step of qualitative) {
      expect(step.suggestedDelta).toBe(0);
      expect(step.printed.length).toBeGreaterThan(10);
    }
  });

  it('moves the war by the difference of the militaries, clamped by the routes', () => {
    const state = actionPhase();
    state.warProgress = 11;
    set(state, 'earth_gov_military', 10);
    set(state, 'senate_military', 3);
    expect(computeTurnUpdate(state, data).find((s) => s.kind === 'war-progress'))
      .toMatchObject({ from: 11, to: 18, delta: 7, clamps: [] });

    // Earth's route collapses: the war cannot end higher than it started.
    set(state, 'earth_trade_route', 3);
    const clamped = computeTurnUpdate(state, data).find((s) => s.kind === 'war-progress');
    expect(clamped).toMatchObject({ from: 11, to: 11, delta: 0 });
    expect(clamped.clamps[0]).toContain('cannot end higher');

    // And the mirror: Mars's route collapses against a Martian advance.
    set(state, 'earth_trade_route', 16);
    set(state, 'senate_military', 15);
    set(state, 'mars_trade_route', 2);
    const mirrored = computeTurnUpdate(state, data).find((s) => s.kind === 'war-progress');
    expect(mirrored).toMatchObject({ from: 11, to: 11, delta: 0 });
    expect(mirrored.clamps[0]).toContain('cannot end lower');
  });

  it('skips the war entirely while it has not begun', () => {
    const steps = computeTurnUpdate(actionPhase(), data);
    expect(steps.some((s) => s.kind === 'war-progress')).toBe(false);
    expect(steps.some((s) => s.kind === 'surrender')).toBe(false);
  });

  it('flags a surrender boundary rather than ending anything', () => {
    const state = actionPhase();
    state.warProgress = 18;
    set(state, 'earth_gov_military', 5);
    set(state, 'senate_military', 0);
    const steps = computeTurnUpdate(state, data);
    expect(steps.find((s) => s.kind === 'war-progress')).toMatchObject({ to: 23 });
    expect(steps.find((s) => s.kind === 'surrender')).toMatchObject({ side: 'mars' });

    state.warProgress = 2;
    set(state, 'earth_gov_military', 0);
    set(state, 'senate_military', 6);
    const floor = computeTurnUpdate(state, data);
    expect(floor.find((s) => s.kind === 'war-progress')).toMatchObject({ to: 0, delta: -2 });
    expect(floor.find((s) => s.kind === 'surrender')).toMatchObject({ side: 'earth' });
  });
});

describe('the worksheet verbs', () => {
  it('begins only in an Action Phase, and only once a turn', () => {
    let state = createInitialState({ joinCode: 'T', seed: 1, data });
    state.seats.s9 = { id: 's9', token: 'f', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
    state = run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);
    expect(admit(state, data,
      { verb: 'facilitator:begin-turn-update' }, FACILITATOR).reason)
      .toContain('end of an Action Phase');

    state = run(state, [
      [FACILITATOR, 'facilitator:advance-phase', {}],
      [FACILITATOR, 'facilitator:advance-phase', {}],
      [FACILITATOR, 'facilitator:begin-turn-update', {}],
    ]);
    expect(state.turnUpdate.turn).toBe(1);
    expect(state.turnUpdate.steps.length).toBeGreaterThan(0);
    expect(admit(state, data,
      { verb: 'facilitator:begin-turn-update' }, FACILITATOR).reason)
      .toContain('already begun');
  });

  it('confirms and overrides, and replays to the same boards', () => {
    let state = actionPhase();
    // Start the war and tilt the militaries so the worksheet has a real
    // war step, then collapse a route so a qualitative step appears too.
    state = run(state, [
      [FACILITATOR, 'facilitator:publish-correspondence', {
        turn: 1,
        effects: [
          { track: 'war_progress', set: 11 },
          { track: 'earth_gov_military', delta: 3 },
          { track: 'mars_trade_route', delta: -10 },
        ],
      }],
      [FACILITATOR, 'facilitator:begin-turn-update', {}],
    ]);

    const steps = state.turnUpdate.steps;
    const war = steps.find((s) => s.kind === 'war-progress');
    // Mars's route is at 2, so an Earth advance stands but a Martian one
    // would not: militaries 7 v 0, delta +7.
    expect(war).toMatchObject({ from: 11, to: 18, delta: 7 });
    const terraforming = steps.find((s) => s.trackId === 'terraforming_project');
    expect(terraforming.kind).toBe('qualitative');

    state = run(state, [
      [FACILITATOR, 'facilitator:confirm-update-step', { stepId: war.id }],
      [FACILITATOR, 'facilitator:override-update-step',
        { stepId: terraforming.id, delta: -2 }],
      [FACILITATOR, 'facilitator:finish-turn-update', {}],
    ]);
    expect(state.warProgress).toBe(18);
    expect(state.maps.mars_map.tracks.terraforming_project).toBe(18);
    expect(state.turnUpdate.finished).toBe(true);
    expect(state.turnUpdate.steps.find((s) => s.id === war.id).status).toBe('confirmed');
    expect(state.turnUpdate.steps.find((s) => s.id === terraforming.id).status).toBe('overridden');

    // A confirmed step stays confirmed.
    expect(admit(state, data, {
      verb: 'facilitator:confirm-update-step', payload: { stepId: war.id },
    }, FACILITATOR).reason).toContain('already answered');

    // The load-bearing half: the whole worksheet rebuilds from the log.
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    expect(rebuilt.turnUpdate).toEqual(state.turnUpdate);
    expect(rebuilt.maps).toEqual(state.maps);
    expect(rebuilt.warProgress).toBe(18);
  });

  it('acknowledges an opportunity proposal without moving anything', () => {
    let state = run(actionPhase(), [[FACILITATOR, 'facilitator:begin-turn-update', {}]]);
    const proposal = state.turnUpdate.steps.find((s) => s.kind === 'opportunity');
    const before = structuredClone(state.maps);
    expect(admit(state, data, {
      verb: 'facilitator:override-update-step', payload: { stepId: proposal.id, delta: 1 },
    }, FACILITATOR).reason).toContain('nothing to override');
    state = run(state, [[FACILITATOR, 'facilitator:confirm-update-step',
      { stepId: proposal.id }]]);
    expect(state.maps).toEqual(before);
    expect(state.turnUpdate.steps.find((s) => s.id === proposal.id).status).toBe('confirmed');
  });

  it('dies with the turn, unanswered steps and all', () => {
    let state = run(actionPhase(), [[FACILITATOR, 'facilitator:begin-turn-update', {}]]);
    state = run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);
    expect(state.phase).toMatchObject({ turn: 2, name: 'team' });
    expect(state.turnUpdate).toBe(null);
  });

  it('classifies every path of a worksheet in progress', () => {
    const state = run(actionPhase(), [[FACILITATOR, 'facilitator:begin-turn-update', {}]]);
    expect(unclassifiedPaths(state)).toEqual([]);
  });
});
