// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply } from '../../gui/rules/reducer.js';
import '../../gui/components/cm-turn-update.js';

const data = await loadData();
const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };

const mount = () => {
  const element = document.createElement('cm-turn-update');
  document.body.append(element);
  return element;
};

function run(state, script) {
  return script.reduce((at, [verb, payload]) => {
    const result = apply(at, data, { verb, payload }, FACILITATOR, { ts: 0 });
    if (!result.ok) throw new Error(`${verb} refused: ${result.reason}`);
    return result.state;
  }, state);
}

const actionPhase = () => run(createInitialState({ joinCode: 'T', seed: 1, data }), [
  ['facilitator:advance-phase', {}],
  ['facilitator:advance-phase', {}],
  ['facilitator:advance-phase', {}],
]);

beforeEach(() => { document.body.innerHTML = ''; });

describe('<cm-turn-update>', () => {
  it('offers Begin during an Action Phase and nothing before one', () => {
    const sheet = mount();
    sheet.data = data;
    sheet.view = createInitialState({ joinCode: 'T', seed: 1, data });
    expect(sheet.innerHTML).toBe('');

    sheet.view = actionPhase();
    const raised = [];
    sheet.addEventListener('cm-facilitate', (e) => raised.push(e.detail));
    sheet.querySelector('[data-begin]').click();
    expect(raised).toEqual([{ verb: 'facilitator:begin-turn-update', payload: {} }]);
  });

  it('draws each step in its own words and lands confirms and overrides', () => {
    let state = actionPhase();
    state = run(state, [
      ['facilitator:publish-correspondence', {
        turn: 1,
        effects: [{ track: 'war_progress', set: 11 }, { track: 'mars_trade_route', delta: -10 }],
      }],
      ['facilitator:begin-turn-update', {}],
    ]);
    const sheet = mount();
    sheet.data = data;
    sheet.view = state;

    // The two NPC leads, the collapsed-route damage, and the war step.
    expect(sheet.textContent).toContain('War Progress');
    expect(sheet.textContent).toContain('Terraforming Project');
    expect(sheet.textContent).toContain('Compose it on the Team Phase table');

    const raised = [];
    sheet.addEventListener('cm-facilitate', (e) => raised.push(e.detail));
    const war = state.turnUpdate.steps.find((s) => s.kind === 'war-progress');
    sheet.querySelector(`[data-confirm="${war.id}"]`).click();
    expect(raised.at(-1)).toEqual({
      verb: 'facilitator:confirm-update-step', payload: { stepId: war.id },
    });

    const damage = state.turnUpdate.steps.find((s) => s.trackId === 'terraforming_project');
    const input = sheet.querySelector(`[data-override-delta="${damage.id}"]`);
    input.value = '-2';
    sheet.querySelector(`[data-override="${damage.id}"]`).click();
    expect(raised.at(-1)).toEqual({
      verb: 'facilitator:override-update-step', payload: { stepId: damage.id, delta: -2 },
    });

    sheet.querySelector('[data-finish]').click();
    expect(raised.at(-1)).toEqual({ verb: 'facilitator:finish-turn-update', payload: {} });
  });

  it('narrates what has landed and quiets a finished sheet', () => {
    let state = actionPhase();
    state = run(state, [['facilitator:begin-turn-update', {}]]);
    for (const step of state.turnUpdate.steps) {
      state = run(state, [['facilitator:confirm-update-step', { stepId: step.id }]]);
    }
    state = run(state, [['facilitator:finish-turn-update', {}]]);

    const sheet = mount();
    sheet.data = data;
    sheet.view = state;
    expect(sheet.querySelector('.cm-worksheet').dataset.finished).toBe('true');
    expect(sheet.textContent).toContain('finished');
    expect(sheet.textContent).toContain('So far:');
    expect(sheet.querySelector('[data-finish]')).toBeNull();
    expect(sheet.querySelector('[data-confirm]')).toBeNull();
  });
});
