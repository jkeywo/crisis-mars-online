/**
 * <cm-turn-update> — the end-of-turn worksheet, as a checklist stepper.
 *
 * Renders whatever `state.turnUpdate` holds: each proposed step with its
 * kind's own line — the printed sentence and a delta box for the qualitative
 * ones, the movement and its clamps for the war, the trigger and its target
 * for an opportunity proposal, the flag for a surrender — with Confirm on
 * everything and Override beside the two numeric kinds. A running narration
 * of what has landed grows underneath, in the order it landed.
 *
 * Facilitator-only by placement (the host page mounts it), not by secrecy:
 * the worksheet itself is public arithmetic. Every button emits
 * `cm-facilitate`; the component decides nothing.
 */

export class CmTurnUpdate extends HTMLElement {
  set data(value) { this._data = value; this._render(); }

  /** The facilitator's own state. `phase` and `turnUpdate` are read. */
  set view(value) { this._view = value; this._render(); }

  connectedCallback() { this._render(); }

  _emit(verb, payload = {}) {
    this.dispatchEvent(new CustomEvent('cm-facilitate', {
      bubbles: true, detail: { verb, payload },
    }));
  }

  _name(code) {
    return this._data?.roles.roles[code]?.name
      ?? this._data?.factions.npcs?.[code]?.name ?? code;
  }

  _trackName(trackId) {
    return this._data?.maps.tracks[trackId]?.name ?? trackId;
  }

  _describe(step) {
    switch (step.kind) {
      case 'qualitative':
        return `<strong>${escape(this._trackName(step.trackId))}</strong> —
          <span class="cm-meta">${escape(step.printed)}</span>`;
      case 'war-progress':
        return `<strong>War Progress</strong> ${step.from} → ${step.to}
          (${step.delta >= 0 ? '+' : ''}${step.delta})
          ${step.clamps.map((clamp) => `<span class="cm-warn">${escape(clamp)}</span>`).join(' ')}`;
      case 'opportunity':
        return `<strong>Opportunity</strong> for ${escape(step.factionId
          ? this._data.factions.factions[step.factionId]?.name ?? step.factionId
          : this._name(step.npcCode))}
          <span class="cm-meta">${escape(step.triggerId)} — ${escape(step.note ?? '')}.
          Compose it on the Team Phase table.</span>`;
      case 'otherwise':
        return `<strong>No clear lead</strong>
          <span class="cm-meta">${escape(step.triggerId)}: the print says ${escape(step.text)}.</span>`;
      case 'surrender':
        return `<strong class="cm-warn">${step.side === 'earth' ? 'Earth' : 'Mars'}
          has hit the surrender boundary.</strong>
          <span class="cm-meta">The ending is yours to narrate — call time when it is told.</span>`;
      default:
        return escape(step.kind);
    }
  }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    if (this.contains(document.activeElement)
      && document.activeElement.matches('input, textarea, select')) return;

    const phase = this._view.phase;
    const sheet = this._view.turnUpdate;

    if (phase.name !== 'action' && !sheet) { this.innerHTML = ''; return; }

    if (!sheet) {
      this.innerHTML = `
        <div class="cm-worksheet">
          <button type="button" class="cm-primary" data-begin>
            Begin the end-of-turn update
          </button>
          <p class="cm-meta">Computes the printed checklist from the boards as
            they stand — run it once the last spotlight has closed.</p>
        </div>`;
      this.querySelector('[data-begin]').onclick = () =>
        this._emit('facilitator:begin-turn-update');
      return;
    }

    const numeric = (step) => ['qualitative', 'war-progress'].includes(step.kind);
    const answered = sheet.steps.filter((step) => step.status !== 'proposed');

    this.innerHTML = `
      <div class="cm-worksheet" data-finished="${sheet.finished}">
        <h4>Turn ${sheet.turn} update ${sheet.finished ? '— finished' : ''}</h4>
        <ol class="cm-worksheet-steps">${sheet.steps.map((step) => `
          <li data-step="${escape(step.id)}" data-status="${escape(step.status)}"
              data-kind="${escape(step.kind)}">
            <div class="cm-worksheet-words">${this._describe(step)}</div>
            ${step.status === 'proposed' && !sheet.finished ? `
              <div class="cm-row">
                <button type="button" data-confirm="${escape(step.id)}">Confirm${
  step.kind === 'war-progress' ? ` ${step.delta >= 0 ? '+' : ''}${step.delta}` : ''}</button>
                ${numeric(step) ? `
                  <input type="number" step="1" placeholder="+/-"
                    data-override-delta="${escape(step.id)}" style="width: 4rem">
                  <button type="button" data-override="${escape(step.id)}">Override</button>` : ''}
              </div>` : `
              <span class="cm-meta">${escape(step.status)}${
  'appliedDelta' in step && numeric(step)
    ? ` (${step.appliedDelta >= 0 ? '+' : ''}${step.appliedDelta})` : ''}</span>`}
          </li>`).join('')}
        </ol>
        ${answered.length ? `
          <p class="cm-meta">So far: ${answered.map((step) =>
    `${step.kind === 'war-progress' ? 'war progress' : step.trackId ?? step.kind}${
      numeric(step) ? ` ${step.appliedDelta >= 0 ? '+' : ''}${step.appliedDelta}` : ' noted'}`)
    .join('; ')}.</p>` : ''}
        ${!sheet.finished ? `
          <button type="button" class="cm-primary" data-finish>Finish the update</button>` : ''}
      </div>`;

    for (const button of this.querySelectorAll('[data-confirm]')) {
      button.onclick = () => this._emit('facilitator:confirm-update-step',
        { stepId: button.dataset.confirm });
    }
    for (const button of this.querySelectorAll('[data-override]')) {
      button.onclick = () => {
        const input = this.querySelector(`[data-override-delta="${button.dataset.override}"]`);
        const delta = Number(input.value);
        if (!input.value.trim() || !Number.isInteger(delta)) return;
        this._emit('facilitator:override-update-step',
          { stepId: button.dataset.override, delta });
      };
    }
    const finish = this.querySelector('[data-finish]');
    if (finish) finish.onclick = () => this._emit('facilitator:finish-turn-update');
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-turn-update', CmTurnUpdate);
