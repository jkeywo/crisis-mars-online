/**
 * gui/rules/turn-update.js — what the end of a turn proposes, computed pure.
 *
 * The printed end-of-turn sequence is a facilitator checklist: qualitative
 * damage where a trade route has collapsed, prosperity caps, the opportunity
 * triggers, and the war moving by the difference of the two militaries. This
 * module reads state and CORE data and returns that checklist as ordered
 * proposal steps — numbers where the print gives numbers, the printed
 * sentence and a zero where it leaves magnitude to judgement.
 *
 * Nothing here applies anything. `facilitator:begin-turn-update` stores the
 * steps into state (computed in its effects, so replay agrees), and each step
 * lands only when the facilitator confirms or overrides it. The surrender
 * boundaries are flagged, never enforced: the game ending is a facilitator
 * call. See gaps.js.
 */

/** A track's current value, wherever it lives. */
export function trackValue(state, trackId) {
  for (const board of Object.values(state.maps)) {
    if (trackId in board.tracks) return board.tracks[trackId];
  }
  return null;
}

/**
 * The gamespec's end-of-turn conditions, evaluated.
 *
 * Two printed shapes: `track < N` and `track > track + track`. Parsed rather
 * than hand-coded per track, so a new condition in the data is a new step
 * here and no new code — but only these shapes; anything else returns false
 * and the facilitator still has the pencil.
 */
export function conditionHolds(state, expression) {
  const comparison = expression.includes('<') ? '<' : expression.includes('>') ? '>' : null;
  if (!comparison) return false;
  const [left, right] = expression.split(comparison).map((side) => side.trim());
  const leftValue = trackValue(state, left);
  if (leftValue === null) return false;
  const rightValue = right.includes('+')
    ? right.split('+').reduce((sum, part) => sum + (trackValue(state, part.trim()) ?? 0), 0)
    : Number(right);
  if (!Number.isFinite(rightValue)) return false;
  return comparison === '<' ? leftValue < rightValue : leftValue > rightValue;
}

/** Who an opportunity trigger's printed actor is: a faction, or an NPC lanyard. */
function targetOf(data, actor) {
  if (data.factions.factions[actor]) return { factionId: actor, npcCode: null };
  const npcCode = Object.keys(data.factions.npcs ?? {})
    .find((code) => data.factions.npcs[code].id === actor) ?? null;
  return { factionId: null, npcCode };
}

/**
 * The ordered checklist for ending the current turn.
 *
 * @returns {object[]} steps, each `{id, kind, status: 'proposed', …}`
 */
export function computeTurnUpdate(state, data) {
  const steps = [];
  let counter = 0;
  const step = (fields) => steps.push({ id: `s${++counter}`, status: 'proposed', ...fields });

  // --- 1. the qualitative track entries -------------------------------------
  // Trade-route damage and the prosperity caps. The print says "negatively
  // affected" and "reduced" with the amount left to judgement, so the step
  // carries the sentence and suggests zero for the facilitator to overwrite.
  for (const [trackId, track] of Object.entries(data.maps.tracks)) {
    if (trackId === 'war_progress') continue;
    for (const entry of track.endOfTurn ?? []) {
      if (entry.when && conditionHolds(state, entry.when)) {
        step({
          kind: 'qualitative',
          trackId,
          printed: entry.printed ?? entry.effect,
          suggestedDelta: 0,
        });
      }
    }
  }

  // --- 2. threshold opportunity triggers -------------------------------------
  for (const trigger of data.maps.opportunityTriggers) {
    if (trigger.kind !== 'threshold') continue;
    const value = trackValue(state, trigger.track);
    const fired = trigger.comparison === '>' ? value > trigger.value : value < trigger.value;
    if (fired) {
      step({
        kind: 'opportunity',
        triggerId: trigger.id,
        ...targetOf(data, trigger.actor),
        note: `${trigger.track} is ${value} (${trigger.comparison} ${trigger.value})`,
      });
    }
  }

  // --- 3. lead triggers, margin four ------------------------------------------
  for (const trigger of data.maps.opportunityTriggers) {
    if (trigger.kind !== 'lead') continue;
    const rows = trigger.tracks
      .map((row) => ({ ...row, value: trackValue(state, row.track) }))
      .sort((a, b) => b.value - a.value);
    const margin = rows[0].value - (rows[1]?.value ?? 0);
    if (margin >= Number(trigger.margin)) {
      step({
        kind: 'opportunity',
        triggerId: trigger.id,
        ...targetOf(data, rows[0].actor),
        note: `${rows[0].track} leads by ${margin}`,
      });
    } else {
      // Nobody clearly ahead: the print promises unrest instead.
      step({ kind: 'otherwise', triggerId: trigger.id, text: trigger.otherwise });
    }
  }

  // --- 4 & 5. the war ----------------------------------------------------------
  // Skipped entirely while the war has not begun: there is no marker to move
  // and no surrender to flag.
  if (state.warProgress !== null) {
    let delta = trackValue(state, 'earth_gov_military') - trackValue(state, 'senate_military');
    const clamps = [];
    if (trackValue(state, 'earth_trade_route') < 4 && delta > 0) {
      delta = 0;
      clamps.push('Earth trade route below 4 — war progress cannot end higher than it started');
    }
    if (trackValue(state, 'mars_trade_route') < 4 && delta < 0) {
      delta = 0;
      clamps.push('Mars trade route below 4 — war progress cannot end lower than it started');
    }
    const to = Math.max(0, state.warProgress + delta);
    step({ kind: 'war-progress', from: state.warProgress, to, delta: to - state.warProgress, clamps });
    if (to <= 0) step({ kind: 'surrender', side: 'earth' });
    if (to >= 20) step({ kind: 'surrender', side: 'mars' });
  }

  return steps;
}
