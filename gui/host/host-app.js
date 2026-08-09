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
  Persistence, saveFilename, downloadSave, parseSave,
} from './persistence.js';
import { PrimarySession } from './session.js';
import { eventPumpFor } from './event-pump.js';
import { createBeeper } from '../sound.js';
import {
  mintJoinCode, mintFacilitatorPin, playerLink,
} from '../net/join-code.js';
import { mintSeed } from '../rules/rng.js';
import { PHASES, OUT_OF_PLAY, NPC_CODES } from '../rules/state.js';
import { KNOWN_GAPS } from '../rules/gaps.js';
import { loadData } from '../client/load-data.js';
import '../components/cm-connection-dot.js';
import '../components/cm-seat-roster.js';
import '../components/cm-phase-clock.js';
import '../components/cm-state-inspector.js';

const $ = (id) => document.getElementById(id);

export async function startHostApp({ location = window.location, beeper = createBeeper() } = {}) {
  const data = await loadData();
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
  const pump = eventPumpFor({ location, onLog: (line) => appendLog(line) });

  // Fixed for the whole game, so it is written once rather than on every
  // projection. Empty in this phase — the first real gaps arrive with the
  // Action Phase — and the panel hides itself when there is nothing to say.
  $('gaps-panel').hidden = KNOWN_GAPS.length === 0;
  $('rules-gaps').innerHTML = KNOWN_GAPS.map((gap) => `
    <dt>${gap.about} — ${gap.ruling}</dt>
    <dd><em>${gap.silent}</em> ${gap.because}</dd>`).join('');

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

  /** Adopt a session and show the running console. */
  function take(started) {
    session = started;
    pin = session.facilitatorPin;
    session.start();

    $('join-code').textContent = session.joinCode;
    $('facilitator-pin').textContent = pin ?? '—';
    $('player-link').value = playerLink(location, session.joinCode);
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

  /** The facilitator acts as themselves — a seat of their own on this tab. */
  function asFacilitator(verb, payload = {}) {
    const result = session.submit(verb, payload);
    if (result && !result.ok) appendLog(`[host] refused: ${result.reason}`);
  }

  document.addEventListener('cm-facilitate', (event) =>
    asFacilitator(event.detail.verb, event.detail.payload));

  // --- the clock, out loud --------------------------------------------------
  // A facilitator running a room is not looking at this screen. They are
  // listening to a negotiation across the table, and the one thing they must
  // not miss is a phase running out — so the clock says it rather than only
  // showing it.
  document.addEventListener('cm-time-up', () => beeper.beep(3, 880));
  document.addEventListener('cm-overtime', () => beeper.beep(1, 660));

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
