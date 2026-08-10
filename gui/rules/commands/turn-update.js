/**
 * gui/rules/commands/turn-update.js — the end-of-turn checklist, stepped
 * through out loud.
 *
 * `begin` computes the proposals inside the reducer — from state and CORE
 * data alone, so a replay recomputes the same checklist — and stores them.
 * Each step then lands on its own confirm, or on an override carrying the
 * facilitator's number instead of the proposal's. There is no unwind: a
 * confirmed step is a track movement like any other, and afterwards the
 * pencil is the eraser. See DECISIONS.md.
 *
 * Nothing gates the phase clock on this. A facilitator who advances with
 * steps unconfirmed has decided those steps did not happen this turn, which
 * is their call to make — the rollover clears the worksheet.
 */

import { no, ok } from './shared.js';
import { computeTurnUpdate } from '../turn-update.js';

/** The step a payload names, from the live worksheet. */
function stepIn(state, payload) {
  return state.turnUpdate?.steps.find((step) => step.id === payload?.stepId) ?? null;
}

/** Whether a delta can land on a step's target right now. */
function deltaProblem(state, step, delta) {
  if (!Number.isInteger(delta)) return 'movement is whole points';
  if (step.kind === 'qualitative') {
    for (const board of Object.values(state.maps)) {
      if (step.trackId in board.tracks) {
        return board.tracks[step.trackId] + delta < 0
          ? `${step.trackId} would go negative` : null;
      }
    }
    return 'that track is gone';
  }
  if (step.kind === 'war-progress') {
    if (state.warProgress === null) return 'the war is no longer running';
    return state.warProgress + delta < 0 ? 'war progress cannot go below zero' : null;
  }
  return null;
}

/** Land a step: move its target and mark it answered. */
function landStep(draft, step, delta, status) {
  if (step.kind === 'qualitative' && delta !== 0) {
    for (const board of Object.values(draft.maps)) {
      if (step.trackId in board.tracks) board.tracks[step.trackId] += delta;
    }
  }
  if (step.kind === 'war-progress' && delta !== 0) {
    draft.warProgress += delta;
  }
  step.appliedDelta = delta;
  step.status = status;
}

export const TURN_UPDATE_COMMANDS = {
  /**
   * Open the worksheet: compute this turn's proposals and store them.
   *
   * Once per turn — a second begin would recompute against boards the first
   * pass already moved, proposing the same damage twice.
   */
  'facilitator:begin-turn-update': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      if (ctx.state.phase.name !== 'action') {
        return no('the turn update belongs at the end of an Action Phase');
      }
      if (ctx.state.turnUpdate?.turn === ctx.state.phase.turn) {
        return no('this turn’s update has already begun');
      }
      return ok();
    },
    effects(draft, ctx, { data }) {
      draft.turnUpdate = {
        turn: draft.phase.turn,
        steps: computeTurnUpdate(draft, data),
        finished: false,
      };
    },
  },

  /**
   * Land a step as proposed. Qualitative steps may carry the facilitator's
   * delta — the proposal is the printed sentence and a zero — and the
   * bookkeeping kinds (opportunity, otherwise, surrender) simply get
   * acknowledged: delivering the opportunity itself is its own verb.
   */
  'facilitator:confirm-update-step': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const step = stepIn(ctx.state, ctx.cmd.payload);
      if (!step) return no('no such step on the worksheet');
      if (step.status !== 'proposed') return no('that step is already answered');
      const delta = step.kind === 'war-progress' ? step.delta
        : Number(ctx.cmd.payload?.delta ?? step.suggestedDelta ?? 0);
      const problem = ['qualitative', 'war-progress'].includes(step.kind)
        ? deltaProblem(ctx.state, step, delta) : null;
      return problem ? no(problem) : ok();
    },
    effects(draft, ctx) {
      const step = stepIn(draft, ctx.cmd.payload);
      const delta = step.kind === 'war-progress' ? step.delta
        : step.kind === 'qualitative'
          ? Number(ctx.cmd.payload?.delta ?? step.suggestedDelta ?? 0) : 0;
      landStep(draft, step, delta, 'confirmed');
    },
  },

  /**
   * Land a step with the facilitator's number instead of the proposal's.
   * Only the two numeric kinds have a number to override.
   */
  'facilitator:override-update-step': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      const step = stepIn(ctx.state, ctx.cmd.payload);
      if (!step) return no('no such step on the worksheet');
      if (step.status !== 'proposed') return no('that step is already answered');
      if (!['qualitative', 'war-progress'].includes(step.kind)) {
        return no('nothing to override — confirm it');
      }
      const delta = Number(ctx.cmd.payload?.delta);
      const problem = deltaProblem(ctx.state, step, delta);
      return problem ? no(problem) : ok();
    },
    effects(draft, ctx) {
      landStep(draft, stepIn(draft, ctx.cmd.payload),
        Number(ctx.cmd.payload.delta), 'overridden');
    },
  },

  /** Close the worksheet. Unanswered steps stay unanswered, on the record. */
  'facilitator:finish-turn-update': {
    phases: '*',
    actor: 'facilitator',
    admit(ctx) {
      if (!ctx.state.turnUpdate) return no('no update has begun');
      if (ctx.state.turnUpdate.finished) return no('already finished');
      return ok();
    },
    effects(draft) {
      draft.turnUpdate.finished = true;
    },
  },
};
