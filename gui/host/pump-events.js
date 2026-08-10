/**
 * gui/host/pump-events.js — what an outside service is told, and how.
 *
 * The event pump exists so a bot (Discord or otherwise) can follow a game it
 * is not playing. Everything about *sending* is next door in event-pump.js;
 * everything here is a pure function over two snapshots, so the whole
 * contract can be tested in Node with no socket, no clock and no host.
 *
 * **The input is a spectator projection, never state.** That is the redaction
 * story and it is structural rather than careful: `projectView(state, data,
 * {kind: 'spectator'})` returns exactly the paths the manifest marks PUBLIC.
 * No filtering happens here, and no `FIELD_VISIBILITY` entry is needed,
 * because the pump adds nothing to state and reads nothing that is not
 * already leaving the tab. The digest-equality test holds this honest: it
 * comes out identical built from a projection or from raw state, which is
 * only true while every field it reads is PUBLIC.
 *
 * Events describe changes rather than carrying the board, so a bot never
 * needs to hold a copy of the game to make sense of one. Each says what
 * moved and what it moved from.
 */

import { actionImpact, bandFor } from '../rules/derive.js';

/**
 * The wire's own version, bumped when a field changes meaning or leaves.
 *
 * The bot is in another repository and will be deployed on its own schedule,
 * so it needs to be able to say "I do not understand this" rather than
 * mis-parse a shape that quietly changed under it.
 */
export const PUMP_SCHEMA_VERSION = 2;

/** Every type this module can emit. Exported because it is the contract. */
export const EVENT_TYPES = [
  'game.opened',
  'game.phase',
  'game.ended',
  'seat.joined',
  'seat.left',
  'seat.returned',
  'seat.role',
  'correspondence.published',
  'opportunity.resolved',
  'action.closed',
  'turn-update.step',
  'war.progress',
];

/** The keys on every envelope, in the order they are written. */
export const ENVELOPE_KEYS = ['v', 'seq', 'at', 'game', 'type', 'data'];

/**
 * The public board, reduced to the handful of things worth announcing.
 *
 * Deliberately flat and deliberately small. Diffing whole states would mean
 * holding two of them, and would make "what changed" a question about
 * structure rather than about the game.
 *
 * @param {object} view  a spectator projection
 * @param {object} data  the static dataset, for the band ladder
 */
export function publicDigest(view, data) {
  const phase = view?.phase ?? {};

  const seats = {};
  for (const [id, seat] of Object.entries(view?.seats ?? {})) {
    seats[id] = {
      name: typeof seat?.name === 'string' ? seat.name : '',
      roleId: seat?.roleId ?? null,
      kind: seat?.kind === 'facilitator' ? 'facilitator' : 'player',
      connected: Boolean(seat?.connected),
    };
  }

  const opportunities = {};
  for (const [id, record] of Object.entries(view?.opportunities ?? {})) {
    opportunities[id] = {
      status: record?.status ?? null,
      factionId: record?.factionId ?? null,
      npcCode: record?.npcCode ?? null,
    };
  }

  // Actions carry the story a bot wants to tell: who, where, how big, and
  // the facilitator's own sentence. The band is derived at digest time —
  // when a close first appears the phase is still the turn it happened in,
  // and events only fire on the status transition, so the band captured
  // with the transition is the band the room heard.
  const actions = {};
  for (const [id, action] of Object.entries(view?.actions ?? {})) {
    actions[id] = {
      mapId: action?.mapId ?? null,
      actorCode: action?.actorCode ?? null,
      status: action?.status ?? null,
      narration: action?.narration ?? '',
      band: data ? bandFor(actionImpact(view, data, action), data)?.label ?? null : null,
    };
  }

  const updateSteps = {};
  const sheet = view?.turnUpdate;
  for (const step of sheet?.steps ?? []) {
    updateSteps[`t${sheet.turn}:${step.id}`] = {
      kind: step.kind,
      status: step.status,
      appliedDelta: step.appliedDelta ?? null,
    };
  }

  return {
    turn: phase.turn ?? null,
    phase: phase.name ?? null,
    paused: Boolean(phase.paused),
    ended: phase.name === 'epilogue',
    seats,
    correspondence: { ...(view?.correspondence ?? {}) },
    opportunities,
    actions,
    updateSteps,
    warProgress: view?.warProgress ?? null,
  };
}

/** One seat, in the shape every seat-shaped event carries it. */
const seatData = (seatId, seat) => ({
  seatId, name: seat.name, roleId: seat.roleId, kind: seat.kind,
});

/**
 * What happened between two digests.
 *
 * A null `before` is the first observation of a game, which is a different
 * question — the bot has just attached and needs the position, not a diff —
 * so it gets one `game.opened` carrying the roster rather than a join for
 * every seat that was already sitting there.
 *
 * Order is deterministic: the clock first, then the people, then the news,
 * the war, the openings, the spotlights and the worksheet. A bot replaying
 * a log file gets the same story the room got.
 *
 * @param {object|null} before
 * @param {object} after
 * @returns {{type: string, data: object}[]}
 */
