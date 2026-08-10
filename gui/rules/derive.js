/**
 * gui/rules/derive.js — the arithmetic of an action, computed when asked.
 *
 * Impact, the band it falls in, and the effect budgets that band buys are
 * never stored in state. Every reader — the admission clamps on
 * `facilitator:apply-effects`, the adjudication panel's live readout, the
 * player's spotlight mirror — computes them from the same functions here, so
 * the number the facilitator is looking at and the number the rules enforce
 * cannot disagree. Storing a derived value is how the boards and the tracker
 * come to drift; see AGENTS.md.
 *
 * Everything is a pure function over (numbers, data). The formula and the
 * tables are the gamespec's — data/meta.json — and this file adds no opinion
 * of its own beyond reading them.
 */

/**
 * The printed formula: turn + allies + accepted resources − difficulty,
 * plus the consequence die's boon and any flat bonus the facilitator has
 * spoken onto the action — the author's replacement for a token bank.
 *
 * `difficulty` is stored as the signed value the facilitator set (0 to −3),
 * so it is added rather than subtracted — the sign is already in it.
 *
 * @param {object} parts
 * @param {number} parts.turn
 * @param {number} [parts.allies]           confirmed allies
 * @param {number} [parts.accepted]         accepted resource cards
 * @param {number} [parts.difficulty]       0..-3, the facilitator's call
 * @param {number|null} [parts.dieFace]     null until rolled
 * @param {number} [parts.bonus]            facilitator:set-bonus, announced
 * @param {object} data
 */
export function impactOf({
  turn, allies = 0, accepted = 0, difficulty = 0, dieFace = null, bonus = 0,
}, data) {
  const boon = dieFace !== null && consequenceOf(dieFace, data)?.id === 'boon' ? 1 : 0;
  return turn + allies + accepted + difficulty + boon + bonus;
}

/** What a die face means: complication, normal, or boon. */
export function consequenceOf(face, data) {
  return data.meta.consequenceDie.find((entry) => entry.faces.includes(face)) ?? null;
}

/**
 * The band an Impact total falls in. The ladder tiles ≤1 up to 10+ — the
 * validator enforces that — so every total, however negative or heroic, has
 * exactly one label.
 */
export function bandFor(impact, data) {
  return data.meta.impact.bands.find((band) =>
    (band.min === undefined || band.min === null || impact >= band.min)
    && (band.max === undefined || band.max === null || impact <= band.max)) ?? null;
}

/** The band's position in the ladder, which is what the effect tables key on. */
export function bandIndexOf(impact, data) {
  return data.meta.impact.bands.indexOf(bandFor(impact, data));
}

/**
 * What an Impact total buys, per printed effect table.
 *
 * `scoreModifier` is read as a TOTAL budget of points of track movement
 * across the action's effects, not a per-track allowance — see gaps.js.
 */
export function effectBudgets(impact, data) {
  const index = bandIndexOf(impact, data);
  const tables = data.meta.effects;
  return {
    scoreModifier: tables.score_modifier.by_band[index],
    regain: tables.regain_resources.by_band[index],
    sabotage: tables.sabotage_resources.by_band[index],
    futureImpact: tables.increase_future_impact.by_band[index],
  };
}

/** The faction a card belongs to: its owner's — or, for an NPC, the NPC itself. */
export function cardFaction(data, ownerCode) {
  return data.roles.roles[ownerCode]?.factionId ?? ownerCode;
}

/**
 * What regaining one card costs against the regain budget.
 *
 * One for a card of the recipient's own faction; the printed out-of-faction
 * price for anything else. "If a player wants resources that would be
 * outside of their faction they 'cost' 2 each."
 */
export function regainCost(data, cardOwnerCode, toCode) {
  return cardFaction(data, cardOwnerCode) === cardFaction(data, toCode)
    ? 1 : Number(data.meta.effects.regain_resources.out_of_faction_cost);
}

/** How many resource cards an action may commit: the base, plus one per ally. */
export function resourceLimit(data, allyCount) {
  return Number(data.meta.resourceCommitment.base_limit)
    + Number(data.meta.resourceCommitment.per_ally_bonus) * allyCount;
}

/** An action record's confirmed allies, which are the ones Impact counts. */
export function confirmedAllies(action) {
  return Object.entries(action.allies ?? {})
    .filter(([, status]) => status === 'confirmed')
    .map(([code]) => code);
}

/** One action record's live Impact total, from the state around it. */
export function actionImpact(state, data, action) {
  return impactOf({
    turn: state.phase.turn,
    allies: confirmedAllies(action).length,
    accepted: (action.accepted ?? []).length,
    difficulty: action.difficulty ?? 0,
    dieFace: action.roll,
    bonus: action.bonus ?? 0,
  }, data);
}

/**
 * Where a faction's opportunity vote stands.
 *
 * Consensus is every CLAIMED seat of the faction voting the same way —
 * empty chairs do not block a table that agrees, and an unclaimed faction
 * can never reach consensus. The facilitator resolves on judgement either
 * way; this is the readout, not a gate.
 *
 * @returns {{claimed: string[], agreed: ('A'|'B'|null)}}
 */
export function opportunityConsensus(state, data, record) {
  if (!record.factionId) return { claimed: [], agreed: null };
  const claimed = Object.values(state.roles)
    .filter((role) => !role.npc && role.claimedBySeat !== null
      && data.roles.roles[role.id]?.factionId === record.factionId)
    .map((role) => role.id);
  const votes = record.votes ?? {};
  const first = claimed.length ? votes[claimed[0]] : undefined;
  const agreed = claimed.length && first !== undefined
    && claimed.every((code) => votes[code] === first) ? first : null;
  return { claimed, agreed };
}
