#!/usr/bin/env node
/**
 * tools/validate-data.mjs — structural gate over `data/` and the card art.
 *
 * `data/` is exported from the crisis_mars gamespec, so it is checked against
 * numbers the published game states independently: six factions of three
 * roles, eighteen lanyards, 108 resource cards of 24 types, five cards per
 * player and nine per NPC, four turns of three phases.
 *
 * The strongest checks here are not counts but cross-references. The roles
 * file and the resources file each say whose cards are whose, the factions
 * file says which roles it owns, and the scaling table deals rosters out of
 * the same codes — all exported separately, so the places they must agree are
 * the places a transcription slip would show.
 *
 * Run directly (`npm run data:validate`) or import `validateData` from a
 * test, so a failure names the offending card rather than just returning a
 * nonzero exit code.
 */

import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { KNOWN_GAPS } from '../gui/rules/gaps.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(HERE, '..', 'data');
export const CARDS_DIR = join(HERE, '..', 'assets', 'cards');

/** Published values, transcribed from the printed game. */
export const CHECKSUMS = {
  factions: 6,
  goalsPerFaction: 4,
  roles: 18,
  npcs: ['N1', 'N2'],
  cardsPerPlayer: 5,
  cardsPerNpc: 9,
  resourceTypes: 24,
  resourceCards: 108,
  turns: 4,
  phases: 3,
  spotlightSeconds: 60,
  maps: 3,
  tracks: 20,           // 19 with a printed initial value, plus War Progress
  effectBands: 6,
  rosterCounts: { min: 8, max: 18 },
};

/** Every file the exporter writes, all required, all marked generated. */
const FILES = ['factions', 'roles', 'resources', 'maps', 'meta', 'scaling',
  'events', 'aftermath'];

export async function dataExists() {
  try {
    await access(join(DATA_DIR, 'factions.json'));
    return true;
  } catch {
    return false;
  }
}

const load = async (name) => JSON.parse(await readFile(join(DATA_DIR, `${name}.json`), 'utf8'));

const artExists = async (name) => {
  try {
    await access(join(CARDS_DIR, name));
    return true;
  } catch {
    return false;
  }
};

