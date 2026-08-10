# String inventory — every word the app says

For the author's review and rewrite. Each row is one user-facing string as
it appears in the code today, with a stable reference (file, and the verb or
element it belongs to). Dynamic strings show their placeholders as `{name}`;
plural forks are written `{n} card(s)` where the code picks the form.

**Not listed here:** anything from `data/*.json` — role names, faction
blurbs, goal statements, track names, card flavour, the war correspondence,
the opportunity menus, the aftermath tables. That text is gamespec-owned:
edit it in `C:\AnalogueGames\analogue-projects\GameProjects\crisis_mars`
(the authored modules behind `tools/export_web_data.py`) and re-export.
Also excluded: README/AGENTS/CONTEXT/DECISIONS prose, code comments, commit
messages, and test strings — see the note at the end.

---

## 1. Page titles and chrome

| Ref | Text |
|---|---|
| index.html `<title>` | Crisis: Mars — Online |
| host.html `<title>` | Crisis: Mars — Facilitator |
| replay.html `<title>` | Crisis: Mars — Replay |
| index.html `.cm-brand` | Crisis: Mars |
| host.html `.cm-brand` | Crisis: Mars `facilitator` |
| replay.html `.cm-brand` | Crisis: Mars `replay` |

## 2. Player page — static (index.html)

| Ref | Text |
|---|---|
| #screen-code h1 | Join the game |
| #screen-code lede | Your facilitator will read out a seven-character code. |
| #screen-code label | Join code |
| #join-code placeholder | MARS42X |
| #screen-code button | Continue |
| #screen-name h1 | Who are you? |
| #screen-name lede | Your own name, not your character's — you will choose a lanyard next. This is what the others see on the roster. |
| #screen-name label | Your name |
| #screen-name button | Join |
| #screen-lobby h1 | The Solar System, 2225 |
| #screen-lobby lede | Game {CODE}. {message} |
| #screen-lobby h2 | Who is here |
| #start-over button | Not this game — start over |
| #tithe h2 | The tithe |
| #pay-tithe button | Pay the tithe |
| #placement h2 | Your action card |
| #action-rail h2 | What you can do |
| war strip comment target (visible when running) | *(cm-war-progress, see §6)* |
| #game-main h2 | Who is here |

## 3. Player page — dynamic (gui/client/player-app.js)

| Ref | Text |
|---|---|
| code-form invalid | That code is not right. Ask your facilitator to read it again. |
| lobby, waiting (remembered seat) | Looking for game {CODE}, as {name}… |
| lobby, waiting | Waiting for the facilitator… |
| lobby, unclaimed | Choose a lanyard. |
| lobby, claimed | Playing {role name}. Waiting for the facilitator to start the game. |
| role picker, taken badge | taken |
| claim error, not connected | Not connected yet — try again in a moment. |
| dispatch error, not connected | Not connected — try again in a moment. |
| placement note, placed | On {map name} — you can move it until the phase ends. |
| placement note, unplaced | Not placed yet. Placement is mandatory — pick a map. |
| tithe note | The Ambassador is owed {n} card(s) this turn — {paid} paid so far. Any Belt player can pay, in instalments. |
| all-hands fold summary (index.html) | Everyone's hands |
| all-hands note (index.html) | *(comment-only; visible text is the summary above)* |

## 4. Host page — static (host.html)

