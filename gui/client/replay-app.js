/**
 * gui/client/replay-app.js — the evening afterwards, from above.
 *
 * A save is a seed and a command log, which means the whole game is still in
 * it: not a highlight reel somebody chose to keep, but every action in the
 * order it was taken. This page walks that log and draws the board at whatever
 * point you stop.
 *
 * Three things follow from what it is for.
 *
 * **The whole game at once.** All three maps' tracks are up together, drawn
 * as plain tables in this phase — the boards proper arrive with the map view.
 *
 * **Nothing is redacted.** The projection is a facilitator's, because whoever
 * opened this file already holds every secret in the game — the save *is* the
 * secrets. The per-role sheets are the exception and are projected properly,
 * for a different reason: a panel that invented its own summary of a role
 * could disagree with the sheet that player was actually reading.
 *
 * **It hosts nothing.** No PeerJS, no clock, no commands. It reads a file and
 * some local storage, and the only state it holds is where the cursor is.
 */

import { Persistence, parseSave } from '../host/persistence.js';
import { ReplayCursor } from '../rules/replay-cursor.js';
import { projectView } from '../rules/views.js';
import { labelFor } from '../rules/commands.js';
import { actionImpact, bandFor } from '../rules/derive.js';
import { loadData } from './load-data.js';
import '../components/cm-map-board.js';
import '../components/cm-war-progress.js';

const $ = (id) => document.getElementById(id);

/** How far the skip buttons go. A phase of a turn is roughly this many acts. */
const SKIP = 10;

