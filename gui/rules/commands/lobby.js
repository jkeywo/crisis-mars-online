/**
 * gui/rules/commands/lobby.js — taking a lanyard, at any point in the evening.
 *
 * One verb, and it is on its own because it is the only one that runs before
 * its issuer is anybody. Every other command in the game asks what a character
 * may do; this one asks what a *seat* may do, and the exemption that lets a
 * roleless player issue it would be an odd footnote sitting in the middle of a
 * fragment about tracks and cards.
 */

import { seatHolding } from '../state.js';
import { no, ok, roleName } from './shared.js';

export const LOBBY_COMMANDS = {
  'claim-role': {
    // Any phase, not just the lobby. People arrive late, drop out, and get
    // reseated onto a lanyard whose player has gone home — a game that can
    // only be joined before it starts is not one that survives a real evening.
    phases: '*',
    actor: 'player',
    label: 'Take a lanyard',
    // The one command a seat issues before it has a role, so it is exempt
    // from the check that a player command must have one.
    roleless: true,
    // And the one player command that still works when the game is not being
    // played. Taking a lanyard is the whole business of the pregame; after
    // time is called it changes nothing on the board, and refusing it would
    // only strand somebody who reconnected during the debrief.
    outOfPlay: true,
    admit(ctx) {
      const { state, cmd } = ctx;
      const roleId = cmd.payload?.roleId;
      // Role ids are codes — 'C1' through 'F3' — and only the codes the
      // scaling table dealt in for this head count exist in state at all, so
      // an absent role and a role outside today's roster are the same refusal.
      if (!state.roles[roleId]) return no('no such role in this game');
      // The two NPC lanyards are the facilitator's to roleplay, never a
      // player's chair.
      if (state.roles[roleId].npc) {
        return no(`${roleName(ctx.data, roleId)} is played by the facilitator`);
      }
      // A role held by someone who has dropped off is fair game; a facilitator
      // can always reassign either way.
      const holder = seatHolding(state, roleId);
      if (holder && holder.id !== ctx.actor.seatId && holder.connected) {
        // The printed name, not the code. This is very nearly the first thing
        // the app ever says to somebody — they have typed their name, pressed
        // a lanyard, and been told no — and "C2 is already being played" is
        // not a sentence.
        return no(`${roleName(ctx.data, roleId)} is already being played`);
      }
      return ok();
    },
    effects(draft, ctx) {
      const seatId = ctx.actor.seatId;
      const taking = ctx.cmd.payload.roleId;
      // One seat, one role: whoever was in this chair leaves whatever they
      // were playing, and whoever was playing this role loses the chair. The
      // claim is written in both directions — on the seat for the transport,
      // and on the role for the game — and this is the one place both halves
      // move, which is what keeps them from disagreeing.
      for (const seat of Object.values(draft.seats)) {
        if (seat.roleId === taking) seat.roleId = null;
      }
      for (const role of Object.values(draft.roles)) {
        if (role.claimedBySeat === seatId) role.claimedBySeat = null;
      }
      draft.seats[seatId].roleId = taking;
      draft.roles[taking].claimedBySeat = seatId;
    },
  },
};
