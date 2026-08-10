// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply } from '../../gui/rules/reducer.js';
import { projectView } from '../../gui/rules/views.js';
import '../../gui/components/cm-opportunity-card.js';

const data = await loadData();
const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };

const mount = (tag) => {
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
};

function delivered() {
  let state = createInitialState({ joinCode: 'TESTING', seed: 1, data });
  for (const payload of [
    {},
    {
      factionId: 'viva_mars', title: 'The garrison blinks',
      optionA: 'Strike now', optionB: 'Recruit deserters',
    },
  ]) {
    const verb = Object.keys(payload).length
      ? 'facilitator:deliver-opportunity' : 'facilitator:advance-phase';
    const result = apply(state, data, { verb, payload }, FACILITATOR, { ts: 0 });
    if (!result.ok) throw new Error(result.reason);
    state = result.state;
  }
  return state;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('<cm-opportunity-card>', () => {
  it('shows the faction its moment and records the tap', () => {
    const card = mount('cm-opportunity-card');
    card.data = data;
    card.view = projectView(delivered(), data,
      { kind: 'player', roleId: 'V1', teamId: 'viva_mars' });

    expect(card.textContent).toContain('The garrison blinks');
    expect(card.textContent).toContain('Strike now');

    const raised = [];
    card.addEventListener('cm-command', (e) => raised.push(e.detail));
    card.querySelector('[data-choose="o1|A"]').click();
    expect(raised).toEqual([{
      verb: 'choose-opportunity', payload: { opportunityId: 'o1', choice: 'A' },
    }]);
  });

  it('marks each seat\u2019s own vote and renders nothing for other factions', () => {
    const state = delivered();
    const chosen = apply(state, data, {
      verb: 'choose-opportunity', payload: { opportunityId: 'o1', choice: 'B' },
    }, { seatId: 's2', kind: 'player', roleId: 'V2' }, { ts: 1 });
    expect(chosen.ok).toBe(true);

    const card = mount('cm-opportunity-card');
    card.data = data;
    card.view = projectView(chosen.state, data,
      { kind: 'player', roleId: 'V1', teamId: 'viva_mars' });
    // V2 voted, not V1: the buttons mark the viewer's own vote only, and
    // the votes line names the team-mate's.
    expect(card.querySelector('[data-choose="o1|B"]').getAttribute('aria-pressed')).toBe('false');
    expect(card.textContent).toContain('Viva Mars Firebrand — B');
    expect(card.textContent).toContain('No consensus yet');

    // A Canopy player's projection carries the record's existence but none
    // of its words — redaction, not component politeness — so the card
    // renders nothing it cannot read.
    const other = mount('cm-opportunity-card');
    other.data = data;
    other.view = projectView(chosen.state, data,
      { kind: 'player', roleId: 'C1', teamId: 'canopy_corp' });
    expect(other.innerHTML).toBe('');
  });
});
