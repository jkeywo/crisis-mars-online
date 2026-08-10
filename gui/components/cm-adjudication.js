/**
 * <cm-adjudication> — one map's lane of the facilitator's table.
 *
 * The whole printed procedure as one panel: call, read the declaration, rule
 * the cards, set difficulty, roll, spend the band's budgets, narrate, close.
 * Every control emits a `cm-facilitate` command and decides nothing itself —
 * admission owns the clamps, and the Impact readout here is the same
 * derive.js computation the clamps use, so the number on this screen is the
 * number the rules will hold the ruling to.
 *
 * The effect pickers stage locally (per action, in `_staged`) and commit as
 * one `facilitator:apply-effects` — the same shape a paper facilitator works
 * in: decide the whole ruling, then say it.
 */

import {
  actionImpact, bandFor, consequenceOf, effectBudgets, regainCost, confirmedAllies,
} from '../rules/derive.js';

export class CmAdjudication extends HTMLElement {
  static observedAttributes = ['map'];

  set data(value) { this._data = value; this._render(); }

  /** The facilitator's own state — nothing here is redacted from them. */
  set view(value) { this._view = value; this._render(); }

  attributeChangedCallback() { this._render(); }

  connectedCallback() { this._render(); }

  get mapId() { return this.getAttribute('map'); }

  /** What this console's umpire calls themselves, for the lane claim. */
  get facilitatorName() { return this.getAttribute('facilitator-name') || 'the host'; }

  _emit(verb, payload) {
    this.dispatchEvent(new CustomEvent('cm-facilitate', {
      bubbles: true, detail: { verb, payload },
    }));
  }

  /** The lane's ownership line: whose table this is, claim or release. */
  _laneBar() {
    const owner = this._view.lanes?.[this.mapId] ?? null;
    const mine = owner === this.facilitatorName;
    return `
      <p class="cm-lane-bar">
        ${owner ? `Lane: <strong>${escape(owner)}</strong>${mine ? ' (you)' : ''}`
    : '<span class="cm-meta">Lane unclaimed</span>'}
        <button type="button" data-lane="${mine ? '' : escape(this.facilitatorName)}">
          ${mine ? 'Release' : 'Run this lane'}</button>
      </p>`;
  }

  _wireLane() {
    const button = this.querySelector('[data-lane]');
    if (button) {
      button.onclick = () => this._emit('facilitator:claim-lane', {
        mapId: this.mapId, name: button.dataset.lane || null,
      });
    }
  }

  _name(code) {
    return this._data?.roles.roles[code]?.name
      ?? this._data?.factions.npcs?.[code]?.name ?? code;
  }

  _cardName(cardId) {
    const card = this._data?.resources.cards[cardId];
    return this._data?.resources.types[card?.type]?.name ?? cardId;
  }

  /** This action's staging area, fresh whenever the action changes. */
  _stagedFor(action) {
    if (this._staged?.actionId !== action.id) {
      this._staged = {
        actionId: action.id,
        effects: {},                    // trackId -> delta
        regains: [...action.regains],
        sabotage: [...action.sabotage],
        futureImpact: action.futureImpactAwarded,
        futureImpactTo: action.futureImpactTo ?? action.actorCode,
        narration: action.narration,
      };
      for (const { trackId, delta } of action.effects) this._staged.effects[trackId] = delta;
    }
    return this._staged;
  }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    if (this.contains(document.activeElement)
      && document.activeElement.matches('input, textarea, select')) return;

    const initiative = this._view.initiative ?? {};
    const queue = initiative.queues?.[this.mapId];
    if (!queue) { this.innerHTML = ''; return; }

    const id = initiative.current?.[this.mapId];
    const action = id ? this._view.actions?.[id] : null;

