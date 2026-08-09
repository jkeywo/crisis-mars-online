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
 * already leaving the tab.
 *
 * TODO(phase>B0): this is a minimal generic stub carried over from RBO. It
 * digests only the clock and derives only phase-change events. The game's own
 * events — a track moving, a card changing hands, War Progress activating —
 * arrive with the Action Phase, alongside the seat events RBO's pump emitted.
 */

/**
 * The wire's own version, bumped when a field changes meaning or leaves.
 *
 * The bot is in another repository and will be deployed on its own schedule,
 * so it needs to be able to say "I do not understand this" rather than
 * mis-parse a shape that quietly changed under it.
 */
export const PUMP_SCHEMA_VERSION = 1;

/** Every type this module can emit. Exported because it is the contract. */
export const EVENT_TYPES = [
  'game.opened',
  'game.phase',
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
 */
export function publicDigest(view) {
  const phase = view?.phase ?? {};
  return {
    turn: phase.turn ?? null,
    phase: phase.name ?? null,
    paused: Boolean(phase.paused),
  };
}

/**
 * What happened between two digests.
 *
 * A null `before` is the first observation of a game, which is a different
 * question — the bot has just attached and needs the position, not a diff —
 * so it gets one `game.opened` carrying it.
 *
 * @param {object|null} before
 * @param {object} after
 * @returns {{type: string, data: object}[]}
 */
export function deriveEvents(before, after) {
  if (!before) {
    return [{
      type: 'game.opened',
      data: { turn: after.turn, phase: after.phase, paused: after.paused },
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
    // something. The pump is best-effort — a socket that was down dropped what
    // it could not hold — and a gap it can spot beats a gap it cannot.
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
