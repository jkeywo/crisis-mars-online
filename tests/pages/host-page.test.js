// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPage, installFetch, installPeer, fakeLocation } from './page-harness.js';

/**
 * The host page, booted for real: the actual host.html markup, the actual
 * startHostApp, the real dataset over a disk-backed fetch, and the fake
 * transport. This is the test that goes red when a render-path function
 * stops existing — the failure the browser found and the unit suites could
 * not.
 */

installFetch();
installPeer();

const $ = (id) => document.getElementById(id);

describe('host.html boots', () => {
  beforeAll(async () => {
    await loadPage('host.html');
    const { startHostApp } = await import('../../gui/host/host-app.js');
    await startHostApp({
      location: fakeLocation({ pathname: '/host.html' }),
      beeper: { beep: () => {} },
    });
  });

  it('builds the six-tab strip and the map panels', () => {
    const tabs = [...$('host-tabs').querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent.trim()))
      .toEqual(['Earth', 'Mars', 'Asteroid Belt', 'Roles', 'NPCs', 'Game']);
    for (const mapId of ['earth_map', 'mars_map', 'belt_map']) {
      const panel = $(`panel-${mapId}`);
      expect(panel.querySelector('cm-board-overlay')).toBeTruthy();
      expect(panel.querySelector('cm-adjudication')).toBeTruthy();
    }
  });

  it('built the opportunity composer with its selects and guidance', () => {
    expect($('op-trigger')).toBeTruthy();
    expect($('op-target').options.length).toBeGreaterThanOrEqual(8);
    expect($('op-deliver').textContent).toContain('Deliver');
  });

  it('offers the trigger\'s guide examples as one-click templates', () => {
    // Free-form: no trigger, no templates.
    expect($('op-templates').children).toHaveLength(0);

    $('op-trigger').value = 'war_support_high';
    $('op-trigger').dispatchEvent(new Event('change'));
    const templates = [...$('op-templates').querySelectorAll('[data-template]')];
    expect(templates.length).toBeGreaterThanOrEqual(4);

    // A click copies the sentence into the draft: fiction to the title,
    // mechanics to Option A, Option B left for the facilitator to write.
    templates[0].click();
    expect($('op-title').value).toBe('Convert a moon base into a military facility');
    expect($('op-a').value)
      .toBe('move Luna Prosperity to Earth Gov Military.');
    expect($('op-b').value).toBe('');

    // Back to free-form clears the shelf.
    $('op-trigger').value = '';
    $('op-trigger').dispatchEvent(new Event('change'));
    expect($('op-templates').children).toHaveLength(0);
  });

  it('filled the NPC briefs from the facilitator file', () => {
    for (const id of ['npc-brief-n1', 'npc-brief-n2']) {
      expect($(id).textContent.length).toBeGreaterThan(40);
      expect($(id).querySelector('details')).toBeTruthy();   // the play notes
    }
    expect($('npc-brief-n1').textContent).toContain('Ambassador');
  });

  it('starts a game and renders the whole running console', () => {
    $('new-game').click();
    expect($('screen-running').hidden).toBe(false);
    expect($('join-code').textContent).toMatch(/^[A-Z2-9]{7}$/);

    // A tab is selected and its board overlay drew the printed sheet with
    // chips on it.
    const selected = $('host-tabs').querySelector('[aria-selected="true"]');
    expect(selected).toBeTruthy();
    const overlay = $('panel-earth_map').querySelector('cm-board-overlay');
    expect(overlay.querySelector('img').src).toContain('earth.png');
    expect(overlay.querySelectorAll('[data-chip]').length).toBe(5);

    // The Roles tab knows the whole roster; the tithe tracker is speaking.
    expect($('roles-panel').querySelectorAll('.cm-role-admin')).toHaveLength(18);
    expect($('tithe-tracker').textContent).toContain('owes');
  });

  it('renders the Team Phase table once the game moves', () => {
    $('advance-phase').click();
    expect($('clock').textContent).toContain('Team Phase');
    // The correspondence card came from the facilitator file, with its
    // Publish affordance — the exact machinery the lost-function bug killed.
    expect($('correspondence-card').querySelector('[data-publish]')).toBeTruthy();
    expect($('opportunity-list').textContent).toContain('None delivered yet');
  });
});
