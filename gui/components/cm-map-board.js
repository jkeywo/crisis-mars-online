/**
 * <cm-map-board> — one of the three printed boards, redrawn from state.
 *
 * Data-driven from maps.json: tell it which map it is with the `map`
 * attribute and it renders that map's name, its tracks and its locations.
 * Nothing about Earth, Mars or the Belt is written in here, so a fourth board
 * in the data would be a fourth instance of this and no new code.
 *
 * What it draws is the paper form, redrawn: a rail per track with the name
 * and the current value, and a row of location slots that are the map's
 * geography. RBO's map drew "only what has moved" because its artwork already
 * said the printed truth; these boards have no artwork yet, so every track is
 * drawn every time — but the discipline survives in two marks. A track whose
 * value has left its printed initial carries `data-moved`, because a moved
 * counter is the kind of thing a table argues about; and a track that changed
 * in this very projection flashes its delta, because a player glancing up
 * from a negotiation wants to know what just happened, not only what is true.
 *
 * Read-only. It renders a projection and decides nothing. The replay page
 * is its home now — both live consoles moved to cm-board-overlay, the
 * printed sheet with chips — and it stays because the scrubber wants a
 * compact board that needs no geometry file to be legible at speed.
 */

export class CmMapBoard extends HTMLElement {
  static observedAttributes = ['map'];

  /** The static dataset. */
  set data(value) { this._data = value; this._render(); }

  /** A projection. Only `maps` and `actionCards` are read. */
  set view(value) { this._view = value; this._render(); }

  attributeChangedCallback() { this._render(); }

  connectedCallback() { this._render(); }

  disconnectedCallback() {
    clearTimeout(this._flashTimer);
    this._flashTimer = null;
  }

  get mapId() { return this.getAttribute('map'); }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    const mapId = this.mapId;
    const printed = this._data.maps.maps[mapId];
    const live = this._view.maps?.[mapId];
    if (!printed || !live) { this.innerHTML = ''; return; }

    // What changed since the last projection this instance drew. Compared
    // here rather than tracked by the page, so every console gets the same
    // flash for free — and remembered per track, because two tracks moving in
    // one action both deserve their moment.
    const before = this._lastValues ?? {};
    const changed = {};
    for (const [trackId, value] of Object.entries(live.tracks)) {
      if (trackId in before && before[trackId] !== value) {
        changed[trackId] = value - before[trackId];
      }
    }
    this._lastValues = { ...live.tracks };

    const trackRow = (trackId) => {
      const track = this._data.maps.tracks[trackId];
      const value = live.tracks[trackId];
      if (track === undefined || value === undefined) return '';
      const delta = changed[trackId];
      const moved = value !== track.initial;
      return `
        <li class="cm-track" data-track="${escape(trackId)}"
            ${moved ? 'data-moved="true"' : ''}
            ${delta ? `data-flash="${delta > 0 ? 'up' : 'down'}"` : ''}>
          <span class="cm-track-name">${escape(track.name)}</span>
          <span class="cm-track-value">${value}</span>
          ${delta ? `<span class="cm-track-delta">${delta > 0 ? '+' : '−'}${Math.abs(delta)}</span>` : ''}
        </li>`;
    };

    // The action cards placed on this map. Placement is map-level — the
    // printed rule says "on a map", so the tokens live in their own strip
    // rather than being pinned to a location; see gaps.js. Empty until the
    // Negotiation Phase puts something here.
    const placed = Object.entries(this._view.actionCards ?? {})
      .filter(([, card]) => card.placed === mapId);
    const factionOf = (code) => this._data.factions
      .factions[this._data.roles.roles[code]?.factionId] ?? null;

    this.innerHTML = `
      <header class="cm-board-head"><h3>${escape(printed.name)}</h3></header>
      <ul class="cm-board-tracks">${printed.trackIds.map(trackRow).join('')}</ul>
      <div class="cm-board-cards" data-empty="${placed.length === 0}">
        ${placed.map(([code]) => {
    const faction = factionOf(code);
    return `<span class="cm-action-token" data-code="${escape(code)}"
              style="--faction-colour: ${escape(faction?.colour ?? '#888888')}"
              title="${escape(this._data.roles.roles[code]?.name ?? code)}">${escape(code)}</span>`;
  }).join('')}
      </div>
      <ul class="cm-board-locations">${printed.locations.map((location) => `
        <li class="cm-location" data-location="${escape(location.id)}">
          <span class="cm-location-name">${escape(location.name)}</span>
          <span class="cm-location-slot"></span>
        </li>`).join('')}
      </ul>`;

    // The flash is a moment, not a state: the attribute comes back off so the
    // next quiet render draws a quiet board. One timer for the lot — a batch
    // of changes arrived as one projection and fades as one.
    if (Object.keys(changed).length) {
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => {
        for (const row of this.querySelectorAll('[data-flash]')) {
          row.removeAttribute('data-flash');
          row.querySelector('.cm-track-delta')?.remove();
        }
      }, 1800);
    }
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-map-board', CmMapBoard);