| Ref | Text |
|---|---|
| #screen-start h1 | Run a game |
| #screen-start lede | The game lives in this tab. Keep it open, keep the laptop plugged in, and turn off sleep. |
| player-count label | How many players? |
| player-count option (18) | 18 — the full game |
| player-count options (9–17) | {n} |
| player-count option (8) | 8 — the smallest table |
| scaling note | The scaling table is applied for you: the gamespec names the exact roster for every head count, and only those lanyards — and their resource cards — are dealt in. The two NPC lanyards are always yours. |
| #new-game button | Start a new game |
| resume h2 | Or pick up where you left off |
| co h2 | Or help run somebody else's |
| co note | The other facilitator holds the game. You get the same console over the wire, and a full copy of the game on this machine — so if their laptop dies, you can pick it up without anybody re-entering anything. |
| co labels | Game code / Facilitator PIN / Your name |
| co submit | Join as co-facilitator |
| import h2 | Or open a saved game |
| import note | A downloaded save can be opened on any machine — this is how a game survives a laptop dying. |
| co-banner | **You are the co-facilitator.** The game is on the other machine and mirrored here. |
| #take-over button | Take over hosting |
| clock buttons | Next phase / Pause / +1 min / −1 min / Call time |
| epilogue h2 | The debrief |
| epilogue note | Read from this. Print it, or save it as a page to send round the week after. |
| epilogue buttons | Print it / Save as a page |
| team panel h2 | The Team Phase table |
| team panel h3s | War correspondence / The tithe / Compose an opportunity / Opportunities |
| lobby-roles h2 | Choosing lanyards |
| lobby-roles note | The same picker every player has open right now. Begin the game above once enough of the table has sat down — a lanyard can still be claimed or re-claimed after that, same as any late arrival. |
| join h1 | Game {CODE} |
| join lede | Read the code out. Paste the link. |
| link label / button | Player link / Copy |
| testing fold summary | Testing on one machine |
| testing note | Opens tabs that each take a seat of their own rather than sharing this machine's. For trying the game out alone — not something to reach for at a real table. |
| testing controls | How many / Open test players |
| PIN line | Facilitator PIN {pin} — Only the other facilitator gets this. Anyone with it can edit the game. |
| saves h2 | Keeping the game |
| saves note | Saved automatically as you go. Download one before anything important — it is the only copy that survives this machine. |
| #download-save button | Download save |
| #save-warning | Could not save to this browser — storage is full or blocked. Download a save instead. |
| roster h2 | Who is here |
| clear-seat note | Clearing a seat empties the chair, not the character: whoever was in it can no longer resume, and their lanyard stays on the wall with everything it holds for somebody else to take. |
| connections h2 | Connections |
| NPC h2 | The NPC hands |
| NPC note | The U.N. Ambassador and the Martian Senate Speaker are yours to roleplay. Hand their cards out — the tithe, a bribe, a favour — through the same verbs the players use; every pass lands in the log like everything else. |
| NPC h3s | Unified Nations Ambassador / Martian Senate Speaker |
| gaps fold summary | Where the rules are silent |
| gaps note | The printed rules were written for a room with you in it, so a few questions are never answered on paper. The app had to pick something before anybody sat down. Here is what it picked — overrule any of it on the boards themselves: every chip is the pencil. |

## 5. Host page — dynamic (gui/host/host-app.js)

