// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply } from '../../gui/rules/reducer.js';
import { projectView } from '../../gui/rules/views.js';
import '../../gui/components/cm-initiative-queue.js';
import '../../gui/components/cm-action-spotlight.js';
import '../../gui/components/cm-adjudication.js';

const data = await loadData();
const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };
const asPlayer = (code) => ({ seatId: `s-${code}`, kind: 'player', roleId: code });

const mount = (tag, attrs = {}) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  document.body.append(element);
  return element;
};

function run(state, script) {
  return script.reduce((at, [actor, verb, payload]) => {
    const result = apply(at, data, { verb, payload }, actor, { ts: 5000 + at.log.length });
    if (!result.ok) throw new Error(`${verb} refused: ${result.reason}`);
    return result.state;
  }, state);
}

/** A ten-player game in the Action Phase, everyone placed on Earth's map bar V/D/B. */
function actionPhase() {
  let state = createInitialState({ joinCode: 'TESTING', seed: 7, data, playerCount: 10 });
  state = run(state, [
    [FACILITATOR, 'facilitator:advance-phase', {}],
    [FACILITATOR, 'facilitator:advance-phase', {}],
  ]);
  const mapFor = { C: 'earth_map', U: 'earth_map', V: 'mars_map', D: 'mars_map', B: 'belt_map' };
  for (const code of state.rosterCodes) {
    state = run(state, [[asPlayer(code), 'place-action-card', { mapId: mapFor[code[0]] }]]);
  }
  return run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);
}

const projectFor = (state, roleId) => projectView(state, data, roleId
  ? { kind: 'player', seatId: 's1', roleId, teamId: data.roles.roles[roleId]?.factionId }
  : { kind: 'spectator', roleId: null, teamId: null });

beforeEach(() => { document.body.innerHTML = ''; });

describe('<cm-initiative-queue>', () => {
  it('draws the call order: done struck, live ringed, next marked', () => {
    let state = actionPhase();
    const [first, second] = state.initiative.queues.earth_map;
    state = run(state, [
      [FACILITATOR, 'facilitator:call-next', { mapId: 'earth_map' }],
      [FACILITATOR, 'facilitator:close-action', { actionId: 'a1' }],
    ].slice(0, 1));   // just the call — a1 is live

    const queue = mount('cm-initiative-queue', { map: 'earth_map' });
    queue.now = () => state.actions.a1.endsAt - 30_000;
    queue.data = data;
    queue.view = projectFor(state, null);

    const live = queue.querySelector('[data-live="true"]');
    expect(live.textContent).toContain(data.roles.roles[first].name);
    expect(live.querySelector('.cm-queue-ring').textContent).toBe('30s');
    expect(live.dataset.state).toBe('running');
    expect(queue.querySelector('[data-next="true"]')).toBeNull();   // someone is live
    void second;
  });

  it('greys the done and marks the next when nobody is live', () => {
    let state = actionPhase();
    const [first, second] = state.initiative.queues.earth_map;
    state = run(state, [
      [FACILITATOR, 'facilitator:call-next', { mapId: 'earth_map' }],
      [FACILITATOR, 'facilitator:skip-action', { mapId: 'earth_map' }],
    ]);
    const queue = mount('cm-initiative-queue', { map: 'earth_map' });
    queue.data = data;
    queue.view = projectFor(state, null);

    expect(queue.querySelector('[data-done="true"]').textContent)
      .toContain(data.roles.roles[first].name);
    expect(queue.querySelector('[data-next="true"]').textContent)
      .toContain(data.roles.roles[second].name);
  });

  it('announces ten seconds and time, once each', () => {
    const state = run(actionPhase(),
      [[FACILITATOR, 'facilitator:call-next', { mapId: 'earth_map' }]]);
    const endsAt = state.actions.a1.endsAt;
    const queue = mount('cm-initiative-queue', { map: 'earth_map' });
    const heard = [];
    queue.addEventListener('cm-spotlight-warning', () => heard.push('warning'));
    queue.addEventListener('cm-spotlight-up', () => heard.push('up'));
    queue.data = data;

    queue.now = () => endsAt - 30_000;
    queue.view = projectFor(state, null);
    expect(heard).toEqual([]);

    queue.now = () => endsAt - 9_000;    // crossing ten seconds
    queue.now = () => endsAt - 8_000;    // still inside it: nothing new
    expect(heard).toEqual(['warning']);

    queue.now = () => endsAt + 500;      // time
    queue.now = () => endsAt + 20_000;   // long past: still one call
    expect(heard).toEqual(['warning', 'up']);
  });
});

