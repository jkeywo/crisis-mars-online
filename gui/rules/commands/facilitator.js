/**
 * gui/rules/commands/facilitator.js — the umpire's hands, on the same pipeline
 * as everybody else's.
 *
 * The clock, the end of the game, the seat that needs clearing, and the pencil
 * that edits the board directly. These have no domain of their own — they are
 * the umpire acting on the game as a whole — which is exactly why they are
 * together, and why a facilitator verb that *is* about a domain (confirming an
 * action's effects, moving War Progress by correspondence) will be filed with
 * that domain when it arrives.
 *
 * None of it bypasses the reducer. An override that wrote to state directly
 * would be invisible to the log and would break replay, and replay is what
 * makes a crashed host recoverable — so these are commands like any other,
 * whose `admit` simply always says yes.
 */

import { PHASES, OUT_OF_PLAY, emptyInitiative } from '../state.js';
import { no, ok } from './shared.js';

/**
 * The call order for a turn's Action Phase, built the moment the phase opens.
 *
 * Each role's printed initiative row names its call position for each turn,
 * and the queue for a map is simply the roles placed there, in that order.
 * A player who never placed — the print makes placement mandatory, but a
 * mandate is not a crash barrier — goes to the `unplaced` bucket for the
 * facilitator to deal with by hand. See gaps.js.
 */
function buildInitiative(draft, data) {
  const turnIndex = draft.phase.turn - 1;
  const order = [...draft.rosterCodes].sort((a, b) =>
    (data.roles.roles[a]?.initiative?.[turnIndex] ?? 99)
    - (data.roles.roles[b]?.initiative?.[turnIndex] ?? 99));

  const initiative = emptyInitiative();
  for (const mapId of Object.keys(draft.maps)) {
    initiative.queues[mapId] = [];
    initiative.done[mapId] = [];
    initiative.current[mapId] = null;
  }
  for (const code of order) {
    const placed = draft.actionCards[code]?.placed;
    if (placed && initiative.queues[placed]) initiative.queues[placed].push(code);
    else initiative.unplaced.push(code);
  }
  draft.initiative = initiative;
}

/**
 * The printed length of a phase, in minutes.
 *
 * The gamespec exports durations as prose — "5 minutes" — because that is
 * what the handbook prints. Parsed here, once, rather than at every place a
 * deadline is set.
 */
export function phaseMinutes(data, phaseName) {
  const printed = data.meta.phases.find((p) => p.id === `${phaseName}_phase`);
  if (!printed) return null;
  const minutes = Number.parseInt(printed.duration, 10);
  return Number.isFinite(minutes) ? minutes : null;
}

/**
 * When the phase now beginning should end.
 *
 * A deadline rather than a countdown, so a client works out what is left from
 * the clock on the wall. A browser that has been in a background tab has had
 * its timers throttled to about once a second and would otherwise come back
 * minutes adrift — which, in a game whose phases are five minutes long, is the
 * difference between having time to act and not.
 *
 * The lobby and the epilogue have no deadline: neither is a phase anybody is
 * waiting out.
 */
export function phaseEndsAt(state, data, payload, now) {
  if (payload?.endsAt !== undefined) return payload.endsAt;
  const minutes = phaseMinutes(data, state.phase.name);
  return minutes === null ? null : now + minutes * 60_000;
}

/** How long is left, or how far past time we are. Negative means overtime. */
export function remainingMs(phase, now) {
  if (phase.paused) return phase.pausedRemainingMs ?? 0;
  return phase.endsAt === null ? null : phase.endsAt - now;
}

