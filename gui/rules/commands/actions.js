/**
 * gui/rules/commands/actions.js — the Action Phase, one spotlight at a time.
 *
 * The printed procedure, verb by verb: the facilitator calls the next player
 * to a map (`facilitator:call-next`), the player declares the action in
 * fiction with allies and offered cards (`declare-action`), the named allies
 * answer (`confirm-ally` / `decline-ally`), the facilitator rules relevance
 * (`facilitator:rule-resources`), sets difficulty, rolls the consequence die,
 * applies band-limited effects, narrates, and closes — which is when
 * everything is actually spent.
 *
 * Two disciplines hold throughout. **The app computes; the facilitator
 * adjudicates**: every ruling is a facilitator verb, and the app's only
 * enforcement is the band budgets the printed tables set — exceeding them is
 * what `facilitator:set` exists for, tagged as the override it is. And
 * **derived values are never stored**: Impact, the band and the budgets are
 * recomputed by derive.js at every admit and every render, so the number on
 * the screen and the number in the clamp are the same computation.
 *
 * The timer never forfeits anybody. `endsAt` is a spotlight for the room to
 * see and hear; what happens when it runs out is the facilitator's call —
 * skip, or let them finish the sentence. See gaps.js.
 */

import { no, ok, subjectOf, roleName } from './shared.js';
import {
  actionImpact, effectBudgets, regainCost, resourceLimit, confirmedAllies,
} from '../derive.js';

/** The next action record's id. Global across maps, so ids never collide. */
const nextActionId = (state) => `a${Object.keys(state.actions).length + 1}`;

/** The map a track lives on, or null. */
function mapOfTrack(state, trackId) {
  return Object.keys(state.maps)
    .find((mapId) => trackId in state.maps[mapId].tracks) ?? null;
}

/** The action a payload names, if it exists. */
const actionIn = (state, payload) => state.actions[payload?.actionId] ?? null;

