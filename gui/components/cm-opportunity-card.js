/**
 * <cm-opportunity-card> — your faction's moment, and the two ways to take it.
 *
 * Renders whatever opportunities the projection carries the words of —
 * which, because the manifest scopes them by faction, is exactly the ones
 * aimed at this viewer's faction and no others. The component never asks
 * "is this mine?": redaction already answered. Pending records are votable;
 * one answered this turn stays on screen, settled, until the turn ends.
 *
 * By the author's ruling the tap is a vote: each claimed seat of the
 * faction picks an option, revotable while the record is pending, and the
 * card marks consensus when every claimed seat agrees. The facilitator
 * resolves on judgement either way. See gaps.js.
 */

import { opportunityConsensus } from '../rules/derive.js';

export class CmOpportunityCard extends HTMLElement {
  set data(value) { this._data = value; this._render(); }

  /** A projection. `opportunities` is read. */
  set view(value) { this._view = value; this._render(); }

  connectedCallback() { this._render(); }

  _emit(verb, payload) {
    this.dispatchEvent(new CustomEvent('cm-command', { bubbles: true, detail: { verb, payload } }));
  }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    // A record's existence and status are public; its words are the
    // faction's. Render only the ones whose words arrived — which is
    // exactly the viewer's own faction's, by redaction — while they are
    // live, plus the ones answered this very turn, settled and dimmed, so
    // the moment does not vanish the instant the facilitator resolves it.
    const relevant = Object.values(this._view.opportunities ?? {})
      .filter((record) => record.title !== undefined
        && (record.status === 'pending'
          || record.resolvedTurn === this._view.phase?.turn));
    if (!relevant.length) { this.innerHTML = ''; return; }

    const me = this._view.viewer?.roleId ?? null;
    this.innerHTML = relevant.map((record) => {
      const live = record.status === 'pending';
      const { agreed } = opportunityConsensus(this._view, this._data, record);
      const votes = Object.entries(record.votes ?? {});
      return `
      <section class="cm-opportunity" data-opportunity="${escape(record.id)}"
               data-status="${escape(record.status)}"
               data-consensus="${agreed ?? ''}">
        <h3>${escape(record.title)}</h3>
        <p class="cm-meta">An opportunity for ${escape(
    this._data.factions.factions[record.factionId]?.name ?? 'your faction')}${live ? ` —
          talk it over, then vote. Every claimed seat agreeing is consensus.` : '.'}</p>
        <div class="cm-opportunity-options">
          ${[['A', record.optionA], ['B', record.optionB]].map(([key, text]) => live ? `
            <button type="button" data-choose="${escape(record.id)}|${key}"
                    aria-pressed="${(record.votes ?? {})[me] === key}">
              <strong>${key}.</strong> ${escape(text)}
            </button>` : `
            <p class="cm-opportunity-option"><strong>${key}.</strong> ${escape(text)}</p>`).join('')}
        </div>
        ${votes.length ? `
          <p class="cm-meta">Votes: ${votes.map(([code, choice]) => `${escape(
    this._data.roles.roles[code]?.name ?? code)} — ${escape(choice)}`).join('; ')}.
            ${live ? agreed ? `<strong>Consensus on ${agreed}.</strong>`
    : 'No consensus yet.' : ''}</p>` : ''}
        ${live ? '' : '<p class="cm-meta">Resolved — the facilitator has ruled.</p>'}
      </section>`;
    }).join('');

    for (const button of this.querySelectorAll('[data-choose]')) {
      button.onclick = () => {
        const [opportunityId, choice] = button.dataset.choose.split('|');
        this._emit('choose-opportunity', { opportunityId, choice });
      };
    }
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-opportunity-card', CmOpportunityCard);
