/**
 * gui/client/load-data.js — the static dataset, fetched once.
 *
 * Both consoles need it: the projection carries what has *changed* about the
 * board, but the names, faction colours, printed initial track values and
 * card art paths never change and so are never sent. Sending eighteen role
 * names eighteen times a turn would be silly.
 *
 * Fetched rather than imported so the JSON stays JSON. With no build step,
 * import assertions are a compatibility question nobody needs to answer.
 */

const CORE = ['factions', 'roles', 'resources', 'maps', 'meta', 'scaling'];

/**
 * The two files only the facilitator's console has any business fetching:
 * the turn-by-turn event script (war correspondence, tithes, NPC play notes)
 * and the aftermath assessment tables. They are static files on the same
 * server, so a determined player could fetch them by hand — the same accepted
 * trade as the role card backs — but the app never loads them into a player
 * page, so they never appear on anybody's screen by accident.
 */
const FACILITATOR_ONLY = ['events', 'aftermath'];

let cached = null;
let facilitatorCached = null;

/**
 * @param {object} [options]
 * @param {string} [options.base]
 */
export async function loadData({ base = 'data' } = {}) {
  if (cached) return cached;
  cached = await fetchAll(CORE, base);
  return cached;
}

/** The facilitator-only files, loaded by host code and nothing else. */
export async function loadFacilitatorData({ base = 'data' } = {}) {
  if (facilitatorCached) return facilitatorCached;
  facilitatorCached = await fetchAll(FACILITATOR_ONLY, base);
  return facilitatorCached;
}

async function fetchAll(names, base) {
  const loaded = await Promise.all(
    names.map((name) => fetch(`${base}/${name}.json`).then((response) => {
      if (!response.ok) throw new Error(`could not load ${name} (${response.status})`);
      return response.json();
    })));
  return Object.fromEntries(names.map((name, i) => [name, loaded[i]]));
}
