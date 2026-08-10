/**
 * gui/rules/commands/team.js — the Team Phase: the news, the openings, and
 * the tithe.
 *
 * The war correspondence and the opportunity menus live in facilitator-only
 * data (data/events.json), which the rules never read: every effect these
 * verbs apply arrives IN THE COMMAND PAYLOAD, submitted by the host console
 * after the facilitator has the script open in front of them. That is what
 * keeps a replay a function of the log alone — a save replays identically on
 * a machine that has never fetched the facilitator files. See DECISIONS.md.
 *
 * The one deliberate exception is the tithe schedule. Players need their own
 * consoles to admit a payment, so the printed amounts are transcribed here as
 * a constant, and tools/validate-data.mjs cross-checks the transcription
 * against events.json so the two cannot drift apart silently.
 */

import { no, ok, subjectOf } from './shared.js';

/**
 * "The Belt Union owes the U.N. Ambassador 1, 1, 2, 2 resource cards by
 * turn." Transcribed from data/events.json (facilitatorOnly), cross-checked
 * by the validator.
 */
export const TITHE_SCHEDULE = { 1: 1, 2: 1, 3: 2, 4: 2 };
export const TITHE_FROM_FACTION = 'belt_union';
export const TITHE_TO_CODE = 'N1';

/** How many cards the tithe demands this turn. */
export function titheOwed(turn) {
  return TITHE_SCHEDULE[turn] ?? 0;
}

/**
 * A track-effect list as the correspondence and opportunity verbs carry it:
 * `{track, delta}` moves a track, `{track: 'war_progress', set}` places the
 * War Progress marker (which is how the turn-two correspondence starts the
 * war). Validated once here for both verbs.
 */
function effectsProblem(state, effects) {
  if (!Array.isArray(effects)) return 'effects must be a list';
  for (const effect of effects) {
    if (effect.track === 'war_progress') {
      if ('set' in effect) {
        if (!Number.isInteger(effect.set) || effect.set < 0) {
          return 'war progress is set to a whole non-negative value';
        }
        continue;
      }
      if (!Number.isInteger(effect.delta)) return 'war progress moves by whole points';
      if (state.warProgress === null) return 'the war has not begun — set war progress first';
      if (state.warProgress + effect.delta < 0) return 'war progress cannot go below zero';
      continue;
    }
    const mapId = Object.keys(state.maps)
      .find((id) => effect.track in state.maps[id].tracks);
    if (!mapId) return `no track called '${effect.track}'`;
    if (!Number.isInteger(effect.delta) || effect.delta === 0) {
      return 'track movement is whole points';
    }
    if (state.maps[mapId].tracks[effect.track] + effect.delta < 0) {
      return `${effect.track} would go negative`;
    }
  }
  return null;
}

/** Apply a validated effect list to a draft. */
function applyEffects(draft, effects) {
  for (const effect of effects) {
    if (effect.track === 'war_progress') {
      if ('set' in effect) draft.warProgress = effect.set;
      else draft.warProgress += effect.delta;
      continue;
    }
    const mapId = Object.keys(draft.maps)
      .find((id) => effect.track in draft.maps[id].tracks);
    draft.maps[mapId].tracks[effect.track] += effect.delta;
  }
}

