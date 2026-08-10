import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply, replay } from '../../gui/rules/reducer.js';
import { toSave } from '../../gui/rules/command-log.js';
import { unclassifiedPaths } from '../../gui/rules/views.js';

/**
 * The proof the whole game holds together: a scripted four-turn evening
 * driven through the reducer and nothing else — claims, news, tithes,
 * loans, placements, three adjudicated maps a turn, the end-of-turn
 * worksheet — replayed from its seed and log to a byte-identical state.
 *
 * Everything a player or facilitator can do travels the same pipeline, so
 * if any verb here mutated something replay cannot rebuild, this test is
 * where it dies.
 */

const data = await loadData();
const events = JSON.parse(await readFile(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'events.json'), 'utf8'));

const FACILITATOR = { seatId: 'sF', kind: 'facilitator', roleId: null };

describe('a whole evening, replayed', () => {
  it('runs four turns through every system and rebuilds exactly', () => {
    let state = createInitialState({ joinCode: 'FULLGAME', seed: 2226, data, playerCount: 12 });
    state.seats.sF = { id: 'sF', token: 'f', name: 'Umpire', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };

    let ts = 0;
    const act = (actor, verb, payload = {}) => {
      const result = apply(state, data, { verb, payload }, actor, { ts: ts += 1 });
      if (!result.ok) throw new Error(`t${state.phase.turn} ${state.phase.name}: ${verb} refused — ${result.reason}`);
      state = result.state;
    };
    const facilitate = (verb, payload) => act(FACILITATOR, verb, payload);
    const as = (code) => ({ seatId: `s-${code}`, kind: 'player', roleId: code });
    const heldBy = (code) => Object.values(state.cards)
      .filter((c) => c.holderCode === code && c.state === 'held').map((c) => c.id);

    // --- the lobby: twelve people take lanyards through the pipeline --------
    for (const [index, code] of state.rosterCodes.entries()) {
      const seatId = `s${index + 1}`;
      state.seats[seatId] = {
        id: seatId, token: `tok-${code}`, name: `Player ${code}`,
        roleId: null, kind: 'player', connected: true, lastSeen: 0,
      };
      act({ seatId, kind: 'player', roleId: null }, 'claim-role', { roleId: code });
    }

    const mapFor = { C: 'earth_map', U: 'earth_map', V: 'mars_map', D: 'mars_map', B: 'belt_map', F: 'belt_map' };
    const trackFor = { earth_map: 'war_support', mars_map: 'senate_control_people', belt_map: 'ceres_prosperity' };
    const warAfterUpdate = [];

    for (let turn = 1; turn <= 4; turn += 1) {
      // --- Team Phase --------------------------------------------------------
      facilitate('facilitator:advance-phase');
      expect(state.phase).toMatchObject({ turn, name: 'team' });
      // Every action card came back at the rollover.
      for (const card of Object.values(state.actionCards)) {
        expect(card).toEqual({ placed: null, spent: false });
      }

      // The news, exactly as the host console would submit it from the
      // facilitator file: published turns 1, 2 and 4; turn 3 skipped, which
      // is the optional one.
      const scripted = events.correspondence.find((c) => c.turn === turn);
      if (turn === 3) facilitate('facilitator:publish-correspondence', { turn, skip: true });
      else {
        facilitate('facilitator:publish-correspondence',
          { turn, effects: scripted.effects.map((e) => ({ ...e })) });
      }
      if (turn === 2) expect(state.warProgress).toBe(11);

      // The tithe: paid in turns 1 and 3, refused in turn 2, paid in 4.
      if (turn === 2) facilitate('facilitator:mark-tithe-refused');
      else {
        const payer = turn === 3 ? 'B2' : 'B1';
        const owed = { 1: 1, 3: 2, 4: 2 }[turn];
        act(as(payer), 'pay-tithe', { cardIds: heldBy(payer).slice(0, owed) });
      }

      // Turn two's opportunity: delivered, chosen, resolved.
      if (turn === 2) {
        facilitate('facilitator:deliver-opportunity', {
          triggerId: 'war_support_low', factionId: 'viva_mars',
          title: 'The garrison blinks', optionA: 'Strike', optionB: 'Recruit',
        });
        const opportunityId = Object.keys(state.opportunities).at(-1);
        act(as('V1'), 'choose-opportunity', { opportunityId, choice: 'A' });
        facilitate('facilitator:resolve-opportunity', {
          opportunityId, effects: [{ track: 'war_support', delta: -1 }],
        });
      }

      // --- Negotiation Phase --------------------------------------------------
      facilitate('facilitator:advance-phase');
      for (const code of state.rosterCodes) {
        act(as(code), 'place-action-card', { mapId: mapFor[code[0]] });
      }
      // A loan across factions, and a discard recovered — the card economy
      // in ordinary motion.
      act(as('V1'), 'hand-card', { cardId: heldBy('V1')[0], toCode: 'C1' });
      const spendable = heldBy('C2')[0];
      act(as('C2'), 'discard-card', { cardId: spendable });
      act(as('C2'), 'recover-discard', { cardId: spendable });

      // --- Action Phase --------------------------------------------------------
      facilitate('facilitator:advance-phase');
      expect(state.initiative.unplaced).toEqual([]);

      for (const mapId of Object.keys(state.maps)) {
        // One adjudicated spotlight per map…
        facilitate('facilitator:call-next', { mapId });
        const actionId = state.initiative.current[mapId];
        const actor = state.actions[actionId].actorCode;
        const offered = heldBy(actor).slice(0, 1);
        act(as(actor), 'declare-action', {
          actionId, text: `Turn ${turn} on ${mapId}`, allyCodes: [], cardIds: offered,
        });
        facilitate('facilitator:rule-resources',
          { actionId, acceptedCardIds: offered, vetoedCardIds: [] });
        facilitate('facilitator:set-difficulty', { actionId, difficulty: -1 });
        facilitate('facilitator:roll-consequence', { actionId });
        facilitate('facilitator:apply-effects', {
          actionId,
          effects: [{ trackId: trackFor[mapId], delta: mapId === 'earth_map' ? -1 : 1 }],
        });
        facilitate('facilitator:narrate', { actionId, text: 'And so it went.' });
        facilitate('facilitator:close-action', { actionId });
        // …and the rest of the queue passed over, so every map empties.
        while (state.initiative.queues[mapId].length) {
          facilitate('facilitator:skip-action', { mapId });
        }
      }

      // --- the end-of-turn worksheet -------------------------------------------
      facilitate('facilitator:begin-turn-update');
      for (const step of state.turnUpdate.steps) {
        facilitate('facilitator:confirm-update-step', { stepId: step.id });
      }
      facilitate('facilitator:finish-turn-update');
      warAfterUpdate.push(state.warProgress);
    }

    // --- the epilogue ------------------------------------------------------------
    facilitate('facilitator:advance-phase');
    expect(state.phase).toMatchObject({ turn: 4, name: 'epilogue', endsAt: null });

    // --- what the evening left on the table ---------------------------------------
    // The war: begun at 11 by the T2 news, then moved by military difference
    // each worksheet — +10 at t2 (military 4+6 v 0), +10 at t3 (the optional
    // fleet reveal was skipped), +10 at t4.
    expect(warAfterUpdate).toEqual([null, 21, 31, 41]);
    expect(state.correspondence).toEqual(
      { t1: 'published', t2: 'published', t3: 'skipped', t4: 'published' });

    // The card economy is closed: every dealt card still exists, still
    // belongs to its printed owner, and is either held or spent.
    const cards = Object.values(state.cards);
    expect(cards).toHaveLength(12 * 5 + 18);
    for (const card of cards) {
      expect(['held', 'spent']).toContain(card.state);
      expect(data.resources.cards[card.id].ownerCode).toBe(card.ownerCode);
    }
    // Twelve actions closed — three per turn — plus the skips on the record.
    const closed = Object.values(state.actions).filter((a) => a.status === 'closed');
    const skipped = Object.values(state.actions).filter((a) => a.status === 'skipped');
    expect(closed).toHaveLength(12);
    expect(closed.length + skipped.length).toBe(Object.keys(state.actions).length);
    // The tithe record held its last turn's shape, and the Ambassador's hand
    // grew by the five cards paid across the evening.
    expect(state.tithe.paidCardIds).toHaveLength(2);
    expect(Object.values(state.cards).filter((c) => c.holderCode === 'N1')).toHaveLength(9 + 5);

    // Nothing in the final state is unclassified — four turns added no path
    // the manifest does not govern.
    expect(unclassifiedPaths(state)).toEqual([]);

    // --- the whole point ------------------------------------------------------------
    // The evening rebuilds from its seed and its log, byte for byte.
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    const { seats: _a, seatByToken: _b, ...expected } = state;
    const { seats: _c, seatByToken: _d, ...actual } = rebuilt;
    expect(actual).toEqual(expected);
  });
});
