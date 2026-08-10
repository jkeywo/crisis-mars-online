/**
 * <cm-card-viewer> — one card, big enough to actually read.
 *
 * The thumbs in a hand are for counting; the art carries the words. This is
 * the one place a card is shown full size, opened by `show(cardId)` from
 * whichever page mounted it, and closed by its button, a click on the
 * backdrop, or Escape. The name and flavour ride along as text so the modal
 * is readable before the image arrives — and by anyone not loading images.
 */

export class CmCardViewer extends HTMLElement {
  set data(value) { this._data = value; }

  connectedCallback() {
    if (!this._built) {
      this._built = true;
      this.hidden = true;
      this.addEventListener('click', (event) => {
        // The backdrop and the close button shut it; the card itself does not,
        // so a mis-tap while peering at small print is not a dismissal.
        if (event.target === this || event.target.closest('[data-close]')) this.close();
      });
      this._onKey = (event) => { if (event.key === 'Escape') this.close(); };
    }
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKey);
  }

  /** Open on a resource card by id. */
  show(cardId) {
    const card = this._data?.resources.cards[cardId];
    if (!card) return;
    const type = this._data.resources.types[card.type];
    this.innerHTML = `
      <figure class="cm-viewer-card">
        <img src="assets/cards/${escape(cardId)}.png" alt="${escape(type?.name ?? card.type)}">
        <figcaption>
          <strong>${escape(type?.name ?? card.type)}</strong>
          <span class="cm-meta">${escape(card.flavour ?? type?.flavour ?? '')}</span>
        </figcaption>
        <button type="button" data-close aria-label="Close">×</button>
      </figure>`;
    this.hidden = false;
    document.addEventListener('keydown', this._onKey);
  }

  close() {
    this.hidden = true;
    this.replaceChildren();
    document.removeEventListener('keydown', this._onKey);
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-card-viewer', CmCardViewer);