export async function startReplayApp() {
  const data = await loadData();
  const persistence = new Persistence({});

  let save = null;
  let cursor = null;
  let historyItems = [];
  // How far the history list is currently painted, so a step repaints two
  // entries rather than a thousand. See `markHistory`.
  let painted = 0;
  let current = null;
  // Whose sheet is open, and the roster the rail was last built from.
  let openRoleId = null;
  let roster = '';

  const screens = { open: $('screen-open'), replay: $('screen-replay') };
  const show = (which) => {
    for (const [key, element] of Object.entries(screens)) element.hidden = key !== which;
  };

  // --- opening a game -------------------------------------------------------
  renderSaves();

  /**
   * The games this browser has a save for.
   *
   * Deliberately without the facilitator console's Delete button: this page
   * exists to look at a game that is over, and a screen for looking at
   * something should not be a screen for throwing it away.
   */
  function renderSaves() {
    const saves = persistence.list();
    $('resume').hidden = saves.length === 0;
    $('resume-list').innerHTML = saves.map((entry) => `
      <li>
        <button type="button" class="cm-resume" data-code="${escape(entry.joinCode)}">
          <strong>${escape(entry.joinCode)}</strong>
          <span>${entry.log.length} action${entry.log.length === 1 ? '' : 's'}${
  entry.savedAt ? `, saved ${new Date(entry.savedAt).toLocaleTimeString()}` : ''}</span>
        </button>
      </li>`).join('');
  }

  $('resume-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-code]');
    if (button) open(persistence.read(button.dataset.code));
  });

  $('import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = parseSave(await file.text());
    if (!parsed.ok) { $('open-error').textContent = parsed.reason; return; }
    $('open-error').textContent = '';
    open(parsed.save);
  });

  $('open-another').addEventListener('click', () => {
    renderSaves();
    show('open');
  });

  function open(loaded) {
    if (!loaded) return;
    save = loaded;
    // Warmed on the way in. One pass over the log is what restoring a save
    // already costs, and paying it here means no drag of the bar ever pays it
    // — and that the refusals below are the whole truth rather than whatever
    // has been scrubbed past so far.
    cursor = new ReplayCursor(save, data).warm();
    openRoleId = null;
    roster = '';

    $('replay-code').textContent = save.joinCode;
    $('scrub').max = String(cursor.length);
    buildHistory();

    const refused = cursor.refusals;
    $('replay-warning').hidden = refused.length === 0;
    $('replay-warning').textContent = refused.length
      ? `${refused.length} recorded action${refused.length === 1 ? '' : 's'} could not be `
        + `replayed and had no effect: ${refused.map((r) => labelFor(r.verb)).join(', ')}.`
      : '';

    show('replay');
    render();
  }

  // --- the boards -----------------------------------------------------------

  /**
   * The same boards the consoles draw, plus the war rail — scrubbing is
   * watching the real components react, delta flashes and all — and the
   * spotlight record up to wherever the cursor stands.
   */
  let boardsBuilt = false;
  function renderBoards(view) {
    if (!boardsBuilt) {
      boardsBuilt = true;
      for (const mapId of Object.keys(data.maps.maps)) {
        const board = document.createElement('cm-map-board');
        board.setAttribute('map', mapId);
        $('boards').append(board);
      }
    }
    $('replay-war').data = data;
    $('replay-war').view = view;
    for (const board of $('boards').children) {
      board.data = data;
      board.view = view;
    }

    const told = Object.values(view.actions ?? {}).sort((a, b) => a.seq - b.seq);
    $('replay-actions').innerHTML = told.map((action) => `
      <li data-status="${escape(action.status)}">
        <strong>#${action.seq} ${escape(nameOf(action.actorCode))}</strong>
        <span class="cm-meta">${escape(data.maps.maps[action.mapId]?.name ?? action.mapId)}
          · ${escape(action.status)}${action.status === 'closed'
    ? ` · ${escape(bandFor(actionImpact(view, data, action), data)?.label ?? '')}` : ''}</span>
        ${action.declaration ? `<em>${escape(action.declaration)}</em>` : ''}
        ${action.narration ? `<span>${escape(action.narration)}</span>` : ''}
      </li>`).join('') || '<li class="cm-empty">Nothing has been called yet.</li>';
  }

  // --- the history ----------------------------------------------------------

  /**
   * Every action, written once.
   *
   * A four-turn game is a few thousand entries and the list does not change as
   * the cursor moves — only which of it has happened yet does. So it is built
   * once and thereafter only has attributes flipped on it.
   *
   * `data-at` is the cursor position *after* the entry, which is what clicking
   * one should jump to: "show me the board once this had happened".
   */
  function buildHistory() {
    $('history').innerHTML = cursor.log.map((entry, index) => {
      const refusal = cursor.refusalAt(index);
      return `<li data-at="${index + 1}" data-applied="false"
                  data-override="${entry.override === true}"
                  ${refusal ? 'data-refused="true"' : ''}>
        <button type="button" data-at="${index + 1}">
          <span class="cm-replay-seq">${entry.seq}</span>
          <span class="cm-replay-label">${escape(labelFor(entry.verb))}</span>
          <span class="cm-replay-who">${escape(whoDid(entry))}</span>
          ${entry.override
    ? '<span class="cm-replay-override">facilitator override</span>' : ''}
          ${refusal ? `<span class="cm-replay-refused">${escape(refusal.reason)}</span>` : ''}
        </button>
      </li>`;
    }).join('');
    historyItems = [...$('history').children];
    painted = 0;
    current = null;
  }

  /** Whose action it was, in the words the roster uses. */
  function whoDid(entry) {
    if (entry.roleId) return nameOf(entry.roleId);
    return entry.override ? 'a facilitator' : entry.seatId;
  }

  /**
   * Repaint only the stretch the cursor moved across.
   *
   * A step flips one entry; a jump flips as many as it skipped. Either way it
   * is attribute writes on nodes that already exist rather than a parse of the
   * whole list.
   */
  function markHistory() {
    const to = cursor.position;
    for (let i = Math.min(painted, to); i < Math.max(painted, to); i += 1) {
      historyItems[i].dataset.applied = String(i < to);
    }
    painted = to;

    current?.removeAttribute('aria-current');
    current = to > 0 ? historyItems[to - 1] : null;
    current?.setAttribute('aria-current', 'step');
    // Absent in a test environment, which has no layout to scroll.
    current?.scrollIntoView?.({ block: 'nearest' });
  }

  // --- the people who were playing ------------------------------------------

  /**
   * The roster, as a rail of things to open.
   *
   * Rebuilt only when the roster itself changes. The NPC lanyards are listed
   * too: they were in the game, and their hands are part of the record.
   */
  function renderRoles() {
    const state = cursor.state;
    const roleIds = Object.keys(state.roles);
    const key = roleIds.join(',');

    if (key !== roster) {
      roster = key;
      $('role-rail').innerHTML = roleIds.map((roleId) => {
        const printed = data.roles.roles[roleId] ?? data.factions.npcs?.[roleId] ?? {};
        return `<button type="button" class="cm-role" data-role="${escape(roleId)}"
                        aria-pressed="false">
            <span class="cm-role-name">${escape(printed.name ?? roleId)}</span>
          </button>`;
      }).join('');
      if (openRoleId && !roleIds.includes(openRoleId)) openRoleId = null;
    }

    for (const button of $('role-rail').children) {
      button.setAttribute('aria-pressed', String(button.dataset.role === openRoleId));
    }
    renderRoleSheet(state);
  }

  /**
   * One sheet, or none.
   *
   * Given a real player projection rather than a summary of one, so nothing
   * here can disagree with what was in front of that player at the table.
   */
  function renderRoleSheet(state) {
    const panel = $('role-panel');
    if (!openRoleId) {
      panel.replaceChildren();
      panel.hidden = true;
      return;
    }
    const view = projectView(state, data, viewerFor(state, openRoleId));
    const held = Object.values(view.cards ?? {}).filter((c) => c.holderCode === openRoleId);
    panel.innerHTML = `
      <h3>${escape(data.roles.roles[openRoleId]?.name
    ?? data.factions.npcs?.[openRoleId]?.name ?? openRoleId)}</h3>
      ${view.brief ? `<p>${escape(view.brief.personalGoal ?? '')}</p>` : ''}
      <ul>${held.map((card) => `
        <li>${escape(data.resources.types[card.type]?.name ?? card.type)}${
  card.state === 'spent' ? ' (spent)' : ''}</li>`).join('') || '<li class="cm-empty">no cards</li>'}
      </ul>`;
    panel.hidden = false;
  }

  /**
   * Whose eyes the sheet is drawn through.
   *
   * The seat is looked up in the replayed state first and in the save's own
   * roster second. Seats are not commanded and so are not in the log — they
   * ride alongside it — and the log's version is only whoever the reducer had
   * to invent to admit a command.
   */
  function viewerFor(state, roleId) {
    const seat = Object.values(state.seats ?? {}).find((s) => s.roleId === roleId)
      ?? Object.values(save.seats ?? {}).find((s) => s.roleId === roleId);
    return {
      kind: 'player',
      seatId: seat?.id ?? null,
      roleId,
      teamId: data.roles.roles[roleId]?.factionId ?? null,
    };
  }

  $('role-rail').addEventListener('click', (event) => {
    const button = event.target.closest('[data-role]');
    if (!button) return;
    // Clicking the open one shuts it. The rail is a row of toggles rather than
    // a choice there is no way back out of.
    openRoleId = openRoleId === button.dataset.role ? null : button.dataset.role;
    renderRoles();
  });

  // --- the controls ---------------------------------------------------------

  const goTo = (position) => { cursor.seek(position); render(); };

  $('to-start').addEventListener('click', () => goTo(0));
  $('to-end').addEventListener('click', () => goTo(cursor.length));
  for (const [id, by] of [['step-back', -1], ['step-forward', 1],
    ['skip-back', -SKIP], ['skip-forward', SKIP]]) {
    $(id).addEventListener('click', () => goTo(cursor.position + by));
  }
  $('scrub').addEventListener('input', (event) => goTo(Number(event.target.value)));
  $('history').addEventListener('click', (event) => {
    const button = event.target.closest('[data-at]');
    if (button) goTo(Number(button.dataset.at));
  });

  // --- drawing whatever the cursor is on ------------------------------------

  function viewNow() {
    // A facilitator's projection: unredacted. See the header — the file this
    // page was handed holds every secret in it already.
    return projectView(cursor.state, data, { kind: 'facilitator' });
  }

  function render() {
    const view = viewNow();
    renderBoards(view);

    $('scrub').value = String(cursor.position);
    $('replay-position').textContent = cursor.position === 0
      ? `Before anything happened — ${cursor.length} action${cursor.length === 1 ? '' : 's'} to come`
      : `After ${cursor.position} of ${cursor.length} actions`;

    const atStart = cursor.position === 0;
    const atEnd = cursor.position === cursor.length;
    for (const id of ['to-start', 'skip-back', 'step-back']) $(id).disabled = atStart;
    for (const id of ['to-end', 'skip-forward', 'step-forward']) $(id).disabled = atEnd;

    markHistory();
    renderRoles();
  }

  const nameOf = (roleId) => data.roles.roles[roleId]?.name
    ?? data.factions.npcs?.[roleId]?.name ?? roleId;

  show('open');
}

/** Join codes are minted, but names and refusal reasons are prose. */
function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
