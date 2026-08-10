/**
 * gui/rules/commands/cards.js — resource cards changing hands.
 *
 * Three verbs, and between them the whole printed life of a resource card
 * short of spending it on an action: it is loaned to somebody, taken back by
 * its owner, or discarded. The invariants are the handbook's own —
 *
 *   - **Ownership never changes.** `ownerCode` is printed on the card;
 *     `holderCode` is where it happens to be. A loan moves the holder and
 *     nothing else.
 *   - **Freely loanable.** Any holder may pass a held card to anybody in the
 *     game, in any playing phase. The handbook puts no gate on generosity.
 *   - **The owner reclaims until spent.** A loaned card is the owner's to take
 *     back at any moment — that is what makes lending safe enough to be the
 *     game's whole economy — and a spent card is nobody's until recovery.
 *
 * The NPC hands are driven through these same verbs by the facilitator, who
 * names the acting role in the payload the way `subjectOf` already allows.
 * Discarding here is the bookkeeping half of "discard on use"; the use itself
 * is adjudicated in the Action Phase, by a human, later.
 */

import { no, ok, roleName, subjectOf } from './shared.js';

/** The cards a role is holding right now, as chooser options. */
const heldBy = (state, data, roleId) => Object.values(state.cards ?? {})
  .filter((card) => card.holderCode === roleId && card.state === 'held')
  .map((card) => ({
    value: card.id,
    label: data.resources.types[card.type]?.name ?? card.type,
  }));

export const CARD_COMMANDS = {
  /**
   * The umpire moves any card anywhere — a mis-deal corrected, a reward
   * granted, a loan unwound without asking. One explicit verb rather than
   * pencil-poking card records, so the ledger reads as what happened.
   *
   * `to` is a role code (into that hand, held) or 'discard' (spent where it
   * stands, landing in its owner's pile). There is no 'box': undealt cards
   * are not state, and a destroyed card stays destroyed. See DECISIONS.md.
   */
  'facilitator:move-card': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { cardId, to } = ctx.cmd.payload ?? {};
      const card = ctx.state.cards[cardId];
      if (!card) return no('no such card in this game');
      if (card.state === 'destroyed') return no('that card was destroyed — it is out of the game');
      if (to === 'discard') {
        return card.state === 'spent' ? no('it is already in the discard') : ok();
      }
      if (!ctx.state.roles[to]) return no('nobody by that code is in this game');
      if (card.holderCode === to && card.state === 'held') {
        return no('it is already in that hand');
      }
      return ok();
    },
    effects(draft, ctx) {
      const { cardId, to } = ctx.cmd.payload;
      const card = draft.cards[cardId];
      if (to === 'discard') {
        card.state = 'spent';
        return;
      }
      card.state = 'held';
      card.holderCode = to;
    },
  },

  'hand-card': {
    phases: '*',
    actor: 'player',
    label: 'Hand a card to somebody',
    note: 'A loan, not a gift — the owner can always take it back.',
    admit(ctx) {
      const { state, cmd } = ctx;
      const subject = subjectOf(ctx);
      const card = state.cards[cmd.payload?.cardId];
      if (!card) return no('no such card in this game');
      if (card.holderCode !== subject) return no('you are not holding that card');
      if (card.state !== 'held') return no('that card has been spent');
      const toCode = cmd.payload?.toCode;
      if (!state.roles[toCode]) return no('nobody by that code is in this game');
      if (toCode === subject) return no('it is already in your hand');
      return ok();
    },
    effects(draft, ctx) {
      draft.cards[ctx.cmd.payload.cardId].holderCode = ctx.cmd.payload.toCode;
    },
    fields(state, data, roleId) {
      return [
        { name: 'cardId', label: 'Which card', kind: 'select', options: heldBy(state, data, roleId) },
        {
          name: 'toCode',
          label: 'To whom',
          kind: 'select',
          options: Object.keys(state.roles ?? {})
            .filter((code) => code !== roleId)
            .map((code) => ({ value: code, label: roleName(data, code) })),
        },
      ];
    },
  },

  'reclaim-card': {
    phases: '*',
    actor: 'player',
    label: 'Take a loaned card back',
    note: 'Yours until it is spent, wherever it is.',
    admit(ctx) {
      const { state, cmd } = ctx;
      const subject = subjectOf(ctx);
      const card = state.cards[cmd.payload?.cardId];
      if (!card) return no('no such card in this game');
      if (card.ownerCode !== subject) return no('that card is not yours to reclaim');
      if (card.holderCode === subject) return no('it is already in your hand');
      // The one line the whole loan economy stands on: a spent card is out of
      // everybody's reach until the Negotiation Phase recovery.
      if (card.state !== 'held') return no('it has been spent — reclaim reaches held cards only');
      return ok();
    },
    effects(draft, ctx) {
      const card = draft.cards[ctx.cmd.payload.cardId];
      card.holderCode = card.ownerCode;
    },
    fields(state, data, roleId) {
      return [{
        name: 'cardId',
        label: 'Which card',
        kind: 'select',
        options: Object.values(state.cards ?? {})
          .filter((card) => card.ownerCode === roleId
            && card.holderCode !== roleId && card.state === 'held')
          .map((card) => ({
            value: card.id,
            label: `${data.resources.types[card.type]?.name ?? card.type} — with ${
              roleName(data, card.holderCode)}`,
          })),
      }];
    },
  },

  'discard-card': {
    phases: '*',
    actor: 'player',
    label: 'Discard a card',
    note: 'Spent cards go to their owner’s discard pile until recovered.',
    admit(ctx) {
      const { state, cmd } = ctx;
      const subject = subjectOf(ctx);
      const card = state.cards[cmd.payload?.cardId];
      if (!card) return no('no such card in this game');
      if (card.holderCode !== subject) return no('you are not holding that card');
      if (card.state !== 'held') return no('it is already in the discard');
      return ok();
    },
    effects(draft, ctx) {
      draft.cards[ctx.cmd.payload.cardId].state = 'spent';
    },
    fields(state, data, roleId) {
      return [{
        name: 'cardId', label: 'Which card', kind: 'select', options: heldBy(state, data, roleId),
      }];
    },
  },
};
