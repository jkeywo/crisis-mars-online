// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPage, installFetch, installPeer, fakeLocation } from './page-harness.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply } from '../../gui/rules/reducer.js';
import { projectView } from '../../gui/rules/views.js';
import { VIEW } from '../../gui/net/wire.js';

/** The player page, booted for real over the actual index.html markup. */

installFetch();
installPeer();

const $ = (id) => document.getElementById(id);
let app = null;

describe('index.html boots', () => {
  beforeAll(async () => {
    await loadPage('index.html');
    const { startPlayerApp } = await import('../../gui/client/player-app.js');
    app = await startPlayerApp({
      location: fakeLocation(),
      beeper: { beep: () => {} },
    });
  });

  it('opens on the join screen with the others hidden', () => {
    expect($('screen-code').hidden).toBe(false);
    for (const id of ['screen-name', 'screen-lobby', 'screen-game']) {
      expect($(id).hidden, id).toBe(true);
    }
  });

  it('built a tab panel per map: read-only board, call order, spotlight, placement', () => {
    for (const mapId of ['earth_map', 'mars_map', 'belt_map']) {
      const panel = $(`panel-${mapId}`);
      expect(panel, mapId).toBeTruthy();
      const overlay = panel.querySelector('cm-board-overlay');
      expect(overlay.hasAttribute('readonly')).toBe(true);
      expect(panel.querySelector('cm-initiative-queue')).toBeTruthy();
      expect(panel.querySelector('cm-action-spotlight')).toBeTruthy();
      expect(panel.querySelector(`[data-place-map="${mapId}"]`)).toBeTruthy();
    }
  });

  it('has the fixed panels: news, opportunities, tithe, role — and no action list', () => {
    for (const id of ['panel-news', 'panel-opportunities', 'panel-tithe', 'panel-role']) {
      expect($(id), id).toBeTruthy();
    }
    expect($('panel-role').querySelector('cm-role-card')).toBeTruthy();
    expect($('panel-role').querySelector('cm-hand')).toBeTruthy();
    expect($('panel-news').querySelector('#news-feed')).toBeTruthy();
    expect(document.querySelector('cm-action-list')).toBeNull();
    expect(document.querySelector('#all-hands')).toBeNull();
  });

  it('wired the join form: a bad code is refused in words', () => {
    $('join-code').value = 'NOPE';
    $('code-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect($('code-error').textContent).toContain('not right');
    expect($('screen-code').hidden).toBe(false);
  });

  it('renders the tab strip from a live projection — Tithe for the Belt alone', () => {
    // A real mid-game state fed straight into the page's client, the way a
    // projection arrives off the wire.
    const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };
    let state = createInitialState({ joinCode: 'MARS42X', seed: 7, data: app.data });
    for (const [verb, payload] of [
      ['facilitator:advance-phase', {}],                       // team phase
      ['facilitator:post-news', { text: 'The Senate blinks first.' }],
    ]) {
      const result = apply(state, app.data, { verb, payload }, FACILITATOR, { ts: 0 });
      expect(result.ok, verb).toBe(true);
      state = result.state;
    }

    const beltView = projectView(state, app.data,
      { kind: 'player', seatId: 's1', roleId: 'B1', teamId: 'belt_union' });
    app.client.receive({ type: VIEW, data: beltView });

    expect($('screen-game').hidden).toBe(false);
    const labels = [...$('player-tabs').querySelectorAll('[role="tab"]')]
      .map((tab) => tab.textContent.trim());
    expect(labels).toEqual([
      'Earth (0)', 'Mars (0)', 'Asteroid Belt (0)', 'News', 'Tithe', 'Role']);

    // The news feed carries the post; the Role tab carries the briefing as
    // words; the tithe note names the debt.
    expect($('news-feed').textContent).toContain('The Senate blinks first.');
    expect($('briefing').textContent).toContain('Who you are');
    expect($('briefing').textContent)
      .toContain(app.data.roles.roles.B1.private.personalGoal);
    expect($('tithe-note').textContent).toContain('owed 1 card');
    expect($('pay-tithe').hidden).toBe(false);

    // Not Belt Union: no Tithe tab, everything else intact.
    const canopyView = projectView(state, app.data,
      { kind: 'player', seatId: 's2', roleId: 'C1', teamId: 'canopy_corp' });
    app.client.receive({ type: VIEW, data: canopyView });
    const canopyLabels = [...$('player-tabs').querySelectorAll('[role="tab"]')]
      .map((tab) => tab.textContent.trim());
    expect(canopyLabels).toEqual([
      'Earth (0)', 'Mars (0)', 'Asteroid Belt (0)', 'News', 'Role']);
  });

  it('surfaces the placement affordance on every map tab during negotiation', () => {
    const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };
    let state = createInitialState({ joinCode: 'MARS42X', seed: 7, data: app.data });
    for (const payload of [{}, {}]) {                   // team → negotiation
      state = apply(state, app.data,
        { verb: 'facilitator:advance-phase', payload }, FACILITATOR, { ts: 0 }).state;
    }
    const placed = apply(state, app.data,
      { verb: 'place-action-card', payload: { mapId: 'mars_map' } },
      { seatId: 's2', kind: 'player', roleId: 'C1' }, { ts: 1 });
    expect(placed.ok).toBe(true);

    app.client.receive({
      type: VIEW,
      data: projectView(placed.state, app.data,
        { kind: 'player', seatId: 's2', roleId: 'C1', teamId: 'canopy_corp' }),
    });

    // The map that holds the card reads pressed and counts it; the note
    // says where the card sits on every map panel.
    expect($('tab-mars_map').textContent.trim()).toBe('Mars (1)');
    expect(document.querySelector('[data-place-map="mars_map"]')
      .getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-place-map="earth_map"]')
      .getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-placement-note="earth_map"]').textContent)
      .toContain('On Mars');
  });
});
