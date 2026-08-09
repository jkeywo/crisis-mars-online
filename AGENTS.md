# Crisis Mars Online — Agent Guide

A browser client for *Crisis: Mars*, an 8–18 player megagame set in 2225,
during the Martian war of independence. A facilitator and up to eighteen
players join from their own machines, talk on voice elsewhere, and play four
turns of three phases through this app. The facilitator's browser tab is the
authoritative host; everyone else is a client over PeerJS.

This repo is a structural fork of
[`the-raven-banner-online`](https://github.com/jkeywo/the-raven-banner-online)
— same architecture, same laws, different game. The paper game exists; this
repo does not invent rules. It implements them.

## This repo is not part of the vellum fleet

`C:\Coding\AGENTS.md` describes vellum and the games that pin it. This is not
one of them. Determinism tiers, vellum crate pins, `fleet-ci.yml` and the
golden/fixture/trace naming convention **do not apply here**. The single fleet
convention this repo adopts is **PASM**, consumed by rev from vellum and
validated in CI.

## Tech stack

| Layer | Technology |
|---|---|
| Client | Vanilla ES modules, no bundler, no framework. Custom elements prefixed `cm-`. |
| Transport | PeerJS (vendored at `vendor/peerjs.min.js`, not CDN), star topology, host-authoritative |
| Rules engine | Plain JS under `gui/rules/` — pure, DOM-free, no network imports |
| Static data | Generated JSON under `data/`, card art under `assets/cards/` |
| Tests | vitest (+ jsdom per-file for components) |
| Architecture model | PASM — YAML under `pasm/spec/`, tool pinned from vellum |
| Rules of record | crisis_mars gamespec, at `C:\AnalogueGames\analogue-projects\GameProjects\crisis_mars` |
| Hosting | GitHub Pages, from the `gh-pages` branch, published by CI |

There is deliberately no build. What is committed is what is served, byte for
byte. For a two-hour live event with eighteen strangers on eighteen networks, a
zero-build deploy is the single biggest reliability win available.

The `gh-pages` branch is generated, never edited by hand and never checked out.
CI assembles it from `index.html`, `host.html`, `replay.html`, `gui/`, `data/`,
`assets/` and `vendor/` after both gates pass, and force-pushes. That is a
copy, not a build: nothing is transformed. It exists so a failing commit cannot
reach players, and so the model, the tests and the export tools are not served
to them. **Adding a runtime file means adding it to the copy list in
`.github/workflows/ci.yml`, or the live site will 404 on it.**

## The three laws

**1. Rules purity.** `gui/rules/**` imports nothing from `gui/net/**`,
`gui/host/**`, `gui/client/**`, or the DOM. It is pure functions over
`(state, data, …)`. Static data is always passed in as an argument, never
reached for as a module global, so tests can inject fixtures. This is what makes
the rules testable in Node and shareable between the host (which enforces them)
and the clients (which use them to grey out buttons). `pasm scan` gates the
dependency edges; a lint test gates the imports.

**2. Redaction.** Nothing leaves the host except through `projectView()` in
`gui/rules/views.js`. What each recipient may see is declared once, as data, in
the `FIELD_VISIBILITY` manifest in `gui/rules/visibility.js`. Never hand-filter
an object at a send site. `tests/rules/redaction.test.js` enforces both halves:
no secret reaches a seat the manifest does not grant it, **and** every path in a
fully-populated state has a manifest entry. That second check is the point — a
new field is a test failure by default rather than a silent leak.

**3. Everything goes through the reducer.** Including facilitator overrides.
`facilitator:set` is a command like any other; its `admit` returns true
unconditionally and its log entry is tagged `override: true`. That keeps the
whole game replayable from `(seed, log)` and keeps "what did the umpire change?"
answerable.

## Generated files — do not hand-edit

`data/*.json` and the card art under `assets/cards/` and `assets/icons/` are
generated from the crisis_mars gamespec at
`C:\AnalogueGames\analogue-projects\GameProjects\crisis_mars` by
`tools/export_web_data.py` and `tools/install_web_assets.py` **in that repo**.
Each data file carries a `_generated` provenance line naming the
`analogue-projects` commit it came from, and `_doNotEdit: true`. To change any
of them, change the authored gamespec module and re-export.

The gamespec project is the specification of record; `gui/rules/` is the
implementation. They are two languages and they will drift unless something
stops them, so as mechanisms land, the Python side generates conformance
vectors the JS suite replays. A rules disagreement is therefore a failing
test, not a bug report from a player mid-game.

## Common commands

```bash
serve.bat                       # run it locally — the consoles fetch JSON,
                                # so file:// gets you a blank page
npm test                        # vitest
npm run data:validate           # data shape, cross-references, art files
uv run pasm validate pasm/spec  # spec integrity
uv run pasm scan pasm/spec      # observed-vs-declared dependency edges
```

## PASM — keep it up to date

Model first, then build. Record accepted choices as `decision` entities in
`pasm/spec/core/foundation.yaml`. Run `uv run pasm validate pasm/spec` after any
model change and fix before committing. Never leave dead spec.

Gotchas, both of which produce confusing errors:

- A PASM YAML string containing `": "` must be quoted, or validation fails with
  `invalid-list-item ... must be a string`.
- The parser accepts only map/seq/str/bool YAML tags. **There are no integers.**
  Write `turns: "4"`, not `turns: 4`.

## Design notes worth knowing before you change things

- **Adjudication is human.** The app computes an action's Impact, names the
  band and rolls the consequence die — but it never applies an effect to the
  boards without a facilitator confirming it. Difficulty, resource relevance
  and every consequence are the facilitator's judgement, exactly as printed.
  The confirm is a command like any other, so the log still answers "what did
  the umpire apply?".
- **Derived values are never stored.** The Impact total, the effect band, and
  the War Progress marker's location on the maps are computed from state on
  demand. Storing them is how the boards and the tracker come to disagree.
- **Role card backs are static JSON, rendered only for the owner.** The
  private half of a lanyard — background and personal goal — is served to
  every browser in `data/roles.json` and attached to its owner's projection in
  `views.js`. A determined player could read it in devtools; it never appears
  on anybody else's screen. This is an accepted trade, the same one RBO made
  for `briefs.json`.
- **The facilitator is trusted.** They run the table and hold the only copy of
  state. The redaction layer exists to stop material reaching other *players*.
- **The whole game lives in one browser tab.** Host crash recovery has three
  independent layers: a deterministic peer id derived from the join code (so
  clients reconnect unaided), a debounced localStorage autosave with a frozen
  copy per turn, and a downloadable save file. Do not weaken any of them.
- **The roster is authored, not computed.** `data/scaling.json` names the
  exact role codes dealt in at every head count from 8 to 18. Cards belonging
  to absent roles stay in the box — they are not state.
