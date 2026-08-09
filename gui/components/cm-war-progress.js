/**
 * <cm-war-progress> — the war itself, as a rail across the header.
 *
 * War Progress is a single number on a route: 0 is Earth's surrender, 20 or
 * more is Mars's, and each stretch of values stands the marker at a named
 * location on the planetary maps. The rail draws the route's stations from
 * `maps.json` — nothing about the route is written in here — and stands the
 * marker in the band the current value falls in.
 *
 * Null is not zero. Before the turn-two war correspondence the war has not
 * begun, and a marker drawn at Earth Gov Capital would read as "Earth has
 * surrendered", which is the worst possible thing for a header to be wrong
 * about. So a null value hides the marker and says so in words.
 *
 * Like the boards, it remembers the last value it drew and flashes the
 * difference — the front line moving is the single most consequential thing
 * that can happen in this game, and it should not happen silently.
 */

export class CmWarProgress extends HTMLElement {
  set data(value) { this._data = value; this._render(); }

  /** A projection. Only `warProgress` is read. */
  set view(value) { this._view = value; this._render(); }

  connectedCallback() { this._render(); }

  disconnectedCallback() {
    clearTimeout(this._flashTimer);
    this._flashTimer = null;
  }

  /** The band a value stands in, by the ranges maps.json prints. */
  _bandFor(value) {
    const bands = this._data?.maps.warProgress.locationBands ?? [];
    if (!bands.length) return null;
    if (value <= bands[0].range[1]) return bands[0];
    return bands.find(({ range: [low, high] }) =>
      value >= low && (high === null || value <= high)) ?? bands[bands.length - 1];
  }

  /** A location's printed name, wherever on the three maps it is. */
  _locationName(id) {
    for (const map of Object.values(this._data?.maps.maps ?? {})) {
      const found = map.locations.find((location) => location.id === id);
      if (found) return found.name;
    }
    return id;
  }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    const value = this._view.warProgress ?? null;

    // Null → number is the war starting, which the correspondence announces
    // out loud; a delta chip on top of that would be noise. Number → number
    // is the front line moving, and that is exactly what the chip is for.
    const before = this._lastValue;
    this._lastValue = value;
    const delta = (typeof before === 'number' && typeof value === 'number' && before !== value)
      ? value - before : null;

    if (value === null) {
      this.innerHTML = `
        <span class="cm-war-label">War Progress</span>
        <span class="cm-war-quiet">The war has not begun.</span>`;
      return;
    }

    const standing = this._bandFor(value);
    const bands = this._data.maps.warProgress.locationBands;

    this.innerHTML = `
      <span class="cm-war-label">War Progress</span>
      <span class="cm-war-value">${value}${delta ? `
        <span class="cm-war-delta" data-flash="${delta > 0 ? 'up' : 'down'}">${
  delta > 0 ? '+' : '−'}${Math.abs(delta)}</span>` : ''}</span>
      <ol class="cm-war-route">${bands.map((band) => `
        <li class="cm-war-station" data-location="${escape(band.location)}"
            ${band === standing ? 'data-marker="true"' : ''}
            ${band.note === 'Surrender' ? 'data-surrender="true"' : ''}>
          <span class="cm-war-station-name">${escape(this._locationName(band.location))}</span>
          <span class="cm-war-station-range">${band.range[1] === null
    ? `${band.range[0]}+`
    : band.range[0] === band.range[1] ? `${band.range[0]}` : `${band.range[0]}–${band.range[1]}`}</span>
          ${band === standing ? '<span class="cm-war-marker" aria-label="the war stands here"></span>' : ''}
          ${band.note === 'Surrender' ? '<span class="cm-war-surrender">surrender</span>' : ''}
        </li>`).join('')}
      </ol>`;

    if (delta) {
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => {
        this.querySelector('.cm-war-delta')?.remove();
      }, 1800);
    }
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-war-progress', CmWarProgress);
