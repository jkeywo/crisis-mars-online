/**
 * <cm-connection-dot> — whether the game can hear you.
 *
 * The single most important pixel on a player's screen. Everything else is a
 * game; this is whether the game is still there. So it says what is happening
 * in words as well as colour, and it offers a way to act rather than only a
 * state to read: a player watching a backoff timer count down will reload the
 * page, which loses nothing but feels like it might.
 */

const LABELS = {
  connecting: ['connecting', 'Reaching the game'],
  ready: ['ready', 'Connected'],
  disconnected: ['away', 'Lost the game — trying again'],
  error: ['away', 'Cannot reach the game'],
  hosting: ['ready', 'Hosting'],
  'waiting-for-code': ['connecting', 'Waiting for the room code'],
  reconnecting: ['connecting', 'Reconnecting'],
};

export class CmConnectionDot extends HTMLElement {
  static observedAttributes = ['status'];

  connectedCallback() {
    if (!this._built) this._build();
    this._render();
  }

  attributeChangedCallback() {
    if (this._built) this._render();
  }

  _build() {
    this._built = true;
    this.innerHTML = `
      <span class="cm-dot" aria-hidden="true"></span>
      <span class="cm-dot-label"></span>
      <button type="button" class="cm-dot-retry" hidden>Try now</button>`;
    this.querySelector('.cm-dot-retry').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('cm-retry', { bubbles: true }));
    });
  }

  _render() {
    const status = this.getAttribute('status') ?? 'connecting';
    const [tone, label] = LABELS[status] ?? LABELS.connecting;
    this.dataset.tone = tone;
    this.querySelector('.cm-dot-label').textContent = label;
    // Only offered when it would do something. A retry button beside a live
    // connection is an invitation to break one.
    this.querySelector('.cm-dot-retry').hidden = tone !== 'away';
    this.setAttribute('role', 'status');
    this.setAttribute('aria-label', label);
  }
}

customElements.define('cm-connection-dot', CmConnectionDot);
