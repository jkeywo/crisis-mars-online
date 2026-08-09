/**
 * gui/client/player-app.js — the player's whole console.
 *
 * Four screens: the code, your name, the lobby, and then the game. The lobby
 * is the role grid — eighteen lanyards at most, drawn with their printed
 * fronts, claimed by pressing one. The game screen is a placeholder in this
 * phase: the clock, the roster, your own lanyard back and your hand of cards,
 * with the three maps to follow.
 *
 * Nothing here decides anything. It sends what the player asked for and
 * renders whatever the host sends back, including the reason a request was
 * refused. No local truth, no prediction, no patching of a projection: the
 * next one that arrives is simply what is true now, which is what makes a
 * reconnect free.
 */

import { ConnectionManager } from '../net/connection-manager.js';
import {
  peerIdForCode, codeFromLocation, seatFromLocation, normaliseJoinCode, isValidJoinCode,
} from '../net/join-code.js';
import { installSessionToken } from '../net/session-token.js';
import { loadSavedName, saveName, forgetName } from '../net/name-storage.js';
import { identify } from '../net/wire.js';
import { sendCommand } from '../net/command-gateway.js';
import { ClientState } from './client-state.js';
import { loadData } from './load-data.js';
import { createBeeper, createPhaseAnnouncer } from '../sound.js';
import '../components/cm-connection-dot.js';
import '../components/cm-seat-roster.js';
import '../components/cm-phase-clock.js';
import '../components/cm-action-list.js';

const $ = (id) => document.getElementById(id);

/** The printed front of a lanyard, by role code. */
const lanyardFront = (code) => `assets/cards/lanyard_role_${code.toLowerCase()}-front.png`;

