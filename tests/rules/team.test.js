import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadData } from '../helpers/load-data.js';
import { createInitialState } from '../../gui/rules/state.js';
import { apply, replay } from '../../gui/rules/reducer.js';
import { admit } from '../../gui/rules/admission.js';
import { toSave } from '../../gui/rules/command-log.js';
import { projectView, unclassifiedPaths } from '../../gui/rules/views.js';
import { titheOwed } from '../../gui/rules/commands.js';
import { opportunityConsensus } from '../../gui/rules/derive.js';

const data = await loadData();
// The facilitator file, loaded the way only the host page ever does — the
// tests read it to drive the same payloads the host console would submit.
const events = JSON.parse(await readFile(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'events.json'), 'utf8'));

const FACILITATOR = { seatId: 's9', kind: 'facilitator', roleId: null };
const asPlayer = (code) => ({ seatId: `s-${code}`, kind: 'player', roleId: code });

function run(state, script) {
  return script.reduce((at, [actor, verb, payload]) => {
    const result = apply(at, data, { verb, payload }, actor, { ts: 9000 + at.log.length });
    if (!result.ok) throw new Error(`${verb} refused: ${result.reason}`);
    return result.state;
  }, state);
}

/** A full-roster game advanced into a given turn's Team Phase. */
function teamPhase(turn = 1) {
  let state = createInitialState({ joinCode: 'TESTING', seed: 42, data });
  state.seats.s9 = { id: 's9', token: 'f', name: 'F', roleId: null, kind: 'facilitator', connected: true, lastSeen: 0 };
  state = run(state, [[FACILITATOR, 'facilitator:advance-phase', {}]]);
  while (state.phase.turn < turn) {
    state = run(state, [
      [FACILITATOR, 'facilitator:advance-phase', {}],   // negotiation
      [FACILITATOR, 'facilitator:advance-phase', {}],   // action
      [FACILITATOR, 'facilitator:advance-phase', {}],   // next team
    ]);
  }
  return state;
}

describe('the war correspondence', () => {
  const t2 = events.correspondence.find((c) => c.turn === 2);

  it('publishes turn two exactly as the script prints it, replay-stable', () => {
    // The load-bearing vector: war progress set to 11, +6 to the Earth
    // military, −4 to UN shipping — the effects travelling in the payload
    // the host console builds from events.json.
    let state = teamPhase(2);
    state = run(state, [[FACILITATOR, 'facilitator:publish-correspondence',
      { turn: 2, effects: t2.effects.map((e) => ({ track: e.track, ...e })) }]]);

    expect(state.correspondence.t2).toBe('published');
    expect(state.warProgress).toBe(11);
    expect(state.maps.earth_map.tracks.earth_gov_military).toBe(4 + 6);
    expect(state.maps.belt_map.tracks.shipping_control_un).toBe(12 - 4);

    // And the whole thing rebuilds from the log with no facilitator file
    // in sight — the reducer only ever saw the payload.
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    expect(rebuilt.warProgress).toBe(11);
    expect(rebuilt.correspondence).toEqual(state.correspondence);
    expect(rebuilt.maps).toEqual(state.maps);
  });

  it('lands the read-aloud words on the public feed when it publishes', () => {
    // The rules never read the facilitator file: the text travels in the
    // payload, exactly as the host console submits it, and every seat —
    // spectators included — can read the feed.
    let state = teamPhase(2);
    state = run(state, [[FACILITATOR, 'facilitator:publish-correspondence',
      { turn: 2, effects: [], text: t2.readAloud }]]);
    expect(state.news).toHaveLength(1);
    expect(state.news[0]).toMatchObject({ turn: 2, kind: 'correspondence' });
    expect(state.news[0].text).toContain('declares war');

    const spectator = projectView(state, data,
      { kind: 'spectator', roleId: null, teamId: null });
    expect(spectator.news[0].text).toContain('declares war');

    // A skip publishes nothing to read.
    let skipped = teamPhase(3);
    skipped = run(skipped, [[FACILITATOR, 'facilitator:publish-correspondence',
      { turn: 3, skip: true }]]);
    expect(skipped.news).toEqual([]);
  });

  it('lets Control post the news directly, replayably', () => {
    let state = teamPhase(1);
    state = run(state, [
      [FACILITATOR, 'facilitator:post-news', { text: 'The docks are burning.' }],
      [FACILITATOR, 'facilitator:post-news', { text: '  A correction: one dock.  ' }],
    ]);
    expect(state.news.map((entry) => entry.text))
      .toEqual(['The docks are burning.', 'A correction: one dock.']);
    expect(state.news[0]).toMatchObject({ turn: 1, kind: 'posted' });
    expect(admit(state, data, {
      verb: 'facilitator:post-news', payload: { text: '   ' },
    }, FACILITATOR).reason).toContain('write the news');
    const { state: rebuilt, refused } = replay(toSave(state), data);
    expect(refused).toEqual([]);
    expect(rebuilt.news).toEqual(state.news);
  });

  it('refuses publishing the same turn twice', () => {
    let state = teamPhase(1);
    state = run(state, [[FACILITATOR, 'facilitator:publish-correspondence',
      { turn: 1, effects: [] }]]);
    expect(admit(state, data, {
      verb: 'facilitator:publish-correspondence', payload: { turn: 1, effects: [] },
    }, FACILITATOR).reason).toContain('already been dealt with');
  });

  it('skips the optional turn without touching a track', () => {
    let state = teamPhase(3);
    const before = structuredClone(state.maps);
    state = run(state, [[FACILITATOR, 'facilitator:publish-correspondence',
      { turn: 3, skip: true }]]);
    expect(state.correspondence.t3).toBe('skipped');
    expect(state.maps).toEqual(before);
  });

  it('refuses an effect the boards cannot take', () => {
    const state = teamPhase(1);
    expect(admit(state, data, {
      verb: 'facilitator:publish-correspondence',
      payload: { turn: 1, effects: [{ track: 'senate_military', delta: -1 }] },
    }, FACILITATOR).reason).toContain('negative');
    expect(admit(state, data, {
      verb: 'facilitator:publish-correspondence',
      payload: { turn: 1, effects: [{ track: 'war_progress', delta: 2 }] },
    }, FACILITATOR).reason).toContain('the war has not begun');
  });
});

