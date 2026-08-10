/**
 * <cm-role-card> — a lanyard, front and (for its owner alone) back.
 *
 * The front is public: name, title, faction, the printed card art everyone
 * saw handed out at the table. The back is the character — background and
 * personal goal — and it renders only for the seat that owns the role.
 *
 * The gate is the projection, not this component being careful. `view.brief`
 * exists only in the owner's own projection (views.js attaches it), so a
 * non-owner's instance has nothing to flip to: no button, no back, nothing
 * in the DOM to find. The back's words also ride along as text beside the
 * PNG, because a personal goal you cannot quite read at thumbnail size is a
 * personal goal you will play wrong. The faction's four public goals are
 * printed alongside — they come from factions.json and are the shared half
 * of what this lanyard is for.
 */

export class CmRoleCard extends HTMLElement {
  static observedAttributes = ['code'];

  set data(value) { this._data = value; this._render(); }

  /** A projection. `viewer` and `brief` are read. */
  set view(value) { this._view = value; this._render(); }

  attributeChangedCallback() { this._render(); }

  connectedCallback() { this._render(); }

  get code() { return this.getAttribute('code') ?? this._view?.viewer?.roleId ?? null; }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    const code = this.code;
    const printed = this._data.roles.roles[code];
    if (!printed) { this.innerHTML = ''; return; }

    const faction = this._data.factions.factions[printed.factionId];
    const lower = code.toLowerCase();
    // The back is the owner's and nobody else's. The brief only arrives in
    // the owner's projection, so this is structural rather than polite.
    const isOwner = this._view.viewer?.roleId === code && Boolean(this._view.brief);
    const showingBack = isOwner && this._flipped;

    this.innerHTML = `
      <figure class="cm-lanyard" data-side="${showingBack ? 'back' : 'front'}"
              style="--faction-colour: ${escape(faction?.colour ?? '#888888')}">
        <img src="assets/cards/lanyard_role_${escape(lower)}-${showingBack ? 'back' : 'front'}.png"
             alt="${escape(printed.name)}${showingBack ? ' — private side' : ''}">
        <figcaption>
          <strong>${escape(printed.name)}</strong>
          <span class="cm-meta">${escape(faction?.name ?? '')}</span>
        </figcaption>
        ${isOwner ? `
          <button type="button" class="cm-lanyard-flip" data-flip>
            ${showingBack ? 'Show the front' : 'Read the back'}
          </button>` : ''}
      </figure>
      ${showingBack ? `
        <div class="cm-lanyard-private">
          <h4>Who you are</h4>
          <p>${escape(this._view.brief.background ?? '')}</p>
          <h4>Your personal goal</h4>
          <p>${escape(this._view.brief.personalGoal ?? '')}</p>
          <h4>${escape(faction?.name ?? 'Your faction')}'s goals</h4>
          <ul>${(faction?.goals ?? []).map((goal) => `
            <li>${escape(goal.statement)}</li>`).join('')}
          </ul>
        </div>` : ''}`;

    const flip = this.querySelector('[data-flip]');
    if (flip) {
      flip.onclick = () => {
        this._flipped = !this._flipped;
        this._render();
      };
    }
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-role-card', CmRoleCard);
