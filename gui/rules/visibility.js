/**
 * gui/rules/visibility.js — who may see what, declared once.
 *
 * Every path in the game state has exactly one entry here. Nothing else in the
 * codebase decides what a recipient may see, and no send site ever filters an
 * object by hand.
 *
 * That rule exists because the alternative fails open. Redaction spread across
 * send sites is correct until somebody adds a field, and then it silently
 * isn't — the new field just goes out. A manifest with a completeness test
 * fails closed instead: a path nobody has classified is a failing test, so the
 * default for anything new is "this breaks the build", not "this leaks".
 *
 * Crisis Mars keeps very little from the table: the boards, the tracks, who
 * holds which card and where every action card sits are all public in the
 * room, and stay public here. What never leaves the host is the machinery —
 * the seed and cursor that would let a client predict dice, the log, the seat
 * tokens — plus whatever the facilitator writes for their own eyes. A role's
 * private brief is not in state at all: it is static data, attached to its
 * owner's projection in views.js, which is the same accepted trade RBO made
 * for briefs.json.
 *
 * Patterns use `*` for one segment and a trailing `**` for a whole subtree.
 * Where several match, the most specific wins — an exact segment beats `*`,
 * and `*` beats `**`, then longer patterns beat shorter ones.
 */

/** Everyone at the table. */
export const PUBLIC = 'public';
/** The owning role's seat, and nobody else's. */
export const OWNER = 'owner';
/**
 * Everyone in one faction. The rule names the faction with a `faction(segments,
 * state)` function; a null answer fails closed to the facilitator alone, which
 * is exactly what an NPC-targeted record wants.
 */
export const TEAM = 'team';
/** Facilitators only. */
export const FACILITATOR = 'facilitator';
/** Nobody: host-internal, never leaves the tab. */
export const NOBODY = 'nobody';

