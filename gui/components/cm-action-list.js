/**
 * <cm-action-list> — what you can do now, and why you cannot do the rest.
 *
 * Built by asking the same admission functions the host will ask. The answer
 * here is presentation only — the host's is the one that decides — but asking
 * the real rules rather than reimplementing them means a control is never
 * greyed out for a reason the host would not give.
 *
 * Refused actions are shown rather than hidden, with the reason attached. A
 * player who cannot see that Recruit Soldiers exists cannot learn that it
 * costs five silver, and "why is there nothing here?" is a worse question than
 * "why can't I afford that?".
 *
 * Available actions come first, everything refused sits below under its own
 * heading — a player scans one short list of what they can actually do rather
 * than picking it out of everything the phase makes available in principle.
 *
 * A shire clicked on the map (`focusShireId`) promotes and marks whichever
 * available actions could target it, using the same field data the chooser
 * would render — so "click a target to see what you can do with it" can never
 * name an action the chooser would then refuse a shire for.
 */

import { availableTo } from '../rules/admission.js';
import { fieldsFor, labelFor, noteFor } from '../rules/commands.js';

/**
 * Verbs a bespoke control already owns, so a generic row here would be a
 * second, worse way to do the same thing — and, unlabelled, would print its
 * own verb at the player.
 */
const ELSEWHERE = new Set(['claim-role']);

export class CmActionList extends HTMLElement {
  set data(value) { this._data = value; this._render(); }

  set view(value) { this._view = value; this._render(); }

  connectedCallback() { this._render(); }

  _render() {
    if (!this.isConnected || !this._view || !this._data) return;
    const roleId = this._view.viewer?.roleId;
    if (!roleId) { this.innerHTML = ''; return; }

    // The client holds a redacted projection, so anything whose legality turns
    // on a secret cannot be judged here. Those come back as refused for a
    // reason that is about the view rather than the game, which is why the
    // host's answer is the only one that counts.
    const actor = { seatId: this._view.viewer.seatId, kind: 'player', roleId };
    const actions = availableTo(this._view, this._data, actor)
      // Taking a lanyard has its own control — the lobby's role grid — so a
      // generic row for it here would be a second, worse way to do the same
      // thing.
      .filter((action) => !ELSEWHERE.has(action.verb));

    if (!actions.length) {
      // The two brackets are not phases anybody plays, and are not called
      // "lobby" or "epilogue" anywhere a player can see — so they get the
      // sentence that is true of them rather than "nothing to do in the
      // epilogue phase", which names a thing the game does not have.
      const named = {
        lobby: 'The game has not begun. Take a lanyard and wait to be called on.',
        epilogue: 'Time has been called. Nothing more can be played.',
      }[this._view.phase.name];
      this.innerHTML = `<p class="cm-empty">${named
        ?? `Nothing to do in the ${this._view.phase.name} phase — this one is for talking.`}</p>`;
      return;
    }

    const available = actions.filter((a) => a.ok);
    const unavailable = actions.filter((a) => !a.ok);

    // The ellipsis is a promise that clicking opens a form, so it is read off
    // the same fields the form is built from rather than off a list kept here
    // — a list which could, and did, disagree with what the chooser does.
    const row = (action) => `
      <li class="cm-action" data-ok="${action.ok}">
        <button type="button" data-verb="${action.verb}" ${action.ok ? '' : 'disabled'}>
          ${labelFor(action.verb)}${
  fieldsFor(action.verb, this._view, this._data).length ? '…' : ''}
        </button>
        <span class="cm-action-note">${
  action.ok ? noteFor(action.verb, this._view, this._data) : escape(action.reason ?? '')}</span>
      </li>`;

    this.innerHTML = `
      <ul class="cm-actions cm-actions-available">${available.map(row).join('')}</ul>
      ${unavailable.length ? `
        <h4 class="cm-actions-heading">Not right now</h4>
        <ul class="cm-actions cm-actions-unavailable">${unavailable.map(row).join('')}</ul>`
    : ''}`;
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-action-list', CmActionList);
