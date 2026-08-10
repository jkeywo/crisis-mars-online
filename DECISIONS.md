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

## Phase B8 — Epilogue and polish

**The favicon is committed, not built.** `tools/make-favicon.py` squares the
gamespec logo and writes 32/16px frames; the output is committed because
this repo has no build step by design, and CI copies files rather than
transforming them. Re-run the script if the logo changes.

**The epilogue degrades by inputs, not by role checks.** `cm-epilogue`
renders the goal walk only when handed `aftermath.json` (host-only load)
and the override ledger only when the projection carries `log`
(facilitator-only path). The same element serves both consoles with no
"am I the facilitator?" branch to get wrong.

**Opportunity existence went public in the pump phase.** `opportunities.*.
{id,turn,status,factionId,npcCode}` are PUBLIC; title, options, choice and
effects stay faction-scoped. The end-of-turn worksheet already announced
proposed deliveries publicly (triggers are arithmetic over public tracks),
so this leaked nothing new — and it is what lets the event pump announce a
resolution. The player card renders only records whose words arrived.

**The pump carries the dataset and stamps schema v2.** `action.closed`
events name the band, which needs the meta ladder, so `eventPumpFor` takes
`data`. The digest-equality test (projection vs raw state) remains the
structural guarantee that the pump reads only PUBLIC paths.

**Co-facilitator model.** One authoritative host tab, always. The PIN
grants facilitator authority over the wire; the co console mirrors the
full projection (state-shaped, so it is a save), and take-over rebuilds
from that mirror's log — never adopts a snapshot — with the derived peer
id as the guard against two live hosts. `?role=co` just focuses the form.

**Stack-on-narrow instead of rails-become-tabs.** RBO's player page turned
its side rails into tabs below 75rem; this game's player page has no tab
bar, so below the same breakpoint the three columns stack and the main
column scrolls. Cheaper, and honest about how much UI this page has. The
copied tab plumbing stays in console.css unused, for whoever adds tabs.

