// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply } from '../../gui/rules/reducer.js';
import { projectView } from '../../gui/rules/views.js';
import '../../gui/components/cm-epilogue.js';

const data = await loadData();
const aftermath = JSON.parse(await readFile(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'aftermath.json'), 'utf8'));

const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };

const mount = () => {
  const element = document.createElement('cm-epilogue');
  document.body.append(element);
  return element;
};

/** A short game, ended: the war stood at 14, one override on the record. */
function ended() {
  let state = createInitialState({ joinCode: 'OVER', seed: 3, data });
  for (const [verb, payload] of [
    ['facilitator:advance-phase', {}],
    ['facilitator:set', { path: ['warProgress'], value: 14 }],
    ['facilitator:end-game', {}],
  ]) {
    const result = apply(state, data, { verb, payload }, FACILITATOR, { ts: 1 });
    if (!result.ok) throw new Error(result.reason);
    state = result.state;
  }
  return state;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('<cm-epilogue>', () => {
  it('gives the facilitator the whole debrief: outcome, goals, ledger, notes', () => {
    const panel = mount();
    panel.data = data;
    panel.aftermath = aftermath;
    panel.view = ended();   // the host's own state carries the log

    // The war: 14 is Mars Low Orbit on the printed route, unresolved.
    expect(panel.textContent).toContain('Low Orbit');
    expect(panel.textContent).toContain('Neither capital fell');
    // The goal walk names factions, cites evidence values, and says when
    // something is judged at the table.
    expect(panel.textContent).toContain('Canopy Corp');
    expect(panel.textContent).toContain('Terraforming Project 20');
    expect(panel.textContent).toContain('judged at the table');
    // Personal reckonings resolve briefing ids to printed names.
    expect(panel.textContent).toContain('Canopy Corp C.E.O.');
    // The ledger separates the game from the pencil: one facilitator:set.
    expect(panel.textContent).toContain('facilitator:set');
    expect(panel.textContent).toContain('warProgress = 14');
    expect(panel.querySelector('textarea')).toBeTruthy();
  });

  it('emits the notes as an ordinary override command', () => {
    const panel = mount();
    panel.data = data;
    panel.aftermath = aftermath;
    panel.view = ended();
    const raised = [];
    panel.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    panel.querySelector('textarea').value = 'A close-run thing.';
    panel.querySelector('[data-save-notes]').click();
    expect(raised).toEqual([{
      verb: 'facilitator:set',
      payload: { path: ['facilitatorNotes', 'epilogue'], value: 'A close-run thing.' },
    }]);
  });

  it('shows a player the public portrait and none of the facilitator\'s half', () => {
    const panel = mount();
    panel.data = data;
    // No aftermath — the player page never loads that file — and a player
    // projection, which carries no log.
    panel.view = projectView(ended(), data,
      { kind: 'player', roleId: 'C1', teamId: 'canopy_corp' });

    expect(panel.textContent).toContain('Low Orbit');
    expect(panel.textContent).toContain('The boards, as they closed');
    expect(panel.textContent).not.toContain('How everyone did');
    expect(panel.textContent).not.toContain('umpire changed');
    expect(panel.querySelector('textarea')).toBeNull();
  });

  it('says plainly when the war never began', () => {
    let state = createInitialState({ joinCode: 'QUIET', seed: 1, data });
    const result = apply(state, data,
      { verb: 'facilitator:end-game', payload: {} }, FACILITATOR, { ts: 1 });
    state = result.state;

    const panel = mount();
    panel.data = data;
    panel.aftermath = aftermath;
    panel.view = state;
    expect(panel.textContent).toContain('The war never began.');
  });
});
