/**
 * gui/rules/state.js — the shape of a game, and how one begins.
 *
 * Plain JSON: no classes, no Map, no Set, no Date. That is what makes
 * `structuredClone` a valid copy, `JSON.stringify` a valid save, a downloaded
 * file a valid handover to another machine, and `toEqual` a valid assertion.
 * Every one of those would need bespoke code if this held live objects.
 *
 * Derived values are deliberately absent. Impact totals, effect bands and the
 * War Progress marker's map location are all worked out from the numbers here
 * when they are needed. Storing them is how the board and the tracker come to
 * disagree, and in a game adjudicated off the tracker, that disagreement is
 * the bug that matters.
 */

export const SCHEMA_VERSION = 1;

/** The three phases of every turn, in order. */
export const PHASES = ['team', 'negotiation', 'action'];

/**
 * The two phases that bracket the game rather than being part of it.
 *
 * `lobby` is the pregame: people are arriving and taking lanyards, and
 * nothing on the board is meant to be happening yet. `epilogue` is the
 * postgame: time has been called, the debrief is being read, and the board is
 * the record of what happened rather than something still being played.
 *
 * Neither admits a player's game actions — see admission.js. They are named
 * here rather than tested for by string in five places, because "is the game
 * being played right now" is one question and deserves one answer.
 */
export const OUT_OF_PLAY = ['lobby', 'epilogue'];

/** The two facilitator-played NPC lanyards. */
export const NPC_CODES = ['N1', 'N2'];

/**
 * Which role codes are dealt in at a given head count.
 *
 * The scaling table is authored, not computed: the gamespec names the exact
 * roster for every count from eight to eighteen, and the app applies it
 * rather than inventing a drop order of its own.
 */
export function rosterFor(data, players) {
  const table = data.scaling.rosterAt;
  const counts = Object.keys(table).map(Number);
  const wanted = Math.min(Math.max(Number(players) || Math.max(...counts),
    Math.min(...counts)), Math.max(...counts));
  return [...table[String(wanted)]];
}

/**
 * Build the opening position from the static data.
 *
 * @param {object} args
 * @param {string} args.joinCode
 * @param {number} args.seed
 * @param {object} args.data  the contents of data/, already loaded
 * @param {number} [args.playerCount]  how many players; defaults to the full 18
 * @param {string[]} [args.rosterCodes]  the exact roster, when a save carries
 *   one; wins over playerCount because it is what the game was actually dealt
 * @returns {object} a fresh GameState
 */