**Replay draws the live components.** The replay page mounts the same
cm-map-board and cm-war-progress the consoles use rather than bespoke
tables, so scrubbing exercises the components' own change-detection. The
fidelity guarantee stays in the rules layer (the scrub suite checks the
cursor against the reducer's replay at every stop).

**Still uncovered, knowingly.** Page-level integration tests for
player-app.js / host-app.js (RBO's pages/player-lobby suites) — the apps
are thin wiring over components and sessions that are each tested, and a
DOM-level page harness was judged not worth its weight before a first
playtest. Also unported: RBO's sound.test (the beeper is copied verbatim),
and everything about map artwork (this game has no map artwork yet).

## Publication (2026-08-10, coordinator)

- The pasm model was validated locally before first push (`uv run pasm
  validate/scan`): three schema mismatches fixed in
  `architecture/state-and-views.yaml` (`implemented`→`declared` — vellum's
  vocabulary; a stray `pure` field removed; two scalar `derived_from`
  values made lists), and the player console's observed dependency on the
  wire protocol declared rather than left as a scan warning.
- Repo published as **public** `github.com/jkeywo/crisis-mars-online`
  (matching the-raven-banner-online), per the author's explicit
  authorization before going AFK. Code MIT; `assets/**` remains
  © John Keyworth, all rights reserved, as the README states.
- GitHub Pages serves the `gh-pages` branch, which only CI writes.

## 2026-08-10 — The author's rulings applied

All twelve gaps.js entries were ruled on by the author and now carry
`status: 'author-ruled'`; where a ruling changed behaviour the entry's text
is the author's rule. Engineering notes from applying them:

**The effect-table clamps are gone, the budgets stay for display.**
`facilitator:apply-effects` now checks only board arithmetic (real tracks,
whole points, the zero floor, regains from the discard, sabotage of held
uncommitted cards). `derive.effectBudgets` survives purely to light the
guidance table on the adjudication panel. No override-variant verb was ever
needed once the clamps left.

**`destroyed` is a third card state.** Sabotage carries a per-card mode;
`recover-discard` and regains refuse destroyed cards; `cm-hand` shows a
destroyed epitaph. The 108-card economy is no longer strictly closed — by
the author's own hand.

**The future-impact bank is deleted, not deprecated.** `state.futureImpacts`
is gone from state and manifest; `facilitator:note` (FACILITATOR-visible
`state.notes`) and `facilitator:set-bonus` (public, on the action record,
in derive's Impact) replace it. Saves from before this commit would replay
their banking commands as refusals — acceptable pre-publication, when no
real save exists.

**assign-action-card appends to the back of a built queue** rather than
re-sorting by printed initiative: the order already ran without them.

**The tithe consequence quote joins the schedule as a transcription** in
`gui/rules/turn-update.js` (the worksheet's reminder step), same reasoning
as before: the rules never read the facilitator file. Not validator-checked
— it is prose, not numbers; drift is cosmetic.

**Consensus is derived, never stored.** `derive.opportunityConsensus`
computes it from votes and claimed seats at render, keeping the
derived-values law intact.

## 2026-08-10 — STRINGS.md

Every user-facing string is inventoried in STRINGS.md for the author's
rewrite, organized by surface, with placeholders shown and gamespec-owned
text explicitly excluded (that text is edited in the gamespec and
re-exported). The inventory is hand-curated from a literal-extraction sweep
of gui/ and the three pages; the extraction script was throwaway and is not
committed.

## 2026-08-10 — The tabbed host console

**Six tabs, current one in the hash.** Map tabs are built from maps.json
(labels are the printed map names — gamespec-owned strings); Roles, NPCs and
Game are static panels. `location.hash` carries the tab so a refresh
returns to it; the player page's hash still carries the join code — the two
pages never share a hash convention. Arrow keys walk the tablist. Badges
are deliberately minimal: a map with an open spotlight, Roles during the
lobby, Game when the turn's news is unread or the debrief is up.

**Board chips commit as deltas; the war marker commits as a set.** A chip
edit pre-fills the current value and commits `facilitator:adjust` with
typed−shown, so a player-driven change between look and commit survives —
the inspector's own reasoning moved onto the board. The War Progress marker
commits `facilitator:set` because a marker is placed, not nudged; setting
the war back to null stays with the inspector's Deactivate.

**Action-card tokens sit under the image, not over it.** The board is the
author's drawing; the tokens are the evening's. A strip along the bottom
edge outside the art keeps both legible and costs no geometry.

**`facilitator:move-card` has no 'box'.** Undealt cards are not state, so
the umpire's card mover reaches hands and discards only. Destroyed stays
destroyed. Introducing an undealt card would be a state-shape change, not a
move — the pencil could do it, but nothing invites it.

**geometry.json is CORE data.** Board layout is public (the players look at
the same printed sheets), so it loads with the other six files everywhere
rather than being host-only; the player page simply does not use it yet.

**The lobby role grid is gone.** The Roles tab shows claims better and
lives one keystroke away; the old grid was a worse copy of it. The Roles
tab badge during the lobby is the pointer.

**cm-map-board survives for the player page only.** The host tabs use the
overlay; the player's rail keeps the compact track list until a player-page
tab pass (explicitly deferred by the author's request).

## 2026-08-10 — The page-boot smoke tests, and a retired exemption

The tab refactor deleted nine functions the host page still called; every
unit suite stayed green and the page died at boot with a ReferenceError in
the browser. The 'page-level integration untested' exemption recorded
earlier is hereby retired: tests/pages/ now boots each of the three pages
for real — the actual HTML body, the actual start function, the real
dataset served over a disk-backed fetch, the transport tests' own PeerJS
fake — and asserts the boot completes and the landmark containers filled
(the tab strip, the composer, the NPC briefs, a started game's console,
the player join flow, the replay open screen). A call to a function that
no longer exists is a red test from now on, not a browser surprise.

## 2026-08-10 — The custom domain is written into every publish

GitHub Pages stores a custom domain as a CNAME file on the served branch,
and our publish job force-pushes gh-pages fresh every run — so the first
publish after the author bound crisis-mars-online.kiwigamedesign.co.uk
erased the binding and took the live site (and every card image on it)
down. The workflow now writes the CNAME into _site alongside VERSION, so
the domain survives every deploy. README leads with the custom domain and
keeps the github.io address as the fallback.

## Stale-version guard (2026-08-10, coordinator)

The author hit host.html stuck on "Reaching the game": a deploy landed
mid-visit and their browser paired cached old modules with new HTML (GitHub
Pages caches assets for ten minutes), so the module graph died silently and
the connection dot's static default text was all that showed. Three changes:
the dot now *starts* as `idle` ("No game yet") because the start screen is
not reaching anything; each page carries a classic-script watchdog that
reveals a reload banner when a script/stylesheet fails to load, when the app
module rejects, or when boot has not completed within six seconds; and boot
completion is signalled via `document.body.dataset.booted` by the page
module. A hard refresh was always the cure; now the page says so itself.

## 2026-08-10 — The pinned host header (author's ruling)

**Two rows that never scroll away.** The author asked for the clock, its
controls and the war rail on one pinned row with the six tabs on a second;
`#host-header` is one sticky block under the brand bar (which already
carries the connection dot, sticky in its own right). The run control gave
up its own `position: sticky` to the wrapper, and the war strip moved from
a page-wide band into row one of the header — same ids, same render calls.

**The clock's explanatory sentence is gone.** "The clock runs past zero
rather than stopping…" was worth a line on a scrolling page; on a header
that is on screen for the whole evening it is furniture. A facilitator
learns the behaviour the first time a phase overruns. The unplaced strip
stays in the header — that one is live information with a deadline.

## 2026-08-10 — The state inspector retires (author's ruling)

The editable board chips made "Change anything" a second, worse way to do
the same edits, and the author ruled it off the Game tab. Before removal
its one irreplaceable control moved home: clearing War Progress back to
"the war has not begun" (facilitator:set to null) is now a third button in
the war marker chip's edit mode on the board overlays — the earlier note
that "setting the war back to null stays with the inspector's Deactivate"
is hereby superseded. The component file, its CSS and its STRINGS rows are
gone; the facilitator:set / facilitator:adjust verbs it drove are untouched
and remain the pencil under every chip.

## HTTPS enforcement lives at Cloudflare, not GitHub (2026-08-10, coordinator)

crisis-mars-online.kiwigamedesign.co.uk resolves to Cloudflare's proxy, so
TLS terminates at Cloudflare's edge and GitHub can never provision its own
certificate for the domain -- its https_enforced flag will stay false
forever and chasing it is wasted API calls. HTTPS already works via
Cloudflare's cert. The http-to-https redirect is currently OFF at the edge
(plain http serves 200): flipping it is one toggle in the author's
Cloudflare dashboard -- SSL/TLS > Edge Certificates > "Always Use HTTPS" --
and "Full" SSL mode is the right companion so the Cloudflare-to-GitHub hop
is encrypted too. Both are account settings only the author can reach.
