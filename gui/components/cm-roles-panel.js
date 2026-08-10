/**
 * <cm-roles-panel> — every lanyard, who wears it, and the umpire's hands on
 * their cards.
 *
 * The Roles tab: faction-grouped rows — lanyard thumb, printed name, code,
 * the seat wearing it (or "unclaimed") and whether that seat is connected.
 * Selecting a row opens the management panel, three columns by the author's
 * ruling: the player's hand (with their loans out), their discard pile, and
 * the umpire's actions — an add-a-card picker over every card NOT currently
 * in that hand (from another hand or a discard — moved by the explicit
 * `facilitator:move-card` verb, override-ledgered like everything the umpire
 * does), removal to the owner's discard or straight back to the owner, the
 * assign-action-card buttons for the player who never placed, and the
 * private note ledger (`facilitator:note` — the same ledger the
 * adjudication panel reads back).
 *
 * NPC lanyards are not here — they have their own tab.
 */

export class CmRolesPanel extends HTMLElement {
  set data(value) { this._data = value; this._render(); }

  /** The facilitator's own state. */
  set view(value) { this._view = value; this._render(); }

  connectedCallback() { this._render(); }

  _emit(verb, payload) {
    this.dispatchEvent(new CustomEvent('cm-facilitate', {
      bubbles: true, detail: { verb, payload },
    }));
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
    if (this.contains(document.activeElement)
      && document.activeElement.matches('input, textarea, select')) return;

    const byFaction = new Map();
    for (const role of Object.values(this._view.roles ?? {})) {
      if (role.npc) continue;
      const factionId = this._data.roles.roles[role.id]?.factionId ?? 'unaligned';
      if (!byFaction.has(factionId)) byFaction.set(factionId, []);
      byFaction.get(factionId).push(role);
    }

    this.innerHTML = [...byFaction].map(([factionId, roles]) => {
      const faction = this._data.factions.factions[factionId];
      return `
      <section class="cm-roles-admin-faction"
               style="--faction-colour: ${escape(faction?.colour ?? '#888888')}">
        <h3>${escape(faction?.name ?? factionId)}</h3>
        ${roles.map((role) => this._row(role)).join('')}
      </section>`;
    }).join('');

    this._wire();
  }

  _row(role) {
    const code = role.id;
    const seat = role.claimedBySeat ? this._view.seats?.[role.claimedBySeat] : null;
    const open = this._openCode === code;
    return `
      <article class="cm-role-admin" data-code="${escape(code)}" data-open="${open}">
        <button type="button" class="cm-role-admin-row" data-toggle="${escape(code)}"
                aria-expanded="${open}">
          <img src="assets/cards/lanyard_role_${escape(code.toLowerCase())}-front.png"
               alt="" loading="lazy">
          <span class="cm-role-admin-name">${escape(this._name(code))}
            <span class="cm-meta">${escape(code)}</span></span>
          <span class="cm-role-admin-seat">${seat
    ? `${escape(seat.name || 'Unnamed')}${seat.connected ? '' : ' — away'}`
    : 'unclaimed'}</span>
        </button>
        ${open ? this._management(code) : ''}
      </article>`;
  }

