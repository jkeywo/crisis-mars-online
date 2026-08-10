// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import '../../gui/components/cm-board-overlay.js';

const data = await loadData();

const mount = (mapId) => {
  const element = document.createElement('cm-board-overlay');
  element.setAttribute('map', mapId);
  document.body.append(element);
  return element;
};

const fresh = () => createInitialState({ joinCode: 'BOARD1', seed: 1, data });

beforeEach(() => { document.body.innerHTML = ''; });

describe('<cm-board-overlay>', () => {
  it('sits a chip on every printed value, at the geometry\'s own anchors', () => {
    // The three boards carry 5, 6 and 8 printed track values between them —
    // the whole nineteen, each chip positioned by percentage so it rides
    // the image at any width.
    const counts = {};
    for (const [mapId, boardId] of [
      ['earth_map', 'earth'], ['mars_map', 'mars'], ['belt_map', 'belt']]) {
      const overlay = mount(mapId);
      overlay.data = data;
      overlay.view = fresh();
      const chips = [...overlay.querySelectorAll('[data-chip]')];
      counts[mapId] = chips.length;

      for (const chip of chips) {
        const anchor = data.geometry.boards[boardId].tracks[chip.dataset.chip];
        expect(chip.style.left).toBe(`${anchor.x * 100}%`);
        expect(chip.style.top).toBe(`${anchor.y * 100}%`);
      }
      expect(overlay.querySelector('img').src).toContain(`${boardId}.png`);
    }
    expect(counts).toEqual({ earth_map: 5, mars_map: 6, belt_map: 8 });
  });

  it('shows the live value, not the printed one', () => {
    const overlay = mount('earth_map');
    overlay.data = data;
    const view = fresh();
    view.maps.earth_map.tracks.war_support = 9;
    overlay.view = view;
    expect(overlay.querySelector('[data-chip="war_support"]').textContent.trim()).toBe('9');
  });

  it('edits through the pencil: click, retype, commit as a delta', () => {
    const overlay = mount('earth_map');
    overlay.data = data;
    overlay.view = fresh();
    const raised = [];
    overlay.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    overlay.querySelector('[data-chip="war_support"] button').click();
    const input = overlay.querySelector('[data-chip="war_support"] input');
    expect(input.value).toBe('16');            // pre-filled with the current value

    input.value = '12';
    input.dispatchEvent(new Event('input'));
    overlay.querySelector('[data-commit]').click();

    // Typed 12 over 16: a delta of −4, so a player's spend between look and
    // commit survives — the inspector's own reasoning.
    expect(raised).toEqual([{
      verb: 'facilitator:adjust',
      payload: { path: ['maps', 'earth_map', 'tracks', 'war_support'], delta: -4 },
    }]);
    expect(overlay.querySelector('input')).toBeNull();   // edit closed
  });

  it('cancels by button and by Escape, committing nothing', () => {
    const overlay = mount('belt_map');
    overlay.data = data;
    overlay.view = fresh();
    const raised = [];
    overlay.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    overlay.querySelector('[data-chip="ceres_prosperity"] button').click();
    overlay.querySelector('[data-cancel]').click();
    expect(overlay.querySelector('input')).toBeNull();

    overlay.querySelector('[data-chip="ceres_prosperity"] button').click();
    const input = overlay.querySelector('input');
    input.value = '99';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(overlay.querySelector('input')).toBeNull();
    expect(raised).toEqual([]);
  });

  it('opens one chip at a time', () => {
    const overlay = mount('belt_map');
    overlay.data = data;
    overlay.view = fresh();
    overlay.querySelector('[data-chip="ceres_prosperity"] button').click();
    overlay.querySelector('[data-chip="earth_trade_route"] button').click();
    const editing = [...overlay.querySelectorAll('[data-editing="true"]')];
    expect(editing).toHaveLength(1);
    expect(editing[0].dataset.chip).toBe('earth_trade_route');
  });

  it('stands the war marker in the band that holds the value, on the right board', () => {
    // Earth carries the 0..9 hexes, Mars 10..20+; a quiet war marks nothing.
    const at = (value, mapId) => {
      document.body.innerHTML = '';
      const overlay = mount(mapId);
      overlay.data = data;
      const view = fresh();
      view.warProgress = value;
      overlay.view = view;
      return overlay.querySelector('[data-chip="war-progress"]');
    };

    expect(at(null, 'earth_map')).toBeNull();
    expect(at(null, 'mars_map')).toBeNull();

    const earth5 = at(5, 'earth_map');
    const band = data.geometry.boards.earth.warProgressBands
      .find(({ range: [low, high] }) => low <= 5 && 5 <= high);
    expect(earth5.style.left).toBe(`${band.x * 100}%`);
    expect(at(5, 'mars_map')).toBeNull();          // not this board's stretch

    expect(at(12, 'mars_map')).not.toBeNull();
    expect(at(12, 'earth_map')).toBeNull();
    // The open end swallows everything past twenty.
    expect(at(27, 'mars_map')).not.toBeNull();
    expect(at(27, 'belt_map')).toBeNull();
  });

  it('places the marker rather than nudging it', () => {
    const overlay = mount('mars_map');
    overlay.data = data;
    const view = fresh();
    view.warProgress = 12;
    overlay.view = view;
    const raised = [];
    overlay.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    overlay.querySelector('[data-chip="war-progress"] button').click();
    const input = overlay.querySelector('input');
    expect(input.value).toBe('12');
    input.value = '15';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(raised).toEqual([{
      verb: 'facilitator:set', payload: { path: ['warProgress'], value: 15 },
    }]);
  });

  it('clears the war marker back to "not begun" from its edit mode', () => {
    // The one control the retired state inspector alone used to have: the
    // war chip's edit mode carries a clear that sets warProgress to null.
    const overlay = mount('mars_map');
    overlay.data = data;
    const view = fresh();
    view.warProgress = 12;
    overlay.view = view;
    const raised = [];
    overlay.addEventListener('cm-facilitate', (e) => raised.push(e.detail));

    // Track chips carry no clear — only the marker can be lifted off.
    overlay.querySelector('[data-chip="senate_military"] button').click();
    expect(overlay.querySelector('[data-war-clear]')).toBeNull();
    overlay.querySelector('[data-cancel]').click();

    overlay.querySelector('[data-chip="war-progress"] button').click();
    overlay.querySelector('[data-war-clear]').click();
    expect(raised).toEqual([{
      verb: 'facilitator:set', payload: { path: ['warProgress'], value: null },
    }]);
    expect(overlay.querySelector('input')).toBeNull();   // edit closed
  });

  it('carries the placed action-card tokens under the image', () => {
    const overlay = mount('earth_map');
    overlay.data = data;
    const view = fresh();
    view.actionCards.C1 = { placed: 'earth_map', spent: false };
    overlay.view = view;
    const tokens = [...overlay.querySelectorAll('.cm-action-token')];
    expect(tokens.map((t) => t.dataset.code)).toEqual(['C1']);
    expect(tokens[0].getAttribute('style'))
      .toContain(data.factions.factions.canopy_corp.colour);
  });
});
