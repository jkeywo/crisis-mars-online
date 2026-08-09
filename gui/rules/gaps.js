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
  {
    id: 'unplaced-players-at-action',
    about: 'A player with no placed action card when the Action Phase opens',
    silent:
      'The handbook makes placing an action card in the Negotiation Phase '
      + 'mandatory, and never says what happens to a player who somehow did '
      + 'not — dropped, distracted, or mid-reconnect when the phase turned.',
    ruling:
      'They join no queue. The app lists them in an unplaced bucket the '
      + 'facilitator can see, and never invents a placement for them.',
    because:
      'A mandate is not a crash barrier. Auto-placing them somewhere would '
      + 'be the app deciding where their story goes, and dropping them '
      + 'silently would lose a player. Listing them hands the judgement to '
      + 'the person the game trusts with judgement.',
  },
  {
    id: 'ally-card-any-map',
    about: 'Where an ally\u2019s action card may sit',
    silent:
      'The ally rule reads "an ally spends their own action with yours: +1 '
      + 'impact and +1 to the resource limit. Bring them with you when '
      + 'called" — and never says whether their card must sit on the same map.',
    ruling:
      'Any map. Confirming as an ally spends the card wherever it was '
      + 'placed; the ally simply never gets called at their own map.',
    because:
      '"Bring them with you" reads as bodies at a table, not tokens on a '
      + 'board — and requiring same-map placement would make allying nearly '
      + 'impossible to plan during a Negotiation Phase in which placements '
      + 'move until the clock runs out.',
  },
  {
    id: 'score-modifier-total-budget',
    about: 'How far a band moves the tracks',
    silent:
      'The effect table prints "Score Modifier ±N" per band, and never '
      + 'says whether N is per track or in all.',
    ruling:
      'A total budget: N points of track movement across the whole action, '
      + 'split however the facilitator rules.',
    because:
      'Per-track would let a Moderate action move five tracks three points '
      + 'each — fifteen points of swing from one minute of play, dwarfing a '
      + 'Radical action read as a total. The printed ladder only means '
      + 'anything if a bigger band buys more movement in all.',
  },
  {
    id: 'sabotage-marks-spent',
    about: 'What confiscating a sabotaged resource does',
    silent:
      'The sabotage table says "visit them in the team phase and confiscate '
      + 'the appropriate number of resources", and never says where a '
      + 'confiscated card goes.',
    ruling:
      'The card is marked spent where it is held, landing in its owner\u2019s '
      + 'discard pile — recoverable later like any spend, never removed from '
      + 'the game.',
    because:
      'The deck is a closed economy of 108 cards and nothing else in the '
      + 'print destroys one. Spending it hurts exactly as long as the '
      + 'printed recovery rule says a spend hurts, and keeps every card '
      + 'accounted for.',
  },
  {
    id: 'regain-recipient-and-price',
    about: 'Who a regained card goes to, and from where',
    silent:
      'The regain table says "choose those narratively appropriate rather '
      + 'than giving them a choice" and prices out-of-faction cards at 2, '
      + 'without saying whose discard is eligible or who may receive.',
    ruling:
      'The facilitator names each card and its recipient; recipients are '
      + 'the actor or a confirmed ally; any spent card in the game is '
      + 'eligible, costing 1 in the recipient\u2019s own faction and 2 outside it.',
    because:
      'The out-of-faction price only exists if out-of-faction cards are '
      + 'reachable, which means the pool is wider than your own pile — and '
      + 'the printed "if there isn\u2019t a spent card available then it\u2019s '
      + 'just too hard" reads as the whole discard, not one faction\u2019s.',
  },
  {
    id: 'spotlight-timer-informs-only',
    about: 'The 60-second spotlight running out',
    silent:
      'The handbook gives each called player 60 seconds and never says what '
      + 'happens at 61.',
    ruling:
      'Nothing, automatically. The ring and the beep inform the room; the '
      + 'facilitator skips, hurries, or lets the sentence finish.',
    because:
      'An auto-forfeit would let a clock adjudicate, and adjudication is '
      + 'human in this game by design. The printed timer is pacing advice '
      + 'for a facilitator running three maps at once, not a rule about '
      + 'whose action counts.',
  },
  {
    id: 'future-impact-accepted-by-default',
    about: 'Spending banked future impact on an action',
    silent:
      'The future-impact table says to "adjudicate whether this can be '
      + 'applied to the action as you would a resource card" — a token, but '
      + 'with no offer/veto procedure printed for it.',
    ruling:
      'The actor declares the spend with the action and it counts unless '
      + 'the facilitator strikes it (re-declare, or the pencil). There is '
      + 'no separate accept step.',
    because:
      'The token was already earned through a ruled, rolled and closed '
      + 'action — a second full relevance procedure would adjudicate the '
      + 'same story twice. The facilitator can still refuse one outright, '
      + 'which is all the printed sentence asks for.',
  },
];
