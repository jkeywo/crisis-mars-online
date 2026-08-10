/**
 * <cm-hand> — one role's cards: in hand, out on loan, and in the discard.
 *
 * Hands are public in this game — the paper version plays cards face up on
 * the table — so this component draws anybody's, not only yours. What varies
 * is the affordances: with `readonly` it is a display and nothing else; with
 * `acts-for` set it acts for that role and stamps `roleId` into every payload
 * (the facilitator driving the NPC hands); bare, it acts as the viewer.
 *
 * It raises `cm-command` for the page to send and `cm-view-card` for the
 * page's card viewer. It decides nothing — admission does, on the host.
 */

export class CmHand extends HTMLElement {
  static observedAttributes = ['code', 'readonly', 'acts-for', 'sections'];

  set data(value) { this._data = value; this._render(); }

  /** A projection. `cards`, `roles` and `phase` are read. */
  set view(value) { this._view = value; this._render(); }

  attributeChangedCallback() { this._render(); }

  connectedCallback() { this._render(); }

  /** Whose cards to draw. */
  get code() {
    return this.getAttribute('code') ?? this.getAttribute('acts-for')
      ?? this._view?.viewer?.roleId ?? null;
  }

  get readonly() { return this.hasAttribute('readonly'); }

  /**
   * Which of the four sections to draw: a comma list of `held`, `loans`,
   * `discard`, `destroyed`. Unset means all of them — the whole life of a
   * role's cards in one column. Set, it lets a layout put the hand and the
   * discard side by side as their own columns (the Roles tab does).
   */
  get sections() {
    const listed = this.getAttribute('sections');
    if (!listed) return null;
    return new Set(listed.split(',').map((s) => s.trim()).filter(Boolean));
  }

  _emit(verb, payload) {
    // Acting for somebody — the facilitator behind an NPC lanyard — names the
    // role in the payload, which is exactly what subjectOf() reads.
    const actsFor = this.getAttribute('acts-for');
    this.dispatchEvent(new CustomEvent('cm-command', {
      bubbles: true,
      detail: { verb, payload: actsFor ? { roleId: actsFor, ...payload } : payload },
    }));
  }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    const code = this.code;
    if (!code) { this.innerHTML = ''; return; }

    const cards = Object.values(this._view.cards ?? {});
    const held = cards.filter((c) => c.holderCode === code && c.state === 'held');
    const onLoan = cards.filter((c) => c.ownerCode === code
      && c.holderCode !== code && c.state === 'held');
    const discarded = cards.filter((c) => c.ownerCode === code && c.state === 'spent');
    const destroyed = cards.filter((c) => c.ownerCode === code && c.state === 'destroyed');

    const typeName = (card) => this._data.resources.types[card.type]?.name ?? card.type;
    const whoIs = (roleId) => this._data.roles.roles[roleId]?.name
      ?? this._data.factions.npcs?.[roleId]?.name ?? roleId;
    const others = Object.keys(this._view.roles ?? {}).filter((c) => c !== code);

    // The one-back-per-phase rule is the host's to enforce; the button is
    // simply not offered outside the phase it belongs to, or once this
    // role's recovery is used, so a press that would certainly be refused
    // is not invited.
    const recovery = !this.readonly
      && this._view.phase?.name === 'negotiation'
      && (this._view.roles?.[code]?.perTurn?.recovered ?? 0) < 1;

    const thumb = (card) => `
      <button type="button" class="cm-card-thumb" data-view-card="${escape(card.id)}"
              aria-label="Look at ${escape(typeName(card))}">
        <img src="assets/cards/${escape(card.id)}.png" alt="${escape(typeName(card))}" loading="lazy">
      </button>`;

    const wanted = this.sections;
    const wants = (section) => wanted === null || wanted.has(section);

    this.innerHTML = `
      ${wants('held') ? `
      <section class="cm-hand-held">
        <h4>In hand <span class="cm-meta">${held.length}</span></h4>
        <ul class="cm-hand-cards">${held.map((card) => `
          <li data-card="${escape(card.id)}">
            ${thumb(card)}
            <div class="cm-hand-card-words">
              <span>${escape(typeName(card))}</span>
              ${card.ownerCode !== code ? `
                <span class="cm-hand-loan-badge">on loan from ${escape(whoIs(card.ownerCode))}</span>` : ''}
              ${this.readonly ? '' : `
                <div class="cm-hand-actions">
                  <select data-hand-to="${escape(card.id)}" aria-label="Hand this card to">
                    <option value="">Hand to…</option>
                    ${others.map((c) => `<option value="${escape(c)}">${escape(whoIs(c))}</option>`).join('')}
                  </select>
                  <button type="button" data-discard="${escape(card.id)}">Discard</button>
                </div>`}
            </div>
          </li>`).join('') || '<li class="cm-empty">nothing in hand</li>'}
        </ul>
      </section>` : ''}

      ${wants('loans') && onLoan.length ? `
        <section class="cm-hand-loans">
          <h4>Out on loan <span class="cm-meta">${onLoan.length}</span></h4>
          <ul class="cm-hand-cards">${onLoan.map((card) => `
            <li data-card="${escape(card.id)}">
              ${thumb(card)}
              <div class="cm-hand-card-words">
                <span>${escape(typeName(card))} — with ${escape(whoIs(card.holderCode))}</span>
                ${this.readonly ? '' : `
                  <div class="cm-hand-actions">
                    <button type="button" data-reclaim="${escape(card.id)}">Reclaim</button>
                  </div>`}
              </div>
            </li>`).join('')}
          </ul>
        </section>` : ''}

      ${wants('discard') ? `
      <section class="cm-hand-discard">
        <h4>Discard pile <span class="cm-meta">${discarded.length}</span></h4>
        <ul class="cm-hand-cards cm-hand-spent">${discarded.map((card) => `
          <li data-card="${escape(card.id)}" data-state="spent">
            ${thumb(card)}
            <div class="cm-hand-card-words">
              <span>${escape(typeName(card))}</span>
              ${recovery ? `
                <div class="cm-hand-actions">
                  <button type="button" data-recover="${escape(card.id)}">Recover</button>
                </div>` : ''}
            </div>
          </li>`).join('') || '<li class="cm-empty">nothing spent</li>'}
        </ul>
      </section>` : ''}
      ${wants('destroyed') && destroyed.length ? `
        <section class="cm-hand-destroyed">
          <h4>Destroyed <span class="cm-meta">${destroyed.length}</span></h4>
          <p class="cm-meta">${destroyed.map((card) => escape(typeName(card))).join(', ')}
            — out of the game, never recoverable.</p>
        </section>` : ''}`;

    for (const button of this.querySelectorAll('[data-view-card]')) {
      button.onclick = () => this.dispatchEvent(new CustomEvent('cm-view-card', {
        bubbles: true, detail: { cardId: button.dataset.viewCard },
      }));
    }
    if (this.readonly) return;
    for (const select of this.querySelectorAll('[data-hand-to]')) {
      select.onchange = () => {
        if (!select.value) return;
        this._emit('hand-card', { cardId: select.dataset.handTo, toCode: select.value });
        select.value = '';
      };
    }
    for (const button of this.querySelectorAll('[data-discard]')) {
      button.onclick = () => this._emit('discard-card', { cardId: button.dataset.discard });
    }
    for (const button of this.querySelectorAll('[data-reclaim]')) {
      button.onclick = () => this._emit('reclaim-card', { cardId: button.dataset.reclaim });
    }
    for (const button of this.querySelectorAll('[data-recover]')) {
      button.onclick = () => this._emit('recover-discard', { cardId: button.dataset.recover });
    }
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-hand', CmHand);
