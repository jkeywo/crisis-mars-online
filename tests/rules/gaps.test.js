import { describe, it, expect } from 'vitest';
import { KNOWN_GAPS } from '../../gui/rules/gaps.js';

describe('the gaps table', () => {
  it('says what was silent, what was decided, and why', () => {
    // A ruling with no reasoning is not reviewable, and this list exists to be
    // reviewed — by the facilitator on the night, and by the author later.
    // Empty in the skeleton; the shape check runs the day the first entry
    // arrives with the Action Phase.
    for (const gap of KNOWN_GAPS) {
      expect(gap.id, JSON.stringify(gap)).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(gap.about?.length, `${gap.id}.about`).toBeGreaterThan(3);
      for (const field of ['silent', 'ruling', 'because']) {
        expect(gap[field]?.length, `${gap.id}.${field}`).toBeGreaterThan(20);
      }
    }
  });

  it('names each gap once', () => {
    const ids = KNOWN_GAPS.map((gap) => gap.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
