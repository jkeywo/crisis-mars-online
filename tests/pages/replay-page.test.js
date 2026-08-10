// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPage, installFetch } from './page-harness.js';

/** The replay page, booted for real. No transport to fake: it hosts nothing. */

installFetch();

const $ = (id) => document.getElementById(id);

describe('replay.html boots', () => {
  beforeAll(async () => {
    await loadPage('replay.html');
    const { startReplayApp } = await import('../../gui/client/replay-app.js');
    await startReplayApp();
  });

  it('opens on the open-a-game screen', () => {
    expect($('screen-open').hidden).toBe(false);
    expect($('screen-replay').hidden).toBe(true);
    // No saves in this browser: the resume list stays folded away.
    expect($('resume').hidden).toBe(true);
    expect($('import-file')).toBeTruthy();
  });
});