| Ref | Text |
|---|---|
| resume row | {CODE} — {n} action(s), saved {time} |
| resume delete button / aria | Delete / Delete game {CODE} |
| resume turns | Back to the start of: turn {n} *(aria: Resume game {CODE} from the start of turn {n})* |
| delete confirm | Delete the saved game {CODE}? This cannot be undone. |
| turn-back confirm | Put game {CODE} back to the start of turn {n}? Everything played since then is undone. |
| co code invalid | That code is not right. Ask them to read it again. |
| co PIN missing | The PIN is on the other facilitator's screen. |
| co default name | Co-facilitator |
| take-over confirm | Take over hosting? Do this only when the other facilitator has stopped. |
| take-over log | [co] taking the game over — claiming the code |
| replay warning | {n} recorded action(s) could not be replayed and had no effect. |
| co mirror | {n} action(s) mirrored / nothing has arrived yet |
| seated count | {claimed} of {playable} lanyards claimed |
| advance button states | Begin the game / Next phase / The game is over |
| pause button states | Pause / Resume |
| end-game confirm | End the game and freeze the board for the debrief? |
| unplaced strip | Still to place: {name} [Earth] [Mars] [Asteroid Belt] … / Every action card is placed. |
| role grid, open seat | open |
| role grid, away | {player name} — away |
| correspondence card | *(read-aloud and note text come from events.json — gamespec-owned)* effect lines: {track}: set to {n} / {track}: {±n}; Already {published/skipped}. ; buttons: Publish / Skip it ; no-script line: Nothing scripted to read this turn. |
| composer labels | Trigger / Free-form / For / U.N. Ambassador (you) / Senate Speaker (you) / Title / Option A / Option B / Deliver it |
| composer guidance | {principle} *(text gamespec-owned)* |
| composer templates | *(buttons — each the trigger's guide example sentence verbatim, gamespec-owned; a click drafts title + Option A from it)* |
| opportunity list empty | None delivered yet. |
| opportunity row status | — CONSENSUS on {A/B} ({n} claimed) / — {code}:{A} …, no consensus of {n} claimed / — no votes yet |
| opportunity resolve controls | Track… / +/- placeholder / Add / Resolve |
| tithe tracker | {faction} owes {n} card(s) this turn — refused, with {n} paid. / paid in full ({n}). / {paid} of {owed} paid. |
| tithe refuse button | Mark refused |
| tithe refusal note | On refusal, the print says: {onRefusal lines}. The amounts are yours — move the tracks by hand. |
| lane umpire name (primary) | the host |
| host log refusals | [host] refused: {reason} |
| copy button states | Copy / Copied |
| debrief filename | crisis-mars-{CODE}-debrief.html |

## 6. Components (gui/components/)

### cm-phase-clock
| Ref | Text |
|---|---|
| phase names | Waiting to begin / Team Phase / Negotiation Phase / Action Phase / The Epilogue |
| turn line | Turn {n} · {phase name} |
| bracket notes | Not started. Take a lanyard — the game begins when the facilitator says so. / Time has been called. The board is the record now; nothing more can be played. |
| phase notes | Talk to your own faction only. Make a plan; brief your allies. / Talk to anyone. Place your action card on a map — it is mandatory. / Players are called to the maps in initiative order to resolve actions. |
| paused note | Paused by the facilitator |
| overtime note | Over time — the facilitator will call it |
| overtime prefix | +{m:ss} |

### cm-connection-dot
| Ref | Text |
|---|---|
| statuses | Reaching the game / Connected / Lost the game — trying again / Cannot reach the game / Hosting / Waiting for the room code / Reconnecting |
| retry button | Try now |

### cm-seat-roster
| Ref | Text |
|---|---|
| empty | Nobody has joined yet. |
| choosing | *choosing* |
| facilitator tag | facilitator |
| count | {n} player(s) seated. |
| clear button / aria | Clear / Clear {who} out of {role or "their seat"} |
| clear confirm (role) | Clear {who} out of {role}? {role} stays in the game, with everything they hold, and anyone can take them. This person will have to join again. |
| clear confirm (no role) | Clear {who} out? They have not taken a character. They will have to join again. |

### cm-map-board
| Ref | Text |
|---|---|
| track delta chip | +{n} / −{n} |
| action token title | {role name} *(text on token is the role code)* |

### cm-war-progress
| Ref | Text |
|---|---|
| label | War Progress |
| quiet | The war has not begun. |
| marker aria | the war stands here |
| surrender tag | surrender |
| station range | {low}–{high} / {n}+ |

### cm-initiative-queue
| Ref | Text |
|---|---|
| heading | Call order |
| ring | {n}s / time |
| next marker (CSS ::after) | next |

### cm-action-spotlight
| Ref | Text |
|---|---|
| umpire line | Umpire for this map: {name}. |
| up next | Up next: {name} — waiting on the facilitator to call them. |
| actor suffix | {name} — you |
| declaring placeholder | Declaring… |
| ally chip | {name} · {invited/confirmed/declined} |
| offered line | Offered: {card chips} |
| sums line | Impact {n} · {band} · difficulty {−n} · {±n} bonus · die {n} ({complication/normal/boon}) |
| declare form | What are you doing? / Allies to invite / Offer cards / Declare |
| ally ask | {actor name} asks you to spend your action with theirs. |
| ally buttons | Join in / Decline |

### cm-adjudication
| Ref | Text |
|---|---|
| lane bar | Lane: {name} (you) / Lane unclaimed / Run this lane / Release |
| idle | Call {name} / Skip them / This map's queue is done. |
| head | #{n} · {actor name} {status} |
| declaring placeholder | Waiting on the declaration… |
| ruling fieldset | Rule the offer / {card} {owner name}'s / Rule resources |
| difficulty group | Difficulty: 0 / −1 / −2 / −3 |
| sums line | Impact {n} · {band} {printed band text — gamespec-owned} · {±n} bonus · die {n} ({id}) / Roll the consequence die |
| notes fold | Your notes {n} / Nothing written against them. / note input placeholder: Prepare for the future… / Note it |
| bonus row | Spoken bonus / Set / Public, counted into Impact — honouring a note, out loud. |
| guidance table caption | The printed tables — guidance for the whole action, this band's column lit. Nothing here is enforced. |
| guidance rows | Score modifier ± / Regain / Sabotage / Future impact — running column: {n} staged / a note, now |
| tracks fieldset | Tracks |
| regain fieldset | Regain — to {actor name} (out-of-faction cards count 2 in the guidance) / Card… / Add |
| sabotage fieldset | Sabotage / Card… / discard — recoverable / destroy — gone for good / Add |
| chips | {card} ({owner code}) / {card} — with {holder code} / {card} · {mode} |
| apply button | Apply effects |
| narration | Narration / Save narration |
| close/skip | Close the action / Skip |

### cm-hand
| Ref | Text |
|---|---|
| sections | In hand {n} / Out on loan {n} / Discard pile {n} / Destroyed {n} |
| empty states | nothing in hand / nothing spent |
| loan badge | on loan from {owner name} |
| loan line | {card} — with {holder name} |
| actions | Hand to… / Discard / Reclaim / Recover / Regain *(NPC hands only — the umpire's restore)* |
| thumb aria | Look at {card type name} |
| destroyed line | {card names} — out of the game, never recoverable. |

### cm-card-viewer
| Ref | Text |
|---|---|
| close aria | Close *(button glyph ×)* |
| caption | {type name} {flavour — gamespec-owned} |

### cm-role-card
| Ref | Text |
|---|---|
| caption | {role name} · {faction name} · initiative {a, b, c, d} |
| flip button | Read the back / Show the front |
| back alt suffix | {role name} — private side |
| back headings | Who you are / Your personal goal / {faction name}'s goals |

### cm-opportunity-card
| Ref | Text |
|---|---|
| lede | An opportunity for {faction name} — talk it over, then vote. Every claimed seat agreeing is consensus. |
| votes line | Votes: {name} — {A/B}; … **Consensus on {A/B}.** / No consensus yet. |

### cm-turn-update
| Ref | Text |
|---|---|
| begin | Begin the end-of-turn update / Computes the printed checklist from the boards as they stand — run it once the last spotlight has closed. |
| heading | Turn {n} update — finished |
| qualitative step | {track name} — {printed sentence — gamespec-derived, transcribed} |
| war step | War Progress {from} → {to} ({±n}) {clamp sentences below} |
| war clamps | Earth trade route below 4 — war progress cannot end higher than it started / Mars trade route below 4 — war progress cannot end lower than it started |
| opportunity step | Opportunity for {faction/NPC name} — {triggerId} — {note}. Compose it on the Team Phase table. |
| otherwise step | No clear lead — {triggerId}: the print says {otherwise text — gamespec-owned}. |
| tithe step | The tithe is short — {paid} of {owed} paid, refused outright. {printed consequences, transcribed} |
| surrender step | Earth/Mars has hit the surrender boundary. The ending is yours to narrate — call time when it is told. |
| step controls | Confirm {±n} / Override / +/- placeholder |
| answered | {confirmed/overridden} ({±n}) |
| so-far line | So far: {track/kind} {±n or "noted"}; … |
| finish | Finish the update |

### cm-epilogue
| Ref | Text |
|---|---|
| war heading | The war |
| war standing | The war never began. / The front ended at {location name}, at {n}. |
| boards heading | The boards, as they closed |
| goals heading | How everyone did |
| goals note | The printed evidence for each goal, read off the final boards. The verdicts are the room's, not the app's. |
| evidence phrasing | war outcome: never fought / Earth surrendered / Mars surrendered / unresolved · War Progress {n} · {track name} {n} |
| judged tag | judged at the table |
| personals heading | Personal reckonings |
| ledger heading | What the umpire changed {n} |
| ledger empty | Nothing. The whole game happened through the rules. |
| notes heading | Your notes / For the debrief, in your own words. Saved into the game. / Save notes |

### cm-ballot *(dormant — no votes exist in this game's state; kept from RBO)*
| Ref | Text |
|---|---|
| head | The crown of {crown}, put by {name}. |
| outcome | {name} is king. / Nobody carried it. The crown stays unworn. |
| status | {n} still to speak / counting — you have {n} vote(s) / you have no vote in this. |
| compelled | Your liege stands. You are sworn to vote for them. |
| voted | You voted for {name}. |

## 7. Replay page (replay.html + gui/client/replay-app.js)

| Ref | Text |
|---|---|
| open h1 | Watch a game back |
| open lede | A save is the seed and every action taken, so the whole evening is still in it. Open one and walk it. |
| resume h2 | Games on this machine |
| import h2 / note | Or open a saved game / The file a facilitator downloaded. It opens on any machine — nothing here needs the game, or the host, to still exist. |
| replay h1 | Game {CODE} |
| controls aria | Back to the start / Back ten actions / Back one action / How far through the game / On one action / On ten actions / On to the end |
| open-another button | Open another game |
| history h2 / note | What happened / Click any action to stand just after it. |
| actions h2 / note | The actions / Every spotlight up to the cursor, as it was told. |
| roles h2 / note | Who was playing / Open anybody's own sheet, as it stood wherever the cursor is. |
| position line | Before anything happened — {n} action(s) to come / After {n} of {m} actions |
| replay warning | {n} recorded action(s) could not be replayed and had no effect: {labels}. |
| history row | {seq} {verb label} {who} / facilitator override / {refusal reason} |
| who fallback | a facilitator / {seatId} |
| action row | #{seq} {actor} — {map} · {status} · {band} |
| actions empty | Nothing has been called yet. |
| role sheet empty | no cards |
| resume row | {CODE} — {n} action(s), saved {time} |

## 8. Refusal messages (what a player sees when a button says no)

### The gate (gui/rules/admission.js)
| Verb | Text |
|---|---|
| any unknown | unknown command '{verb}' |
| facilitator-only | only a facilitator may do that |
| out of play | the game has not begun yet / the game is over |
| wrong phase | that belongs to the {phase} phase, and this is the {phase} phase |
| roleless | claim a role first |
| absent role | no such role in this game |
| dead role *(future-proofing)* | that character is dead |
| unjudgeable probe | cannot tell from here |

### The chair (lobby.js)
| Verb | Text |
|---|---|
| claim-role | no such role in this game / {name} is played by the facilitator / {name} is already being played |

### Cards (cards.js)
| Verb | Text |
|---|---|
| hand-card | no such card in this game / you are not holding that card / that card has been spent / nobody by that code is in this game / it is already in your hand |
| reclaim-card | no such card in this game / that card is not yours to reclaim / it is already in your hand / it has been spent — reclaim reaches held cards only |
| discard-card | no such card in this game / you are not holding that card / it is already in the discard |

### Team Phase (team.js)
| Verb | Text |
|---|---|
| facilitator:publish-correspondence | no such turn / that correspondence has already been dealt with |
| shared effects check | effects must be a list / war progress is set to a whole non-negative value / war progress moves by whole points / the war has not begun — set war progress first / war progress cannot go below zero / no track called '{track}' / track movement is whole points / {track} would go negative |
| facilitator:deliver-opportunity | aim it at exactly one faction, or one NPC lanyard / no such faction / no such NPC lanyard / write the {title/option A/option B} |
| choose-opportunity | no such opportunity / that opportunity is settled / choose option A or B / this opportunity is not your faction's |
| facilitator:resolve-opportunity | no such opportunity / already resolved |
| pay-tithe | the tithe is the Belt Union's to pay / this turn's tithe was refused — talk to the facilitator / pay at least one card / the same card twice is one card / no such card in this game / pay from cards in your own hand |
| facilitator:mark-tithe-refused | already recorded |

### Negotiation Phase (negotiation.js)
| Verb | Text |
|---|---|
| place-action-card | {name} has no action card / no such map / your action has already been resolved this turn |
| recover-discard | no such card in this game / only your own discard comes back / that card was destroyed — it is out of the game / that card is not in the discard / you have already recovered a card this phase |

### Action Phase (actions.js)
| Verb | Text |
|---|---|
| facilitator:call-next | the Action Phase has not begun / an action is already open on this map — close or skip it first / this map's queue is done |
| facilitator:assign-action-card | {name} has no action card / their action is already spent this turn / no such map / they have already been called this turn / their spotlight is open right now |
| declare-action | no such action / this is not your spotlight / the facilitator has started ruling — talk to them / you cannot be your own ally / {name} cannot be an ally / {name} has no action card / {name} is not at this map — allies act where their card sits / {name} has already acted this turn / {name} has already been called / no such card in this game / a spent card cannot be offered / offer only cards you or a named ally are holding / that is more than {n} cards — the limit is three, plus one per ally |
| confirm-ally | no such action / that action is over / you have not been asked / your action card is not at this map — allies act where their card sits / your action is already spent this turn / you have already been called this turn |
| decline-ally | no such action / that action is over / you have not been asked |
| facilitator:rule-resources | no such action / the die is already cast — the ruling stands / rule every offered card, once — accepted and vetoed must cover the offer / each committed card must come from a different faction / that is more than {n} cards — the limit is three, plus one per ally |
| facilitator:set-difficulty | no such action / the die is already cast — difficulty is set before it / difficulty runs from 0 to −3 |
| facilitator:roll-consequence | no such action / the die is already cast / that action is over / rule on the offered cards first |
| facilitator:apply-effects | no such action / roll the consequence die first / no track called '{track}' / track movement is whole points / {track} would go negative — it is {n} before this action / no such card to regain / that card was destroyed — it is out of the game / only a discarded card can be regained / no such card to sabotage / only a held card can be sabotaged / that card is committed to this very action / sabotage discards, or destroys — say which |
| facilitator:set-bonus | no such action / that action is over / a bonus is whole points |
| facilitator:narrate | no such action / that action is over |
| facilitator:close-action | no such action / roll the consequence die before closing / only {n} allies confirmed — re-rule the resources down to {m} cards / an accepted card left the table — re-rule the resources |
| facilitator:skip-action | the Action Phase has not begun / nobody to skip on this map |
| facilitator:claim-lane | no such lane / a name, or null to release |

### The umpire's own (facilitator.js)
| Verb | Text |
|---|---|
| facilitator:advance-phase | the game is over |
| facilitator:pause-clock / extend-clock | there is no clock running / say how many minutes |
| facilitator:end-game | the game is already over |
| facilitator:adjust | an adjustment needs a path / say how much to change it by / no such value / that is not a number / would go negative — it is {n} right now |
| facilitator:note | no such character / write the note |

### End of turn (turn-update.js)
| Verb | Text |
|---|---|
| facilitator:begin-turn-update | the turn update belongs at the end of an Action Phase / this turn's update has already begun |
| facilitator:confirm/override-update-step | no such step on the worksheet / that step is already answered / nothing to override — confirm it / movement is whole points / {track} would go negative / that track is gone / the war is no longer running / war progress cannot go below zero |
| facilitator:finish-turn-update | no update has begun / already finished |

### Verb labels and notes (buttons the action list prints)
| Verb | Label — note |
|---|---|
| claim-role | Take a lanyard |
| hand-card | Hand a card to somebody — A loan, not a gift — the owner can always take it back. |
| reclaim-card | Take a loaned card back — Yours until it is spent, wherever it is. |
| discard-card | Discard a card — Spent cards go to their owner's discard pile until recovered. |
| pay-tithe | Pay the tithe — The Belt Union owes the U.N. Ambassador — 1, 1, 2, 2 cards by turn. |
| choose-opportunity | Vote on your faction's opportunity |
| place-action-card | Place your action card — Mandatory. On a map, not a place — you say where the story goes when you are called. |
| recover-discard | Recover a discarded card — One per Negotiation Phase, from your own pile. |
| declare-action | Declare your action |
| confirm-ally / decline-ally | Join as an ally / Decline to ally |
| chooser fields | Which card / To whom / Which map / Which cards / Which card — with {holder} |
| chooser buttons (action-chooser.js) | Do it / Cancel / nothing available |
| action list heading (cm-action-list) | Not right now |
| action list empty | The game has not begun. Take a lanyard and wait to be called on. / Time has been called. Nothing more can be played. / Nothing to do in the {phase} phase — this one is for talking. |

## 9. Network and persistence (seen in the connection dot, log, or dialogs)

| Ref | Text |
|---|---|
| host-peer rejections | no token / that facilitator PIN is not right / this game is full / identify first |
| host-peer log (host console) | PeerJS did not load — {detail} *(and connection status lines)* |
| event pump log | [events] streaming to {url} / [events] connected to {url} / [events] sink unreachable — {why} / [events] dropped a batch: {error} / [events] the pump threw and was ignored: {error} |
| co session log | [co] not connected — that did not go anywhere / [co] {takeover refusal} |
| parseSave reasons | that file is not readable as a save / that file is not a save / that save has no join code / that save has no seed / that save has no history |
| save filename | mars-{CODE}-t{nn}-{phase}.json |
| debrief page title/footer (persistence.epiloguePage) | Crisis Mars — {CODE} |

---

## Addendum, 2026-08-10 — the tabbed host console

### Tab strip (host.html + gui/host/host-app.js)
| Ref | Text |
|---|---|
| tablist aria-label | Console tabs |
| map tab labels | *(the printed map names — gamespec-owned, from maps.json)* |
| static tab labels | Roles / NPCs / Game |

### cm-board-overlay
| Ref | Text |
|---|---|
| board image alt | {map name} board |
| chip aria | {track name}: {n} — click to edit |
| edit input aria | New value for {track name} |
| commit / cancel | ✓ *(aria: Commit)* / ✕ *(aria: Cancel)* |
| war marker chip aria | War Progress: {n} — click to edit |
| war marker clear | clear *(aria: Clear — the war has not begun)* |

### Roles tab (host.html + cm-roles-panel)
| Ref | Text |
|---|---|
| panel h2 / note | The lanyards / Who is wearing what. Open a row to manage that player's cards — every move lands on the override ledger — or to place their action card for them. |
| claim column | {seat name} / {seat name} — away / unclaimed |
| give fieldset | Give them a card / Card… / Add to hand |
| give picker labels | {card} — discard ({owner}'s) / {card} — with {holder} |
| take fieldset | Take one away / Card… / To the discard / Back to its owner |
| take picker label | {card} — {owner}'s loan |
| action card fieldset | Action card / Placed on {map name}. / Not placed. / {map name} buttons |
| notes fieldset | Your notes {n} / Nothing written against them. / note input placeholder: Prepare for the future… / Note it |

### NPCs tab (host.html + host-app renderNpcBriefs)
| Ref | Text |
|---|---|
| panel h2 / note | Your lanyards / The Ambassador and the Speaker are yours to roleplay. Their cards move through the same verbs the players use; every pass lands in the log like everything else. |
| column headings | The tithe / Hand |
| play notes fold | Play notes *(note text is facilitator-file data — gamespec-owned)* |
| npc name/description | *(gamespec-owned, from factions.json)* |

### New refusals (facilitator:move-card, gui/rules/commands/cards.js)
| Verb | Text |
|---|---|
| facilitator:move-card | no such card in this game / that card was destroyed — it is out of the game / it is already in the discard / nobody by that code is in this game / it is already in that hand |

---

## Deliberately left out

- **Everything in `data/*.json`** — names, briefs, goals, flavour, the
  correspondence script, opportunity menus, aftermath tables. Gamespec-owned;
  edit the authored modules and re-export.
- **Two transcriptions of gamespec text inside the rules** (they must track
  the gamespec, not this file): the tithe schedule note in
  `gui/rules/commands/team.js` and the tithe-consequence quote in
  `gui/rules/turn-update.js`.
- **README.md, AGENTS.md, CONTEXT.md, DECISIONS.md, gaps.js prose** — docs,
  reviewed as docs.
- **Code comments, commit messages, test names and test strings.**
- **Console/log lines never surfaced in the UI** (wire validation errors,
  dev-facing throws).
- **CSS-only content** (`::after` markers listed where they carry meaning).

## Addendum — stale-version guard (2026-08-10)

| Ref | Text |
|---|---|
| all pages `#stale-banner` | This page loaded only part of a freshly published version. |
| all pages `#stale-reload` | Reload |
| cm-connection-dot `idle` | No game yet |
