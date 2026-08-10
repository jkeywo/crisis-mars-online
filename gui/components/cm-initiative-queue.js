/**
 * <cm-initiative-queue> — one map's call order, and the spotlight clock.
 *
 * Who has acted (greyed), who is up (highlighted, with the sixty-second
 * countdown), who is next. The order is state — advance-phase built it from
 * the printed initiative row — so this only draws it.
 *
 * The countdown is a deadline read off the wall clock, like the phase clock:
 * a throttled tab comes back right. By the author's ruling it says nothing
 * until time expires — one `cm-spotlight-up` at the crossing, then a
 * `cm-spotlight-overtime` every ten seconds while the action stays open —
 * and leaves what the crossings are worth to the page, which is where the
 * beeper lives. It never forfeits anybody: the facilitator closes the
 * spotlight when it is done. See gaps.js.
 */

export class CmInitiativeQueue extends HTMLElement {
  static observedAttributes = ['map'];

  set data(value) { this._data = value; this._render(); }

  /** A projection. `initiative` and `actions` are read. */
  set view(value) {
    this._view = value;
    this._render();
    this._ensureTicking();
  }

  /** Injectable so a test does not have to wait for a real second. */
  set now(fn) { this._now = fn; this._render(); }

  attributeChangedCallback() { this._render(); }

  connectedCallback() {
    this._render();
    this._ensureTicking();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
  }

  get mapId() { return this.getAttribute('map'); }

  _ensureTicking() {
    if (this._timer || !this.isConnected) return;
    this._timer = setInterval(() => this._render(), 500);
  }

  _live() {
    const id = this._view?.initiative?.current?.[this.mapId];
    return id ? this._view.actions?.[id] ?? null : null;
  }

  _name(code) {
    return this._data?.roles.roles[code]?.name ?? code;
  }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    const queue = this._view.initiative?.queues?.[this.mapId];
    const done = this._view.initiative?.done?.[this.mapId];
    if (!queue && !done?.length) { this.innerHTML = ''; return; }

    const action = this._live();
    const now = (this._now ?? Date.now)();
    const open = action && !['closed', 'skipped'].includes(action.status);
    const left = open && action.endsAt !== null ? action.endsAt - now : null;
    const seconds = left === null ? null : Math.ceil(left / 1000);

    this.innerHTML = `
      <h4 class="cm-queue-head">Call order</h4>
      <ol class="cm-queue">
        ${(done ?? []).map((code) => `
          <li class="cm-queue-entry" data-done="true">${escape(this._name(code))}</li>`).join('')}
        ${open ? `
          <li class="cm-queue-entry" data-live="true"
              data-state="${left <= 0 ? 'over' : left <= 10_000 ? 'soon' : 'running'}">
            <span class="cm-queue-name">${escape(this._name(action.actorCode))}</span>
            <span class="cm-queue-ring" role="timer">${left <= 0 ? 'time' : `${seconds}s`}</span>
          </li>` : ''}
        ${(queue ?? []).map((code, index) => `
          <li class="cm-queue-entry" data-next="${index === 0 && !open}">${
  escape(this._name(code))}</li>`).join('')}
      </ol>`;

    this._announce(action, left);
  }

  /**
   * Says when the spotlight crosses a line; decides nothing about it.
   *
   * Counted in whole ten-second steps of overtime, at most one event per
   * render however many steps went by — a throttled tab that comes back a
   * minute late hears one nag rather than a backlog, the same bargain the
   * phase clock strikes.
   */
  _announce(action, left) {
    if (!action || left === null) return;
    if (this._announcedFor !== action.id) {
      this._announcedFor = action.id;
      this._called = false;
      this._overtimeStep = null;
    }
    if (left > 0) return;
    if (!this._called) {
      this._called = true;
      // The step it landed in is the step it starts from: arriving twelve
      // seconds over is one crossing, not two.
      this._overtimeStep = Math.floor(-left / 10_000);
      this.dispatchEvent(new CustomEvent('cm-spotlight-up', {
        bubbles: true, detail: { actionId: action.id, mapId: this.mapId },
      }));
      return;
    }
    const step = Math.floor(-left / 10_000);
    if (step > this._overtimeStep) {
      this._overtimeStep = step;
      this.dispatchEvent(new CustomEvent('cm-spotlight-overtime', {
        bubbles: true, detail: { actionId: action.id, mapId: this.mapId, overMs: -left },
      }));
    }
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-initiative-queue', CmInitiativeQueue);