  _management(code) {
    const cards = Object.values(this._view.cards ?? {});
    const inHand = cards.filter((c) => c.holderCode === code && c.state === 'held');
    const elsewhere = cards.filter((c) =>
      c.state !== 'destroyed' && !(c.holderCode === code && c.state === 'held'));
    const whereIs = (card) => (card.state === 'spent'
      ? `discard (${card.ownerCode}'s)` : `with ${card.holderCode}`);
    const placed = this._view.actionCards?.[code]?.placed ?? null;

    const notes = this._view.notes?.[code] ?? [];

    return `
      <div class="cm-role-admin-panel">
        <div class="cm-role-admin-column">
          <cm-hand readonly code="${escape(code)}" sections="held,loans"></cm-hand>
        </div>

        <div class="cm-role-admin-column">
          <cm-hand readonly code="${escape(code)}" sections="discard,destroyed"></cm-hand>
        </div>

        <div class="cm-role-admin-column cm-role-admin-actions">
        <fieldset><legend>Give them a card</legend>
          <div class="cm-row">
            <select data-give-card="${escape(code)}">
              <option value="">Card…</option>
              ${elsewhere.map((card) => `
                <option value="${escape(card.id)}">${escape(this._cardName(card.id))} — ${
  escape(whereIs(card))}</option>`).join('')}
            </select>
            <button type="button" data-give="${escape(code)}">Add to hand</button>
          </div>
        </fieldset>

        <fieldset><legend>Take one away</legend>
          <div class="cm-row">
            <select data-take-card="${escape(code)}">
              <option value="">Card…</option>
              ${inHand.map((card) => `
                <option value="${escape(card.id)}">${escape(this._cardName(card.id))}${
  card.ownerCode !== code ? ` — ${escape(card.ownerCode)}'s loan` : ''}</option>`).join('')}
            </select>
            <button type="button" data-take-discard="${escape(code)}">To the discard</button>
            <button type="button" data-take-return="${escape(code)}">Back to its owner</button>
          </div>
        </fieldset>

        <fieldset><legend>Action card</legend>
          <div class="cm-row">
            <span class="cm-meta">${placed
    ? `Placed on ${escape(this._data.maps.maps[placed]?.name ?? placed)}.`
    : 'Not placed.'}</span>
            ${Object.entries(this._data.maps.maps).map(([mapId, map]) => `
              <button type="button" data-assign="${escape(code)}|${escape(mapId)}"
                aria-pressed="${placed === mapId}">${escape(map.name)}</button>`).join('')}
          </div>
        </fieldset>

        <fieldset><legend>Your notes <span class="cm-meta">${notes.length}</span></legend>
          ${notes.map((note) => `<p class="cm-meta">${escape(note.text)}</p>`).join('')
            || '<p class="cm-meta">Nothing written against them.</p>'}
          <div class="cm-row">
            <input data-note-text="${escape(code)}" maxlength="200"
                   placeholder="Prepare for the future…">
            <button type="button" data-note="${escape(code)}">Note it</button>
          </div>
        </fieldset>
        </div>
      </div>`;
  }

  _wire() {
    for (const button of this.querySelectorAll('[data-toggle]')) {
      button.onclick = () => {
        const code = button.dataset.toggle;
        this._openCode = this._openCode === code ? null : code;
        this._render();
      };
    }
    // The read-only hands inside the open panel need their projection —
    // one column for the hand and loans, one for the discard.
    for (const hand of this.querySelectorAll('cm-hand')) {
      hand.data = this._data;
      hand.view = this._view;
    }
    for (const button of this.querySelectorAll('[data-note]')) {
      button.onclick = () => {
        const code = button.dataset.note;
        const input = this.querySelector(`[data-note-text="${code}"]`);
        if (!input.value.trim()) return;
        this._emit('facilitator:note', { code, text: input.value });
        input.value = '';
      };
    }
    for (const button of this.querySelectorAll('[data-give]')) {
      button.onclick = () => {
        const cardId = this.querySelector(`[data-give-card="${button.dataset.give}"]`).value;
        if (cardId) this._emit('facilitator:move-card', { cardId, to: button.dataset.give });
      };
    }
    for (const button of this.querySelectorAll('[data-take-discard]')) {
      button.onclick = () => {
        const cardId = this.querySelector(
          `[data-take-card="${button.dataset.takeDiscard}"]`).value;
        if (cardId) this._emit('facilitator:move-card', { cardId, to: 'discard' });
      };
    }
    for (const button of this.querySelectorAll('[data-take-return]')) {
      button.onclick = () => {
        const cardId = this.querySelector(
          `[data-take-card="${button.dataset.takeReturn}"]`).value;
        if (!cardId) return;
        this._emit('facilitator:move-card', {
          cardId, to: this._view.cards[cardId].ownerCode,
        });
      };
    }
    for (const button of this.querySelectorAll('[data-assign]')) {
      button.onclick = () => {
        const [code, mapId] = button.dataset.assign.split('|');
        this._emit('facilitator:assign-action-card', { code, mapId });
      };
    }
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-roles-panel', CmRolesPanel);
