/**
 * gui/host/host-app.js — the facilitator's tab, which must not be closed.
 *
 * Starts or resumes a game, holds it, and shows the three things a
 * facilitator needs in the lobby: the code to read out, the link to paste,
 * and who has turned up. The PIN is here and nowhere else — the code gets
 * shouted over voice, and without a second secret anyone holding it could
 * claim to be an umpire and edit the game.
 *
 * Everything else on this page exists because the tab can die. Autosave on
 * every change, an unconditional write when the page is hidden, and a
 * download button that is always in reach.
 *
 * The co-facilitator console — RBO's warm standby — is not wired to a screen
 * yet, but the session objects it runs on are here and tested; a later phase
 * adds the form.
 */

import { GameHost } from './game-host.js';
import {
  Persistence, saveFilename, downloadSave, downloadPage, epiloguePage, parseSave,
} from './persistence.js';
import { PrimarySession, CoFacilitatorSession } from './session.js';
import { installSessionToken } from '../net/session-token.js';
import { loadSavedName, saveName } from '../net/name-storage.js';
import { eventPumpFor } from './event-pump.js';
import { createBeeper } from '../sound.js';
import {
  mintJoinCode, mintFacilitatorPin, playerLink, normaliseJoinCode, isValidJoinCode,
} from '../net/join-code.js';
import { mintSeed } from '../rules/rng.js';
import { PHASES, OUT_OF_PLAY, NPC_CODES } from '../rules/state.js';
import { KNOWN_GAPS } from '../rules/gaps.js';
import { loadData, loadFacilitatorData } from '../client/load-data.js';
import { titheOwed } from '../rules/commands.js';
import '../components/cm-connection-dot.js';
import '../components/cm-seat-roster.js';
import '../components/cm-phase-clock.js';
import '../components/cm-state-inspector.js';
import '../components/cm-map-board.js';
import '../components/cm-war-progress.js';
import '../components/cm-hand.js';
import '../components/cm-card-viewer.js';
import '../components/cm-initiative-queue.js';
import '../components/cm-adjudication.js';
import '../components/cm-turn-update.js';
import '../components/cm-epilogue.js';

const $ = (id) => document.getElementById(id);

