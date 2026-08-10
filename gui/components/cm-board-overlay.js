/**
 * <cm-board-overlay> — the printed board itself, with the live game sitting
 * on top of it.
 *
 * The image is the artist's sheet; the geometry file says where every
 * track's printed starting value is; a chip covers each printed number with
 * the current one. Fractional anchors become percentage positioning, so the
 * chips ride the image at any width.
 *
 * A chip is the pencil, one at a time: click it and it opens a numeric
 * input pre-filled with the value, with commit (✓) and cancel (✕) beside it;
 * Escape cancels. A commit issues `facilitator:adjust` with the DIFFERENCE
 * between what was typed and what the chip showed when editing began — a
 * delta commutes with whatever the players did in between, exactly the
 * inspector's own reasoning. The War Progress marker is a chip like the
 * others, standing at the route hex whose band holds the value, except its
 * commit is `facilitator:set` — a marker is placed, not nudged.
 *
 * Read-only without a facilitator page around it in spirit, but the
 * component itself only ever emits `cm-facilitate`; admission decides.
 */

export class CmBoardOverlay extends HTMLElement {
  static observedAttributes = ['map'];

  set data(value) { this._data = value; this._render(); }

  /** The facilitator's own state, or any projection: maps + warProgress. */
  set view(value) { this._view = value; this._render(); }

  attributeChangedCallback() { this._render(); }

  connectedCallback() { this._render(); }

  get mapId() { return this.getAttribute('map'); }

  /** geometry.json keys its boards 'earth'/'mars'/'belt'; state says *_map. */
  get boardId() { return (this.mapId ?? '').replace(/_map$/, ''); }

  _emit(verb, payload) {
    this.dispatchEvent(new CustomEvent('cm-facilitate', {
      bubbles: true, detail: { verb, payload },
    }));
  }

  /** The geometry band the war marker stands in on THIS board, or null. */
  _warBandHere(value) {
    if (value === null || value === undefined) return null;
    const bands = this._data.geometry.boards[this.boardId]?.warProgressBands ?? [];
    return bands.find(({ range: [low, high] }) =>
      value >= low && (high === null || value <= high))
      // The route's open end swallows everything past it, but only on the
      // board that carries the final band.
      ?? (bands.length && bands.at(-1).range[1] === null && value > bands.at(-1).range[0]
        ? bands.at(-1) : null);
  }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    const board = this._data.geometry.boards[this.boardId];
    const live = this._view.maps?.[this.mapId];
    if (!board || !live) { this.innerHTML = ''; return; }

    const chip = (id, value, anchor, label) => {
      const editing = this._editing === id;
      return `
        <div class="cm-board-chip" data-chip="${escape(id)}" data-editing="${editing}"
             style="left: ${anchor.x * 100}%; top: ${anchor.y * 100}%">
          ${editing ? `
            <input type="number" step="1" value="${this._editValue}"
              aria-label="New value for ${escape(label)}">
            <button type="button" data-commit aria-label="Commit">✓</button>
            <button type="button" data-cancel aria-label="Cancel">✕</button>` : `
            <button type="button" class="cm-board-chip-value"
              aria-label="${escape(label)}: ${value} — click to edit">${value}</button>`}
        </div>`;
    };

    const trackChips = Object.entries(board.tracks).map(([trackId, anchor]) =>
      chip(trackId, live.tracks[trackId],
        anchor, this._data.maps.tracks[trackId]?.name ?? trackId)).join('');

    const warBand = this._warBandHere(this._view.warProgress);
    const warChip = warBand
      ? chip('war-progress', this._view.warProgress, warBand, 'War Progress') : '';

    // The turn's action cards placed at this map, in a strip under the
    // image rather than over the art — the board is the author's drawing,
    // and the tokens are the evening's. See DECISIONS.md.
    const placed = Object.entries(this._view.actionCards ?? {})
      .filter(([, card]) => card.placed === this.mapId);
    const factionOf = (code) => this._data.factions
      .factions[this._data.roles.roles[code]?.factionId] ?? null;

    this.innerHTML = `
      <div class="cm-board-stage">
        <img src="${escape(board.image)}" alt="${escape(
    this._data.maps.maps[this.mapId]?.name ?? this.mapId)} board">
        ${trackChips}
        ${warChip}
      </div>
      <div class="cm-board-cards" data-empty="${placed.length === 0}">
        ${placed.map(([code]) => {
    const faction = factionOf(code);
    return `<span class="cm-action-token" data-code="${escape(code)}"
              style="--faction-colour: ${escape(faction?.colour ?? '#888888')}"
              title="${escape(this._data.roles.roles[code]?.name ?? code)}">${escape(code)}</span>`;
  }).join('')}
      </div>`;

    this._wire(live);
  }

  _wire(live) {
    for (const holder of this.querySelectorAll('[data-chip]')) {
      const id = holder.dataset.chip;
      if (holder.dataset.editing !== 'true') {
        holder.querySelector('.cm-board-chip-value').onclick = () => {
          // One chip at a time: opening this one closes any other.
          this._editing = id;
          this._editBase = id === 'war-progress'
            ? this._view.warProgress : live.tracks[id];
          this._editValue = this._editBase;
          this._render();
          this.querySelector('[data-chip][data-editing="true"] input')?.focus();
        };
        continue;
      }

      const input = holder.querySelector('input');
      input.onkeydown = (event) => {
        if (event.key === 'Escape') { this._closeEdit(); }
        if (event.key === 'Enter') { event.preventDefault(); commit(); }
      };
      input.oninput = () => { this._editValue = input.value; };

      const commit = () => {
        const typed = Number(input.value);
        if (!Number.isInteger(typed)) return;
        if (id === 'war-progress') {
          // A marker is placed, not nudged.
          if (typed !== this._editBase) {
            this._emit('facilitator:set', { path: ['warProgress'], value: typed });
          }
        } else if (typed !== this._editBase) {
          // A delta, so a player's spend between look and commit survives.
          this._emit('facilitator:adjust', {
            path: ['maps', this.mapId, 'tracks', id],
            delta: typed - this._editBase,
          });
        }
        this._closeEdit();
      };

      holder.querySelector('[data-commit]').onclick = commit;
      holder.querySelector('[data-cancel]').onclick = () => this._closeEdit();
    }
  }

  _closeEdit() {
    this._editing = null;
    this._editBase = null;
    this._editValue = null;
    this._render();
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-board-overlay', CmBoardOverlay);