/** @returns {Promise<string[]>} findings; empty means the dataset is sound. */
export async function validateData() {
  const findings = [];
  const fail = (msg) => findings.push(msg);

  // --- every file exists and says where it came from -------------------------
  const loaded = {};
  for (const name of FILES) {
    try {
      loaded[name] = await load(name);
    } catch (error) {
      fail(`${name}.json: could not load (${error.message})`);
      continue;
    }
    if (typeof loaded[name]._generated !== 'string' || !loaded[name]._generated) {
      fail(`${name}.json: no _generated provenance line`);
    }
    if (loaded[name]._doNotEdit !== true) fail(`${name}.json: not marked _doNotEdit`);
  }
  if (findings.length) return findings;   // nothing below survives a missing file

  const { factions, npcs } = loaded.factions;
  const { roles } = loaded.roles;
  const { types, cards } = loaded.resources;
  const { maps, tracks, warProgress } = loaded.maps;
  const meta = loaded.meta;
  const rosterAt = loaded.scaling.rosterAt;

  // --- factions --------------------------------------------------------------
  const factionIds = Object.keys(factions);
  if (factionIds.length !== CHECKSUMS.factions) {
    fail(`expected ${CHECKSUMS.factions} factions, found ${factionIds.length}`);
  }
  for (const [id, faction] of Object.entries(factions)) {
    if ((faction.goals ?? []).length !== CHECKSUMS.goalsPerFaction) {
      fail(`${id}: expected ${CHECKSUMS.goalsPerFaction} goals, found ${faction.goals?.length ?? 0}`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(faction.colour ?? '')) {
      fail(`${id}: colour '${faction.colour}' is not #rrggbb`);
    }
  }
  for (const code of CHECKSUMS.npcs) {
    const npc = npcs?.[code];
    if (!npc) { fail(`npcs: ${code} missing`); continue; }
    if ((npc.handCardIds ?? []).length !== CHECKSUMS.cardsPerNpc) {
      fail(`${code}: expected ${CHECKSUMS.cardsPerNpc} hand cards, found ${npc.handCardIds?.length ?? 0}`);
    }
  }

  // --- roles -----------------------------------------------------------------
  const codes = Object.keys(roles);
  if (codes.length !== CHECKSUMS.roles) {
    fail(`expected ${CHECKSUMS.roles} roles, found ${codes.length}`);
  }
  for (const [code, role] of Object.entries(roles)) {
    if (!factions[role.factionId]) fail(`${code}: faction '${role.factionId}' is not a faction`);
    if ((role.initiative ?? []).length !== CHECKSUMS.turns) {
      fail(`${code}: initiative has ${role.initiative?.length ?? 0} entries, expected ${CHECKSUMS.turns}`);
    }
    if ((role.handCardIds ?? []).length !== CHECKSUMS.cardsPerPlayer) {
      fail(`${code}: expected ${CHECKSUMS.cardsPerPlayer} hand cards, found ${role.handCardIds?.length ?? 0}`);
    }
  }
  // The factions' own role lists and the roles' faction ids are two
  // transcriptions of one table, so they must agree in both directions.
  for (const [id, faction] of Object.entries(factions)) {
    for (const code of faction.roleIds ?? []) {
      if (roles[code]?.factionId !== id) {
        fail(`${id} lists ${code}, but ${code} says it belongs to '${roles[code]?.factionId}'`);
      }
    }
  }

  // Initiative is a pre-rolled call order: each turn's column must be a
  // permutation of 1..18, or two players get called at once and one never.
  for (let turn = 0; turn < CHECKSUMS.turns; turn += 1) {
    const column = codes.map((code) => roles[code].initiative?.[turn]).sort((a, b) => a - b);
    const wanted = Array.from({ length: CHECKSUMS.roles }, (_, i) => i + 1);
    if (JSON.stringify(column) !== JSON.stringify(wanted)) {
      fail(`initiative turn ${turn + 1}: not a permutation of 1..${CHECKSUMS.roles} (${column.join(',')})`);
    }
  }

  // --- resources -------------------------------------------------------------
  if (Object.keys(types).length !== CHECKSUMS.resourceTypes) {
    fail(`expected ${CHECKSUMS.resourceTypes} resource types, found ${Object.keys(types).length}`);
  }
  const cardIds = Object.keys(cards);
  if (cardIds.length !== CHECKSUMS.resourceCards) {
    fail(`expected ${CHECKSUMS.resourceCards} resource cards, found ${cardIds.length}`);
  }
  const perOwner = {};
  for (const [cardId, card] of Object.entries(cards)) {
    if (!types[card.type]) fail(`${cardId}: type '${card.type}' is not a resource type`);
    perOwner[card.ownerCode] = (perOwner[card.ownerCode] ?? 0) + 1;
  }
  for (const code of codes) {
    if ((perOwner[code] ?? 0) !== CHECKSUMS.cardsPerPlayer) {
      fail(`${code}: owns ${perOwner[code] ?? 0} cards, expected ${CHECKSUMS.cardsPerPlayer}`);
    }
  }
  for (const code of CHECKSUMS.npcs) {
    if ((perOwner[code] ?? 0) !== CHECKSUMS.cardsPerNpc) {
      fail(`${code}: owns ${perOwner[code] ?? 0} cards, expected ${CHECKSUMS.cardsPerNpc}`);
    }
  }
  // The roles' hand lists and the cards' owner codes are two transcriptions
  // of the same deal.
  for (const [code, role] of Object.entries(roles)) {
    for (const cardId of role.handCardIds ?? []) {
      if (cards[cardId]?.ownerCode !== code) {
        fail(`${code} lists ${cardId}, but that card says its owner is '${cards[cardId]?.ownerCode}'`);
      }
    }
  }

  // --- maps ------------------------------------------------------------------
  if (Object.keys(maps).length !== CHECKSUMS.maps) {
    fail(`expected ${CHECKSUMS.maps} maps, found ${Object.keys(maps).length}`);
  }
  if (Object.keys(tracks).length !== CHECKSUMS.tracks) {
    fail(`expected ${CHECKSUMS.tracks} tracks, found ${Object.keys(tracks).length}`);
  }
  for (const [trackId, track] of Object.entries(tracks)) {
    if (trackId === 'war_progress') continue;   // no map and no value until activated
    if (!maps[track.map]) fail(`${trackId}: map '${track.map}' is not a map`);
    if (!Number.isInteger(track.initial)) fail(`${trackId}: initial '${track.initial}' is not an integer`);
    if (!maps[track.map]?.trackIds?.includes(trackId)) {
      fail(`${trackId}: not listed on its own map '${track.map}'`);
    }
  }
  if (!tracks.war_progress) fail('war_progress track missing');
  else if (tracks.war_progress.map !== null || tracks.war_progress.initial !== null) {
    fail('war_progress: expected no map and no initial value until the correspondence activates it');
  }

  // The marker's route: bands must tile 0..20+ with no gap and no overlap,
  // or a value would exist with no location to stand the marker on.
  const bands = warProgress?.locationBands ?? [];
  let expectedLow = 0;
  for (const band of bands) {
    const [low, high] = band.range;
    if (low !== expectedLow) fail(`warProgress band at ${low}: expected to start at ${expectedLow}`);
    if (!maps.earth_map.locations.concat(maps.mars_map.locations, maps.belt_map.locations)
      .some((l) => l.id === band.location)) {
      fail(`warProgress band at ${low}: location '${band.location}' is not on any map`);
    }
    if (high === null) { expectedLow = null; break; }
    expectedLow = high + 1;
  }
  if (expectedLow !== null) fail('warProgress bands: the route does not end in an open band');
  const last = bands[bands.length - 1];
  if (last && last.range[0] < 20) fail('warProgress bands: the open band should begin at 20 or more');

  // --- meta ------------------------------------------------------------------
  if (Number(meta.turns) !== CHECKSUMS.turns) {
    fail(`meta: ${meta.turns} turns, the printed game has ${CHECKSUMS.turns}`);
  }
  if ((meta.phases ?? []).length !== CHECKSUMS.phases) {
    fail(`meta: ${meta.phases?.length ?? 0} phases, the printed turn has ${CHECKSUMS.phases}`);
  }
  if (Number(meta.spotlightSeconds) !== CHECKSUMS.spotlightSeconds) {
    fail(`meta: spotlightSeconds is ${meta.spotlightSeconds}, the print says ${CHECKSUMS.spotlightSeconds}`);
  }

  // Impact bands must tile ≤1 up to 10+, or an Impact total would fall
  // between two labels.
  const impactBands = meta.impact?.bands ?? [];
  let expectedMin = null;   // the first band is an open "anything up to max"
  for (const band of impactBands) {
    if (expectedMin === null) {
      if (band.min !== undefined && band.min !== null) fail(`impact band '${band.label}': the first band should be open below`);
    } else if (band.min !== expectedMin) {
      fail(`impact band '${band.label}': starts at ${band.min}, expected ${expectedMin}`);
    }
    expectedMin = band.max === null ? null : band.max + 1;
    if (band.max === null && band.min < 10) {
      fail(`impact band '${band.label}': the open top band should begin at 10 or more`);
    }
  }
  if (expectedMin !== null) fail('impact bands: the ladder does not end in an open band');

  for (const [name, table] of Object.entries(meta.effects ?? {})) {
    if ((table.by_band ?? []).length !== CHECKSUMS.effectBands) {
      fail(`effect table '${name}': ${table.by_band?.length ?? 0} entries, expected ${CHECKSUMS.effectBands}`);
    }
  }

  // --- scaling ---------------------------------------------------------------
  const counts = Object.keys(rosterAt).map(Number).sort((a, b) => a - b);
  const { min, max } = CHECKSUMS.rosterCounts;
  const wantedCounts = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  if (JSON.stringify(counts) !== JSON.stringify(wantedCounts)) {
    fail(`scaling: rosterAt covers ${counts.join(',')}, expected ${min}..${max}`);
  }
  for (const [count, roster] of Object.entries(rosterAt)) {
    if (new Set(roster).size !== roster.length) fail(`rosterAt[${count}]: duplicate codes`);
    if (roster.length !== Number(count)) {
      fail(`rosterAt[${count}]: ${roster.length} codes, expected ${count}`);
    }
    for (const code of roster) {
      if (!roles[code]) fail(`rosterAt[${count}]: '${code}' is not a role`);
    }
  }

  // --- events, cross-checked against the rules' one transcription -------------
  // The tithe schedule is duplicated into gui/rules/commands/team.js because
  // player consoles admit payments without ever fetching the facilitator
  // file. This is where that duplication would be caught drifting.
  const events = loaded.events;
  const transcribed = { 1: 1, 2: 1, 3: 2, 4: 2 };
  for (const [turn, amount] of Object.entries(transcribed)) {
    if (Number(events.tithe?.amountByTurn?.[turn]) !== amount) {
      fail(`events tithe turn ${turn}: ${events.tithe?.amountByTurn?.[turn]}, rules transcribe ${amount}`);
    }
  }
  if (events.tithe?.from !== 'belt_union') {
    fail(`events tithe from '${events.tithe?.from}', rules transcribe belt_union`);
  }
  const correspondenceTurns = (events.correspondence ?? []).map((c) => c.turn).sort();
  const allTurns = Array.from({ length: CHECKSUMS.turns }, (_, i) => i + 1);
  if (JSON.stringify(correspondenceTurns) !== JSON.stringify(allTurns)) {
    fail(`events correspondence covers turns ${correspondenceTurns.join(',')}, expected ${allTurns.join(',')}`);
  }

  // --- the art ---------------------------------------------------------------
  // Every card the data deals must have a face to draw, by the naming
  // convention the installer uses. A card with no art is a blank rectangle in
  // front of a player, found here rather than at the table.
  for (const cardId of cardIds) {
    if (!(await artExists(`${cardId}.png`))) fail(`assets/cards/${cardId}.png missing`);
  }
  for (const code of codes) {
    const lower = code.toLowerCase();
    if (!(await artExists(`action_card_${lower}.png`))) {
      fail(`assets/cards/action_card_${lower}.png missing`);
    }
  }
  for (const code of [...codes, ...CHECKSUMS.npcs]) {
    const lower = code.toLowerCase();
    for (const side of ['front', 'back']) {
      if (!(await artExists(`lanyard_role_${lower}-${side}.png`))) {
        fail(`assets/cards/lanyard_role_${lower}-${side}.png missing`);
      }
    }
  }

  return findings;
}

async function main() {
  if (!(await dataExists())) {
    console.log('data/ has not been generated yet — nothing to validate.');
    console.log('It is exported from the crisis_mars gamespec; see AGENTS.md.');
    return 0;
  }
  const findings = await validateData();
  // Not findings. Places the printed rules say nothing and the app had to
  // decide, listed so a facilitator can see what was decided for them.
  for (const gap of KNOWN_GAPS) console.log(`rules gap — ${gap.about}: ${gap.ruling}`);
  if (findings.length === 0) {
    console.log('data/ is sound.');
    return 0;
  }
  for (const f of findings) console.error(`  ${f}`);
  console.error(`\n${findings.length} finding(s) in data/.`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(await main());
}