export function createInitialState({ joinCode, seed, data, playerCount, rosterCodes }) {
  const roster = rosterCodes ?? rosterFor(data, playerCount);

  const roles = {};
  for (const code of roster) {
    if (!data.roles.roles[code]) throw new Error(`createInitialState: unknown role '${code}'`);
    roles[code] = {
      id: code,
      // Which seat is playing this lanyard. Runtime identity lives in `seats`;
      // this is the game's own record of the claim, written by the claim-role
      // command and so replayable from the log.
      claimedBySeat: null,
      // Allowances that refresh every turn. `recovered` is the Negotiation
      // Phase's one-discard-back rule; reset by advance-phase on rollover.
      perTurn: { recovered: 0 },
    };
  }
  // The two NPCs are always in the game, whoever is at the table. They are
  // facilitator-played, so a player claim on them is refused — see lobby.js.
  // They keep the same per-turn allowances: the Speaker's discard pile
  // recovers by the same printed rule as anybody's.
  for (const code of NPC_CODES) {
    roles[code] = { id: code, npc: true, claimedBySeat: null, perTurn: { recovered: 0 } };
  }

  // One tracks object per map, seeded from the printed initial values. The
  // War Progress track is deliberately not here: it has no map and no value
  // until the turn-two war correspondence activates it.
  const maps = {};
  for (const mapId of Object.keys(data.maps.maps)) maps[mapId] = { tracks: {} };
  for (const [trackId, track] of Object.entries(data.maps.tracks)) {
    if (track.map === null || track.initial === null) continue;
    maps[track.map].tracks[trackId] = track.initial;
  }

  // Every resource card that is in the game, one record each. A card whose
  // owner is not in this roster stays in the box — it is not dealt, so it is
  // not state. `holderCode` moves as cards are loaned; `ownerCode` never does.
  const cards = {};
  for (const [cardId, card] of Object.entries(data.resources.cards)) {
    if (!roles[card.ownerCode]) continue;
    cards[cardId] = {
      id: cardId,
      type: card.type,
      ownerCode: card.ownerCode,
      holderCode: card.ownerCode,
      // 'held' in a hand, 'spent' in the discard. Loans move holderCode, not
      // state: a borrowed card is still held, just by somebody else.
      state: 'held',
    };
  }

  // One action card per player, mandatory-placed each Negotiation Phase.
  // The NPCs have none: their hands are resource cards only.
  const actionCards = {};
  for (const code of roster) actionCards[code] = { placed: null, spent: false };

  // Banked future-impact tokens, spendable as a bonus on a later action.
  // Zeroed per player up front rather than created on first credit, so the
  // bank is a column every console can draw from the very first turn.
  const futureImpacts = {};
  for (const code of roster) futureImpacts[code] = 0;

  return {
    schemaVersion: SCHEMA_VERSION,
    joinCode,
    seed,
    rngCursor: 0,
    // The pregame is a phase of no length, held. Not "no clock at all", which
    // is what a null deadline gives and which leaves the facilitator's clock
    // controls dead until the game starts: held at zero, the same +1 min that
    // stretches any other phase will give a briefing however long it needs,
    // and the same Next phase starts the game. It cannot run out while it is
    // held, so nothing beeps at a room that has not sat down yet.
    phase: { turn: 0, name: 'lobby', endsAt: null, paused: true, pausedRemainingMs: 0 },
    // Keyed by a short public seat id, never by the seat token. A projection
    // can redact a value but not a key -- the key is structure -- so anything
    // secret has to not be one. The token is the credential that resumes a
    // seat, so it lives inside the record where the manifest can hide it.
    seats: {},
    seatByToken: {},
    // The roster the game was dealt with, kept in state so a save replays
    // against the same table it was recorded at.
    rosterCodes: roster,
    roles,
    maps,
    // Null until the turn-two war correspondence activates it; then a number
    // on the 0..20+ route. 0 is Earth's surrender, 20+ is Mars's, and the
    // marker's location on the maps is derived from the value, never stored.
    warProgress: null,
    cards,
    actionCards,
    // The Action Phase's call order. Empty outside the phase; advance-phase
    // builds the queues from the turn's printed initiative row and the
    // placements the moment an Action Phase opens. See emptyInitiative().
    initiative: emptyInitiative(),
    // The war correspondence, one slot per turn: null until the facilitator
    // publishes (or, where the print allows, skips) it. That the news
    // happened is public; the read-aloud text itself is facilitator data,
    // spoken over voice rather than sent to anybody.
    correspondence: Object.fromEntries(
      Array.from({ length: Number(data.meta.turns) }, (_, i) => [`t${i + 1}`, null])),
    // Threshold-and-lead opportunities, keyed o1, o2… and kept. The record
    // is faction-scoped — the first TEAM-audience state in the game — and an
    // NPC-targeted one reaches only the facilitator. See visibility.js.
    opportunities: {},
    // The turn's tithe: the Belt Union owes the U.N. Ambassador. One payment
    // per turn, or one refusal; reset by advance-phase on rollover.
    tithe: { paidCardIds: [], refused: false },
    // Every spotlight ever opened, keyed a1, a2… and kept — a closed action
    // is part of the story of the game, and the replay reads it back.
    actions: {},
    futureImpacts,
    // When time was called, for the debrief. Prose about the ending belongs
    // to the facilitator, not to state.
    aftermath: { endedAt: null, endedOnTurn: null },
    facilitatorNotes: {},
    log: [],
    lastSeq: {},
  };
}

/**
 * The Action Phase machinery at rest.
 *
 * One shape for "no Action Phase is running", used by createInitialState and
 * by the turn rollover, so nothing downstream ever asks "is there a queues
 * object" — there always is, it is just empty between phases.
 */
export function emptyInitiative() {
  return { queues: {}, done: {}, current: {}, unplaced: [] };
}

/** The seat holding a token, or null. */
export function seatForToken(state, token) {
  const id = state.seatByToken[token];
  return id ? state.seats[id] ?? null : null;
}

/** The next free public seat id. Short, sequential, and safe to broadcast. */
export function nextSeatId(state) {
  return `s${Object.keys(state.seats).length + 1}`;
}

/** Roles the given seat may act for. A facilitator may act for anyone. */
export function rolesFor(state, seatId) {
  const seat = state.seats[seatId];
  if (!seat) return [];
  if (seat.kind === 'facilitator') return Object.keys(state.roles);
  return seat.roleId ? [seat.roleId] : [];
}

/** The role a seat holds, or null. */
export function roleOf(state, seatId) {
  const roleId = state.seats[seatId]?.roleId;
  return roleId ? state.roles[roleId] ?? null : null;
}

/** The seat playing a role, or null. The reverse of roleOf, computed. */
export function seatHolding(state, roleId) {
  return Object.values(state.seats).find((s) => s.roleId === roleId) ?? null;
}

/** The faction a role code belongs to, read off the static data. */
export function factionOf(data, code) {
  return data.roles.roles[code]?.factionId ?? null;
}
