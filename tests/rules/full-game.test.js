import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { playFullGame } from '../helpers/full-game.js';
import { replay } from '../../gui/rules/reducer.js';
import { toSave } from '../../gui/rules/command-log.js';
import { unclassifiedPaths } from '../../gui/rules/views.js';

/**
 * The proof the whole game holds together: a scripted four-turn evening
 * driven through the reducer and nothing else — claims, news, tithes,
 * loans, placements, three adjudicated maps a turn, the end-of-turn
 * worksheet — replayed from its seed and log to a byte-identical state.
 *
 * The script itself lives in tests/helpers/full-game.js, shared with the
 * replay scrub tests so both prove things about the same game.
 */

const data = await loadData();
const { state, warAfterUpdate, teamPhaseCards } = await playFullGame(data);

describe('a whole evening, replayed', () => {
  it('ends where a four-turn game ends', () => {
    expect(state.phase).toMatchObject({ turn: 4, name: 'epilogue', endsAt: null });
    expect(state.correspondence).toEqual(
      { t1: 'published', t2: 'published', t3: 'skipped', t4: 'published' });
  });

  it('hands every action card back at every rollover', () => {
    expect(teamPhaseCards).toHaveLength(4);
    for (const snapshot of teamPhaseCards) {
      for (const card of snapshot) expect(card).toEqual({ placed: null, spent: false });
    }
  });

  it('moves the war exactly as the arithmetic says', () => {
    // Begun at 11 by the T2 news, then +10 a worksheet — militaries 10 v 0,
    // the optional T3 fleet reveal having been skipped.
    expect(warAfterUpdate).toEqual([null, 21, 31, 41]);
  });

  it('keeps the card economy closed', () => {
    const cards = Object.values(state.cards);
    expect(cards).toHaveLength(12 * 5 + 18);
    for (const card of cards) {
      expect(['held', 'spent']).toContain(card.state);
      expect(data.resources.cards[card.id].ownerCode).toBe(card.ownerCode);
    }
    // The Ambassador's hand grew by exactly the five tithed cards.
    expect(Object.values(state.cards).filter((c) => c.holderCode === 'N1')).toHaveLength(9 + 5);
    expect(state.tithe.paidCardIds).toHaveLength(2);
  });

  it('closed three spotlights a turn and passed over the rest, on the record', () => {
    const closed = Object.values(state.actions).filter((a) => a.status === 'closed');
    const skipped = Object.values(state.actions).filter((a) => a.status === 'skipped');
    expect(closed).toHaveLength(12);
    expect(closed.length + skipped.length).toBe(Object.keys(state.actions).length);
  });

  it('added no path the manifest does not govern', () => {
    expect(unclassifiedPaths(state)).toEqual([]);
  });

  it('rebuilds from its seed and its log, byte for byte', () => {
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    const { seats: _a, seatByToken: _b, ...expected } = state;
    const { seats: _c, seatByToken: _d, ...actual } = rebuilt;
    expect(actual).toEqual(expected);
  });
});
