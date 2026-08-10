/**
 * <cm-opportunity-card> — your faction's moment, and the two ways to take it.
 *
 * Renders whatever pending opportunities the projection carries — which,
 * because the manifest scopes them by faction, is exactly the ones aimed at
 * this viewer's faction and no others. The component never asks "is this
 * mine?": redaction already answered.
 *
 * The tap records a decision the faction made out loud at its table; it is
 * not a ballot, and a team-mate can re-tap until the facilitator resolves.
 * See gaps.js.
 */

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
    // exactly the viewer's own faction's, by redaction.
    const pending = Object.values(this._view.opportunities ?? {})
      .filter((record) => record.status === 'pending' && record.title !== undefined);
    if (!pending.length) { this.innerHTML = ''; return; }

    this.innerHTML = pending.map((record) => `
      <section class="cm-opportunity" data-opportunity="${escape(record.id)}">
        <h3>${escape(record.title)}</h3>
        <p class="cm-meta">An opportunity for ${escape(
    this._data.factions.factions[record.factionId]?.name ?? 'your faction')} —
          talk it over, then record the table's answer.</p>
        <div class="cm-opportunity-options">
          ${[['A', record.optionA], ['B', record.optionB]].map(([key, text]) => `
            <button type="button" data-choose="${escape(record.id)}|${key}"
                    aria-pressed="${record.choice === key}">
              <strong>${key}.</strong> ${escape(text)}
            </button>`).join('')}
        </div>
        ${record.choice ? `
          <p class="cm-meta">Recorded: option ${escape(record.choice)}.
            The facilitator settles it from here.</p>` : ''}
      </section>`).join('');

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
