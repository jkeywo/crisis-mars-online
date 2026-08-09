/**
 * <cm-seat-roster> — who is here and who they are playing.
 *
 * Shown to everyone, because faction membership and who holds which crown are
 * public in the paper game. What is *not* public is anyone's strength, so this
 * shows names and roles and nothing else.
 *
 * Set `.seats` and `.roles` as properties rather than attributes: they are
 * data, not strings, and stringifying a roster into the DOM to parse it back
 * out again would be a strange thing to do.
 */

export class CmSeatRoster extends HTMLElement {
  static observedAttributes = ['editable'];

  set seats(value) { this._seats = value ?? []; this._render(); }

  get seats() { return this._seats ?? []; }

  /** Optional map of roleId -> display name, for showing a role properly. */
  set roles(value) { this._roles = value ?? {}; this._render(); }

  /**
   * Whether each seat offers a way to clear it out.
   *
   * An attribute the facilitator's page grants, not something inferred here.
   * Every console shows this roster and only one of them may empty a chair —
   * and unlike most of what the umpire can do, this one is aimed at a person
   * rather than at the board.
   */
  get editable() { return this.hasAttribute('editable'); }

  attributeChangedCallback() { this._render(); }

  connectedCallback() { this._render(); }

  _render() {
    if (!this.isConnected) return;
    const seats = [...this.seats].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    if (seats.length === 0) {
      this.innerHTML = '<p class="cm-empty">Nobody has joined yet.</p>';
      return;
    }

    const rows = seats.map((seat) => {
      const role = seat.roleId
        ? (this._roles?.[seat.roleId]?.name ?? seat.roleName ?? seat.roleId)
        : null;
      const who = seat.name || 'Unnamed';
      return `
        <li class="cm-seat" data-connected="${seat.connected}">
          <span class="cm-seat-dot" aria-hidden="true"></span>
          <span class="cm-seat-name">${escape(who)}</span>
          <span class="cm-seat-role">${role ? escape(role) : '<em>choosing</em>'}</span>
          ${seat.kind === 'facilitator' ? '<span class="cm-seat-tag">facilitator</span>' : ''}
          ${this.editable ? `
            <button type="button" class="cm-seat-clear" data-clear-seat="${escape(seat.id)}"
                    data-who="${escape(who)}" data-role="${role ? escape(role) : ''}"
                    aria-label="Clear ${escape(who)} out of ${
  role ? escape(role) : 'their seat'}">Clear</button>` : ''}
        </li>`;
    }).join('');

    const playing = seats.filter((s) => s.kind === 'player').length;
    this.innerHTML = `
      <ul class="cm-roster">${rows}</ul>
      <p class="cm-meta">${playing} player${playing === 1 ? '' : 's'} seated.</p>`;

    for (const button of this.querySelectorAll('[data-clear-seat]')) {
      button.onclick = () => {
        const { who, role } = button.dataset;
        // Asked out loud, like taking a role out of the game. This one is
        // aimed at a person: the character keeps its lands and its silver and
        // stays on the board, but whoever was in the chair is out of it and
        // cannot resume — and at a live table the umpire is one misread row
        // away from clearing somebody who is only in the loo.
        // eslint-disable-next-line no-alert
        const sure = globalThis.confirm?.(role
          ? `Clear ${who} out of ${role}? ${role} stays in the game, with everything they hold, `
            + 'and anyone can take them. This person will have to join again.'
          : `Clear ${who} out? They have not taken a character. They will have to join again.`);
        if (sure === false) return;
        this.dispatchEvent(new CustomEvent('cm-facilitate', {
          bubbles: true,
          detail: { verb: 'facilitator:remove-seat', payload: { seatId: button.dataset.clearSeat } },
        }));
      };
    }
  }
}

/** The roster carries names people typed, so it never goes in raw. */
function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-seat-roster', CmSeatRoster);