describe('<cm-action-spotlight>', () => {
  it('offers the actor the declaration form, and sends what they wrote', () => {
    const state = run(actionPhase(),
      [[FACILITATOR, 'facilitator:call-next', { mapId: 'earth_map' }]]);
    const actor = state.actions.a1.actorCode;
    const spotlight = mount('cm-action-spotlight', { map: 'earth_map' });
    spotlight.data = data;
    spotlight.view = projectFor(state, actor);

    const raised = [];
    spotlight.addEventListener('cm-command', (e) => raised.push(e.detail));

    const form = spotlight.querySelector('[data-declare]');
    form.elements.text.value = 'I torch the shipyard';
    form.querySelector('input[name="card"]').checked = true;
    const offered = form.querySelector('input[name="card"]').value;
    form.dispatchEvent(new Event('submit'));

    expect(raised).toEqual([{
      verb: 'declare-action',
      payload: {
        actionId: 'a1', text: 'I torch the shipyard',
        allyCodes: [], cardIds: [offered],
      },
    }]);
  });

  it('mirrors the record read-only for everyone else', () => {
    let state = run(actionPhase(),
      [[FACILITATOR, 'facilitator:call-next', { mapId: 'earth_map' }]]);
    const actor = state.actions.a1.actorCode;
    state = run(state, [[asPlayer(actor), 'declare-action',
      { actionId: 'a1', text: 'I torch the shipyard', allyCodes: [], cardIds: [] }]]);

    const spotlight = mount('cm-action-spotlight', { map: 'earth_map' });
    spotlight.data = data;
    spotlight.view = projectFor(state, null);   // a spectator
    expect(spotlight.textContent).toContain('I torch the shipyard');
    expect(spotlight.textContent).toContain('Impact');
    expect(spotlight.querySelector('[data-declare]')).toBeNull();
  });

  it('asks an invited ally, and sends their answer', () => {
    let state = run(actionPhase(),
      [[FACILITATOR, 'facilitator:call-next', { mapId: 'earth_map' }]]);
    const actor = state.actions.a1.actorCode;
    const ally = state.initiative.queues.earth_map[0];   // same map, next up
    state = run(state, [[asPlayer(actor), 'declare-action',
      { actionId: 'a1', text: 'together', allyCodes: [ally], cardIds: [] }]]);

    const spotlight = mount('cm-action-spotlight', { map: 'earth_map' });
    spotlight.data = data;
    spotlight.view = projectFor(state, ally);
    const raised = [];
    spotlight.addEventListener('cm-command', (e) => raised.push(e.detail));

    spotlight.querySelector('[data-confirm]').click();
    expect(raised).toEqual([{ verb: 'confirm-ally', payload: { actionId: 'a1' } }]);
  });
});

