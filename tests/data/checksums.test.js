import { describe, it, expect } from 'vitest';
import { validateData, dataExists, CHECKSUMS } from '../../tools/validate-data.mjs';

/**
 * The validator, run where a failure names the offending card instead of
 * just exiting nonzero. `npm run data:validate` and CI both run the same
 * function; this makes a red dataset a red test too.
 */

describe('the generated dataset', () => {
  it('exists — this repo does not build without its game', async () => {
    expect(await dataExists()).toBe(true);
  });

  it('is sound, by every structural and cross-reference check', async () => {
    expect(await validateData()).toEqual([]);
  });

  it('counts what the printed game counts', () => {
    // A reviewer's summary of the deal, pinned so a checksum edit is loud.
    expect(CHECKSUMS).toMatchObject({
      factions: 6, roles: 18, resourceTypes: 24, resourceCards: 108,
      cardsPerPlayer: 5, cardsPerNpc: 9, turns: 4, phases: 3,
      maps: 3, tracks: 20, spotlightSeconds: 60,
    });
  });
});
