# Crisis Mars Online

An online interface for *Crisis: Mars*, a megagame for 8–18 players and a
facilitator, set in 2225 during the Martian war of independence.

Play runs about two hours across four turns. Everyone talks on voice — Discord
or similar — and uses this app for the boards, their lanyard, their cards and
the clock.

**Status: in development. Not yet playable.**

## Playing

**Players** open the link the facilitator gives you, enter your name, and take
a lanyard. Your character's background and personal goal are yours alone; the
three maps — Earth, Mars, and the Asteroid Belt — are shared. You will need a
modern browser and a screen bigger than a phone.

**Facilitators** open `host.html`, start a game, and share the join code. The
game state lives in your tab, so keep it open, keep the laptop plugged in, and
turn off sleep.

The app tracks the boards and does the arithmetic. It adjudicates nothing:
every action's difficulty, relevance and effect goes through you, exactly as
the printed game intends.

## For developers

Vanilla ES modules, no build step. PeerJS star topology with the facilitator's
browser as the authoritative host.

```bash
npm install
npm test
npm run data:validate
serve.bat        # then open http://localhost:8173/host.html
```

Opening `index.html` from disk will not work — the consoles fetch their data as
JSON, and browsers refuse that over `file://`. `serve.bat` exists for that one
reason. The three pages are `index.html` (players), `host.html` (facilitator)
and `replay.html` (walk a finished game back from a save file).

See [AGENTS.md](AGENTS.md) for the architecture and the three invariants the
codebase is built around, and [CONTEXT.md](CONTEXT.md) for the domain
vocabulary.

## Generated data

`data/*.json` and everything under `assets/cards/` and `assets/icons/` are
generated from the crisis_mars gamespec at
`C:\AnalogueGames\analogue-projects` (`GameProjects/crisis_mars`), by
`tools/export_web_data.py` and `tools/install_web_assets.py` **in that repo**.
Every data file carries a `_generated` provenance line and `_doNotEdit: true`.
To change any of it, change the authored gamespec module and re-export.

## Licence

The code is MIT — see [LICENSE](LICENSE).

The artwork is not: everything under `assets/cards/**` and `assets/icons/**`
is © John Keyworth, all rights reserved. It is committed here so the game can
be served, not so it can be reused.
