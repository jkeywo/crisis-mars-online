import { describe, it, expect } from 'vitest';
import { loadData } from '../helpers/load-data.js';
import { createInitialState, rosterFor, NPC_CODES } from '../../gui/rules/state.js';

const data = await loadData();

/**
 * The scaling table is authored, not computed: the gamespec names the exact
 * roster for every head count. What the app owes it is that the opening
 * position follows the roster everywhere a roster matters — roles, cards,
 * action cards, banks — with the two NPCs always dealt in.
 */

describe('the smallest and the fullest table', () => {
  it.each([[8], [18]])('deals a %i-player game exactly as authored', (count) => {
    const roster = data.scaling.rosterAt[String(count)];
    const state = createInitialState({ joinCode: 'SCALE', seed: 1, data, playerCount: count });

    expect(state.rosterCodes).toEqual(roster);
    expect(Object.keys(state.roles).sort())
      .toEqual([...roster, ...NPC_CODES].sort());
    // One action card, one bank slot and one perTurn allowance per player —
    // none for the NPCs' action cards, which do not exist.
    expect(Object.keys(state.actionCards).sort()).toEqual([...roster].sort());
    expect(Object.keys(state.futureImpacts).sort()).toEqual([...roster].sort());
    // Five cards per player, nine per NPC, and not one card more: an absent
    // role's cards stay in the box.
    expect(Object.keys(state.cards)).toHaveLength(count * 5 + 18);
    for (const card of Object.values(state.cards)) {
      expect([...roster, ...NPC_CODES]).toContain(card.ownerCode);
    }
    // Every lane, track and correspondence slot exists at every count.
    expect(Object.keys(state.lanes)).toHaveLength(3);
    expect(Object.keys(state.correspondence)).toHaveLength(4);
  });

  it('follows the authored table even where it is not monotonic', () => {
    // The table is authored, not computed, and it shows: nine players seat
    // F3, ten swap F3 out for the two Belt bosses. The app's whole duty is
    // fidelity — deal exactly the printed roster, whatever its shape.
    expect(data.scaling.rosterAt['9']).toContain('F3');
    expect(data.scaling.rosterAt['10']).not.toContain('F3');
    const nine = createInitialState({ joinCode: 'S', seed: 1, data, playerCount: 9 });
    const ten = createInitialState({ joinCode: 'S', seed: 1, data, playerCount: 10 });
    expect(nine.roles.F3).toBeDefined();
    expect(ten.roles.F3).toBeUndefined();
    expect(Object.values(ten.cards).some((c) => c.ownerCode === 'F3')).toBe(false);
  });

  it('clamps a head count the table does not know', () => {
    expect(rosterFor(data, 3)).toEqual(data.scaling.rosterAt['8']);
    expect(rosterFor(data, 40)).toEqual(data.scaling.rosterAt['18']);
  });
});
