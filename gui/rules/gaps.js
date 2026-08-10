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
 * On 2026-08-10 the author reviewed this ledger and ruled on every entry.
 * A ruled entry carries `status: 'author-ruled'` and its ruling text is the
 * author's — settled behaviour now, kept here with its printed citation so
 * the reasoning survives.
 *
 * @type {{id: string, about: string, silent: string, ruling: string,
 *   because: string, status?: string, ruledOn?: string}[]}
 */
export const KNOWN_GAPS = [
  {
    id: 'action-card-map-anchor',
    status: 'author-ruled',
    ruledOn: '2026-08-10',
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
    status: 'author-ruled',
    ruledOn: '2026-08-10',
    about: 'A player with no placed action card when the Action Phase opens',
    silent:
      'The handbook makes placing an action card in the Negotiation Phase '
      + 'mandatory, and never says what happens to a player who somehow did '
      + 'not — dropped, distracted, or mid-reconnect when the phase turned.',
    ruling:
      'They join no queue and cannot act — but the facilitator may place '
      + 'for them at any moment (facilitator:assign-action-card), and a '
      + 'mid-Action-Phase assignment joins the back of that map\u2019s queue.',
    because:
      'The author\u2019s ruling. A mandate is not a crash barrier, and the '
      + 'app never invents a placement — but the person the game trusts '
      + 'with judgement gets a one-click door back in for the player who '
      + 'was mid-reconnect when the phase turned.',
  },
  {
    id: 'ally-card-any-map',
    status: 'author-ruled',
    ruledOn: '2026-08-10',
    about: 'Where an ally\u2019s action card may sit',
    silent:
      'The ally rule reads "an ally spends their own action with yours: +1 '
      + 'impact and +1 to the resource limit. Bring them with you when '
      + 'called" — and never says whether their card must sit on the same map.',
    ruling:
      'The same map, and only there. When an action is called the actor may '
      + 'invite players whose cards sit at that map and whose actions are '
      + 'still unresolved; joining spends their action, and the queue '
      + 'strikes them. Nothing is declared in advance.',
    because:
      'The author\u2019s ruling, reversing the build\u2019s first reading. '
      + 'Placement is the commitment: where your card sits is where your '
      + 'action happens, allies included — which makes the Negotiation '
      + 'Phase\u2019s map choice mean something for the whole table.',
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
  {
    id: 'opportunity-choice-is-a-record',
    about: 'How a faction answers an opportunity',
    silent:
      'The print offers a triggered faction "a two-option team choice" and '
      + 'never says who speaks for the team or how the answer is collected.',
    ruling:
      'Any player of the faction taps the option; the tap is a record of a '
      + 'decision made out loud, overwritable until the facilitator '
      + 'resolves. The last tap counts.',
    because:
      'A ballot would invent voting weights the print does not have. The '
      + 'table talks, somebody taps, and if the tap misrepresents the table '
      + 'that is a table problem — the same trust the paper game runs on.',
  },
  {
    id: 'tithe-one-payment-per-turn',
    about: 'Who pays the tithe, and from what',
    silent:
      'The print says the Belt Union owes the Ambassador 1, 1, 2, 2 cards '
      + 'by turn, without naming which Belt player pays or whose cards go.',
    ruling:
      'Any one Belt Union player pays the whole turn\u2019s tithe from cards '
      + 'in their own hand, once per turn for the faction.',
    because:
      'The debt is the faction\u2019s, so anybody\u2019s hand can settle it — '
      + 'and cards are freely loanable, so the faction can move the burden '
      + 'between hands first. One payment per turn is what "1, 1, 2, 2 by '
      + 'turn" says.',
  },
  {
    id: 'tithe-refusal-is-judgement',
    about: 'What refusing the tithe costs',
    silent:
      'The print says refusal should "move Shipping Control towards Earth" '
      + 'and bring "consequences for the stations if Earth has shipping '
      + 'control", with amounts licensed to judgement.',
    ruling:
      'The app records the refusal and enforces nothing. Retaliation is the '
      + 'facilitator moving tracks by hand, as themselves, in the log.',
    because:
      'The printed consequences have no numbers on purpose — "the amounts '
      + 'are as standard; the guide licenses judgement based on how much '
      + 'tension the table needs". A rule would be inventing the numbers.',
  },
  {
    id: 'surrender-is-a-flag',
    status: 'author-ruled',
    ruledOn: '2026-08-10',
    about: 'War Progress reaching a surrender boundary',
    silent:
      'The print says 0 means Earth surrenders and 20 or more means Mars '
      + 'surrenders, and does not say whether the game ends there, or how.',
    ruling:
      'The end-of-turn worksheet flags the boundary and nothing more. The '
      + 'facilitator narrates the surrender and calls time when the story '
      + 'is told, with the same end-game verb as any other ending.',
    because:
      'A surrender is the biggest narrative moment the game can produce, '
      + 'and an app that froze the boards mid-sentence would be taking the '
      + 'ending away from the room. Adjudication is human here by design; '
      + 'so is the curtain.',
  },
];