export const FACILITATOR_COMMANDS = {
  /**
   * Move the game on: lobby → four turns of Team, Negotiation, Action →
   * epilogue. The turn count is the gamespec's, not this file's.
   */
  'facilitator:advance-phase': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      return ctx.state.phase.name === 'epilogue' ? no('the game is over') : ok();
    },
    effects(draft, ctx, { data }) {
      const at = PHASES.indexOf(draft.phase.name);
      if (draft.phase.name === 'lobby') {
        draft.phase.turn = 1;
        draft.phase.name = PHASES[0];
      } else if (at === PHASES.length - 1) {
        if (draft.phase.turn >= Number(data.meta.turns)) {
          draft.phase.name = 'epilogue';
        } else {
          draft.phase.turn += 1;
          draft.phase.name = PHASES[0];
          // A new turn hands every player their action card back. Placement
          // is mandatory each Negotiation Phase, and a card still marked
          // placed or spent from last turn would be a turn that never quite
          // ended.
          for (const card of Object.values(draft.actionCards)) {
            card.placed = null;
            card.spent = false;
          }
          // And the per-turn allowances refresh — one discard recovered per
          // Negotiation Phase, of which each turn has exactly one.
          for (const role of Object.values(draft.roles)) {
            role.perTurn = { recovered: 0 };
          }
          // The old turn's call order is spent; the next Action Phase builds
          // its own from the new placements.
          draft.initiative = emptyInitiative();
        }
      } else {
        draft.phase.name = PHASES[at + 1];
      }
      draft.phase.paused = false;
      draft.phase.pausedRemainingMs = null;
      draft.phase.endsAt = phaseEndsAt(draft, data, ctx.cmd.payload, ctx.now);
      // The Action Phase's whole apparatus exists exactly while the phase
      // does: built on the way in, from this turn's printed initiative row
      // and the placements the Negotiation Phase just froze.
      if (draft.phase.name === 'action') buildInitiative(draft, data);
    },
  },

  /**
   * Stop and restart the clock.
   *
   * Paused, the deadline means nothing, so what is left is stored instead and
   * a new deadline is worked out on the way back. Without that, a five-minute
   * pause to sort out a rules argument would eat the phase it interrupted.
   */
  'facilitator:pause-clock': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      // The two ends of the game are held at nothing by definition, so there
      // is no clock there either — and starting the pregame's would run a
      // zero-second phase straight into overtime and beep at a room that has
      // not sat down. "Next phase" is how the pregame is left.
      if (OUT_OF_PLAY.includes(ctx.state.phase.name)) return no('there is no clock running');
      return ctx.state.phase.endsAt === null && !ctx.state.phase.paused
        ? no('there is no clock running') : ok();
    },
    effects(draft, ctx) {
      if (draft.phase.paused) {
        draft.phase.endsAt = ctx.now + (draft.phase.pausedRemainingMs ?? 0);
        draft.phase.paused = false;
        draft.phase.pausedRemainingMs = null;
      } else {
        draft.phase.pausedRemainingMs = Math.max(0, draft.phase.endsAt - ctx.now);
        draft.phase.paused = true;
        draft.phase.endsAt = null;
      }
    },
  },

  /** Give a phase more time, or take some back. Minutes, plus or minus. */
  'facilitator:extend-clock': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const minutes = Number(ctx.cmd.payload?.minutes);
      if (!Number.isFinite(minutes) || minutes === 0) return no('say how many minutes');
      if (OUT_OF_PLAY.includes(ctx.state.phase.name)) return no('there is no clock running');
      return ctx.state.phase.endsAt === null && !ctx.state.phase.paused
        ? no('there is no clock running') : ok();
    },
    effects(draft, ctx) {
      const by = Number(ctx.cmd.payload.minutes) * 60_000;
      if (draft.phase.paused) {
        draft.phase.pausedRemainingMs = Math.max(0, (draft.phase.pausedRemainingMs ?? 0) + by);
      } else {
        draft.phase.endsAt = Math.max(ctx.now, draft.phase.endsAt + by);
      }
    },
  },

  /**
   * Call time.
   *
   * The game normally ends by running out of turns, but a room runs out of
   * evening first about as often. Ending it explicitly freezes the board so
   * the debrief is read off a position nobody can still be changing.
   */
  'facilitator:end-game': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      return ctx.state.phase.name === 'epilogue' ? no('the game is already over') : ok();
    },
    effects(draft, ctx) {
      draft.phase.name = 'epilogue';
      draft.phase.endsAt = null;
      draft.phase.paused = false;
      draft.phase.pausedRemainingMs = null;
      draft.aftermath.endedAt = ctx.now;
      draft.aftermath.endedOnTurn = draft.phase.turn;
    },
  },

  /**
   * Nudge a number by an amount, rather than replacing it.
   *
   * The tracks are the whole board of this game, and the inspector adjusts
   * them through here. A delta commutes — it is applied against whatever the
   * value actually is at the moment the command reaches the reducer, not
   * whatever it was when the facilitator looked — so it cannot go stale
   * between typing and committing while players are also changing the game.
   *
   * Refused rather than clamped if it would take the value below zero,
   * because a silently clamped edit is a facilitator being told "yes" to a
   * change that did not happen.
   */
  'facilitator:adjust': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const { path, delta } = ctx.cmd.payload ?? {};
      if (!Array.isArray(path) || !path.length) return no('an adjustment needs a path');
      if (typeof delta !== 'number' || !Number.isFinite(delta)) {
        return no('say how much to change it by');
      }
      let at = ctx.state;
      for (const key of path.slice(0, -1)) {
        at = at?.[key];
        if (at === undefined || at === null) return no('no such value');
      }
      const current = at[path[path.length - 1]];
      if (typeof current !== 'number') return no('that is not a number');
      if (current + delta < 0) return no(`would go negative — it is ${current} right now`);
      return ok();
    },
    effects(draft, ctx) {
      const { path, delta } = ctx.cmd.payload;
      let at = draft;
      for (const key of path.slice(0, -1)) at = at[key];
      at[path[path.length - 1]] += delta;
    },
  },

  /**
   * Clear a seat out of the roster, freeing whatever it was playing.
   *
   * This takes a *person* out of the chair and touches nothing on the board —
   * the character stays exactly as they were, waiting for somebody else to
   * pick them up. Half a game in, that is almost always what an umpire means:
   * a laptop died, a player went home, and the lanyard is still on the wall.
   *
   * The token goes with the seat. Leaving it would let the browser that owned
   * it resume straight back into a chair the facilitator has just cleared,
   * which is the one thing this command exists to prevent. A player who is
   * genuinely still there rejoins as a new seat and takes a lanyard again,
   * which is the same road every late arrival walks.
   *
   * It does not refuse a connected seat. "Disconnected" is what the console
   * offers the button for, but connection is a guess about a network and not
   * a fact about a person: a seat can read as connected because a tab is open
   * on a laptop in a bag. The umpire is looking at the room and this panel is
   * the pencil, so it does what it is told and asks first.
   */
  'facilitator:remove-seat': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      return ctx.state.seats[ctx.cmd.payload?.seatId] ? ok() : no('no such seat');
    },
    effects(draft, ctx) {
      const { seatId } = ctx.cmd.payload;
      delete draft.seats[seatId];
      for (const [token, id] of Object.entries(draft.seatByToken)) {
        if (id === seatId) delete draft.seatByToken[token];
      }
      // The claim is written on the role as well as the seat, so both halves
      // are cleared here — a claimedBySeat pointing at a chair that no longer
      // exists would be a roster lying about who is playing.
      for (const role of Object.values(draft.roles)) {
        if (role.claimedBySeat === seatId) role.claimedBySeat = null;
      }
    },
  },

  'facilitator:set': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      return Array.isArray(ctx.cmd.payload?.path) && ctx.cmd.payload.path.length
        ? ok() : no('an override needs a path');
    },
    effects(draft, ctx) {
      const { path, value } = ctx.cmd.payload;
      let at = draft;
      for (const key of path.slice(0, -1)) {
        if (at[key] === undefined) at[key] = {};
        at = at[key];
      }
      at[path[path.length - 1]] = value;
    },
  },
};