export async function startPlayerApp({ location = window.location, beeper = createBeeper() } = {}) {
  const client = new ClientState();
  const manager = new ConnectionManager();
  window.connectionManager = manager;      // what command-gateway resolves to

  const data = await loadData();
  let joinCode = codeFromLocation(location);
  let name = '';
  /** Whether this tab let itself in rather than being walked in. */
  let remembering = false;
  // `?seat=N`: a testing affordance, so one person can drive several seats
  // from one machine. It forces a token of its own rather than adopting the
  // shared one, which is what stops four tabs becoming one seat four times.
  const seat = seatFromLocation(location);

  const screens = {
    code: $('screen-code'),
    name: $('screen-name'),
    lobby: $('screen-lobby'),
    game: $('screen-game'),
  };
  const show = (which) => {
    for (const [key, element] of Object.entries(screens)) element.hidden = key !== which;
  };

  // --- the code -------------------------------------------------------------
  $('code-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const typed = normaliseJoinCode($('join-code').value);
    if (!isValidJoinCode(typed)) {
      // Deliberately not guessed at: see join-code.js. A misheard letter that
      // was silently corrected could be a different, valid game.
      $('code-error').textContent = 'That code is not right. Ask your facilitator to read it again.';
      $('join-code').focus();
      return;
    }
    joinCode = typed;
    location.hash = `#${typed}`;
    show('name');
    $('player-name').focus();
  });

  // --- the name -------------------------------------------------------------
  // Prefilled from whoever last typed one on this machine, so a returning
  // player is not retyping their name every game.
  $('player-name').value = loadSavedName();
  $('name-form').addEventListener('submit', (event) => {
    event.preventDefault();
    name = $('player-name').value.trim() || 'Someone';
    saveName(name);
    connect();
    show('lobby');
  });

  function connect() {
    const token = installSessionToken(joinCode, window, { seat });
    $('lobby-code').textContent = joinCode;
    manager.connect(peerIdForCode(joinCode), {
      onData: (message) => client.receive(message),
      onStatus: (status) => client.setStatus(status),
      getIdent: () => identify({ token, name }),
    });
  }

  document.addEventListener('cm-retry', () => manager.retryNow());

  // The way out of a remembered seat: back to the code screen, with the
  // remembered name cleared so the next load asks properly rather than
  // marching the player into the same silent game again.
  $('start-over').addEventListener('click', () => {
    remembering = false;
    manager.disconnect?.();
    forgetName();
    location.hash = '';
    joinCode = '';
    $('join-code').value = '';
    show('code');
    $('join-code').focus();
  });

  client.subscribe(render);

  const announcePhase = createPhaseAnnouncer({ beeper });

  function render() {
    $('connection').setAttribute('status', client.status);

    if (client.rejection) {
      $('lobby-message').textContent = client.rejection;
      $('role-picker').hidden = true;
      return;
    }

    // A seat let itself back in on a remembered name, and the game it
    // remembered is not answering — a host whose tab died, a code that has
    // moved on, a token the host no longer knows. Say so and offer the way
    // back to the front door, rather than sitting on "waiting" forever.
    $('start-over').hidden = !remembering;

    const view = client.view;
    if (!view) {
      $('lobby-message').textContent = remembering
        ? `Looking for game ${joinCode}, as ${name}…`
        : 'Waiting for the facilitator…';
      return;
    }

    const seats = Object.values(view.seats ?? {});
    $('roster').roles = data.roles.roles;
    $('roster').seats = seats;

    const mine = client.roleId;
    if (!mine) {
      show('lobby');
      $('lobby-message').textContent = 'Choose a lanyard.';
      $('role-picker').hidden = false;
      renderRolePicker(view);
      if (client.lastRefusal) $('claim-error').textContent = client.lastRefusal.reason;
      return;
    }

    // Seated, but the facilitator has not begun the game — stay on the
    // lobby screen with a lanyard chosen rather than open the board on a
    // turn that has not started.
    if (view.phase.name === 'lobby') {
      show('lobby');
      $('lobby-message').textContent =
        `Playing ${data.roles.roles[mine]?.name ?? mine}. Waiting for the facilitator to start the game.`;
      $('role-picker').hidden = true;
      return;
    }

    // Seated and under way.
    if (screens.game.hidden) show('game');
    $('bar-status').hidden = false;
    $('bar-role').textContent = data.roles.roles[mine]?.name ?? mine;
    announcePhase(view.phase);
    $('clock').phase = view.phase;
    $('actions').data = data;
    $('actions').view = view;
    $('action-error').textContent = client.lastRefusal?.reason ?? '';
    renderSheet(view, mine);
    $('game-roster').roles = data.roles.roles;
    $('game-roster').seats = seats;
  }

  /**
   * Your own lanyard, and your hand.
   *
   * The back of the role card is static data rendered only for its owner —
   * the projection carries it as `brief`, the same accepted trade RBO made
   * for briefs.json. The hand is read off the public card records: everything
   * this player currently holds, spent or not.
   */
  function renderSheet(view, mine) {
    const printed = data.roles.roles[mine] ?? {};
    const faction = data.factions.factions[printed.factionId];
    const held = Object.values(view.cards ?? {}).filter((c) => c.holderCode === mine);

    $('sheet').innerHTML = `
      <h2>${escape(printed.name ?? mine)}</h2>
      <p class="cm-meta">${escape(faction?.name ?? '')} · initiative ${
  (printed.initiative ?? []).join(', ')}</p>
      ${view.brief ? `
        <h3>Who you are</h3>
        <p>${escape(view.brief.background ?? '')}</p>
        <h3>Your goal</h3>
        <p>${escape(view.brief.personalGoal ?? '')}</p>` : ''}
      <h3>Your hand</h3>
      <ul class="cm-hand">${held.map((card) => `
        <li data-state="${card.state}">
          <img src="assets/cards/${escape(card.id)}.png" alt="${escape(
  data.resources.types[card.type]?.name ?? card.type)}" loading="lazy">
          <span>${escape(data.resources.types[card.type]?.name ?? card.type)}${
  card.ownerCode === mine ? '' : ` — on loan from ${escape(card.ownerCode)}`}${
  card.state === 'spent' ? ' (spent)' : ''}</span>
        </li>`).join('') || '<li class="cm-empty">nothing in hand</li>'}
      </ul>`;
  }

  /**
   * The lanyards, grouped by faction, each drawn with its printed front.
   *
   * Built from the projection's roles — which is exactly the roster this
   * game was dealt — and the faction colour comes from the data at runtime,
   * so no colour is hardcoded anywhere in the app.
   */
  function renderRolePicker(view) {
    const taken = new Set(Object.values(view.seats ?? {})
      .filter((s) => s.connected && s.roleId).map((s) => s.roleId));

    const byFaction = new Map();
    for (const role of Object.values(view.roles ?? {})) {
      if (role.npc) continue;   // the facilitator's lanyards, not chairs
      const factionId = data.roles.roles[role.id]?.factionId ?? 'unaligned';
      if (!byFaction.has(factionId)) byFaction.set(factionId, []);
      byFaction.get(factionId).push(role.id);
    }

    $('role-picker').hidden = false;
    $('role-picker').innerHTML = [...byFaction].map(([factionId, codes]) => {
      const faction = data.factions.factions[factionId];
      return `<div class="cm-roles-faction" style="--faction-colour: ${
        escape(faction?.colour ?? '#888888')}">
        <h3 class="cm-roles-faction-name">${escape(faction?.name ?? factionId)}</h3>
        <div class="cm-roles-row">${codes.map((code) => {
    const printed = data.roles.roles[code] ?? {};
    const held = taken.has(code);
    return `<button type="button" class="cm-role" data-role="${code}" ${held ? 'disabled' : ''}>
            <img src="${lanyardFront(code)}" alt="" loading="lazy">
            <span class="cm-role-name">${escape(printed.name ?? code)}</span>
            ${held ? '<span class="cm-role-taken">taken</span>' : ''}
          </button>`;
  }).join('')}</div>
      </div>`;
    }).join('');
  }

  $('role-picker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-role]');
    if (!button) return;
    $('claim-error').textContent = '';
    const { envelope, sent } = sendCommand('claim-role', { roleId: button.dataset.role });
    if (sent) client.awaiting(envelope.data.seq, 'claim-role');
    else $('claim-error').textContent = 'Not connected yet — try again in a moment.';
  });

  // A code in the link and a name already given: the two screens in front of
  // the game exist to collect exactly those, so there is nothing left to ask.
  // The session token survives a reload and the host matches it back to the
  // seat that held it, so this lands the player back in their own chair rather
  // than making them walk through the door again to reach it.
  const remembered = seat !== null ? `Seat ${seat}` : loadSavedName();
  if (joinCode && remembered) {
    remembering = true;
    name = remembered;
    connect();
    show('lobby');
    // Nothing has arrived to subscribe on yet, so the lobby would sit blank
    // until the first projection — which for a game that is not answering is
    // never. One render now says who we are looking for, and offers the way
    // back out.
    render();
  } else if (joinCode) {
    $('lobby-code').textContent = joinCode;
    show('name');
  } else {
    show('code');
  }

  return { client, manager, data };
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
