import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import {
  impactOf, consequenceOf, bandFor, bandIndexOf, effectBudgets,
  regainCost, resourceLimit,
} from '../../gui/rules/derive.js';

const data = await loadData();

describe('the impact formula', () => {
  it('is the printed sum: turn + allies + accepted − difficulty', () => {
    expect(impactOf({ turn: 1 }, data)).toBe(1);
    expect(impactOf({ turn: 2, allies: 1, accepted: 3 }, data)).toBe(6);
    // Difficulty is stored signed, 0..−3, so it is added.
    expect(impactOf({ turn: 3, allies: 2, accepted: 2, difficulty: -3 }, data)).toBe(4);
  });

  it('adds one for a boon and nothing otherwise', () => {
    for (const face of [5, 6]) {
      expect(impactOf({ turn: 1, dieFace: face }, data), `face ${face}`).toBe(2);
    }
    for (const face of [1, 2, 3, 4]) {
      expect(impactOf({ turn: 1, dieFace: face }, data), `face ${face}`).toBe(1);
    }
    expect(impactOf({ turn: 1, dieFace: null }, data)).toBe(1);
  });

  it('counts banked future impact spent into the total', () => {
    expect(impactOf({ turn: 1, futureImpactSpent: 2 }, data)).toBe(3);
  });

  it('names each die face as the printed table does', () => {
    expect(consequenceOf(1, data).id).toBe('complication');
    expect(consequenceOf(2, data).id).toBe('complication');
    expect(consequenceOf(3, data).id).toBe('normal');
    expect(consequenceOf(4, data).id).toBe('normal');
    expect(consequenceOf(5, data).id).toBe('boon');
    expect(consequenceOf(6, data).id).toBe('boon');
  });
});

describe('the band ladder', () => {
  it('labels every total, from hopeless to game-changing', () => {
    // The open bottom band swallows anything up to 1, negatives included.
    expect(bandFor(-2, data).label).toBe('Insignificant');
    expect(bandFor(1, data).label).toBe('Insignificant');
    expect(bandFor(2, data).label).toBe('Minor');
    expect(bandFor(3, data).label).toBe('Minor');
    expect(bandFor(4, data).label).toBe('Moderate');
    expect(bandFor(5, data).label).toBe('Moderate');
    expect(bandFor(6, data).label).toBe('Notable');
    expect(bandFor(7, data).label).toBe('Notable');
    expect(bandFor(8, data).label).toBe('Major');
    expect(bandFor(9, data).label).toBe('Major');
    // And the open top swallows everything from 10 up.
    expect(bandFor(10, data).label).toBe('Radical');
    expect(bandFor(25, data).label).toBe('Radical');
  });

  it('reads the effect budgets straight off the printed tables', () => {
    // The tables are by_band arrays; the budgets are those values at the
    // band's own index, no arithmetic of this file's invention.
    for (const [impact, index] of [[1, 0], [2, 1], [4, 2], [6, 3], [8, 4], [10, 5]]) {
      expect(bandIndexOf(impact, data)).toBe(index);
      expect(effectBudgets(impact, data)).toEqual({
        scoreModifier: data.meta.effects.score_modifier.by_band[index],
        regain: data.meta.effects.regain_resources.by_band[index],
        sabotage: data.meta.effects.sabotage_resources.by_band[index],
        futureImpact: data.meta.effects.increase_future_impact.by_band[index],
      });
    }
  });
});

describe('the commitment arithmetic', () => {
  it('allows three cards, plus one per ally', () => {
    expect(resourceLimit(data, 0)).toBe(3);
    expect(resourceLimit(data, 2)).toBe(5);
  });

  it('prices a regain by the recipient’s faction, NPCs being their own', () => {
    // C1 and C2 are both Canopy; V1 is not; N1 is nobody's faction but its own.
    expect(regainCost(data, 'C2', 'C1')).toBe(1);
    expect(regainCost(data, 'V1', 'C1')).toBe(2);
    expect(regainCost(data, 'N1', 'C1')).toBe(2);
    expect(regainCost(data, 'N1', 'N1')).toBe(1);
  });
});