export function deriveEvents(before, after) {
  if (!before) {
    return [{
      type: 'game.opened',
      data: {
        turn: after.turn,
        phase: after.phase,
        paused: after.paused,
        seats: Object.entries(after.seats).map(([id, seat]) => seatData(id, seat)),
      },
    }];
  }

  const events = [];

  // Pausing counts. A bot holding a voice channel open for a phase needs to
  // know the room has stopped, and to a facilitator that is the same act as
  // moving on.
  if (before.turn !== after.turn || before.phase !== after.phase
      || before.paused !== after.paused) {
    events.push({
      type: 'game.phase',
      data: {
        turn: after.turn,
        phase: after.phase,
        paused: after.paused,
        previousTurn: before.turn,
        previousPhase: before.phase,
      },
    });
  }
  if (!before.ended && after.ended) {
    events.push({
      type: 'game.ended',
      data: { turn: after.turn, warProgress: after.warProgress },
    });
  }

  for (const [id, seat] of Object.entries(after.seats)) {
    const was = before.seats[id];
    if (!was) {
      events.push({ type: 'seat.joined', data: seatData(id, seat) });
      continue;
    }
    // Coming back is not the same as arriving. A bot that treated it as one
    // would greet the same person eighteen times over a two-hour game.
    if (!was.connected && seat.connected) {
      events.push({ type: 'seat.returned', data: seatData(id, seat) });
    }
    if (was.connected && !seat.connected) {
      events.push({ type: 'seat.left', data: seatData(id, seat) });
    }
    if (was.roleId !== seat.roleId) {
      events.push({
        type: 'seat.role',
        data: { ...seatData(id, seat), previousRoleId: was.roleId },
      });
    }
  }
  for (const [id, seat] of Object.entries(before.seats)) {
    if (!after.seats[id]) events.push({ type: 'seat.left', data: seatData(id, seat) });
  }

  for (const [slot, status] of Object.entries(after.correspondence)) {
    if (before.correspondence[slot] === null && status !== null) {
      events.push({
        type: 'correspondence.published',
        data: { turn: Number(slot.slice(1)), status },
      });
    }
  }

  if (before.warProgress !== after.warProgress) {
    events.push({
      type: 'war.progress',
      data: { from: before.warProgress, to: after.warProgress },
    });
  }

  for (const [id, record] of Object.entries(after.opportunities)) {
    const was = before.opportunities[id];
    if (record.status === 'resolved' && was?.status !== 'resolved') {
      events.push({
        type: 'opportunity.resolved',
        data: { opportunityId: id, factionId: record.factionId, npcCode: record.npcCode },
      });
    }
  }

  for (const [id, action] of Object.entries(after.actions)) {
    const was = before.actions[id];
    if (action.status === 'closed' && was?.status !== 'closed') {
      events.push({
        type: 'action.closed',
        data: {
          actionId: id,
          mapId: action.mapId,
          actorCode: action.actorCode,
          band: action.band,
          narration: action.narration,
        },
      });
    }
  }

  for (const [key, step] of Object.entries(after.updateSteps)) {
    const was = before.updateSteps[key];
    if (step.status !== 'proposed' && (was?.status ?? 'proposed') === 'proposed') {
      events.push({
        type: 'turn-update.step',
        data: {
          stepId: key,
          kind: step.kind,
          status: step.status,
          appliedDelta: step.appliedDelta,
        },
      });
    }
  }

  return events;
}

/**
 * Wrap derived events in the envelope the bot actually reads.
 *
 * The stamp is separate from the derivation because a clock and a counter are
 * not pure, and keeping them out here is what lets every event in this file be
 * asserted with a plain `toEqual`.
 *
 * @param {{type: string, data: object}[]} events
 * @param {{game: string, at: number, seq: number}} stamp  seq of the first
 */
export function stampEvents(events, { game, at, seq }) {
  return events.map((event, index) => ({
    v: PUMP_SCHEMA_VERSION,
    // Monotonic across one pump's life, so a bot can see that it missed
    // something. The pump is best-effort — a socket that was down dropped
    // what it could not hold — and a gap it can spot beats a gap it cannot.
    seq: seq + index,
    at,
    game,
    type: event.type,
    data: event.data,
  }));
}

/**
 * One or more envelopes as newline-terminated JSON.
 *
 * The same bytes whichever transport carries them: a WebSocket frame and an
 * HTTP body are both this string, so a bot can share one parser and a
 * facilitator can `tee` the stream to a file and read it back later.
 */
export function encodeBatch(envelopes) {
  return envelopes.map((envelope) => JSON.stringify(envelope)).join('\n') + '\n';
}