describe('opportunities', () => {
  const delivered = () => run(teamPhase(1), [[FACILITATOR, 'facilitator:deliver-opportunity', {
    triggerId: 'war_support_low',
    factionId: 'viva_mars',
    title: 'SECRET::opportunity.title',
    optionA: 'Strike now',
    optionB: 'Recruit deserters',
  }]]);

  it('reaches the faction it names, and nobody else\'s players', () => {
    // The load-bearing redaction: the first TEAM-audience state. A Viva
    // player sees the record; a Canopy player's projection has no trace of
    // it; the facilitator holds everything.
    const state = delivered();
    const viva = projectView(state, data,
      { kind: 'player', roleId: 'V1', teamId: 'viva_mars' });
    expect(viva.opportunities.o1.title).toBe('SECRET::opportunity.title');

    for (const [name, viewer] of [
      ['canopy', { kind: 'player', roleId: 'C1', teamId: 'canopy_corp' }],
      ['spectator', { kind: 'spectator', roleId: null, teamId: null }],
    ]) {
      const seen = projectView(state, data, viewer);
      expect(JSON.stringify(seen), name).not.toContain('SECRET::opportunity');
      // That it exists, whose it is and where it stands is public — the
      // worksheet already says as much — so the pump can announce it.
      expect(seen.opportunities.o1, name).toMatchObject({
        id: 'o1', status: 'pending', factionId: 'viva_mars',
      });
      expect(seen.opportunities.o1.title, name).toBeUndefined();
      // Votes are faction content: an outsider gets none — an empty object
      // survives the walk when nothing has been cast, and vanishes once
      // anything has, either way carrying no entries.
      expect(Object.keys(seen.opportunities.o1.votes ?? {}), name).toHaveLength(0);
    }
    expect(JSON.stringify(projectView(state, data, { kind: 'facilitator' })))
      .toContain('SECRET::opportunity.title');
  });

  it('keeps an NPC-targeted opportunity to the facilitator alone', () => {
    const state = run(teamPhase(1), [[FACILITATOR, 'facilitator:deliver-opportunity', {
      triggerId: 'shipping_control_lead',
      npcCode: 'N1',
      title: 'SECRET::npc.opportunity',
      optionA: 'Squeeze the routes',
      optionB: 'Buy the stations',
    }]]);
    for (const viewer of [
      { kind: 'player', roleId: 'B1', teamId: 'belt_union' },
      { kind: 'player', roleId: 'V1', teamId: 'viva_mars' },
      { kind: 'spectator', roleId: null, teamId: null },
    ]) {
      const seen = projectView(state, data, viewer);
      expect(JSON.stringify(seen)).not.toContain('SECRET::npc.opportunity');
      // Existence and target are public here too; the content is not.
      expect(seen.opportunities.o1).toMatchObject({ npcCode: 'N1', status: 'pending' });
      expect(seen.opportunities.o1.optionA).toBeUndefined();
    }
    expect(JSON.stringify(projectView(state, data, { kind: 'facilitator' })))
      .toContain('SECRET::npc.opportunity');
  });

  it('collects one vote per seat, revotable, outsiders refused', () => {
    let state = delivered();
    state = run(state, [
      [asPlayer('V1'), 'choose-opportunity', { opportunityId: 'o1', choice: 'A' }],
      [asPlayer('V2'), 'choose-opportunity', { opportunityId: 'o1', choice: 'B' }],
    ]);
    expect(state.opportunities.o1.votes).toEqual({ V1: 'A', V2: 'B' });
    // A revote replaces that seat's vote and nobody else's.
    state = run(state, [[asPlayer('V2'), 'choose-opportunity',
      { opportunityId: 'o1', choice: 'A' }]]);
    expect(state.opportunities.o1.votes).toEqual({ V1: 'A', V2: 'A' });
    expect(admit(state, data, {
      verb: 'choose-opportunity', payload: { opportunityId: 'o1', choice: 'A' },
    }, asPlayer('C1')).reason).toContain('not your faction');
  });

  it('marks consensus when every CLAIMED seat agrees — empty chairs do not block', () => {
    // Three Viva lanyards exist; two are claimed. Both claimed seats voting
    // A is consensus, whatever the empty chair might have thought.
    let state = delivered();
    state.roles.V1.claimedBySeat = 's1';
    state.roles.V2.claimedBySeat = 's2';
    const record = () => state.opportunities.o1;
    expect(opportunityConsensus(state, data, record()))
      .toEqual({ claimed: ['V1', 'V2'], agreed: null });

    state = run(state, [[asPlayer('V1'), 'choose-opportunity',
      { opportunityId: 'o1', choice: 'A' }]]);
    expect(opportunityConsensus(state, data, record()).agreed).toBe(null);

    state = run(state, [[asPlayer('V2'), 'choose-opportunity',
      { opportunityId: 'o1', choice: 'A' }]]);
    expect(opportunityConsensus(state, data, record()).agreed).toBe('A');

    // A dissenting revote breaks it again; the facilitator may still
    // resolve — consensus is a readout, never a gate.
    state = run(state, [[asPlayer('V2'), 'choose-opportunity',
      { opportunityId: 'o1', choice: 'B' }]]);
    expect(opportunityConsensus(state, data, record()).agreed).toBe(null);
    expect(admit(state, data, {
      verb: 'facilitator:resolve-opportunity', payload: { opportunityId: 'o1', effects: [] },
    }, FACILITATOR).ok).toBe(true);
  });

  it('resolves once, applying its effects, and then stands settled', () => {
    let state = delivered();
    state = run(state, [
      [asPlayer('V1'), 'choose-opportunity', { opportunityId: 'o1', choice: 'A' }],
      [FACILITATOR, 'facilitator:resolve-opportunity', {
        opportunityId: 'o1',
        effects: [{ track: 'war_support', delta: -2 }],
      }],
    ]);
    expect(state.opportunities.o1.status).toBe('resolved');
    expect(state.maps.earth_map.tracks.war_support).toBe(14);
    expect(admit(state, data, {
      verb: 'facilitator:resolve-opportunity', payload: { opportunityId: 'o1', effects: [] },
    }, FACILITATOR).reason).toContain('already resolved');
    expect(admit(state, data, {
      verb: 'choose-opportunity', payload: { opportunityId: 'o1', choice: 'A' },
    }, asPlayer('V1')).reason).toContain('settled');
  });

  it('aims at exactly one target', () => {
    const state = teamPhase(1);
    for (const payload of [
      { title: 'x', optionA: 'a', optionB: 'b' },
      { factionId: 'viva_mars', npcCode: 'N1', title: 'x', optionA: 'a', optionB: 'b' },
    ]) {
      expect(admit(state, data,
        { verb: 'facilitator:deliver-opportunity', payload }, FACILITATOR).reason)
        .toContain('exactly one');
    }
  });
});

