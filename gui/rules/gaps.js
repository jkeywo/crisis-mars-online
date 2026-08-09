/**
 * gui/rules/gaps.js — where the printed rules are silent, and what the app does.
 *
 * A megagame's rules are written for a room with an umpire in it, so some
 * questions are simply never answered on paper: a facilitator settles them on
 * the night. An app cannot do that — it has to pick something before anybody
 * sits down — so every place it picked is recorded here, with the reading it
 * took and why.
 *
 * The facilitator console shows this list. That is the point of it: the umpire
 * should be able to see what the app decided on their behalf and overrule it
 * with the inspector, rather than discovering the ruling mid-argument.
 *
 * This is not for rules the app enforces because they are printed. It is for
 * the gaps.
 *
 * Empty so far, deliberately. The skeleton enforces nothing the handbook
 * leaves to judgement — the clock, the roster and the pencil are all printed
 * or all the umpire's. The first real entries arrive with the Action Phase,
 * where difficulty, resource relevance and consequence adjudication are
 * exactly the sort of questions the print leaves to the room.
 *
 * @type {{id: string, about: string, silent: string, ruling: string, because: string}[]}
 */
export const KNOWN_GAPS = [];