export const FIELD_VISIBILITY = [
  // --- housekeeping --------------------------------------------------------
  { path: 'schemaVersion', audience: PUBLIC },
  { path: 'joinCode', audience: PUBLIC },
  // The seed and cursor would let a client predict every die still to come.
  { path: 'seed', audience: FACILITATOR },
  { path: 'rngCursor', audience: FACILITATOR },
  { path: 'log.**', audience: FACILITATOR },
  { path: 'lastSeq.**', audience: NOBODY },
  { path: 'facilitatorNotes.**', audience: FACILITATOR },
  { path: 'phase.**', audience: PUBLIC },

  // --- seats ---------------------------------------------------------------
  // Who is here and who they are playing is public; the token that proves it
  // is the credential that resumes a seat, so it never goes anywhere. Note
  // that seats are keyed by a public seat id — a manifest can redact a value
  // but not a key, so a token could never have been one.
  { path: 'seats.*.id', audience: PUBLIC },
  { path: 'seats.*.name', audience: PUBLIC },
  { path: 'seats.*.roleId', audience: PUBLIC },
  { path: 'seats.*.kind', audience: PUBLIC },
  { path: 'seats.*.connected', audience: PUBLIC },
  { path: 'seats.*.lastSeen', audience: FACILITATOR },
  { path: 'seats.*.token', audience: NOBODY },
  // Keyed by token, so the keys themselves are the secret. Host-internal.
  { path: 'seatByToken.**', audience: NOBODY },

  // --- the table -----------------------------------------------------------
  // Which lanyards are in the game and who has claimed each is the roster on
  // the wall. The private half of a lanyard — the character's background and
  // personal goal — is static data and reaches only its owner, via views.js.
  { path: 'rosterCodes', audience: PUBLIC },
  { path: 'roles.**', audience: PUBLIC },

  // --- the boards ----------------------------------------------------------
  // All of it public. Anyone could walk up to the three printed maps and read
  // every track, and the printed game expects them to. War Progress is a
  // marker on the same wall.
  { path: 'maps.**', audience: PUBLIC },
  { path: 'warProgress', audience: PUBLIC },

  // --- the cards -----------------------------------------------------------
  // Resource cards are played face up in the paper game: hands are open,
  // loans are witnessed, and the discard pile sits in the middle of the
  // table. Who owns, who holds and whether it is spent are all table facts.
  { path: 'cards.**', audience: PUBLIC },
  // An action card placed on a map is the most public act in the game.
  { path: 'actionCards.**', audience: PUBLIC },
  // The spotlight is performed aloud: the call order, every declaration,
  // every ruling, every die and every narration happen in front of the whole
  // room, so the records of them are everybody's.
  { path: 'initiative.**', audience: PUBLIC },
  { path: 'actions.**', audience: PUBLIC },
  { path: 'futureImpacts.**', audience: PUBLIC },

  // --- the team phase --------------------------------------------------------
  // That a turn's war correspondence was published (or skipped) is public —
  // the whole room heard it read. The text lives in facilitator data and is
  // never state.
  { path: 'correspondence.**', audience: PUBLIC },
  // An opportunity's CONTENT is the faction's own moment: the title, the two
  // options, the choice being weighed. That it EXISTS is not a secret — the
  // end-of-turn worksheet already proposes deliveries in public, because the
  // triggers are arithmetic over public tracks — so the record's identity and
  // status are public (which is also what lets the event pump announce a
  // resolution), while everything else stays faction-scoped. NPC-targeted
  // records answer null on the faction and so keep even their content to the
  // facilitator.
  { path: 'opportunities.*.id', audience: PUBLIC },
  { path: 'opportunities.*.turn', audience: PUBLIC },
  { path: 'opportunities.*.status', audience: PUBLIC },
  { path: 'opportunities.*.factionId', audience: PUBLIC },
  { path: 'opportunities.*.npcCode', audience: PUBLIC },
  {
    path: 'opportunities.**',
    audience: TEAM,
    faction: (segments, state) => state.opportunities[segments[1]]?.factionId ?? null,
  },
  // The tithe is paid, or refused, in front of the whole table.
  { path: 'tithe.**', audience: PUBLIC },
  // The end-of-turn worksheet is arithmetic over public tracks and printed
  // rules — any player could compute every line of it, so hiding it would
  // be theatre. What an opportunity SAYS stays scoped; that one is proposed
  // is not a secret. See DECISIONS.md.
  { path: 'turnUpdate.**', audience: PUBLIC },
  // Whose table each lane is: said out loud so players know whom to call.
  { path: 'lanes.**', audience: PUBLIC },

  { path: 'aftermath.**', audience: PUBLIC },
];

const SEGMENT = /\./;

/**
 * How specific a pattern is. An exact segment beats `*`, `*` beats a trailing
 * `**`, and a longer pattern beats a shorter one. So `cards.**` can make a
 * whole subtree public without stopping a single field inside it being pulled
 * back out by name.
 */
function specificity(pattern) {
  const parts = pattern.split(SEGMENT);
  const deep = parts.includes('**') ? 1 : 0;
  const wide = parts.filter((s) => s === '*').length;
  return [-deep, -wide, parts.length];
}

const ORDERED = [...FIELD_VISIBILITY].sort((a, b) => {
  const [ad, aw, al] = specificity(a.path);
  const [bd, bw, bl] = specificity(b.path);
  return bd - ad || bw - aw || bl - al;
});

function patternMatches(pattern, segments) {
  const parts = pattern.split(SEGMENT);
  const deep = parts[parts.length - 1] === '**';
  if (deep) {
    const head = parts.slice(0, -1);
    if (segments.length < head.length) return false;
    return head.every((p, i) => p === '*' || p === segments[i]);
  }
  if (parts.length !== segments.length) return false;
  return parts.every((p, i) => p === '*' || p === segments[i]);
}

/**
 * The rule governing a path, or null if nobody has classified it.
 *
 * A null here is the whole point of the manifest: it means someone added a
 * field and did not say who may see it, and the completeness test turns that
 * into a build failure rather than a leak.
 *
 * @param {string[]} segments
 */
export function ruleFor(segments) {
  return ORDERED.find((rule) => patternMatches(rule.path, segments)) ?? null;
}
