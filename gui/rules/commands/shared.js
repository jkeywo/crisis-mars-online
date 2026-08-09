/**
 * gui/rules/commands/shared.js — the words every fragment speaks.
 *
 * A verb's spec belongs beside the other verbs about the same part of the
 * game, but a handful of things are not about any part of it: how a rule says
 * yes or no, whose role a command acts for, and how a person is named in a
 * dropdown. Those are the vocabulary the fragments are written in, so they
 * live in one place rather than being copied into each of them.
 *
 * Nothing here imports a fragment. The dependency runs one way, which is what
 * keeps the split from becoming a knot.
 */

export const ok = () => ({ ok: true });
export const no = (reason) => ({ ok: false, reason });

/** The role a command acts for: a player's own, or whoever a facilitator names. */
export function subjectOf(ctx) {
  return ctx.actor.kind === 'facilitator'
    ? ctx.cmd.payload?.roleId ?? ctx.actor.roleId ?? null
    : ctx.actor.roleId;
}

export const pretty = (id) => String(id ?? '').replace(/_/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

/** The printed name of a lanyard, falling back to its code. */
export const roleName = (data, code) => data.roles.roles[code]?.name
  ?? data.factions.npcs?.[code]?.name ?? code;

/*
 * -----------------------------------------------------------------------------
 * Presentation, and why it lives beside the rules.
 *
 * What a verb is called, the line under its button, and the questions it still
 * needs answered are all declared on the spec beside the `admit` they have to
 * agree with. Kept apart, they drift: a verb could be added to the registry and
 * render as its own id at a player, or send an empty payload to a rule that
 * needed one, without a single test going red.
 *
 * `fields` is plain data — `{name, label, kind, options, min, max, value}` —
 * so this is still a pure rules module. The DOM that renders it stays in
 * `gui/client/action-chooser.js`, and nothing here knows that file exists.
 */

/**
 * @typedef {object} Field
 * @property {string} name
 * @property {string} label
 * @property {'select'|'number'} kind
 * @property {{value: string, label: string}[]} [options]
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [value]
 */
