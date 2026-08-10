// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPage, installFetch, installPeer, fakeLocation } from './page-harness.js';

/** The player page, booted for real over the actual index.html markup. */

installFetch();
installPeer();

const $ = (id) => document.getElementById(id);

describe('index.html boots', () => {
  beforeAll(async () => {
    await loadPage('index.html');
    const { startPlayerApp } = await import('../../gui/client/player-app.js');
    await startPlayerApp({
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

  it('built a lane per map: board, call order, spotlight', () => {
    const lanes = [...$('boards').children];
    expect(lanes).toHaveLength(3);
    for (const lane of lanes) {
      expect(lane.querySelector('cm-map-board')).toBeTruthy();
      expect(lane.querySelector('cm-initiative-queue')).toBeTruthy();
      expect(lane.querySelector('cm-action-spotlight')).toBeTruthy();
    }
    expect($('placement-buttons').children).toHaveLength(3);
  });

  it('wired the join form: a bad code is refused in words', () => {
    $('join-code').value = 'NOPE';
    $('code-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect($('code-error').textContent).toContain('not right');
    expect($('screen-code').hidden).toBe(false);
  });
});
