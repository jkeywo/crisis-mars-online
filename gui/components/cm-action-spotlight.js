/**
 * <cm-action-spotlight> — one map's live action, from the room's side.
 *
 * The player mirror of the adjudication panel: who is up, what they said,
 * which cards counted, what the die did, what it all came to and how the
 * facilitator told it. Everything here is PUBLIC state — the spotlight is
 * performed aloud — so every console draws the same story.
 *
 * Two affordances, both the viewer's own: the actor gets the declaration
 * form while the record is still theirs to write, and an invited ally gets
 * the yes and the no. Impact and its band come from derive.js at render,
 * never from state, so this readout and the facilitator's clamp are the
 * same computation.
 */

import { actionImpact, bandFor, consequenceOf } from '../rules/derive.js';

export class CmActionSpotlight extends HTMLElement {
  static observedAttributes = ['map'];

  set data(value) { this._data = value; this._render(); }

  set view(value) { this._view = value; this._render(); }

  attributeChangedCallback() { this._render(); }

  connectedCallback() { this._render(); }

  get mapId() { return this.getAttribute('map'); }

  _emit(verb, payload) {
    this.dispatchEvent(new CustomEvent('cm-command', { bubbles: true, detail: { verb, payload } }));
  }

  _name(code) {
    return this._data?.roles.roles[code]?.name ?? code;
  }

  _cardName(cardId) {
    const card = this._data?.resources.cards[cardId];
    return this._data?.resources.types[card?.type]?.name ?? cardId;
  }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    // A projection arriving mid-keystroke must not eat the actor's sentence.
    if (this.contains(document.activeElement)
      && document.activeElement.matches('input, textarea, select')) return;

    const id = this._view.initiative?.current?.[this.mapId];
    const action = id ? this._view.actions?.[id] : null;
    const queue = this._view.initiative?.queues?.[this.mapId] ?? [];

    const umpire = this._view.lanes?.[this.mapId]
      ? `<p class="cm-meta">Umpire for this map: ${escape(this._view.lanes[this.mapId])}.</p>` : '';

    if (!action) {
      this.innerHTML = queue.length ? `${umpire}
        <p class="cm-meta">Up next: <strong>${escape(this._name(queue[0]))}</strong> —
          waiting on the facilitator to call them.</p>` : umpire && queue ? umpire : '';
      return;
    }

    const me = this._view.viewer?.roleId ?? null;
    const impact = actionImpact(this._view, this._data, action);
    const band = bandFor(impact, this._data);
    const consequence = action.roll === null ? null : consequenceOf(action.roll, this._data);

    this.innerHTML = `${umpire}
      <div class="cm-spotlight" data-status="${escape(action.status)}">
        <h4>${escape(this._name(action.actorCode))}${action.actorCode === me ? ' — you' : ''}</h4>
        ${action.declaration
    ? `<blockquote class="cm-spotlight-words">${escape(action.declaration)}</blockquote>`
    : '<p class="cm-meta">Declaring…</p>'}
        ${Object.keys(action.allies).length ? `
          <p class="cm-spotlight-allies">${Object.entries(action.allies).map(([code, status]) => `
            <span class="cm-ally-chip" data-ally="${escape(status)}">${
  escape(this._name(code))} · ${escape(status)}</span>`).join(' ')}</p>` : ''}
        ${action.offered.length ? `
          <p class="cm-meta">Offered: ${action.offered.map((cardId) => {
    const fate = action.accepted.includes(cardId) ? 'accepted'
      : action.vetoed.includes(cardId) ? 'vetoed' : 'offered';
    return `<span class="cm-card-chip" data-fate="${fate}">${
      escape(this._cardName(cardId))}</span>`;
  }).join(' ')}</p>` : ''}
        <p class="cm-spotlight-sums">
          Impact <strong>${impact}</strong> · ${escape(band?.label ?? '')}
          ${action.difficulty ? ` · difficulty ${action.difficulty}` : ''}
          ${action.futureImpactSpent ? ` · +${action.futureImpactSpent} banked` : ''}
          ${action.roll !== null ? ` · die ${action.roll} (${escape(consequence?.id ?? '')})` : ''}
        </p>
        ${action.narration ? `
          <blockquote class="cm-spotlight-narration">${escape(action.narration)}</blockquote>` : ''}
        ${this._actorForm(action, me)}
        ${this._allyButtons(action, me)}
      </div>`;

    this._wire(action);
  }

  /** The declaration form, for the actor while the record is still theirs. */
  _actorForm(action, me) {
    if (me !== action.actorCode || action.status !== 'declaring') return '';
    const candidates = Object.keys(this._view.actionCards ?? {})
      .filter((code) => code !== me
        && this._view.actionCards[code].placed && !this._view.actionCards[code].spent);
    const held = Object.values(this._view.cards ?? {})
      .filter((card) => card.holderCode === me && card.state === 'held');
    const bank = this._view.futureImpacts?.[me] ?? 0;

    return `
      <form class="cm-declare" data-declare="${escape(action.id)}">
        <label>What are you doing?
          <textarea name="text" rows="2">${escape(action.declaration)}</textarea>
        </label>
        ${candidates.length ? `
          <fieldset><legend>Allies to invite</legend>
            ${candidates.map((code) => `
              <label><input type="checkbox" name="ally" value="${escape(code)}"
                ${action.allies[code] ? 'checked' : ''}> ${escape(this._name(code))}</label>`).join('')}
          </fieldset>` : ''}
        ${held.length ? `
          <fieldset><legend>Offer cards</legend>
            ${held.map((card) => `
              <label><input type="checkbox" name="card" value="${escape(card.id)}"
                ${action.offered.includes(card.id) ? 'checked' : ''}> ${
  escape(this._cardName(card.id))}</label>`).join('')}
          </fieldset>` : ''}
        ${bank > 0 ? `
          <label>Spend banked future impact (${bank})
            <input type="number" name="futureImpact" min="0" max="${bank}"
              value="${action.futureImpactSpent}">
          </label>` : ''}
        <button type="submit" class="cm-primary">Declare</button>
      </form>`;
  }

  /** The invitation, for whoever it names. */
  _allyButtons(action, me) {
    if (!me || action.allies[me] !== 'invited'
      || ['closed', 'skipped'].includes(action.status)) return '';
    return `
      <div class="cm-ally-answer">
        <p>${escape(this._name(action.actorCode))} asks you to spend your action with theirs.</p>
        <button type="button" class="cm-primary" data-confirm="${escape(action.id)}">Join in</button>
        <button type="button" data-decline="${escape(action.id)}">Decline</button>
      </div>`;
  }

  _wire(action) {
    const form = this.querySelector('[data-declare]');
    if (form) {
      form.onsubmit = (event) => {
        event.preventDefault();
        this._emit('declare-action', {
          actionId: form.dataset.declare,
          text: form.elements.text.value,
          allyCodes: [...form.querySelectorAll('input[name="ally"]:checked')].map((i) => i.value),
          cardIds: [...form.querySelectorAll('input[name="card"]:checked')].map((i) => i.value),
          futureImpact: Number(form.elements.futureImpact?.value ?? 0),
        });
      };
    }
    const confirm = this.querySelector('[data-confirm]');
    if (confirm) {
      confirm.onclick = () => this._emit('confirm-ally', { actionId: confirm.dataset.confirm });
    }
    const decline = this.querySelector('[data-decline]');
    if (decline) {
      decline.onclick = () => this._emit('decline-ally', { actionId: decline.dataset.decline });
    }
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-action-spotlight', CmActionSpotlight);
