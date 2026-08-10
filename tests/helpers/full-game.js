/**
 * A whole scripted evening, shared between the tests that need one.
 *
 * The full-game test asserts this script's outcomes; the replay tests scrub
 * back and forth across its log. One script, so the two can never drift into
 * proving things about different games.
 *
 * Pure driving, no assertions: everything a test might want to check is
 * returned alongside the final state.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInitialState } from '../../gui/rules/state.js';
import { apply } from '../../gui/rules/reducer.js';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');

export const FULL_GAME_FACILITATOR = { seatId: 'sF', kind: 'facilitator', roleId: null };

/**
 * @returns {{state, warAfterUpdate: (number|null)[],
 *   teamPhaseCards: object[][], refusals: never[]}}
 */
export async function playFullGame(data) {
  const events = JSON.parse(await readFile(join(DATA_DIR, 'events.json'), 'utf8'));

  let state = createInitialState({ joinCode: 'FULLGAME', seed: 2226, data, playerCount: 12 });
  state.seats.sF = { id: 'sF', token: 'f', name: 'Umpire', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };

  let ts = 0;
  const act = (actor, verb, payload = {}) => {
    const result = apply(state, data, { verb, payload }, actor, { ts: ts += 1 });
    if (!result.ok) {
      throw new Error(`t${state.phase.turn} ${state.phase.name}: ${verb} refused — ${result.reason}`);
    }
    state = result.state;
  };
  const facilitate = (verb, payload) => act(FULL_GAME_FACILITATOR, verb, payload);
  const as = (code) => ({ seatId: `s-${code}`, kind: 'player', roleId: code });
  const heldBy = (code) => Object.values(state.cards)
    .filter((c) => c.holderCode === code && c.state === 'held').map((c) => c.id);

  // The lobby: twelve people take lanyards through the pipeline.
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
  const teamPhaseCards = [];

  for (let turn = 1; turn <= 4; turn += 1) {
    // --- Team Phase ----------------------------------------------------------
    facilitate('facilitator:advance-phase');
    teamPhaseCards.push(structuredClone(Object.values(state.actionCards)));

    const scripted = events.correspondence.find((c) => c.turn === turn);
    if (turn === 3) facilitate('facilitator:publish-correspondence', { turn, skip: true });
    else {
      facilitate('facilitator:publish-correspondence',
        { turn, effects: scripted.effects.map((e) => ({ ...e })) });
    }

    if (turn === 2) facilitate('facilitator:mark-tithe-refused');
    else {
      const payer = turn === 3 ? 'B2' : 'B1';
      const owed = { 1: 1, 3: 2, 4: 2 }[turn];
      act(as(payer), 'pay-tithe', { cardIds: heldBy(payer).slice(0, owed) });
    }

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

    // --- Negotiation Phase ----------------------------------------------------
    facilitate('facilitator:advance-phase');
    for (const code of state.rosterCodes) {
      act(as(code), 'place-action-card', { mapId: mapFor[code[0]] });
    }
    act(as('V1'), 'hand-card', { cardId: heldBy('V1')[0], toCode: 'C1' });
    const spendable = heldBy('C2')[0];
    act(as('C2'), 'discard-card', { cardId: spendable });
    act(as('C2'), 'recover-discard', { cardId: spendable });

    // --- Action Phase ----------------------------------------------------------
    facilitate('facilitator:advance-phase');
    for (const mapId of Object.keys(state.maps)) {
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
      while (state.initiative.queues[mapId].length) {
        facilitate('facilitator:skip-action', { mapId });
      }
    }

    // --- the end-of-turn worksheet ------------------------------------------------
    facilitate('facilitator:begin-turn-update');
    for (const step of state.turnUpdate.steps) {
      facilitate('facilitator:confirm-update-step', { stepId: step.id });
    }
    facilitate('facilitator:finish-turn-update');
    warAfterUpdate.push(state.warProgress);
  }

  facilitate('facilitator:advance-phase');   // the epilogue

  return { state, warAfterUpdate, teamPhaseCards };
}