export const ACTION_COMMANDS = {
  /**
   * Open the next spotlight on a map.
   *
   * One live action per map, never more: the three lanes run in parallel but
   * each is strictly one player at a time, which is what the queues are.
   */
  'facilitator:call-next': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { mapId } = ctx.cmd.payload ?? {};
      const queue = ctx.state.initiative.queues[mapId];
      if (!queue) return no('the Action Phase has not begun');
      if (ctx.state.initiative.current[mapId]) {
        return no('an action is already open on this map — close or skip it first');
      }
      if (!queue.length) return no('this map’s queue is done');
      return ok();
    },
    effects(draft, ctx, { data }) {
      const { mapId } = ctx.cmd.payload;
      const actorCode = draft.initiative.queues[mapId].shift();
      const id = nextActionId(draft);
      draft.actions[id] = {
        id,
        mapId,
        actorCode,
        seq: Number(id.slice(1)),
        declaration: '',
        allies: {},
        offered: [],
        accepted: [],
        vetoed: [],
        futureImpactSpent: 0,
        difficulty: 0,
        roll: null,
        effects: [],
        regains: [],
        sabotage: [],
        futureImpactAwarded: 0,
        futureImpactTo: null,
        narration: '',
        status: 'declaring',
        // The 60-second spotlight. A deadline for the room to watch, not a
        // fuse: nothing fires when it passes.
        endsAt: ctx.now + Number(data.meta.spotlightSeconds) * 1000,
      };
      draft.initiative.current[mapId] = id;
    },
  },

  /**
   * Place a player's action card for them — before, during or after the
   * Negotiation Phase.
   *
   * The author's ruling on the unplaced: a player who never placed cannot
   * act, and this is the door back in. Used mid-Action-Phase it appends
   * them to the BACK of the chosen map's queue — the turn order already
   * ran without them, so the back is where they join it.
   */
  'facilitator:assign-action-card': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { code, mapId } = ctx.cmd.payload ?? {};
      const card = ctx.state.actionCards[code];
      if (!card) return no(`${roleName(ctx.data, code)} has no action card`);
      if (card.spent) return no('their action is already spent this turn');
      if (!ctx.state.maps[mapId]) return no('no such map');
      const initiative = ctx.state.initiative;
      if (initiative.queues[mapId]) {
        for (const done of Object.values(initiative.done)) {
          if (done.includes(code)) return no('they have already been called this turn');
        }
        for (const openId of Object.values(initiative.current)) {
          if (openId && ctx.state.actions[openId]?.actorCode === code) {
            return no('their spotlight is open right now');
          }
        }
      }
      return ok();
    },
    effects(draft, ctx) {
      const { code, mapId } = ctx.cmd.payload;
      draft.actionCards[code].placed = mapId;
      if (!draft.initiative.queues[mapId]) return;
      draft.initiative.unplaced = draft.initiative.unplaced.filter((c) => c !== code);
      for (const queue of Object.values(draft.initiative.queues)) {
        const at = queue.indexOf(code);
        if (at !== -1) queue.splice(at, 1);
      }
      draft.initiative.queues[mapId].push(code);
    },
  },

  /**
   * The actor says what they are doing, and with what.
   *
   * Re-declarable while the facilitator has not started ruling: the fiction
   * firms up as the table talks, and the record should follow the words.
   */
  'declare-action': {
    phases: ['action'],
    actor: 'player',
    label: 'Declare your action',
    admit(ctx) {
      const { state, cmd, data } = ctx;
      const subject = subjectOf(ctx);
      const action = actionIn(state, cmd.payload);
      if (!action) return no('no such action');
      if (action.actorCode !== subject) return no('this is not your spotlight');
      if (action.status !== 'declaring') {
        return no('the facilitator has started ruling — talk to them');
      }

      // The author's ruling: an ally is somebody at the SAME map whose
      // action has not yet been resolved — later in this queue, unspent,
      // unskipped. There is no advance declaration; the invitation happens
      // when the action is called, which is here.
      const allyCodes = cmd.payload?.allyCodes ?? [];
      for (const code of allyCodes) {
        if (code === subject) return no('you cannot be your own ally');
        if (!state.roles[code] || state.roles[code].npc) {
          return no(`${roleName(data, code)} cannot be an ally`);
        }
        const allyCard = state.actionCards[code];
        if (!allyCard) return no(`${roleName(data, code)} has no action card`);
        if (allyCard.placed !== action.mapId) {
          return no(`${roleName(data, code)} is not at this map — allies act where their card sits`);
        }
        if (allyCard.spent) return no(`${roleName(data, code)} has already acted this turn`);
        if (state.initiative.done[action.mapId]?.includes(code)) {
          return no(`${roleName(data, code)} has already been called`);
        }
      }

      const cardIds = cmd.payload?.cardIds ?? [];
      for (const cardId of cardIds) {
        const card = state.cards[cardId];
        if (!card) return no('no such card in this game');
        if (card.state !== 'held') return no('a spent card cannot be offered');
        if (card.holderCode !== subject && !allyCodes.includes(card.holderCode)) {
          return no('offer only cards you or a named ally are holding');
        }
      }
      if (cardIds.length > resourceLimit(data, allyCodes.length)) {
        return no(`that is more than ${resourceLimit(data, allyCodes.length)} cards — `
          + 'the limit is three, plus one per ally');
      }

      const spend = Number(cmd.payload?.futureImpact ?? 0);
      if (!Number.isInteger(spend) || spend < 0) return no('future impact is spent in whole tokens');
      if (spend > (state.futureImpacts[subject] ?? 0)) {
        return no(`you have banked ${state.futureImpacts[subject] ?? 0} future impact`);
      }
      return ok();
    },
    effects(draft, ctx) {
      const action = draft.actions[ctx.cmd.payload.actionId];
      action.declaration = String(ctx.cmd.payload.text ?? '');
      // A re-declaration renames the allies but keeps any answer already
      // given by somebody still named — an ally who said yes has said yes.
      const named = ctx.cmd.payload.allyCodes ?? [];
      const allies = {};
      for (const code of named) allies[code] = action.allies[code] ?? 'invited';
      action.allies = allies;
      action.offered = [...(ctx.cmd.payload.cardIds ?? [])];
      action.accepted = [];
      action.vetoed = [];
      action.futureImpactSpent = Number(ctx.cmd.payload.futureImpact ?? 0);
    },
  },

  /**
   * An invited ally answers yes.
   *
   * Confirming is a promise to spend your own action card with theirs, so it
   * needs a placed, unspent card — on any map; see gaps.js.
   */
  'confirm-ally': {
    phases: ['action'],
    actor: 'player',
    label: 'Join as an ally',
    admit(ctx) {
      const { state, cmd } = ctx;
      const subject = subjectOf(ctx);
      const action = actionIn(state, cmd.payload);
      if (!action) return no('no such action');
      if (['closed', 'skipped'].includes(action.status)) return no('that action is over');
      if (action.allies[subject] !== 'invited') return no('you have not been asked');
      const card = state.actionCards[subject];
      if (card?.placed !== action.mapId) {
        return no('your action card is not at this map — allies act where their card sits');
      }
      if (card.spent) return no('your action is already spent this turn');
      if (state.initiative.done[action.mapId]?.includes(subject)) {
        return no('you have already been called this turn');
      }
      return ok();
    },
    effects(draft, ctx) {
      draft.actions[ctx.cmd.payload.actionId].allies[subjectOf(ctx)] = 'confirmed';
    },
  },

  'decline-ally': {
    phases: ['action'],
    actor: 'player',
    label: 'Decline to ally',
    admit(ctx) {
      const action = actionIn(ctx.state, ctx.cmd.payload);
      if (!action) return no('no such action');
      if (['closed', 'skipped'].includes(action.status)) return no('that action is over');
      if (action.allies[subjectOf(ctx)] !== 'invited') return no('you have not been asked');
      return ok();
    },
    effects(draft, ctx) {
      draft.actions[ctx.cmd.payload.actionId].allies[subjectOf(ctx)] = 'declined';
    },
  },

  /**
   * The relevance ruling: which offered cards count, which go home.
   *
   * The one printed constraint the app enforces is the distinct-faction rule
   * — every accepted card from a different faction, a card's faction being
   * its owner's. Everything else about relevance is judgement, which is why
   * this is a facilitator verb at all.
   */
  'facilitator:rule-resources': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { state, cmd, data } = ctx;
      const action = actionIn(state, cmd.payload);
      if (!action) return no('no such action');
      if (!['declaring', 'ruling'].includes(action.status)) {
        return no('the die is already cast — the ruling stands');
      }
      const accepted = cmd.payload?.acceptedCardIds ?? [];
      const vetoed = cmd.payload?.vetoedCardIds ?? [];
      const ruled = [...accepted, ...vetoed].sort();
      if (ruled.join('|') !== [...action.offered].sort().join('|')) {
        return no('rule every offered card, once — accepted and vetoed must cover the offer');
      }

      // Each accepted card from a different faction. The card's faction is
      // its printed owner's, however it reached the actor's hand — a loan
      // does not repaint a card.
      const factions = accepted.map((cardId) =>
        (state.cards[cardId] ? ctx.data.roles.roles[state.cards[cardId].ownerCode]?.factionId
          ?? state.cards[cardId].ownerCode : null));
      if (new Set(factions).size !== factions.length) {
        return no('each committed card must come from a different faction');
      }

      const named = Object.entries(action.allies)
        .filter(([, status]) => status !== 'declined').length;
      if (accepted.length > resourceLimit(data, named)) {
        return no(`that is more than ${resourceLimit(data, named)} cards — `
          + 'the limit is three, plus one per ally');
      }
      return ok();
    },
    effects(draft, ctx) {
      const action = draft.actions[ctx.cmd.payload.actionId];
      action.accepted = [...(ctx.cmd.payload.acceptedCardIds ?? [])];
      action.vetoed = [...(ctx.cmd.payload.vetoedCardIds ?? [])];
      action.status = 'ruling';
    },
  },

  /** Difficulty, 0 to −3. The print's only anchor is judgement; this is its range. */
  'facilitator:set-difficulty': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const action = actionIn(ctx.state, ctx.cmd.payload);
      if (!action) return no('no such action');
      if (!['declaring', 'ruling'].includes(action.status)) {
        return no('the die is already cast — difficulty is set before it');
      }
      const difficulty = ctx.cmd.payload?.difficulty;
      if (!Number.isInteger(difficulty) || difficulty > 0 || difficulty < -3) {
        return no('difficulty runs from 0 to −3');
      }
      return ok();
    },
    effects(draft, ctx) {
      draft.actions[ctx.cmd.payload.actionId].difficulty = ctx.cmd.payload.difficulty;
    },
  },

  /**
   * The consequence die, through the seeded stream like every roll — a
   * replayed game throws the same face.
   */
  'facilitator:roll-consequence': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const action = actionIn(ctx.state, ctx.cmd.payload);
      if (!action) return no('no such action');
      if (action.status === 'rolled') return no('the die is already cast');
      if (['closed', 'skipped'].includes(action.status)) return no('that action is over');
      // An offer nobody has ruled on cannot be rolled past; an empty offer
      // needs no ruling to be complete.
      if (action.status === 'declaring' && action.offered.length > 0) {
        return no('rule on the offered cards first');
      }
      return ok();
    },
    effects(draft, ctx, { roll }) {
      const action = draft.actions[ctx.cmd.payload.actionId];
      action.roll = roll(6);
      action.status = 'rolled';
    },
  },

  /**
   * The band-limited effects, clamped against the printed tables.
   *
   * Re-appliable while the action is open: the previous track movement is
   * reverted before the new is applied, so a corrected ruling is a
   * correction rather than a second helping. Card and bank consequences
   * wait for close-action — this stores them and moves the tracks.
   */
  'facilitator:apply-effects': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { state, cmd, data } = ctx;
      const action = actionIn(state, cmd.payload);
      if (!action) return no('no such action');
      if (action.status !== 'rolled') return no('roll the consequence die first');

      const budgets = effectBudgets(actionImpact(state, data, action), data);

      // --- track movement, as a total budget of points ----------------------
      const effects = cmd.payload?.effects ?? [];
      let spent = 0;
      const previous = {};
      for (const done of action.effects) {
        previous[done.trackId] = (previous[done.trackId] ?? 0) + done.delta;
      }
      for (const { trackId, delta } of effects) {
        const mapId = mapOfTrack(state, trackId);
        if (!mapId) return no(`no track called '${trackId}'`);
        if (!Number.isInteger(delta) || delta === 0) return no('track movement is whole points');
        // The floor check is against the value as it would be with this
        // action's previous ruling unwound — a re-apply replaces, never adds.
        const base = state.maps[mapId].tracks[trackId] - (previous[trackId] ?? 0);
        if (base + delta < 0) {
          return no(`${trackId} would go negative — it is ${base} before this action`);
        }
        spent += Math.abs(delta);
      }
      if (spent > budgets.scoreModifier) {
        return no(`that is ${spent} points of track movement — this band allows ${
          budgets.scoreModifier}`);
      }

      // --- regains, with the out-of-faction price ---------------------------
      let regainSpent = 0;
      for (const { cardId, toCode } of cmd.payload?.regains ?? []) {
        const card = state.cards[cardId];
        if (!card) return no('no such card to regain');
        if (card.state !== 'spent') return no('only a spent card can be regained');
        if (toCode !== action.actorCode && action.allies[toCode] !== 'confirmed') {
          return no('regained cards go to the actor or a confirmed ally');
        }
        regainSpent += regainCost(data, card.ownerCode, toCode);
      }
      if (regainSpent > budgets.regain) {
        return no(`that regain costs ${regainSpent} — this band allows ${budgets.regain}, `
          + 'out-of-faction cards costing 2 each');
      }

      // --- sabotage ----------------------------------------------------------
      const sabotage = cmd.payload?.sabotage ?? [];
      for (const cardId of sabotage) {
        const card = state.cards[cardId];
        if (!card) return no('no such card to sabotage');
        if (card.state !== 'held') return no('only a held card can be sabotaged');
        if (action.accepted.includes(cardId)) {
          return no('that card is committed to this very action');
        }
      }
      if (sabotage.length > budgets.sabotage) {
        return no(`that is ${sabotage.length} cards sabotaged — this band allows ${
          budgets.sabotage}`);
      }

      // --- future impact ------------------------------------------------------
      const future = cmd.payload?.futureImpact ?? { amount: 0 };
      const amount = Number(future.amount ?? 0);
      if (!Number.isInteger(amount) || amount < 0) return no('future impact is whole tokens');
      if (amount > budgets.futureImpact) {
        return no(`that is ${amount} future impact — this band allows ${budgets.futureImpact}`);
      }
      if (amount > 0) {
        const toCode = future.toCode ?? action.actorCode;
        if (!state.rosterCodes.includes(toCode)) return no('bank future impact to a player');
      }
      return ok();
    },
    effects(draft, ctx) {
      const action = draft.actions[ctx.cmd.payload.actionId];
      // Unwind whatever this action already did to the tracks, then apply
      // the new ruling whole.
      for (const { trackId, delta } of action.effects) {
        const mapId = mapOfTrack(draft, trackId);
        draft.maps[mapId].tracks[trackId] -= delta;
      }
      action.effects = [...(ctx.cmd.payload.effects ?? [])];
      for (const { trackId, delta } of action.effects) {
        const mapId = mapOfTrack(draft, trackId);
        draft.maps[mapId].tracks[trackId] += delta;
      }
      action.regains = [...(ctx.cmd.payload.regains ?? [])];
      action.sabotage = [...(ctx.cmd.payload.sabotage ?? [])];
      const future = ctx.cmd.payload.futureImpact ?? { amount: 0 };
      action.futureImpactAwarded = Number(future.amount ?? 0);
      action.futureImpactTo = action.futureImpactAwarded > 0
        ? future.toCode ?? action.actorCode : null;
    },
  },

  /** The story of what happened, in the facilitator's words. Editable until close. */
  'facilitator:narrate': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const action = actionIn(ctx.state, ctx.cmd.payload);
      if (!action) return no('no such action');
      if (['closed', 'skipped'].includes(action.status)) return no('that action is over');
      return ok();
    },
    effects(draft, ctx) {
      draft.actions[ctx.cmd.payload.actionId].narration = String(ctx.cmd.payload.text ?? '');
    },
  },

  /**
   * Close the spotlight — the one moment anything is actually spent.
   *
   * Everything before this was a ruling being assembled; this is the commit.
   * The limit and the holders are re-checked against the allies who actually
   * confirmed, because a declare-time count was a count of invitations.
   */
  'facilitator:close-action': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { state, cmd, data } = ctx;
      const action = actionIn(state, cmd.payload);
      if (!action) return no('no such action');
      if (action.status !== 'rolled') return no('roll the consequence die before closing');

      const confirmed = confirmedAllies(action);
      if (action.accepted.length > resourceLimit(data, confirmed.length)) {
        return no(`only ${confirmed.length} allies confirmed — re-rule the resources down to ${
          resourceLimit(data, confirmed.length)} cards`);
      }
      for (const cardId of action.accepted) {
        const card = state.cards[cardId];
        if (card.state !== 'held'
          || (card.holderCode !== action.actorCode && !confirmed.includes(card.holderCode))) {
          return no('an accepted card left the table — re-rule the resources');
        }
      }
      if (action.futureImpactSpent > (state.futureImpacts[action.actorCode] ?? 0)) {
        return no('the declared future impact is no longer in the bank');
      }
      return ok();
    },
    effects(draft, ctx) {
      const action = draft.actions[ctx.cmd.payload.actionId];
      const confirmed = confirmedAllies(action);

      // The actor's and every confirmed ally's action cards are spent — that
      // is the printed price of acting and of allying — and a spent ally is
      // struck from the queue they were waiting in: they have had their
      // action, with this one, and the call must never reach them again.
      draft.actionCards[action.actorCode].spent = true;
      for (const code of confirmed) {
        draft.actionCards[code].spent = true;
        const queue = draft.initiative.queues[action.mapId];
        const at = queue.indexOf(code);
        if (at !== -1) queue.splice(at, 1);
      }

      // Accepted cards are spent where they stand; the discard pile is the
      // owner's by definition, so no card needs moving to reach it.
      for (const cardId of action.accepted) {
        draft.cards[cardId].state = 'spent';
      }
      // Regains, exactly as ruled at apply-effects.
      for (const { cardId, toCode } of action.regains) {
        draft.cards[cardId].state = 'held';
        draft.cards[cardId].holderCode = toCode;
      }
      // Sabotage confiscates by marking spent in place — into the owner's
      // discard, recoverable later. See gaps.js.
      for (const cardId of action.sabotage) {
        draft.cards[cardId].state = 'spent';
      }

      // The bank: credit what was awarded, debit what was spent.
      if (action.futureImpactAwarded > 0) {
        const toCode = action.futureImpactTo ?? action.actorCode;
        draft.futureImpacts[toCode] = (draft.futureImpacts[toCode] ?? 0)
          + action.futureImpactAwarded;
      }
      if (action.futureImpactSpent > 0) {
        draft.futureImpacts[action.actorCode] -= action.futureImpactSpent;
      }

      action.status = 'closed';
      action.endsAt = null;
      // The actor enters the record first, then the allies struck with them
      // — the order the room heard it.
      draft.initiative.done[action.mapId].push(action.actorCode);
      for (const code of confirmed) draft.initiative.done[action.mapId].push(code);
      draft.initiative.current[action.mapId] = null;
    },
  },

  /**
   * Put a facilitator's name on a lane, or take it off.
   *
   * UI semantics only: nothing is gated by it. Two umpires splitting three
   * maps between them need the split visible on every console, and that is
   * the whole of it.
   */
  'facilitator:claim-lane': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { mapId, name } = ctx.cmd.payload ?? {};
      if (!(mapId in (ctx.state.lanes ?? {}))) return no('no such lane');
      if (name !== null && typeof name !== 'string') return no('a name, or null to release');
      return ok();
    },
    effects(draft, ctx) {
      const { mapId, name } = ctx.cmd.payload;
      draft.lanes[mapId] = typeof name === 'string' && name.trim() ? name.trim() : null;
    },
  },

  /**
   * Pass somebody over — absent, passing, or out of time by the
   * facilitator's judgement. Spends nothing.
   *
   * With a spotlight open it skips that; with none open it skips the next
   * player in the queue, leaving a skipped record so the history says who
   * was passed and when.
   */
  'facilitator:skip-action': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { mapId } = ctx.cmd.payload ?? {};
      if (!ctx.state.initiative.queues[mapId]) return no('the Action Phase has not begun');
      if (!ctx.state.initiative.current[mapId] && !ctx.state.initiative.queues[mapId].length) {
        return no('nobody to skip on this map');
      }
      return ok();
    },
    effects(draft, ctx) {
      const { mapId } = ctx.cmd.payload;
      const openId = draft.initiative.current[mapId];
      if (openId) {
        const action = draft.actions[openId];
        action.status = 'skipped';
        action.endsAt = null;
        draft.initiative.done[mapId].push(action.actorCode);
        draft.initiative.current[mapId] = null;
        return;
      }
      const actorCode = draft.initiative.queues[mapId].shift();
      const id = nextActionId(draft);
      draft.actions[id] = {
        id,
        mapId,
        actorCode,
        seq: Number(id.slice(1)),
        declaration: '',
        allies: {},
        offered: [],
        accepted: [],
        vetoed: [],
        futureImpactSpent: 0,
        difficulty: 0,
        roll: null,
        effects: [],
        regains: [],
        sabotage: [],
        futureImpactAwarded: 0,
        futureImpactTo: null,
        narration: '',
        status: 'skipped',
        endsAt: null,
      };
      draft.initiative.done[mapId].push(actorCode);
    },
  },
};
