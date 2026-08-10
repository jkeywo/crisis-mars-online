/**
 * gui/rules/commands.js — every way the game can change, at one address.
 *
 * A command declares which phases it belongs to, who may issue it, whether it
 * is legal right now (`admit`), and what it does (`effects`). Nothing mutates
 * state anywhere else.
 *
 * It also declares what it is called and what it still needs asking —
 * `label`, `note` and `fields`. A verb is one idea, and a console that had to
 * be told separately what to write on the button would be a second, worse copy
 * of that idea.
 *
 * `admit` returns a reason, not a boolean, because the reason is the whole
 * value of enforcing rules for players: "that lanyard is already being played"
 * against the button they pressed beats a control that silently does nothing.
 *
 * Facilitator commands live in the same registry and travel the same pipeline.
 * Theirs simply always admit. That is deliberate — an override that bypassed
 * the reducer would be invisible to the log and would break replay, and replay
 * is what makes a crashed host recoverable.
 *
 * The registry itself is written a domain at a time under `commands/`. This
 * file stays as the one address the rest of the app knows: where a spec is
 * written is a fact about that directory, not about anybody's import
 * statement.
 */

export {
  COMMANDS,
  subjectOf,
  roleName,
  pretty,
  phaseEndsAt,
  phaseMinutes,
  remainingMs,
  labelFor,
  noteFor,
  fieldsFor,
  payloadFrom,
  probeFor,
  commandsInPhase,
  titheOwed,
  TITHE_SCHEDULE,
  TITHE_FROM_FACTION,
  TITHE_TO_CODE,
} from './commands/index.js';
