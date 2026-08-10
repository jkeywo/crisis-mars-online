/**
 * <cm-epilogue> — the debrief, read off a board nobody can still be changing.
 *
 * The final portrait: where the war ended and what that means, every track's
 * closing value, the goal-assessment walk, and — for the facilitator alone —
 * the override ledger and their own notes. Everything on it is worked out
 * from state and data at render, so it cannot disagree with the boards the
 * players just watched.
 *
 * The component degrades by what it is given, not by asking who is looking.
 * The war-outcome meanings and the goal evidence come from aftermath.json,
 * which only the host page loads — a player's instance gets no `aftermath`
 * and renders the public portrait. The override ledger reads `view.log`,
 * which only a facilitator's projection carries. Same trick both times:
 * redaction and the host-only loader decide, this file just draws what
 * arrived.
 */

export class CmEpilogue extends HTMLElement {
  set data(value) { this._data = value; this._render(); }

  /** A projection — the facilitator's own state on the host page. */
  set view(value) { this._view = value; this._render(); }

  /** data/aftermath.json, host-only. Null on a player page, by design. */
  set aftermath(value) { this._aftermath = value; this._render(); }

  connectedCallback() { this._render(); }

  _emit(verb, payload) {
    this.dispatchEvent(new CustomEvent('cm-facilitate', {
      bubbles: true, detail: { verb, payload },
    }));
  }

  _name(code) {
    return this._data?.roles.roles[code]?.name
      ?? this._data?.factions.npcs?.[code]?.name ?? code;
  }

  /** Where the marker stands, in the printed route's words. */
  _warStanding(value) {
    if (value === null) return 'The war never began.';
    const bands = this._data.maps.warProgress.locationBands;
    const band = value <= bands[0].range[1] ? bands[0]
      : bands.find(({ range: [low, high] }) => value >= low && (high === null || value <= high))
        ?? bands[bands.length - 1];
    const location = Object.values(this._data.maps.maps)
      .flatMap((map) => map.locations).find((l) => l.id === band.location);
    return `The front ended at ${location?.name ?? band.location}, at ${value}.`;
  }

  /** The aftermath file's outcome band for a final value, if the file is here. */
  _warOutcome(value) {
    if (!this._aftermath || value === null) return null;
    const bands = this._aftermath.warOutcome.bands;
    if (value <= 0) return bands.find((b) => b.id === 'earth_surrenders');
    if (value >= 20) return bands.find((b) => b.id === 'mars_surrenders');
    return bands.find((b) => b.id === 'unresolved_at_end');
  }

  /** A piece of evidence's closing value, in words. */
  _evidence(trackId) {
    if (trackId === 'war_outcome') {
      const value = this._view.warProgress;
      return `war outcome: ${value === null ? 'never fought'
        : value <= 0 ? 'Earth surrendered' : value >= 20 ? 'Mars surrendered' : 'unresolved'}`;
    }
    if (trackId === 'war_progress') return `War Progress ${this._view.warProgress ?? '—'}`;
    for (const board of Object.values(this._view.maps)) {
      if (trackId in board.tracks) {
        return `${this._data.maps.tracks[trackId]?.name ?? trackId} ${board.tracks[trackId]}`;
      }
    }
    return trackId;
  }