describe('the tithe', () => {
  const held = (state, code) => Object.values(state.cards)
    .filter((c) => c.holderCode === code && c.state === 'held').map((c) => c.id);

  it('takes one card in turn one, into the Ambassador\'s hand', () => {
    let state = teamPhase(1);
    const cards = held(state, 'B1');
    state = run(state, [[asPlayer('B1'), 'pay-tithe', { cardIds: [cards[0]] }]]);
    expect(state.cards[cards[0]]).toMatchObject({ holderCode: 'N1', state: 'held' });
    expect(state.tithe.paidCardIds).toEqual([cards[0]]);
  });

  it('accumulates instalments from any Belt hand until the due is met', () => {
    // Turn three owes two. B2 pays one, then B1 pays another: two
    // instalments, two payers, one faction's debt settled.
    let state = teamPhase(3);
    expect(titheOwed(3)).toBe(2);
    state = run(state, [
      [asPlayer('B2'), 'pay-tithe', { cardIds: [held(state, 'B2')[0]] }],
    ]);
    expect(state.tithe.paidCardIds).toHaveLength(1);
    state = run(state, [
      [asPlayer('B1'), 'pay-tithe', { cardIds: [held(state, 'B1')[0]] }],
    ]);
    expect(state.tithe.paidCardIds).toHaveLength(2);
    for (const cardId of state.tithe.paidCardIds) {
      expect(state.cards[cardId].holderCode).toBe('N1');
    }
    // And generosity past the due is not refused — the guide licenses
    // judgement on the amounts.
    expect(admit(state, data, {
      verb: 'pay-tithe', payload: { cardIds: [held(state, 'B2')[0]] },
    }, asPlayer('B2')).ok).toBe(true);
  });

  it('is the Belt Union\'s to pay, at least a card at a time, from your own hand', () => {
    const state = teamPhase(1);
    expect(admit(state, data, {
      verb: 'pay-tithe', payload: { cardIds: [held(state, 'C1')[0]] },
    }, asPlayer('C1')).reason).toContain('Belt Union');
    expect(admit(state, data, {
      verb: 'pay-tithe', payload: { cardIds: [held(state, 'C1')[0]] },
    }, asPlayer('B1')).reason).toContain('your own hand');
    expect(admit(state, data, {
      verb: 'pay-tithe', payload: { cardIds: [] },
    }, asPlayer('B1')).reason).toContain('at least one');
  });

  it('records a refusal, which blocks a late payment, and resets with the turn', () => {
    let state = run(teamPhase(1), [[FACILITATOR, 'facilitator:mark-tithe-refused', {}]]);
    expect(state.tithe.refused).toBe(true);
    expect(admit(state, data, {
      verb: 'pay-tithe', payload: { cardIds: [held(state, 'B1')[0]] },
    }, asPlayer('B1')).reason).toContain('refused');
    // The rollover owes afresh.
    state = run(state, [
      [FACILITATOR, 'facilitator:advance-phase', {}],
      [FACILITATOR, 'facilitator:advance-phase', {}],
      [FACILITATOR, 'facilitator:advance-phase', {}],
    ]);
    expect(state.phase.turn).toBe(2);
    expect(state.tithe).toEqual({ paidCardIds: [], refused: false });
  });
});

describe('the record', () => {
  it('classifies every path of a loaded Team Phase state', () => {
    const state = run(teamPhase(2), [
      [FACILITATOR, 'facilitator:deliver-opportunity', {
        factionId: 'unss', title: 'High alert', optionA: 'a', optionB: 'b',
      }],
      [FACILITATOR, 'facilitator:publish-correspondence', { turn: 2, effects: [] }],
    ]);
    expect(unclassifiedPaths(state)).toEqual([]);
  });
});