export const TEAM_COMMANDS = {
  /**
   * Publish (or, where the print allows, skip) a turn's war correspondence.
   *
   * One confirmable step: the news is marked read and its printed effects
   * land together. Which turns may be skipped is not enforced here — the
   * host console only offers Skip where events.json marks the entry
   * optional, and the rules trust the umpire. See DECISIONS.md.
   */
  'facilitator:publish-correspondence': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { state, cmd } = ctx;
      const turn = Number(cmd.payload?.turn);
      if (!Number.isInteger(turn) || !(`t${turn}` in state.correspondence)) {
        return no('no such turn');
      }
      if (state.correspondence[`t${turn}`] !== null) {
        return no('that correspondence has already been dealt with');
      }
      if (cmd.payload?.skip) return ok();
      const problem = effectsProblem(state, cmd.payload?.effects ?? []);
      return problem ? no(problem) : ok();
    },
    effects(draft, ctx) {
      const turn = Number(ctx.cmd.payload.turn);
      if (ctx.cmd.payload.skip) {
        draft.correspondence[`t${turn}`] = 'skipped';
        return;
      }
      draft.correspondence[`t${turn}`] = 'published';
      applyEffects(draft, ctx.cmd.payload.effects ?? []);
    },
  },

  /**
   * Put a two-option choice in front of a faction.
   *
   * The facilitator writes the title and both options — guided by the
   * printed menus, but in their own words, because the menus are examples
   * and the moment is the table's. An NPC-targeted opportunity names a
   * lanyard instead of a faction and stays facilitator-only by redaction.
   */
  'facilitator:deliver-opportunity': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { factionId, npcCode, title, optionA, optionB } = ctx.cmd.payload ?? {};
      if (Boolean(factionId) === Boolean(npcCode)) {
        return no('aim it at exactly one faction, or one NPC lanyard');
      }
      if (factionId && !ctx.data.factions.factions[factionId]) return no('no such faction');
      if (npcCode && !ctx.state.roles[npcCode]?.npc) return no('no such NPC lanyard');
      for (const [field, value] of [['title', title], ['option A', optionA], ['option B', optionB]]) {
        if (typeof value !== 'string' || !value.trim()) return no(`write the ${field}`);
      }
      return ok();
    },
    effects(draft, ctx) {
      const { triggerId, factionId, npcCode, title, optionA, optionB } = ctx.cmd.payload;
      const id = `o${Object.keys(draft.opportunities).length + 1}`;
      draft.opportunities[id] = {
        id,
        turn: draft.phase.turn,
        triggerId: triggerId ?? null,
        factionId: factionId ?? null,
        npcCode: npcCode ?? null,
        title,
        optionA,
        optionB,
        votes: {},
        effects: [],
        status: 'pending',
      };
    },
  },

  /**
   * A player casts their faction's vote. Each of the faction's claimed
   * seats picks an option, revotable while the record is pending; the
   * consoles mark consensus when every claimed seat agrees, and the
   * facilitator resolves on judgement either way. See gaps.js.
   */
  'choose-opportunity': {
    phases: '*',
    actor: 'player',
    label: 'Vote on your faction’s opportunity',
    admit(ctx) {
      const { state, cmd, data } = ctx;
      const record = state.opportunities[cmd.payload?.opportunityId];
      if (!record) return no('no such opportunity');
      if (record.status !== 'pending') return no('that opportunity is settled');
      if (!['A', 'B'].includes(cmd.payload?.choice)) return no('choose option A or B');
      const subject = subjectOf(ctx);
      if (!record.factionId
        || data.roles.roles[subject]?.factionId !== record.factionId) {
        return no('this opportunity is not your faction’s');
      }
      return ok();
    },
    effects(draft, ctx) {
      const record = draft.opportunities[ctx.cmd.payload.opportunityId];
      record.votes[subjectOf(ctx)] = ctx.cmd.payload.choice;
    },
  },

  /**
   * Settle an opportunity: apply the track effects the choice earned and
   * mark it resolved. Applied once — a resolved opportunity is resolved,
   * and a correction afterwards is the pencil's job. See DECISIONS.md.
   */
  'facilitator:resolve-opportunity': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const record = ctx.state.opportunities[ctx.cmd.payload?.opportunityId];
      if (!record) return no('no such opportunity');
      if (record.status !== 'pending') return no('already resolved');
      const problem = effectsProblem(ctx.state, ctx.cmd.payload?.effects ?? []);
      return problem ? no(problem) : ok();
    },
    effects(draft, ctx) {
      const record = draft.opportunities[ctx.cmd.payload.opportunityId];
      record.effects = [...(ctx.cmd.payload.effects ?? [])];
      record.status = 'resolved';
      applyEffects(draft, record.effects);
    },
  },

  /**
   * The Belt Union pays the turn's tithe: the printed count of cards, from
   * the paying player's own hand, into the Ambassador's.
   */
  'pay-tithe': {
    phases: ['team', 'negotiation'],
    actor: 'player',
    label: 'Pay the tithe',
    note: 'The Belt Union owes the U.N. Ambassador — 1, 1, 2, 2 cards by turn.',
    admit(ctx) {
      const { state, cmd, data } = ctx;
      const subject = subjectOf(ctx);
      if (data.roles.roles[subject]?.factionId !== TITHE_FROM_FACTION) {
        return no('the tithe is the Belt Union’s to pay');
      }
      if (state.tithe.refused) return no('this turn’s tithe was refused — talk to the facilitator');
      const cardIds = cmd.payload?.cardIds ?? [];
      // Instalments, by the author's ruling: any Belt player, any number of
      // payments, each of at least one card, accumulating against the due.
      if (!cardIds.length) return no('pay at least one card');
      if (new Set(cardIds).size !== cardIds.length) return no('the same card twice is one card');
      for (const cardId of cardIds) {
        const card = state.cards[cardId];
        if (!card) return no('no such card in this game');
        if (card.holderCode !== subject || card.state !== 'held') {
          return no('pay from cards in your own hand');
        }
      }
      return ok();
    },
    effects(draft, ctx) {
      for (const cardId of ctx.cmd.payload.cardIds) {
        draft.cards[cardId].holderCode = TITHE_TO_CODE;
      }
      draft.tithe.paidCardIds = [...draft.tithe.paidCardIds, ...ctx.cmd.payload.cardIds];
    },
    fields(state, data, roleId) {
      return [{
        name: 'cardIds',
        label: 'Which cards',
        kind: 'select',
        options: Object.values(state.cards ?? {})
          .filter((card) => card.holderCode === roleId && card.state === 'held')
          .map((card) => ({
            value: card.id,
            label: data.resources.types[card.type]?.name ?? card.type,
          })),
      }];
    },
    // The generic probe would send one cardId string where the rule wants a
    // list; a representative legal instance is the right number of cards.
    probe(state, data, roleId) {
      const held = Object.values(state?.cards ?? {})
        .filter((card) => card.holderCode === roleId && card.state === 'held')
        .map((card) => card.id);
      return { cardIds: held.slice(0, titheOwed(state?.phase?.turn ?? 1)) };
    },
  },

  /**
   * The tithe is refused, and the record says so.
   *
   * What refusal costs — "move Shipping Control towards Earth", worse — is
   * the facilitator's retaliation through ordinary track edits, not a rule
   * here. See gaps.js.
   */
  'facilitator:mark-tithe-refused': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      if (ctx.state.tithe.refused) return no('already recorded');
      return ok();
    },
    effects(draft) {
      draft.tithe.refused = true;
    },
  },
};

/** Shared with the turn-update verbs, which carry the same effect shape. */
export { effectsProblem, applyEffects };
