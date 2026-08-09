/**
 * gui/rules/commands/index.js — one registry, assembled from the parts of the
 * game it is about.
 *
 * Every way the game can change is a single `COMMANDS` object, because
 * everything downstream — admission, the reducer, the log, the action list —
 * wants to ask one question of one table. Where a spec is written is a fact
 * about this directory: beside the other verbs about the same subject, and
 * beside the helpers only those verbs use.
 *
 * The chair, the cards, and the umpire. The turn's own verbs (placing an
 * action card, resolving with the die) arrive with the Negotiation and
 * Action Phases and will each be a fragment beside these.
 *
 * The accessors below stay here rather than in a fragment because each of them
 * reads the whole registry. A fragment that imported them would be importing
 * the merged object it is itself part of, which is the one import cycle this
 * layout is arranged to avoid.
 */

import { LOBBY_COMMANDS } from './lobby.js';
import { CARD_COMMANDS } from './cards.js';
import { FACILITATOR_COMMANDS } from './facilitator.js';

export const COMMANDS = {
  ...LOBBY_COMMANDS,
  ...CARD_COMMANDS,
  ...FACILITATOR_COMMANDS,
};

/**
 * The rules helpers other modules reach for by name.
 *
 * Re-exported here so that `gui/rules/commands.js` remains the one address for
 * all of it. Where a helper lives is a fact about this directory rather than
 * about anybody's import statement.
 */
export { subjectOf, roleName, pretty } from './shared.js';
export { phaseEndsAt, phaseMinutes, remainingMs } from './facilitator.js';

/** @typedef {import('./shared.js').Field} Field */

/**
 * What a verb is called, for the button that issues it.
 *
 * A verb nobody has named prints its own id, which is ugly enough that
 * somebody notices — better than a blank button nobody can identify.
 */
export function labelFor(verb) {
  return COMMANDS[verb]?.label ?? verb;
}

/**
 * The line under the button, or nothing.
 *
 * A note may be a function of the game rather than a sentence, because some
 * of them are about a number somebody has only just set.
 */
export function noteFor(verb, state, data, roleId = state?.viewer?.roleId ?? null) {
  const note = COMMANDS[verb]?.note;
  return (typeof note === 'function' ? note(state, data, roleId) : note) ?? '';
}

/**
 * What this action still needs answered, given the game as this player sees it.
 *
 * `roleId` defaults to the viewer of a projection: a client asking what its
 * own player may choose is the common case, and a projection is state-shaped,
 * so the same functions answer for the host — which passes the role it means.
 *
 * @returns {Field[]} empty when the action is just a button
 */
export function fieldsFor(verb, state, data, roleId = state?.viewer?.roleId ?? null) {
  return COMMANDS[verb]?.fields?.(state, data, roleId) ?? [];
}

/**
 * Turn a filled-in form into the payload the command expects.
 *
 * Most verbs want exactly what was chosen. The few that do not say so on their
 * own spec, next to the fields whose values they are rewriting — a form hands
 * back strings, and not every rule wants one.
 */
export function payloadFrom(verb, values) {
  const spec = COMMANDS[verb];
  return spec?.toPayload ? spec.toPayload(values) : values;
}

/**
 * A representative legal instance of this command, for `availableTo`.
 *
 * Derived from the fields, because a field's options are by construction ones
 * the game currently allows — so "is there any way to do this at all?" is
 * answered off the same list the player would be picking from, and there is no
 * second hand-written answer to drift away from it.
 *
 * A spec may still write its own `probe` where the first option is not the
 * representative one. Each of those says why where it is written.
 */
export function probeFor(verb, state, data, roleId) {
  const spec = COMMANDS[verb];
  if (!spec) return {};
  if (spec.probe !== undefined) {
    return (typeof spec.probe === 'function'
      ? spec.probe(state, data, roleId) : spec.probe) ?? {};
  }
  const values = {};
  for (const field of fieldsFor(verb, state, data, roleId)) {
    values[field.name] = field.kind === 'number'
      ? field.value ?? field.min ?? 1
      : field.options?.[0]?.value;
  }
  return payloadFrom(verb, values);
}

/** Commands a role could issue in this phase, whether or not they are legal now. */
export function commandsInPhase(phaseName) {
  return Object.entries(COMMANDS)
    .filter(([, spec]) => spec.phases === '*' || spec.phases.includes(phaseName))
    .map(([verb]) => verb);
}
