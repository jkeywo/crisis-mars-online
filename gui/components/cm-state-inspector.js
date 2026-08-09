/**
 * <cm-state-inspector> — the umpire's hand, reaching into the game.
 *
 * It exists because the app will get something wrong during a game, and the
 * alternative to fixing it is a room of eighteen people watching a facilitator
 * apologise. A paper megagame has never had this problem: the umpire simply
 * moves the marker. This is that pencil.
 *
 * One card per map for the things that actually come up — the tracks. A
 * number is adjusted rather than replaced: type how much to change it by and
 * commit, and the change lands against whatever the value actually is at that
 * moment, not whatever it was when the facilitator opened the panel. That is
 * what keeps an edit from quietly undoing something a player did in between —
 * an absolute "set it to 12" cannot tell the difference between "was 16,
 * should be 12" and "was 16, an action just took 2, should now be 10"; an
 * adjustment of "−4" can, because it does not need to know which one it
 * started from.
 *
 * Every edit goes out through the ordinary command pipeline, so it lands in
 * the log tagged as an override and a replay reproduces it. That is what
 * stops "the facilitator can change anything" from meaning "the history is a
 * polite fiction".
 */

export class CmStateInspector extends HTMLElement {
  set state(value) {
    this._state = value;
    this._render();
  }

  /** The static dataset, for names and the printed initial values. */
  set data(value) {
    this._data = value;
    this._render();
  }

  connectedCallback() {
    if (!this._built) {
      this._built = true;
      this.innerHTML = `
        <div class="cm-inspector-cards"></div>
        <div class="cm-inspector-war"></div>`;
    }
    this._render();
  }

  _emit(verb, payload) {
    this.dispatchEvent(new CustomEvent('cm-facilitate', { bubbles: true, detail: { verb, payload } }));
  }

  _render() {
    if (!this.isConnected || !this._built || !this._state || !this._data) return;
    this._renderTracks();
    this._renderWarProgress();
  }

  // --- one card per map -----------------------------------------------------

  _renderTracks() {
    const host = this.querySelector('.cm-inspector-cards');
    const maps = this._data.maps.maps;

    host.innerHTML = `<h4>The tracks</h4>
      ${Object.entries(this._state.maps ?? {}).map(([mapId, board]) => `
        <article class="cm-inspector-card">
          <header><h5>${escape(maps[mapId]?.name ?? mapId)}</h5></header>
          <div class="cm-inspector-stats">${Object.entries(board.tracks).map(([trackId, value]) => {
    const path = `maps.${mapId}.tracks.${trackId}`;
    return `
            <div class="cm-inspector-stat">
              <span class="cm-inspector-stat-label">${escape(this._data.maps.tracks[trackId]?.name ?? trackId)}</span>
              <span class="cm-inspector-stat-value">${value}</span>
              <input type="number" step="1" placeholder="+/-" data-adjust="${path}">
              <button type="button" data-commit-adjust="${path}">Commit</button>
              <span class="cm-inspector-error" data-error-for="${path}"></span>
            </div>`;
  }).join('')}
          </div>
        </article>`).join('')}`;

    for (const button of host.querySelectorAll('[data-commit-adjust]')) {
      button.onclick = () => this._commitAdjust(button);
    }
  }

  _commitAdjust(button) {
    const path = button.dataset.commitAdjust;
    const card = button.closest('.cm-inspector-card') ?? this;
    const input = card.querySelector(`[data-adjust="${cssEscape(path)}"]`);
    const error = card.querySelector(`[data-error-for="${cssEscape(path)}"]`);
    const delta = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(delta) || delta === 0) {
      if (error) error.textContent = 'enter a nonzero amount, positive or negative';
      return;
    }
    if (error) error.textContent = '';
    input.value = '';
    this._emit('facilitator:adjust', { path: path.split('.'), delta });
  }

  // --- war progress ---------------------------------------------------------

  /**
   * Null until the turn-two correspondence activates it, and set rather than
   * adjusted while it is null — there is no number yet to add to. The
   * activation itself becomes a proper command in a later phase; until then
   * this panel is honest about being the pencil.
   */
  _renderWarProgress() {
    const host = this.querySelector('.cm-inspector-war');
    const value = this._state.warProgress;
    host.innerHTML = `
      <h4>War Progress</h4>
      <p class="cm-meta">${value === null
    ? 'Not active yet — the turn-two war correspondence starts the marker.'
    : `At ${value}. 0 is Earth\u2019s surrender; 20 or more is Mars\u2019s.`}</p>
      <div class="cm-inspector-stat">
        <span class="cm-inspector-stat-label">Set to</span>
        <input type="number" step="1" min="0" data-war-value placeholder="${value ?? 10}">
        <button type="button" data-war-set>Set</button>
        ${value !== null ? '<button type="button" data-war-clear>Deactivate</button>' : ''}
      </div>`;

    host.querySelector('[data-war-set]').onclick = () => {
      const typed = Number(host.querySelector('[data-war-value]').value);
      if (!Number.isFinite(typed) || typed < 0) return;
      this._emit('facilitator:set', { path: ['warProgress'], value: typed });
    };
    const clear = host.querySelector('[data-war-clear]');
    if (clear) {
      clear.onclick = () => this._emit('facilitator:set', { path: ['warProgress'], value: null });
    }
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** A dotted path used verbatim in a CSS attribute selector needs its own escaping. */
function cssEscape(text) {
  return String(text).replace(/["\\]/g, '\\$&');
}

customElements.define('cm-state-inspector', CmStateInspector);