    if (!action) {
      this.innerHTML = `
        <div class="cm-adjudicate" data-idle="true">
          ${this._laneBar()}
          ${queue.length ? `
            <button type="button" class="cm-primary" data-call>Call ${
  escape(this._name(queue[0]))}</button>
            <button type="button" data-skip>Skip them</button>` : `
            <p class="cm-meta">This map's queue is done.</p>`}
        </div>`;
      this._wireIdle();
      this._wireLane();
      return;
    }

    const impact = actionImpact(this._view, this._data, action);
    const band = bandFor(impact, this._data);
    const budgets = effectBudgets(impact, this._data);
    const staged = this._stagedFor(action);
    const confirmed = confirmedAllies(action);
    const rolled = action.status === 'rolled';

    this.innerHTML = `
      <div class="cm-adjudicate" data-status="${escape(action.status)}">
        ${this._laneBar()}
        <h4>#${action.seq} · ${escape(this._name(action.actorCode))}
          <span class="cm-meta">${escape(action.status)}</span></h4>
        ${action.declaration
    ? `<blockquote class="cm-spotlight-words">${escape(action.declaration)}</blockquote>`
    : '<p class="cm-meta">Waiting on the declaration…</p>'}
        ${Object.keys(action.allies).length ? `
          <p>${Object.entries(action.allies).map(([code, status]) => `
            <span class="cm-ally-chip" data-ally="${escape(status)}">${
  escape(this._name(code))} · ${escape(status)}</span>`).join(' ')}</p>` : ''}

        ${action.offered.length && !rolled ? `
          <fieldset class="cm-ruling"><legend>Rule the offer</legend>
            ${action.offered.map((cardId) => {
    const owner = this._view.cards[cardId]?.ownerCode;
    const accepted = action.accepted.length
      ? action.accepted.includes(cardId) : true;
    return `<label><input type="checkbox" name="accept" value="${escape(cardId)}"
              ${accepted ? 'checked' : ''}> ${escape(this._cardName(cardId))}
              <span class="cm-meta">${escape(this._name(owner))}'s</span></label>`;
  }).join('')}
            <button type="button" data-rule>Rule resources</button>
          </fieldset>` : ''}

        ${!rolled ? `
          <div class="cm-difficulty" role="group" aria-label="Difficulty">
            Difficulty:
            ${[0, -1, -2, -3].map((d) => `
              <button type="button" data-difficulty="${d}"
                aria-pressed="${action.difficulty === d}">${d}</button>`).join('')}
          </div>` : ''}

        <p class="cm-spotlight-sums">
          Impact <strong>${impact}</strong> · ${escape(band?.label ?? '')}
          <span class="cm-meta">${escape(band?.printed ?? '')}</span>
          ${action.roll !== null
    ? `· die ${action.roll} (${escape(consequenceOf(action.roll, this._data)?.id ?? '')})`
    : `<button type="button" data-roll>Roll the consequence die</button>`}
        </p>

        ${rolled ? this._effectsPanel(action, staged, budgets, confirmed) : ''}

        <label class="cm-narrate">Narration
          <textarea name="narration" rows="2">${escape(staged.narration)}</textarea>
        </label>
        <div class="cm-adjudicate-buttons">
          <button type="button" data-narrate>Save narration</button>
          <button type="button" class="cm-primary" data-close>Close the action</button>
          <button type="button" data-skip>Skip</button>
        </div>
      </div>`;

    this._wire(action, staged);
    this._wireLane();
  }

  _effectsPanel(action, staged, budgets, confirmed) {
    const tracks = this._data.maps.maps[this.mapId].trackIds;
    const trackSpent = Object.values(staged.effects)
      .reduce((sum, delta) => sum + Math.abs(delta || 0), 0);
    const regainSpent = staged.regains.reduce((sum, { cardId, toCode }) =>
      sum + regainCost(this._data, this._view.cards[cardId]?.ownerCode, toCode), 0);
    const spentCards = Object.values(this._view.cards)
      .filter((card) => card.state === 'spent');
    const heldCards = Object.values(this._view.cards)
      .filter((card) => card.state === 'held' && !action.accepted.includes(card.id));
    const recipients = [action.actorCode, ...confirmed];

    return `
      <div class="cm-effects">
        <fieldset><legend>Tracks — ${trackSpent} of ±${budgets.scoreModifier} points</legend>
          ${tracks.map((trackId) => `
            <label class="cm-effect-track">${escape(this._data.maps.tracks[trackId]?.name ?? trackId)}
              <input type="number" step="1" data-track="${escape(trackId)}"
                value="${staged.effects[trackId] ?? 0}">
            </label>`).join('')}
        </fieldset>

        <fieldset><legend>Regain — ${regainSpent} of ${budgets.regain}
          <span class="cm-meta">(out-of-faction cards cost 2)</span></legend>
          ${staged.regains.map(({ cardId, toCode }, index) => `
            <span class="cm-card-chip">${escape(this._cardName(cardId))} → ${
  escape(this._name(toCode))}
              <button type="button" data-unregain="${index}" aria-label="Remove">×</button>
            </span>`).join('')}
          <div class="cm-row">
            <select data-regain-card>
              <option value="">Card…</option>
              ${spentCards.map((card) => `
                <option value="${escape(card.id)}">${escape(this._cardName(card.id))} (${
  escape(card.ownerCode)})</option>`).join('')}
            </select>
            <select data-regain-to>
              ${recipients.map((code) => `
                <option value="${escape(code)}">${escape(this._name(code))}</option>`).join('')}
            </select>
            <button type="button" data-add-regain>Add</button>
          </div>
        </fieldset>

        <fieldset><legend>Sabotage — ${staged.sabotage.length} of ${budgets.sabotage}</legend>
          ${staged.sabotage.map((cardId, index) => `
            <span class="cm-card-chip">${escape(this._cardName(cardId))}
              <button type="button" data-unsabotage="${index}" aria-label="Remove">×</button>
            </span>`).join('')}
          <div class="cm-row">
            <select data-sabotage-card>
              <option value="">Card…</option>
              ${heldCards.map((card) => `
                <option value="${escape(card.id)}">${escape(this._cardName(card.id))} — with ${
  escape(card.holderCode)}</option>`).join('')}
            </select>
            <button type="button" data-add-sabotage>Add</button>
          </div>
        </fieldset>

        <fieldset><legend>Future impact — of ${budgets.futureImpact}</legend>
          <div class="cm-row">
            <input type="number" min="0" max="${budgets.futureImpact}"
              data-future-amount value="${staged.futureImpact}">
            <select data-future-to>
              ${recipients.map((code) => `
                <option value="${escape(code)}" ${
  code === staged.futureImpactTo ? 'selected' : ''}>${escape(this._name(code))}</option>`).join('')}
            </select>
          </div>
        </fieldset>

        <button type="button" class="cm-primary" data-apply>Apply effects</button>
      </div>`;
  }

  _wireIdle() {
    const call = this.querySelector('[data-call]');
    if (call) call.onclick = () => this._emit('facilitator:call-next', { mapId: this.mapId });
    const skip = this.querySelector('[data-skip]');
    if (skip) skip.onclick = () => this._emit('facilitator:skip-action', { mapId: this.mapId });
  }

  _wire(action, staged) {
    const rule = this.querySelector('[data-rule]');
    if (rule) {
      rule.onclick = () => {
        const accepted = [...this.querySelectorAll('input[name="accept"]:checked')]
          .map((input) => input.value);
        this._emit('facilitator:rule-resources', {
          actionId: action.id,
          acceptedCardIds: accepted,
          vetoedCardIds: action.offered.filter((cardId) => !accepted.includes(cardId)),
        });
      };
    }
    for (const button of this.querySelectorAll('[data-difficulty]')) {
      button.onclick = () => this._emit('facilitator:set-difficulty', {
        actionId: action.id, difficulty: Number(button.dataset.difficulty),
      });
    }
    const roll = this.querySelector('[data-roll]');
    if (roll) roll.onclick = () => this._emit('facilitator:roll-consequence', { actionId: action.id });

    // --- the staged effects -------------------------------------------------
    for (const input of this.querySelectorAll('[data-track]')) {
      input.onchange = () => {
        const delta = Number(input.value);
        if (delta === 0) delete staged.effects[input.dataset.track];
        else staged.effects[input.dataset.track] = delta;
        this._render();
      };
    }
    const addRegain = this.querySelector('[data-add-regain]');
    if (addRegain) {
      addRegain.onclick = () => {
        const cardId = this.querySelector('[data-regain-card]').value;
        const toCode = this.querySelector('[data-regain-to]').value;
        if (!cardId) return;
        staged.regains.push({ cardId, toCode });
        this._render();
      };
    }
    for (const button of this.querySelectorAll('[data-unregain]')) {
      button.onclick = () => { staged.regains.splice(Number(button.dataset.unregain), 1); this._render(); };
    }
    const addSabotage = this.querySelector('[data-add-sabotage]');
    if (addSabotage) {
      addSabotage.onclick = () => {
        const cardId = this.querySelector('[data-sabotage-card]').value;
        if (!cardId) return;
        staged.sabotage.push(cardId);
        this._render();
      };
    }
    for (const button of this.querySelectorAll('[data-unsabotage]')) {
      button.onclick = () => { staged.sabotage.splice(Number(button.dataset.unsabotage), 1); this._render(); };
    }
    const futureAmount = this.querySelector('[data-future-amount]');
    if (futureAmount) {
      futureAmount.onchange = () => { staged.futureImpact = Number(futureAmount.value) || 0; };
    }
    const futureTo = this.querySelector('[data-future-to]');
    if (futureTo) futureTo.onchange = () => { staged.futureImpactTo = futureTo.value; };

    const apply = this.querySelector('[data-apply]');
    if (apply) {
      apply.onclick = () => this._emit('facilitator:apply-effects', {
        actionId: action.id,
        effects: Object.entries(staged.effects)
          .filter(([, delta]) => delta !== 0)
          .map(([trackId, delta]) => ({ trackId, delta })),
        regains: staged.regains,
        sabotage: staged.sabotage,
        futureImpact: { amount: staged.futureImpact, toCode: staged.futureImpactTo },
      });
    }

    const narration = this.querySelector('textarea[name="narration"]');
    if (narration) narration.onchange = () => { staged.narration = narration.value; };
    const narrate = this.querySelector('[data-narrate]');
    if (narrate) {
      narrate.onclick = () => this._emit('facilitator:narrate', {
        actionId: action.id, text: staged.narration,
      });
    }
    const close = this.querySelector('[data-close]');
    if (close) close.onclick = () => this._emit('facilitator:close-action', { actionId: action.id });
    const skip = this.querySelector('[data-skip]');
    if (skip) skip.onclick = () => this._emit('facilitator:skip-action', { mapId: this.mapId });
  }
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-adjudication', CmAdjudication);
