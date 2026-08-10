/**
 * gui/rules/commands/negotiation.js — the five minutes everything is decided in.
 *
 * Two verbs, both scoped hard to the Negotiation Phase because the print
 * scopes them there: the mandatory placing of your action card on a map, and
 * the one discarded card a role gets back per phase.
 *
 * Placement is re-placeable until the phase ends. The handbook makes the
 * placement mandatory but not final — a player who hears something in the
 * last thirty seconds is supposed to be able to move their card, and the
 * facilitator calls the phase when the moving stops.
 */

import { no, ok, subjectOf, roleName } from './shared.js';

export const NEGOTIATION_COMMANDS = {
  'place-action-card': {
    phases: ['negotiation'],
    actor: 'player',
    label: 'Place your action card',
    note: 'Mandatory. On a map, not a place — you say where the story goes when you are called.',
    admit(ctx) {
      const { state, cmd } = ctx;
      const subject = subjectOf(ctx);
      // The NPC lanyards have no action card: their influence is their hands.
      if (!state.actionCards[subject]) {
        return no(`${roleName(ctx.data, subject)} has no action card`);
      }
      if (!state.maps[cmd.payload?.mapId]) return no('no such map');
      if (state.actionCards[subject].spent) {
        return no('your action has already been resolved this turn');
      }
      return ok();
    },
    effects(draft, ctx) {
      // Re-placement is an overwrite, not an error: the last word before the
      // facilitator calls the phase is the placement that counts.
      draft.actionCards[subjectOf(ctx)].placed = ctx.cmd.payload.mapId;
    },
    fields(state, data) {
      return [{
        name: 'mapId',
        label: 'Which map',
        kind: 'select',
        options: Object.entries(data.maps.maps)
          .map(([id, map]) => ({ value: id, label: map.name })),
      }];
    },
  },

  'recover-discard': {
    phases: ['negotiation'],
    actor: 'player',
    label: 'Recover a discarded card',
    note: 'One per Negotiation Phase, from your own pile.',
    admit(ctx) {
      const { state, cmd } = ctx;
      const subject = subjectOf(ctx);
      const card = state.cards[cmd.payload?.cardId];
      if (!card) return no('no such card in this game');
      // Your own pile only: a spent card goes home to its owner, wherever it
      // was spent, so recovery is the owner's and nobody else's.
      if (card.ownerCode !== subject) return no('only your own discard comes back');
      if (card.state === 'destroyed') return no('that card was destroyed — it is out of the game');
      if (card.state !== 'spent') return no('that card is not in the discard');
      if ((state.roles[subject]?.perTurn?.recovered ?? 0) >= 1) {
        return no('you have already recovered a card this phase');
      }
      return ok();
    },
    effects(draft, ctx) {
      const subject = subjectOf(ctx);
      const card = draft.cards[ctx.cmd.payload.cardId];
      card.state = 'held';
      card.holderCode = card.ownerCode;
      draft.roles[subject].perTurn.recovered += 1;
    },
    fields(state, data, roleId) {
      return [{
        name: 'cardId',
        label: 'Which card',
        kind: 'select',
        options: Object.values(state.cards ?? {})
          .filter((card) => card.ownerCode === roleId && card.state === 'spent')
          .map((card) => ({
            value: card.id,
            label: data.resources.types[card.type]?.name ?? card.type,
          })),
      }];
    },
  },
};