  _render() {
    if (!this.isConnected || !this._data || !this._view) return;
    if (this.contains(document.activeElement)
      && document.activeElement.matches('input, textarea, select')) return;

    const view = this._view;
    const outcome = this._warOutcome(view.warProgress);
    const isFacilitator = Array.isArray(view.log);

    this.innerHTML = `
      <div class="cm-epilogue">
        <section class="cm-epilogue-war">
          <h3>The war</h3>
          <p>${escape(this._warStanding(view.warProgress))}</p>
          ${outcome ? `<p><strong>${escape(outcome.printed ?? '')}</strong>
            ${escape(outcome.meaning)}</p>` : ''}
        </section>

        <section class="cm-epilogue-boards">
          <h3>The boards, as they closed</h3>
          <div class="cm-boards">${Object.entries(view.maps).map(([mapId, board]) => `
            <figure class="cm-board">
              <figcaption>${escape(this._data.maps.maps[mapId]?.name ?? mapId)}</figcaption>
              <table class="cm-tracks">${Object.entries(board.tracks).map(([trackId, value]) => `
                <tr><th>${escape(this._data.maps.tracks[trackId]?.name ?? trackId)}</th>
                    <td>${value}</td></tr>`).join('')}
              </table>
            </figure>`).join('')}
          </div>
        </section>

        ${this._aftermath ? this._assessment() : ''}
        ${isFacilitator ? this._ledger(view) : ''}
        ${isFacilitator ? `
          <section class="cm-epilogue-notes">
            <h3>Your notes</h3>
            <p class="cm-meta">For the debrief, in your own words. Saved into the game.</p>
            <textarea rows="4">${escape(view.facilitatorNotes?.epilogue ?? '')}</textarea>
            <button type="button" data-save-notes>Save notes</button>
          </section>` : ''}
      </div>`;

    const save = this.querySelector('[data-save-notes]');
    if (save) {
      save.onclick = () => this._emit('facilitator:set', {
        path: ['facilitatorNotes', 'epilogue'],
        value: this.querySelector('textarea').value,
      });
    }
  }

  /** The goal walk: each faction's four goals against their printed evidence. */
  _assessment() {
    const byObjective = new Map(this._aftermath.goalAssessment.factionGoals
      .map((entry) => [entry.objective, entry]));

    const factions = Object.entries(this._data.factions.factions).map(([factionId, faction]) => `
      <article class="cm-epilogue-faction" style="--faction-colour: ${escape(faction.colour)}">
        <h4>${escape(faction.name)}</h4>
        <ul>${faction.goals.map((goal) => {
    const entry = byObjective.get(goal.id);
    const judged = entry?.judged === 'at_the_table';
    return `<li>
            <span>${escape(goal.statement)}</span>
            <span class="cm-meta">${judged ? 'judged at the table'
      : (entry?.evidence ?? []).map((e) => escape(this._evidence(e))).join(' · ')}</span>
          </li>`;
  }).join('')}
        </ul>
      </article>`).join('');

    const personals = this._aftermath.goalAssessment.personalGoals.map((entry) => {
      const roleId = entry.briefing.replace(/_brief$/, '');
      const code = Object.keys(this._data.roles.roles)
        .find((c) => this._data.roles.roles[c].id === roleId);
      return `<li>
        <strong>${escape(code ? this._name(code) : roleId)}</strong>
        <span class="cm-meta">${entry.evidence.map((e) => escape(this._evidence(e))).join(' · ')}${
  entry.note ? ` — ${escape(entry.note)}` : ''}</span>
      </li>`;
    }).join('');

    return `
      <section class="cm-epilogue-goals">
        <h3>How everyone did</h3>
        <p class="cm-meta">The printed evidence for each goal, read off the final
          boards. The verdicts are the room's, not the app's.</p>
        <div class="cm-epilogue-factions">${factions}</div>
        <h3>Personal reckonings</h3>
        <ul class="cm-epilogue-personals">${personals}</ul>
      </section>`;
  }

  /** Every override, so the debrief can tell the game from the pencil. */
  _ledger(view) {
    const overrides = view.log.filter((entry) => entry.override);
    return `
      <section class="cm-epilogue-ledger">
        <h3>What the umpire changed <span class="cm-meta">${overrides.length}</span></h3>
        ${overrides.length ? `<ol>${overrides.map((entry) => `
          <li><code>${escape(entry.verb)}</code>
            <span class="cm-meta">#${entry.seq} · ${escape(summarise(entry))}</span></li>`).join('')}
        </ol>` : '<p class="cm-empty">Nothing. The whole game happened through the rules.</p>'}
      </section>`;
  }
}

/** A log entry's payload, short enough to read down a list of. */
function summarise(entry) {
  const payload = entry.payload ?? {};
  if (payload.path) return `${payload.path.join('.')}${'value' in payload
    ? ` = ${JSON.stringify(payload.value)}` : ` ${payload.delta > 0 ? '+' : ''}${payload.delta}`}`;
  const keys = Object.keys(payload);
  if (!keys.length) return '';
  return keys.slice(0, 3).map((key) => `${key}: ${JSON.stringify(payload[key])}`)
    .join(', ').slice(0, 90);
}

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

customElements.define('cm-epilogue', CmEpilogue);
