# Decisions made on the author's behalf

Started 2026-08-10, while the author was away and asked for the build to
continue without questions. This file records **engineering and product
calls** made in their absence — the choices a reviewer should be able to
find, understand, and reverse without archaeology.

It is deliberately not `gui/rules/gaps.js`. That file records readings of
the *printed game rules* where the print is silent, is shown to the
facilitator in the console, and each entry cites the sentence it interprets.
This file records decisions about the *software*: loading strategies, replay
contracts, enforcement boundaries, UI scope. If a decision changes what the
game rules mean, it goes in gaps.js; if it changes how the app is built, it
goes here.

---

## Phase B6 — Team Phase

**events.json is loaded by the host page only.** `loadFacilitatorData()` in
`gui/client/load-data.js` fetches `data/events.json` and `data/aftermath.json`,
and only `gui/host/host-app.js` calls it. The player page never fetches
either. Like the role card backs, the file is technically public over HTTP —
anyone can type the URL — which is the same accepted trade RBO made for
briefs.json: the app never *surfaces* it to players, and the join code, not
the data, is what a live game trusts. The redaction laws cover state;
facilitator-only static files are covered by not being loaded.

**Correspondence effects travel in the command payload.** The rules layer
never reads events.json. `facilitator:publish-correspondence` carries the
structured effects (`{track, set|delta}`) that the host UI read out of the
script, so a saved log replays identically on a machine that has never
fetched a facilitator file. The alternative — the reducer reaching into
events.json by turn number — would have made replay depend on data the
player pages are forbidden to load.

**Which correspondence is skippable is not enforced by the rules.** The
print marks only T3 optional. The verb accepts a skip for any turn and
trusts the umpire; the host UI offers the Skip button only where events.json
says `optional: true`. Enforcing it in admission would have meant the rules
reading the facilitator file (see above), and the facilitator can always
achieve a skip with the pencil anyway — a rule that can be trivially
bypassed by its own audience is documentation, so it lives in the UI.

**The tithe schedule is transcribed into the rules, and the validator guards
the transcription.** Player consoles must admit `pay-tithe` without fetching
events.json, so `TITHE_SCHEDULE = {1:1, 2:1, 3:2, 4:2}` (and the
belt_union → N1 direction) is written in `gui/rules/commands/team.js`, and
`tools/validate-data.mjs` fails if events.json ever disagrees with it.
CONTEXT.md already fixed these numbers as vocabulary, so the duplication was
pre-existing in prose; now it is checked.

**resolve-opportunity applies once.** Unlike `facilitator:apply-effects` in
the Action Phase (which unwinds and re-applies so a ruling can be corrected
while the spotlight is open), a resolved opportunity is final. The moment is
shorter — deliver, choose, resolve — and a correction after the fact is what
`facilitator:adjust` exists for. Reversibility costs a stored-effects
bookkeeping trail; it earns its keep in the adjudication panel and does not
here.

**Opportunity records are the first TEAM-audience state, and TEAM is defined
by a faction function.** The manifest rule computes the audience faction
from the record (`factionId`); a null answer (an NPC-targeted opportunity)
fails closed to the facilitator alone. This replaces RBO's owner-derived
TEAM semantics, which nothing in this game had used yet.

## Phase B7 — End of turn

**advance-phase is not gated on the turn update.** `facilitator:begin-turn-
update` admits only during an Action Phase, but nothing stops the
facilitator advancing to the next Team Phase with steps unconfirmed — their
tempo rules, exactly as the phase clock never auto-ends a phase. An
unfinished update dies with the turn (the rollover resets it); the
facilitator who wants its numbers applies them first, and the host UI makes
the unfinished state loud.

**Proposals are computed inside the reducer, from state and CORE data
alone.** `facilitator:begin-turn-update` calls `computeTurnUpdate(draft,
data)` in its effects, so the proposed steps are part of the logged state
transition and replay bit-for-bit. The host UI never computes its own
proposals; it renders the ones state carries.

**Turn-update steps apply on confirm, one at a time.** Confirm applies the
proposed delta; override applies the facilitator's delta instead (both land
in the log as overrides, being facilitator verbs). There is no unwind:
a confirmed step is a track movement like any other, corrected afterwards
with the pencil if needed. The stepper is a checklist, not a transaction.

**Qualitative end-of-turn entries propose a delta of zero.** The printed
trade-route damage and prosperity caps say "negatively affected" and
"reduced" with magnitude left to judgement, so their steps surface the
printed sentence and a zero suggestion for the facilitator to overwrite.
The app never invents the number.
