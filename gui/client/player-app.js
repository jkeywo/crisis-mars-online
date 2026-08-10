/**
 * gui/client/player-app.js — the player's whole console.
 *
 * Four screens: the code, your name, the lobby, and then the game. The lobby
 * is the role grid — eighteen lanyards at most, drawn with their printed
 * fronts, claimed by pressing one. The game screen is tabs under a pinned
 * header, like the facilitator's: one per map (the printed board, read-only,
 * with that map's call order and spotlight, and the placement affordance
 * during the Negotiation Phase), then News, then — only for whom they
 * concern — Opportunities and the Tithe, then Role: the lanyard, the
 * briefing as text, and the hand. Every player verb has a bespoke home;
 * the generic action list is gone. See DECISIONS.md.
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
import '../components/cm-board-overlay.js';
import '../components/cm-war-progress.js';
import '../components/cm-hand.js';
import '../components/cm-role-card.js';
import '../components/cm-card-viewer.js';
import '../components/cm-initiative-queue.js';
import '../components/cm-action-spotlight.js';
import '../components/cm-opportunity-card.js';
import '../components/cm-epilogue.js';
import { titheOwed, TITHE_FROM_FACTION } from '../rules/commands.js';

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

  // One tab panel per map, built from the data so the strip cannot disagree
  // with the boards that exist: the printed board read-only, that map's call
  // order and spotlight, and — during the Negotiation Phase — the placement
  // affordance for this very map. Inserted before the static panels so the
  // maps come first, in printed order.
  const mapIds = Object.keys(data.maps.maps);
  for (const [mapId, map] of Object.entries(data.maps.maps)) {
    const panel = document.createElement('section');
    panel.className = 'cm-tab-panel';
    panel.id = `panel-${mapId}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${mapId}`);
    panel.hidden = true;

    const placement = document.createElement('div');
    placement.className = 'cm-placement';
    placement.dataset.placement = mapId;
    placement.hidden = true;
    const note = document.createElement('p');
    note.className = 'cm-meta';
    note.dataset.placementNote = mapId;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.placeMap = mapId;
    button.textContent = `Place your action card on ${map.name}`;
    button.addEventListener('click', () => dispatch('place-action-card', { mapId }));
    placement.append(note, button);
    panel.append(placement);

    for (const tag of ['cm-board-overlay', 'cm-initiative-queue', 'cm-action-spotlight']) {
      const element = document.createElement(tag);
      element.setAttribute('map', mapId);
      if (tag === 'cm-board-overlay') element.setAttribute('readonly', '');
      panel.append(element);
    }
    $('player-panels').insertBefore(panel, $('panel-news'));
  }

  // --- the tab strip --------------------------------------------------------
  // Rebuilt whenever its labels change (the map counts move with the turn's
  // placements) and stateful in memory only — the page's hash already
  // belongs to the join code. Opportunities and Tithe appear in the order
  // list only while they apply; a vanished tab falls back to the first map.
  const TAB_ORDER = [...mapIds, 'news', 'opportunities', 'tithe', 'role'];
  let currentTab = mapIds[0];
  let tabSignature = '';

  function selectTab(id, tabs = null) {
    currentTab = id;
    for (const tabId of TAB_ORDER) {
      const tab = $(`tab-${tabId}`);
      if (tab) tab.setAttribute('aria-selected', String(tabId === id));
      $(`panel-${tabId}`).hidden = !tab || tabId !== id;
    }
  }

  /** The strip: map names with this turn's placed-card counts, then the rest. */
  function renderTabs(view) {
    const placedOn = (mapId) => Object.values(view.actionCards ?? {})
      .filter((card) => card.placed === mapId).length;
    const labels = new Map(mapIds.map((mapId) => [
      mapId, `${data.maps.maps[mapId].name} (${placedOn(mapId)})`]));
    labels.set('news', 'News');
    if (hasOpportunities(view)) labels.set('opportunities', 'Opportunities');
    if (isBeltUnion()) labels.set('tithe', 'Tithe');
    labels.set('role', 'Role');

    const signature = JSON.stringify([...labels]);
    if (signature === tabSignature) return;
    tabSignature = signature;

    $('player-tabs').innerHTML = [...labels].map(([id, label]) => `
      <button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}"
              aria-selected="false">${escape(label)}</button>`).join('');
    if (!labels.has(currentTab)) currentTab = mapIds[0];
    selectTab(currentTab);
  }

  $('player-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[role="tab"]');
    if (button) selectTab(button.id.slice(4));
  });
  // Arrow keys walk the strip, as a tablist should.
  $('player-tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const tabs = [...$('player-tabs').querySelectorAll('[role="tab"]')]
      .map((tab) => tab.id.slice(4));
    const at = tabs.indexOf(currentTab);
    const next = tabs[(at + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    selectTab(next);
    $(`tab-${next}`).focus();
  });

  /** Whose console this is: the three Belt Union lanyards see the Tithe tab. */
  function isBeltUnion() {
    return data.roles.roles[client.roleId]?.factionId === TITHE_FROM_FACTION;
  }

  /** A live opportunity of yours, or one answered this very turn. */
  function hasOpportunities(view) {
    return Object.values(view.opportunities ?? {}).some((record) =>
      record.title !== undefined
      && (record.status === 'pending' || record.resolvedTurn === view.phase.turn));
  }

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

  // The hand's affordances raise commands; sending them is the page's job,
  // like everything else that leaves this tab.
  $('card-viewer').data = data;
  document.addEventListener('cm-command', (event) =>
    dispatch(event.detail.verb, event.detail.payload));
  document.addEventListener('cm-view-card', (event) =>
    $('card-viewer').show(event.detail.cardId));

  // The spotlight clock says when it crosses a line; what that is worth is
  // the page's call — one pip at time, then one every ten seconds while the
  // action stays open. Best-effort, like every noise this app makes.
  document.addEventListener('cm-spotlight-up', () => beeper?.beep(1, 990));
  document.addEventListener('cm-spotlight-overtime', () => beeper?.beep(1, 990));

  function dispatch(verb, payload) {
    $('action-error').textContent = '';
    const { envelope, sent } = sendCommand(verb, payload);
    if (sent) client.awaiting(envelope.data.seq, verb);
    else $('action-error').textContent = 'Not connected — try again in a moment.';
  }

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
    $('action-error').textContent = client.lastRefusal?.reason ?? '';
    $('war-strip').hidden = false;
    $('war').data = data;
    $('war').view = view;
    renderTabs(view);
    for (const element of $('player-panels')
      .querySelectorAll('cm-board-overlay, cm-initiative-queue, cm-action-spotlight')) {
      element.data = data;
      element.view = view;
    }
    $('role-card').data = data;
    $('role-card').view = view;
    $('hand').data = data;
    $('hand').view = view;
    $('opportunities').data = data;
    $('opportunities').view = view;
    renderBriefing(view, mine);
    renderNews(view);
    renderPlacement(view, mine);
    renderTithe(view, mine);
    // Time called: the public portrait of how it ended, above whichever
    // panel is open.
    $('epilogue-view').hidden = view.phase.name !== 'epilogue';
    if (view.phase.name === 'epilogue') {
      $('epilogue-view').data = data;
      $('epilogue-view').view = view;
    }
    $('game-roster').roles = data.roles.roles;
    $('game-roster').seats = seats;
  }

  /**
   * The Negotiation Phase's one obligation, on the map tabs themselves.
   *
   * Each map panel carries one button — place your card HERE — and the
   * shared sentence saying where it currently sits. Re-placement is an
   * overwrite until the facilitator calls the phase, so the buttons stay
   * live and the map that holds the card reads pressed.
   */
  function renderPlacement(view, mine) {
    const card = view.actionCards?.[mine];
    const open = view.phase.name === 'negotiation' && Boolean(card);
    const sentence = !open ? '' : card.placed
      ? `On ${data.maps.maps[card.placed]?.name ?? card.placed} — you can move it until the phase ends.`
      : 'Not placed yet. Placement is mandatory — pick a map.';
    for (const holder of $('player-panels').querySelectorAll('[data-placement]')) {
      holder.hidden = !open;
      if (!open) continue;
      const mapId = holder.dataset.placement;
      holder.querySelector(`[data-placement-note="${mapId}"]`).textContent = sentence;
      holder.querySelector(`[data-place-map="${mapId}"]`)
        .setAttribute('aria-pressed', String(mapId === card.placed));
    }
  }

  /** The briefing as words: who you are, your goal, your faction's four. */
  function renderBriefing(view, mine) {
    const brief = view.brief;
    if (!brief) { $('briefing').innerHTML = ''; return; }
    const faction = data.factions.factions[data.roles.roles[mine]?.factionId];
    $('briefing').innerHTML = `
      <h4>Who you are</h4>
      <p>${escape(brief.background ?? '')}</p>
      <h4>Your personal goal</h4>
      <p>${escape(brief.personalGoal ?? '')}</p>
      <h4>${escape(faction?.name ?? 'Your faction')}'s goals</h4>
      <ul>${(faction?.goals ?? []).map((goal) => `
        <li>${escape(goal.statement)}</li>`).join('')}
      </ul>`;
  }

  /** state.news newest-first: the read-aloud script and Control's posts. */
  function renderNews(view) {
    const items = [...(view.news ?? [])].reverse();
    $('news-feed').innerHTML = items.length ? items.map((item) => `
      <article class="cm-news-item" data-kind="${escape(item.kind)}">
        <p>${escape(item.text)}</p>
        <p class="cm-meta">Turn ${item.turn}</p>
      </article>`).join('')
      : '<p class="cm-empty">Nothing has made the news yet.</p>';
  }

  /**
   * The Tithe tab's contents, for the Belt Union player who has it.
   *
   * While a payment can be made — Team or Negotiation Phase, not refused,
   * not yet covered — the pay flow: checkboxes over the hand and the button.
   * Otherwise the tab stays (the debt is standing business) and says where
   * the tithe stands instead. The selection survives re-renders in a Set
   * rather than in the DOM, because a projection arrives on every change
   * anybody makes and would otherwise wipe half-ticked checkboxes.
   */
  const titheSelection = new Set();
  function renderTithe(view, mine) {
    if (!isBeltUnion()) return;
    const owed = titheOwed(view.phase.turn);
    const paid = view.tithe.paidCardIds.length;
    const inWindow = ['team', 'negotiation'].includes(view.phase.name);
    const open = inWindow && !view.tithe.refused && paid < owed;
    $('pay-tithe').hidden = !open;
    if (!open) {
      titheSelection.clear();
      $('tithe-cards').innerHTML = '';
      $('tithe-note').textContent = view.tithe.refused
        ? `This turn's tithe was refused, with ${paid} paid.`
        : paid >= owed
          ? `Paid in full this turn — ${paid} card${paid === 1 ? '' : 's'}.`
          : `The Ambassador is owed ${owed} card${owed === 1 ? '' : 's'} this turn — `
            + `${paid} paid so far. Payments happen in the Team and Negotiation Phases.`;
      return;
    }

    const held = Object.values(view.cards ?? {})
      .filter((card) => card.holderCode === mine && card.state === 'held');
    for (const id of [...titheSelection]) {
      if (!held.some((card) => card.id === id)) titheSelection.delete(id);
    }
    $('tithe-note').textContent =
      `The Ambassador is owed ${owed} card${owed === 1 ? '' : 's'} this turn — `
      + `${paid} paid so far. Any Belt player can pay, in instalments.`;
    $('tithe-cards').innerHTML = held.map((card) => `
      <label><input type="checkbox" value="${card.id}"
        ${titheSelection.has(card.id) ? 'checked' : ''}>
        ${data.resources.types[card.type]?.name ?? card.type}</label>`).join('');
    for (const input of $('tithe-cards').querySelectorAll('input')) {
      input.onchange = () => {
        if (input.checked) titheSelection.add(input.value);
        else titheSelection.delete(input.value);
        $('pay-tithe').disabled = titheSelection.size === 0;
      };
    }
    $('pay-tithe').disabled = titheSelection.size === 0;
  }

  $('pay-tithe').addEventListener('click', () => {
    dispatch('pay-tithe', { cardIds: [...titheSelection] });
    titheSelection.clear();
  });

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