export async function startHostApp({ location = window.location, beeper = createBeeper() } = {}) {
  const data = await loadData();
  // The facilitator-only files — the war correspondence script, the
  // opportunity menus, the tithe notes. This page alone fetches them; the
  // player page never does. See DECISIONS.md.
  const facilitatorData = await loadFacilitatorData();
  const events = facilitatorData.events;
  const persistence = new Persistence({
    onError: () => {
      $('save-warning').hidden = false;
    },
  });

  let session = null;
  let pin = null;

  // Null unless this tab was opened with `?events=<url>`, which is the whole
  // of the integration's off-switch. Built once per tab rather than per game,
  // because it is a property of how this console was launched and not of the
  // game it happens to be running.
  const pump = eventPumpFor({ location, data, onLog: (line) => appendLog(line) });

  // Fixed for the whole game, so it is written once rather than on every
  // projection. Empty in this phase — the first real gaps arrive with the
  // Action Phase — and the panel hides itself when there is nothing to say.
  $('gaps-panel').hidden = KNOWN_GAPS.length === 0;
  $('rules-gaps').innerHTML = KNOWN_GAPS.map((gap) => `
    <dt>${gap.about} — ${gap.ruling}</dt>
    <dd><em>${gap.silent}</em> ${gap.because}</dd>`).join('');

  // One lane per map: the board the players see, plus the umpire's own
  // queue and adjudication panel beside it.
  for (const mapId of Object.keys(data.maps.maps)) {
    const lane = document.createElement('div');
    lane.className = 'cm-lane';
    for (const tag of ['cm-map-board', 'cm-initiative-queue', 'cm-adjudication']) {
      const element = document.createElement(tag);
      element.setAttribute('map', mapId);
      lane.append(element);
    }
    $('host-boards').append(lane);
  }

  buildOpportunityComposer();

  const screens = { start: $('screen-start'), running: $('screen-running') };
  const show = (which) => {
    for (const [key, element] of Object.entries(screens)) element.hidden = key !== which;
  };

  // --- resuming -------------------------------------------------------------
  renderResumes();

  /**
   * The saved games on this machine, each with a way to be rid of it.
   *
   * Re-rendered rather than reloaded when one is deleted, because a
   * facilitator clearing out three abandoned test games should not have to
   * refresh between each — and because the whole panel disappears once the
   * last one is gone, which a stale list would not show.
   */
  function renderResumes() {
    const saves = persistence.list();
    $('resume').hidden = saves.length === 0;
    $('resume-list').innerHTML = saves.map((save) => `
      <li>
        <button type="button" class="cm-resume" data-code="${save.joinCode}">
          <strong>${save.joinCode}</strong>
          <span>${save.log.length} action${save.log.length === 1 ? '' : 's'}${
  save.savedAt ? `, saved ${new Date(save.savedAt).toLocaleTimeString()}` : ''}</span>
        </button>
        <button type="button" class="cm-resume-forget" data-forget="${save.joinCode}"
                aria-label="Delete game ${save.joinCode}">Delete</button>
        ${turnsFor(save.joinCode)}
      </li>`).join('');
  }

  /**
   * The turns kept for a game, as a row of ways back into it.
   *
   * Offered rather than merely stored. A checkpoint nobody can reach is a
   * checkpoint that is not there, and the reason for keeping these is a
   * facilitator saying "that went wrong, put us back to the start of turn
   * three" — which has to be one press, in front of a room that is waiting.
   */
  function turnsFor(joinCode) {
    const kept = persistence.checkpoints(joinCode);
    if (!kept.length) return '';
    return `<span class="cm-resume-turns">Back to the start of:${kept.map((save) => `
      <button type="button" data-turn="${joinCode}|${save.turn}"
              aria-label="Resume game ${joinCode} from the start of turn ${save.turn}"
              >turn ${save.turn}</button>`).join('')}</span>`;
  }

  $('resume-list').addEventListener('click', (event) => {
    // Deleting first: the delete button sits inside the same <li> as the
    // resume button, and closest() would otherwise walk past it and open the
    // game the facilitator was trying to throw away.
    const forget = event.target.closest('[data-forget]');
    if (forget) {
      const code = forget.dataset.forget;
      // The only copy that survives this machine is a downloaded save, so a
      // deletion is as final as deletions get. Asked once, out loud.
      // eslint-disable-next-line no-alert
      if (globalThis.confirm?.(
        `Delete the saved game ${code}? This cannot be undone.`) === false) return;
      persistence.forget(code);
      renderResumes();
      return;
    }
    const back = event.target.closest('[data-turn]');
    if (back) {
      const [code, turn] = back.dataset.turn.split('|');
      // Everything after that turn began is about to stop having happened.
      // eslint-disable-next-line no-alert
      if (globalThis.confirm?.(`Put game ${code} back to the start of turn ${turn}? `
        + 'Everything played since then is undone.') === false) return;
      const kept = persistence.checkpoints(code).find((s) => String(s.turn) === turn);
      if (kept) resume(kept);
      return;
    }
    const button = event.target.closest('[data-code]');
    if (button) resume(persistence.read(button.dataset.code));
  });

  // Prefilled from whoever last typed one on this machine — and the
  // ?role=co warm-standby entrance drops the cursor straight on the form.
  $('co-name').value = loadSavedName();
  if (new URLSearchParams(location.search ?? '').get('role') === 'co') {
    $('co-code').focus();
  }

  $('join-as-co').addEventListener('submit', (event) => {
    event.preventDefault();
    const code = normaliseJoinCode($('co-code').value);
    if (!isValidJoinCode(code)) {
      // Not guessed at: a misheard letter that was silently corrected could
      // be a different, valid game.
      $('start-error').textContent = 'That code is not right. Ask them to read it again.';
      return;
    }
    const enteredPin = $('co-pin').value.trim();
    if (!enteredPin) {
      $('start-error').textContent = 'The PIN is on the other facilitator\u2019s screen.';
      return;
    }
    $('start-error').textContent = '';
    const coName = $('co-name').value.trim() || 'Co-facilitator';
    saveName(coName);
    take(new CoFacilitatorSession({
      joinCode: code,
      pin: enteredPin,
      name: coName,
      token: installSessionToken(code),
      data,
      onChange,
      onStatus: (status) => $('connection').setAttribute('status', status),
      onLog: (line) => appendLog(line),
    }));
  });

  $('take-over').addEventListener('click', () => {
    // eslint-disable-next-line no-alert
    const sure = globalThis.confirm?.(
      'Take over hosting? Do this only when the other facilitator has stopped.');
    if (sure === false) return;

    const result = session.takeOver({
      onChange,
      onStatus: (status) => $('connection').setAttribute('status', status),
      onLog: (line) => appendLog(line),
      pump,
    });
    if (!result.ok) { appendLog('[co] ' + result.reason); return; }
    if (result.refused?.length) {
      $('replay-warning').hidden = false;
      $('replay-warning').textContent =
        result.refused.length + ' recorded action'
        + (result.refused.length === 1 ? '' : 's')
        + ' could not be replayed and had no effect.';
    }
    appendLog('[co] taking the game over — claiming the code');
    take(result.session);
  });

  $('import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = parseSave(await file.text());
    if (!parsed.ok) {
      $('start-error').textContent = parsed.reason;
      return;
    }
    resume(parsed.save);
  });

  $('new-game').addEventListener('click', () => {
    begin(GameHost.create({
      joinCode: mintJoinCode(),
      seed: mintSeed(Math.random),
      facilitatorPin: mintFacilitatorPin(),
      // Chosen before anybody joins, because the scaling table changes the
      // opening position — which lanyards exist, whose cards are dealt —
      // rather than anything that happens later.
      playerCount: Number($('player-count').value),
      data,
    }));
  });

  function resume(save) {
    if (!save) return;
    const { host: restored, refused } = GameHost.restore({ save, data });
    if (refused.length) {
      // A log that no longer replays means the rules moved under this save.
      // Said plainly now, rather than discovered mid-game.
      $('replay-warning').hidden = false;
      $('replay-warning').textContent =
        `${refused.length} recorded action${refused.length === 1 ? '' : 's'} could not be `
        + 'replayed and had no effect.';
    }
    begin(restored);
  }

  function begin(started) {
    // A save from before PINs were kept, or one hand-made: mint one rather
    // than leaving the co-facilitator with no way in at all.
    started.facilitatorPin ??= mintFacilitatorPin();
    take(new PrimarySession({
      host: started,
      onChange,
      onStatus: (status) => $('connection').setAttribute('status', status),
      onLog: (line) => appendLog(line),
      pump,
    }));
  }

  /** Adopt a session, whichever kind it is, and show the running console. */
  function take(started) {
    session = started;
    pin = session.facilitatorPin;
    session.start();

    $('join-code').textContent = session.joinCode;
    $('facilitator-pin').textContent = pin ?? '—';
    $('player-link').value = playerLink(location, session.joinCode);
    document.body.dataset.role = session.kind;
    show('running');
    render();

    // The tab may be closed, put to sleep, or crash. Write unconditionally on
    // the way out — there may be no next tick to debounce into.
    const flush = () => { const save = session.save(); if (save) persistence.write(save); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    flush();
  }

  function onChange() {
    const save = session.save();
    if (save) {
      persistence.schedule(save);
      // And a copy of the moment each turn began, kept for good. The rolling
      // save above follows the game and so has any mistake in it by the time
      // anybody notices; a turn boundary is somewhere a facilitator can
      // actually ask to go back to. Written from a playing phase only, so the
      // lobby does not claim to be the start of turn one before anything has
      // happened in it.
      const { turn, name } = session.state.phase;
      if (name === PHASES[0] && persistence.checkpoint(save, turn)) renderResumes();
    }
    render();
  }

  function render() {
    // A co-facilitator before the first projection has nothing but a
    // connection status; the console fills in the moment the mirror does.
    $('co-banner').hidden = session.kind !== 'co';
    if (session.kind === 'co') {
      const ready = session.canTakeOver;
      $('take-over').disabled = !ready;
      $('co-mirror').textContent = ready
        ? `${session.state.log.length} action${session.state.log.length === 1 ? '' : 's'} mirrored`
        : 'nothing has arrived yet';
    }
    if (!session.state) return;

    const roster = $('roster');
    roster.roles = data.roles.roles;
    roster.seats = session.roster();
    const playable = Object.values(session.state.roles).filter((r) => !r.npc).length;
    const claimed = session.roster().filter((s) => s.roleId).length;
    $('seated-count').textContent = `${claimed} of ${playable} lanyards claimed`;

    const phase = session.state.phase;
    $('clock').phase = phase;
    $('lobby-roles').hidden = phase.name !== 'lobby';
    if (phase.name === 'lobby') renderRoleGrid(session.state, session.roster());

    $('inspector').data = data;
    $('inspector').state = session.state;

    // The boards and the war rail render the same shape the players get — a
    // facilitator's projection is the whole state, so the state itself will
    // do. They react to the inspector like every other cm- component.
    $('war-strip').hidden = false;
    $('war').data = data;
    $('war').view = session.state;
    const umpireName = session.kind === 'co'
      ? (loadSavedName() || 'Co-facilitator') : 'the host';
    for (const element of $('host-boards')
      .querySelectorAll('cm-map-board, cm-initiative-queue, cm-adjudication')) {
      if (element.tagName === 'CM-ADJUDICATION') {
        element.setAttribute('facilitator-name', umpireName);
      }
      element.data = data;
      element.view = session.state;
    }
    for (const id of ['npc-n1', 'npc-n2']) {
      $(id).data = data;
      $(id).view = session.state;
    }

    renderUnplaced(session.state, phase);

    renderTeamPanel(session.state);
    $('turn-update').data = data;
    $('turn-update').view = session.state;

    // The debrief appears when time is called, worked out from the frozen
    // board — plus the aftermath file's evidence tables, host-only.
    $('epilogue-panel').hidden = phase.name !== 'epilogue';
    if (phase.name === 'epilogue') {
      $('epilogue').data = data;
      $('epilogue').aftermath = facilitatorData.aftermath;
      $('epilogue').view = session.state;
    }

    const ended = phase.name === 'epilogue';
    $('advance-phase').textContent = phase.name === 'lobby' ? 'Begin the game'
      : ended ? 'The game is over' : 'Next phase';
    $('advance-phase').disabled = ended;
    $('end-game').disabled = ended || phase.name === 'lobby';
    $('pause-clock').textContent = phase.paused ? 'Resume' : 'Pause';
    // Nothing to pause or stretch before the game starts, or after it ends.
    // The pregame is held at zero rather than having no clock at all, so
    // "is it paused" no longer answers this on its own.
    const running = !OUT_OF_PLAY.includes(phase.name) && (phase.endsAt !== null || phase.paused);
    for (const id of ['pause-clock', 'extend-clock', 'shorten-clock']) $(id).disabled = !running;
  }

  /**
   * The same lanyard wall every player's lobby shows, read rather than
   * clicked — dealt out a faction to a row, because every question a
   * facilitator asks this grid is about a faction: is Canopy all seated, has
   * anybody from the Free Federation turned up.
   */
  function renderRoleGrid(state, seats) {
    const holderOf = new Map(seats.filter((s) => s.roleId).map((s) => [s.roleId, s]));
    const factions = new Map();
    for (const code of Object.keys(state.roles)) {
      if (NPC_CODES.includes(code)) continue;
      const factionId = data.roles.roles[code]?.factionId ?? 'unaligned';
      if (!factions.has(factionId)) factions.set(factionId, []);
      factions.get(factionId).push(code);
    }

    $('role-grid').innerHTML = [...factions].map(([factionId, codes]) => {
      const faction = data.factions.factions[factionId];
      return `<div class="cm-roles-faction" data-faction="${escape(factionId)}"
        style="--faction-colour: ${escape(faction?.colour ?? '#888888')}">
        <h3 class="cm-roles-faction-name">${escape(faction?.name ?? factionId)}</h3>
        <div class="cm-roles-row">${codes.map((code) => {
    const printed = data.roles.roles[code] ?? {};
    const seat = holderOf.get(code);
    return `<div class="cm-role">
            <span class="cm-role-name">${escape(printed.name ?? code)}</span>
            <span class="cm-role-team">${escape(printed.title ?? '')}</span>
            ${seat
    ? `<span class="cm-role-taken">${escape(seat.name)}${seat.connected ? '' : ' — away'}</span>`
    : '<span class="cm-meta">open</span>'}
          </div>`;
  }).join('')}</div>
      </div>`;
    }).join('');
  }

  // --- the Team Phase table --------------------------------------------------

  /**
   * Who has not placed — and, by the author's ruling, the way to place for
   * them. Each name carries the three map buttons; a click assigns their
   * card, and mid-Action-Phase the rules append them to the back of that
   * map's queue.
   */
  function renderUnplaced(state, phase) {
    const waiting = phase.name === 'action'
      ? state.initiative.unplaced
      : phase.name === 'negotiation'
        ? Object.keys(state.actionCards).filter((code) => state.actionCards[code].placed === null)
        : [];
    $('unplaced').hidden = !['negotiation', 'action'].includes(phase.name);
    if ($('unplaced').hidden) return;
    if (!waiting.length) {
      $('unplaced').textContent = 'Every action card is placed.';
      return;
    }
    $('unplaced').innerHTML = `Still to place: ${waiting.map((code) => `
      <span class="cm-unplaced-entry">${escape(data.roles.roles[code]?.name ?? code)}
        ${Object.entries(data.maps.maps).map(([mapId, map]) => `
          <button type="button" data-assign="${escape(code)}|${escape(mapId)}">${
  escape(map.name)}</button>`).join('')}
      </span>`).join(' ')}`;
    for (const button of $('unplaced').querySelectorAll('[data-assign]')) {
      button.onclick = () => {
        const [code, mapId] = button.dataset.assign.split('|');
        asFacilitator('facilitator:assign-action-card', { code, mapId });
      };
    }
  }

  /**
   * The correspondence card, the opportunity ledger and the tithe tracker.
   *
   * Rebuilt from state on every render, with one guard: never while the
   * facilitator is typing in it — a projection landing mid-sentence must
   * not eat the sentence. The composer is built once and left alone.
   */
  function renderTeamPanel(state) {
    const panel = $('team-panel');
    panel.hidden = state.phase.name === 'lobby';
    if (panel.hidden) return;
    if (panel.contains(document.activeElement)
      && document.activeElement.matches('input, textarea, select')) return;

    renderCorrespondence(state);
    renderOpportunityList(state);
    renderTitheTracker(state);
  }

  function renderCorrespondence(state) {
    const turn = state.phase.turn;
    const entry = events.correspondence.find((c) => c.turn === turn);
    const status = state.correspondence['t' + turn];
    if (!entry) { $('correspondence-card').innerHTML = ''; return; }

    $('correspondence-card').innerHTML = `
      <article class="cm-correspondence" data-status="${status ?? 'unread'}">
        ${entry.readAloud ? `<blockquote>${escape(entry.readAloud)}</blockquote>`
    : '<p class="cm-meta">Nothing scripted to read this turn.</p>'}
        ${entry.note ? `<p class="cm-meta">${escape(entry.note)}</p>` : ''}
        ${entry.effects.length ? `<ul>${entry.effects.map((e) => `
          <li>${escape(e.track)}: ${'set' in e ? `set to ${e.set}` : (e.delta > 0 ? '+' : '') + e.delta}</li>`).join('')}
        </ul>` : ''}
        ${status ? `<p class="cm-meta">Already ${status}.</p>` : `
          <div class="cm-row">
            <button type="button" class="cm-primary" data-publish>Publish</button>
            ${entry.optional ? '<button type="button" data-skip-news>Skip it</button>' : ''}
          </div>`}
      </article>`;

    const publish = $('correspondence-card').querySelector('[data-publish]');
    if (publish) {
      publish.onclick = () => asFacilitator('facilitator:publish-correspondence', {
        turn, effects: entry.effects.map((e) => ({ ...e })),
      });
    }
    const skip = $('correspondence-card').querySelector('[data-skip-news]');
    if (skip) {
      skip.onclick = () => asFacilitator('facilitator:publish-correspondence',
        { turn, skip: true });
    }
  }

  /**
   * Built once: a composer whose inputs must survive every projection.
   * The guidance line follows the chosen trigger, straight from the
   * facilitator file's menus.
   */
  function buildOpportunityComposer() {
    const triggers = data.maps.opportunityTriggers;
    const host = $('opportunity-composer');
    host.innerHTML = `
      <label>Trigger
        <select id="op-trigger">
          <option value="">Free-form</option>
          ${triggers.map((t) => `<option value="${t.id}">${t.id}</option>`).join('')}
        </select>
      </label>
      <p id="op-guidance" class="cm-meta"></p>
      <label>For
        <select id="op-target">
          ${Object.entries(data.factions.factions).map(([id, f]) =>
    `<option value="faction|${id}">${escape(f.name)}</option>`).join('')}
          <option value="npc|N1">U.N. Ambassador (you)</option>
          <option value="npc|N2">Senate Speaker (you)</option>
        </select>
      </label>
      <label>Title <input id="op-title" maxlength="120"></label>
      <label>Option A <input id="op-a" maxlength="200"></label>
      <label>Option B <input id="op-b" maxlength="200"></label>
      <button type="button" id="op-deliver" class="cm-primary">Deliver it</button>`;

    const guidanceFor = () => {
      const picked = $('op-trigger').value;
      const guide = events.opportunityGuidance.find((g) => picked.startsWith(g.trigger));
      $('op-guidance').textContent = guide
        ? guide.principle + ' e.g. ' + guide.examples[0] : '';
    };
    $('op-trigger').onchange = guidanceFor;
    guidanceFor();

    $('op-deliver').onclick = () => {
      const [kind, id] = $('op-target').value.split('|');
      asFacilitator('facilitator:deliver-opportunity', {
        triggerId: $('op-trigger').value || null,
        ...(kind === 'faction' ? { factionId: id } : { npcCode: id }),
        title: $('op-title').value,
        optionA: $('op-a').value,
        optionB: $('op-b').value,
      });
      for (const field of ['op-title', 'op-a', 'op-b']) $(field).value = '';
    };
  }

  /** Pending first; each pending one carries a small resolve builder. */
  const resolveStaged = new Map();   // opportunityId -> [{track, delta}]
  function renderOpportunityList(state) {
    const records = Object.values(state.opportunities);
    if (!records.length) {
      $('opportunity-list').innerHTML = '<p class="cm-empty">None delivered yet.</p>';
      return;
    }
    const rank = (r) => (r.status === 'pending' ? 0 : 1);
    records.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));

    $('opportunity-list').innerHTML = records.map((r) => `
      <article class="cm-opportunity-row" data-status="${r.status}">
        <h4>${escape(r.title)} <span class="cm-meta">${
  r.factionId ? escape(data.factions.factions[r.factionId]?.name ?? r.factionId)
    : escape(r.npcCode)} · ${r.status}</span></h4>
        <p class="cm-meta">A: ${escape(r.optionA)} · B: ${escape(r.optionB)}
          ${r.choice ? ` — chose ${r.choice}` : ' — undecided'}</p>
        ${r.status === 'pending' ? `
          <div class="cm-row">
            ${(resolveStaged.get(r.id) ?? []).map((e, i) => `
              <span class="cm-card-chip">${escape(e.track)} ${e.delta > 0 ? '+' : ''}${e.delta}
                <button type="button" data-unstage="${r.id}|${i}">×</button></span>`).join('')}
            <select data-res-track="${r.id}">
              <option value="">Track…</option>
              ${Object.keys(data.maps.tracks).filter((t) => t !== 'war_progress')
    .map((t) => `<option value="${t}">${escape(data.maps.tracks[t].name)}</option>`).join('')}
            </select>
            <input type="number" step="1" data-res-delta="${r.id}" placeholder="+/-" style="width:4rem">
            <button type="button" data-res-add="${r.id}">Add</button>
            <button type="button" class="cm-primary" data-resolve="${r.id}">Resolve</button>
          </div>` : ''}
      </article>`).join('');

    for (const button of $('opportunity-list').querySelectorAll('[data-res-add]')) {
      button.onclick = () => {
        const id = button.dataset.resAdd;
        const track = $('opportunity-list').querySelector(`[data-res-track="${id}"]`).value;
        const delta = Number($('opportunity-list').querySelector(`[data-res-delta="${id}"]`).value);
        if (!track || !Number.isInteger(delta) || delta === 0) return;
        resolveStaged.set(id, [...(resolveStaged.get(id) ?? []), { track, delta }]);
        renderOpportunityList(session.state);
      };
    }
    for (const button of $('opportunity-list').querySelectorAll('[data-unstage]')) {
      button.onclick = () => {
        const [id, index] = button.dataset.unstage.split('|');
        const staged = resolveStaged.get(id) ?? [];
        staged.splice(Number(index), 1);
        renderOpportunityList(session.state);
      };
    }
    for (const button of $('opportunity-list').querySelectorAll('[data-resolve]')) {
      button.onclick = () => {
        const id = button.dataset.resolve;
        asFacilitator('facilitator:resolve-opportunity', {
          opportunityId: id, effects: resolveStaged.get(id) ?? [],
        });
        resolveStaged.delete(id);
      };
    }
  }

  function renderTitheTracker(state) {
    const owed = titheOwed(state.phase.turn);
    const paid = state.tithe.paidCardIds.length > 0;
    $('tithe-tracker').innerHTML = `
      <p>${escape(events.tithe.from)} owes ${owed} card${owed === 1 ? '' : 's'} this turn —
        ${paid ? 'paid.' : state.tithe.refused ? 'refused.' : 'outstanding.'}</p>
      ${!paid && !state.tithe.refused ? `
        <button type="button" data-refuse-tithe>Mark refused</button>
        <p class="cm-meta">On refusal, the print says: ${
  events.tithe.onRefusal.map(escape).join('; ')}. The amounts are yours — move the
          tracks by hand.</p>` : ''}`;
    const refuse = $('tithe-tracker').querySelector('[data-refuse-tithe]');
    if (refuse) refuse.onclick = () => asFacilitator('facilitator:mark-tithe-refused', {});
  }

  /** The facilitator acts as themselves — a seat of their own on this tab. */
  function asFacilitator(verb, payload = {}) {
    const result = session.submit(verb, payload);
    if (result && !result.ok) appendLog(`[host] refused: ${result.reason}`);
  }

  document.addEventListener('cm-facilitate', (event) =>
    asFacilitator(event.detail.verb, event.detail.payload));

  // The NPC hands raise the same commands a player's hand would; here they
  // are applied as the facilitator, whose payload already names the lanyard.
  $('card-viewer').data = data;
  document.addEventListener('cm-command', (event) =>
    asFacilitator(event.detail.verb, event.detail.payload));
  document.addEventListener('cm-view-card', (event) =>
    $('card-viewer').show(event.detail.cardId));

  // --- the clock, out loud --------------------------------------------------
  // A facilitator running a room is not looking at this screen. They are
  // listening to a negotiation across the table, and the one thing they must
  // not miss is a phase running out — so the clock says it rather than only
  // showing it.
  document.addEventListener('cm-time-up', () => beeper.beep(3, 880));
  document.addEventListener('cm-overtime', () => beeper.beep(1, 660));
  // And the spotlight's own two crossings, higher-pitched so the umpire can
  // tell the sixty-second clock from the phase clock without looking.
  document.addEventListener('cm-spotlight-warning', () => beeper.beep(1, 990));
  document.addEventListener('cm-spotlight-up', () => beeper.beep(2, 990));

  $('advance-phase').addEventListener('click', () => asFacilitator('facilitator:advance-phase'));
  $('pause-clock').addEventListener('click', () => asFacilitator('facilitator:pause-clock'));
  for (const id of ['extend-clock', 'shorten-clock']) {
    $(id).addEventListener('click', (event) => asFacilitator('facilitator:extend-clock', {
      minutes: Number(event.currentTarget.dataset.minutes),
    }));
  }

  $('end-game').addEventListener('click', () => {
    // Irreversible in the fiction and awkward to undo in the room, so it is
    // asked for rather than assumed. The inspector can still put the phase
    // back if somebody hits it by accident.
    // eslint-disable-next-line no-alert
    if (globalThis.confirm?.('End the game and freeze the board for the debrief?') !== false) {
      asFacilitator('facilitator:end-game');
    }
  });

  // A testing affordance, and deliberately behind a fold. Each tab carries a
  // `?seat=N` that makes it take a token of its own rather than adopting this
  // machine's shared one — otherwise four tabs are one seat opened four times.
  $('open-test-seats').addEventListener('click', () => {
    const wanted = Math.min(8, Math.max(1, Number($('test-seats').value) || 1));
    const link = $('player-link').value;
    for (let seat = 1; seat <= wanted; seat += 1) {
      const [base, hash = ''] = link.split('#');
      const url = `${base}${base.includes('?') ? '&' : '?'}seat=${seat}${hash ? `#${hash}` : ''}`;
      globalThis.open?.(url, `cm-seat-${seat}`);
    }
  });

  $('print-epilogue').addEventListener('click', () => globalThis.print?.());

  $('save-epilogue').addEventListener('click', () => {
    // A self-contained page, so a debrief can be sent round afterwards
    // without needing the app or the game still to exist.
    downloadPage(epiloguePage($('epilogue').innerHTML, session.joinCode),
      `crisis-mars-${session.state.joinCode}-debrief.html`);
  });

  $('copy-link').addEventListener('click', async () => {
    await navigator.clipboard?.writeText($('player-link').value);
    $('copy-link').textContent = 'Copied';
    setTimeout(() => { $('copy-link').textContent = 'Copy'; }, 1500);
  });

  $('download-save').addEventListener('click', () => {
    downloadSave(session.save(), saveFilename(session.state));
  });

  function appendLog(line) {
    const log = $('host-log');
    log.textContent = `${line}\n${log.textContent}`.split('\n').slice(0, 40).join('\n');
  }

  show('start');
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