describe('<cm-adjudication>', () => {
  it('offers the call when the lane is idle', () => {
    const state = actionPhase();
    const panel = mount('cm-adjudication', { map: 'belt_map' });
    panel.data = data;
    panel.view = state;   // the facilitator's own state
    const raised = [];
    panel.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    expect(panel.textContent).toContain(data.roles.roles[state.initiative.queues.belt_map[0]].name);
    panel.querySelector('[data-call]').click();
    expect(raised).toEqual([{
      verb: 'facilitator:call-next', payload: { mapId: 'belt_map' },
    }]);
  });

  it('walks the procedure: rule, difficulty, roll, close', () => {
    let state = run(actionPhase(),
      [[FACILITATOR, 'facilitator:call-next', { mapId: 'earth_map' }]]);
    const actor = state.actions.a1.actorCode;
    const mine = Object.values(state.cards)
      .filter((c) => c.holderCode === actor && c.ownerCode === actor).map((c) => c.id);
    state = run(state, [[asPlayer(actor), 'declare-action',
      { actionId: 'a1', text: 'the depot burns', allyCodes: [], cardIds: [mine[0], mine[1]] }]]);

    const panel = mount('cm-adjudication', { map: 'earth_map' });
    panel.data = data;
    panel.view = state;
    const raised = [];
    panel.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    expect(panel.textContent).toContain('the depot burns');
    expect(panel.textContent).toContain('Impact');

    // Veto the second card by unticking it, then rule.
    const boxes = [...panel.querySelectorAll('input[name="accept"]')];
    boxes[1].checked = false;
    panel.querySelector('[data-rule]').click();
    expect(raised.at(-1)).toEqual({
      verb: 'facilitator:rule-resources',
      payload: { actionId: 'a1', acceptedCardIds: [mine[0]], vetoedCardIds: [mine[1]] },
    });

    panel.querySelector('[data-difficulty="-2"]').click();
    expect(raised.at(-1)).toEqual({
      verb: 'facilitator:set-difficulty', payload: { actionId: 'a1', difficulty: -2 },
    });

    panel.querySelector('[data-roll]').click();
    expect(raised.at(-1)).toEqual({
      verb: 'facilitator:roll-consequence', payload: { actionId: 'a1' },
    });

    panel.querySelector('[data-close]').click();
    expect(raised.at(-1)).toEqual({
      verb: 'facilitator:close-action', payload: { actionId: 'a1' },
    });
  });

  it('stages effects against the live budgets and applies them whole', () => {
    let state = run(actionPhase(),
      [[FACILITATOR, 'facilitator:call-next', { mapId: 'earth_map' }]]);
    const actor = state.actions.a1.actorCode;
    state = run(state, [
      [asPlayer(actor), 'declare-action',
        { actionId: 'a1', text: 'x', allyCodes: [], cardIds: [] }],
      [FACILITATOR, 'facilitator:roll-consequence', { actionId: 'a1' }],
    ]);

    const panel = mount('cm-adjudication', { map: 'earth_map' });
    panel.data = data;
    panel.view = state;
    const raised = [];
    panel.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    // The guidance table lights the action's own band column and nothing
    // else — advice on screen, never a clamp in the rules.
    expect(panel.textContent).toContain(`die ${state.actions.a1.roll}`);
    const lit = panel.querySelectorAll('.cm-guidance td[data-band="true"]');
    expect(lit).toHaveLength(4);   // one cell per printed table row
    expect(panel.textContent).toContain('Nothing here is enforced');

    const input = panel.querySelector('[data-track="war_support"]');
    input.value = '-1';
    input.dispatchEvent(new Event('change'));
    panel.querySelector('[data-apply]').click();

    expect(raised.at(-1)).toEqual({
      verb: 'facilitator:apply-effects',
      payload: {
        actionId: 'a1',
        effects: [{ trackId: 'war_support', delta: -1 }],
        regains: [],
        sabotage: [],
      },
    });

    // And the ledger control speaks a note and a bonus.
    panel.querySelector('[data-note-text]').value = 'Prepared for the future.';
    panel.querySelector('[data-add-note]').click();
    expect(raised.at(-1)).toEqual({
      verb: 'facilitator:note',
      payload: { code: actor, text: 'Prepared for the future.' },
    });
    panel.querySelector('[data-bonus]').value = '1';
    panel.querySelector('[data-set-bonus]').click();
    expect(raised.at(-1)).toEqual({
      verb: 'facilitator:set-bonus', payload: { actionId: 'a1', bonus: 1 },
    });
  });
});
