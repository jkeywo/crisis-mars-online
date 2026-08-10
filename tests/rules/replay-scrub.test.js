import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { playFullGame } from '../helpers/full-game.js';
import { replay } from '../../gui/rules/reducer.js';
import { toSave } from '../../gui/rules/command-log.js';
import { projectView } from '../../gui/rules/views.js';
import { ReplayCursor } from '../../gui/rules/replay-cursor.js';

/**
 * The replay page over a real evening: the cursor scrubbed across the
 * full-game script's log, checked against the reducer's own replay at each
 * stop. This is the integration the scrubber exists for — B0's cursor tests
 * proved the mechanism over a synthetic log; this proves it over the same
 * game the full-game test certifies.
 */

const data = await loadData();
const { state: finalState } = await playFullGame(data);
const save = toSave(finalState);

const rebuiltAt = (position) =>
  replay({ ...save, log: save.log.slice(0, position) }, data).state;

describe('scrubbing a real game', () => {
  const cursor = new ReplayCursor(save, data).warm();

  it('replays the whole log without a single refusal', () => {
    expect(cursor.refusals).toEqual([]);
    expect(cursor.length).toBe(save.log.length);
  });

  it.each([
    ['the opening', 0],
    ['a third in', Math.floor(save.log.length / 3)],
    ['two thirds in', Math.floor((2 * save.log.length) / 3)],
    ['the end', save.log.length],
  ])('shows the boards as they stood at %s', (_label, position) => {
    const seen = cursor.seek(position);
    const reference = rebuiltAt(position);
    // The three things the page draws: the tracks, the war, the actions.
    expect(seen.maps).toEqual(reference.maps);
    expect(seen.warProgress).toBe(reference.warProgress);
    expect(seen.actions).toEqual(reference.actions);
  });

  it('moves the tracks between stops — the scrub is not a still', () => {
    const early = structuredClone(cursor.seek(0).maps);
    const late = cursor.seek(save.log.length).maps;
    expect(late).not.toEqual(early);
    // And specific spot values the script drove: war support fell every turn
    // (four action effects, one opportunity), Ceres rose every turn.
    expect(late.earth_map.tracks.war_support)
      .toBe(early.earth_map.tracks.war_support - 5);
    expect(late.belt_map.tracks.ceres_prosperity)
      .toBe(early.belt_map.tracks.ceres_prosperity + 4);
  });

  it('projects any position for the page without an unclassified path', () => {
    // The replay page renders facilitator projections of scrubbed states;
    // a mid-log state that projected badly would blank the whole screen.
    const midway = cursor.seek(Math.floor(save.log.length / 2));
    const view = projectView(midway, data, { kind: 'facilitator' });
    expect(view.maps).toEqual(midway.maps);
    expect(Object.keys(view.actions).length).toBeGreaterThan(0);
  });
});
