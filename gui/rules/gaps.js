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
 * @type {{id: string, about: string, silent: string, ruling: string, because: string}[]}
 */
export const KNOWN_GAPS = [
  {
    id: 'action-card-map-anchor',
    about: 'Where a placed action card sits',
    silent:
      'The handbook says an action card is placed "on a map" during the '
      + 'Negotiation Phase, and never names a location for it to occupy.',
    ruling:
      'The app anchors the card to the map as a whole — a token strip on the '
      + 'board — never to a location.',
    because:
      'Locations are geography, and the printed rule is map-level: what the '
      + 'action actually does, and where exactly, is narrated when the player '
      + 'is called in the Action Phase. Pinning the token to a location would '
      + 'invent a precision the print does not have, and the app would be '
      + 'correcting it every time the story moved.',
  },
];
