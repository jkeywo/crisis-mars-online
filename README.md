# Crisis Mars Online

An online interface for *Crisis: Mars*, a megagame for 8–18 players and one
or two facilitators, set in 2225 during the Martian war of independence.

Play runs about two hours across four turns. Everyone talks on voice —
Discord or similar — and uses this app for the three boards, their lanyard,
their cards, the clock, and the spotlight.

The current build will be live at
**[jkeywo.github.io/crisis-mars-online](https://jkeywo.github.io/crisis-mars-online/)**
— players land on that page, facilitators want
[host.html](https://jkeywo.github.io/crisis-mars-online/host.html). It is
published from `gh-pages` by CI, so whatever is up there is a revision whose
tests passed.

## Playing

Open the link your facilitator gives you, enter **your own name**, and take
a lanyard from your faction's row — the printed front is the one you would
have worn at the table, and its back (your character, your personal goal,
your faction's goals) is yours alone once you flip it.

A turn is three phases, and the clock in the header always says which:

- **Team Phase (5 min)** — talk to your own faction. The war correspondence
  is read out; opportunities may land in your rail with two options — talk,
  then tap the table's answer. Belt Union players: the tithe panel appears
  here when the Ambassador is owed.
- **Negotiation Phase (5 min)** — talk to anyone. **Place your action card
  on a map** (the three buttons in your rail — mandatory, movable until the
  phase ends). Loan cards freely from your hand panel; owners can always
  reclaim until a card is spent. Recover one card from your discard pile.
- **Action Phase (10 min)** — players are called to their maps in initiative
  order, 60 seconds each. When it is you, the declaration form appears:
  say what you are doing, invite allies, offer up to three cards (one more
  per ally, each from a different faction). The facilitator rules, the die
  rolls, the boards move, and the narration lands in the spotlight panel.

Everything public is on your screen: the tracks, War Progress, everyone's
hands, the call order. Your lanyard back is the only secret the app keeps
for you. You will need a modern browser and a screen bigger than a phone.

## Facilitating

Open `host.html`, pick the head count (the scaling table deals the exact
printed roster), and read the join code out. The game lives in your tab —
keep it open, keep the laptop plugged in, turn off sleep.

- **The clock** — Next phase / Pause / ±1 min. It runs past zero; a phase
  ends when you say so. The strip under it names who has not placed.
- **Lanes** — with two umpires, claim a map each on the adjudication panels;
  players see whose table is whose. A co-facilitator joins from the start
  screen with the code and your PIN, mirrors the whole game, and can take
  over hosting if your laptop dies.
- **The Team Phase table** — the turn's correspondence with its printed
  effects behind one Publish button (Skip only where the script allows),
  the opportunity composer with the menus' guidance, and the tithe tracker.
- **Adjudication** — per lane: call the next player, rule the offered cards
  by checkbox, set difficulty, roll, spend the band's budgets (tracks,
  regains, sabotage, future impact), narrate, close. The Impact readout and
  the budget clamps are the same computation.
- **The turn update** — once the last spotlight closes, Begin computes the
  printed checklist; confirm or override each step. Surrender is flagged,
  never enforced — the curtain is yours.
- **The epilogue** — Call time freezes the boards; the debrief assembles
  itself: the war's ending, every goal against its printed evidence, the
  override ledger, your notes. Print it or save it as a page.
- **The NPC hands** — the Ambassador's and the Speaker's cards move through
  the same verbs the players use, from their panels on your console.

Nothing you do bypasses the log. Autosaves run continuously, a frozen copy
is kept at each turn's start, and the Download save button produces the one
file that survives the machine — `replay.html` walks any of them, action by
action.

## For developers

Vanilla ES modules, no build step. PeerJS star topology with the
facilitator's browser as the authoritative host; everything through one
reducer, one redaction manifest, one seeded RNG — see
[AGENTS.md](AGENTS.md) for the three laws and [CONTEXT.md](CONTEXT.md) for
the vocabulary. Decisions made during the autonomous build are in
[DECISIONS.md](DECISIONS.md) and `gui/rules/gaps.js`.

```bash
npm install
npm test                 # vitest — includes a full scripted 4-turn game
npm run data:validate    # dataset shape, cross-references, art files
serve.bat                # then open http://localhost:8173/host.html
```

Opening `index.html` from disk will not work — the consoles fetch their
data as JSON, and browsers refuse that over `file://`. `serve.bat` exists
for that one reason.

The host can also stream a game's *public* events to an outside bot: open
`host.html?events=<ws-or-http-url>`. Off by default, spectator-projection
only, and a dead sink can never take the game down.

## Generated data

`data/*.json` and everything under `assets/cards/` and `assets/icons/` are
generated from the crisis_mars gamespec at
`C:\AnalogueGames\analogue-projects` (`GameProjects/crisis_mars`), by
`tools/export_web_data.py` and `tools/install_web_assets.py` **in that
repo**. Every data file carries a `_generated` provenance line and
`_doNotEdit: true`. To change any of it, change the authored gamespec
module and re-export. `favicon.ico` is generated from the logo by
`tools/make-favicon.py` and committed.

## Licence

The code is MIT — see [LICENSE](LICENSE).

The artwork is not: everything under `assets/cards/**` and `assets/icons/**`
is © John Keyworth, all rights reserved. It is committed here so the game
can be served, not so it can be reused.
