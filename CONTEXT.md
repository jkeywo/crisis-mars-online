# Domain vocabulary

The words the paper game uses. Code uses these words and no synonyms — a
`holderCode` is never a "possessor", an `Opportunity` is never an "event
choice".

## People

**Faction** — one of the six played groups: Canopy Corp, Viva Mars, Belt
Union, UNSS, Deimos Rising Corp, Free Federation. Three roles each, a shared
brief and four faction goals. Defined in `data/factions.json`.

**Role** — one of the eighteen player lanyards, coded `C1`…`F3` (the letter is
the faction, the digit the seat within it). A role is a fixed thing defined in
`data/roles.json`: a name, a title, an initiative row, five resource cards and
a private back. It exists whether or not anyone is playing it.

**NPC** — the two facilitator-played lanyards: `N1`, the U.N. Ambassador, and
`N2`, the Martian Senate Speaker. Each holds nine resource cards. They are
roleplayed by the facilitator and can never be claimed by a player.

**Seat** — a connected human, identified by a 32-hex token that survives a
page refresh. A seat may claim a role; a role may be held by at most one
connected seat. Seats are runtime, roles are data. Keeping them separate is
what makes reconnection and facilitator reassignment work.

**Facilitator** — the umpire. Runs the clock, roleplays the NPCs, sets every
difficulty, and adjudicates every action. The app computes; the facilitator
decides.

## The boards

**Map** — one of the three boards: Earth, Mars, and the Asteroid Belt. Each is
Locations plus Tracks. Defined in `data/maps.json`.

**Location** — a named place on a map (Luna, Phobos, Ceres…). Action cards are
placed at maps; the War Progress marker stands at a location.

**Track** — a named number on a map: War Support, Terraforming Project, the
Senate Control trio, the Shipping Control quartet, the prosperities and trade
routes. Nineteen carry printed initial values; moving them is what most
actions are for.

**War Progress** — the twentieth track, and the war itself. Activated by the
turn-two War Correspondence; 0 means Earth surrenders, 20 or more means Mars
surrenders. The value is a place on a route across both planetary maps —
which location the marker stands at is derived from the number, never stored.

## Play

**Turn / Phase** — four turns, each Team Phase (5 min, your faction's table
only) → Negotiation Phase (5 min, talk to anyone) → Action Phase (10 min,
actions resolve). The clock is a deadline, runs into overtime, and ends when
the facilitator says so.

**Action Card** — one per player. Placed on a map during the Negotiation
Phase — placement is mandatory — and resolved in the Action Phase when its
player is called.

**Initiative** — the call order for the Action Phase: a fresh seeded
shuffle of each map's placed players, every turn, drawn through the game's
own rng stream so replays reproduce it. (The per-turn values printed on the
role cards are an old rule by the author's errata; the transcribed arrays
remain in roles.json unread.)

**Resource Card** — one of 108 cards across 24 types (Hackers, Patrol Ship,
Untraceable Cash…). Owned by a role, held by whoever it was loaned to,
discarded when spent. Freely loanable; the owner reclaims a loaned card until
it is spent; one discard is recovered per Negotiation Phase; there is no hand
limit.

**Ally** — a player who spends their own action supporting yours: +1 Impact
and +1 to the resource commitment limit. They come with you when you are
called.

**Impact** — what an action achieves: turn number + allies + accepted
resources − difficulty (0 to −3, the facilitator's call), then the consequence
die — 1–2 a complication, 3–4 as normal, 5–6 +1 Impact.

**Band** — the ladder Impact is read against: Insignificant (≤1), Minor,
Moderate, Notable, Major, Radical (10+). The band drives the effect magnitude
tables in `data/meta.json`.

**Opportunity** — a threshold-triggered two-option choice offered to a team
when a track crosses a line (War Support above 18, a Senate Control lead of
4…). Defined as triggers in `data/maps.json`.

**War Correspondence** — the scripted turn-by-turn war news the facilitator
reads out. Turn two's activates War Progress. Facilitator-only data, in
`data/events.json`.

**Tithe** — what the Belt Union owes the U.N. Ambassador: 1, 1, 2, 2 resource
cards by turn. In `data/events.json`.
