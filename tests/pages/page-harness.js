/**
 * The page-boot harness: the real HTML, the real app module, a stubbed
 * boundary.
 *
 * Exists because of a bug the unit suites could not see: a refactor removed
 * functions the host page still called at boot, every component test stayed
 * green, and the console died with a ReferenceError in the browser. These
 * helpers let each page's smoke test load the actual markup, run the actual
 * boot path, and fail on exactly that class of rot.
 *
 * Only the boundary is stubbed: `fetch` reads the repo's own files from
 * disk, and PeerJS is the same in-process fake the transport tests use.
 */

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Peer, createBroker } from '../fakes/peerjs-shim.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Put a page's real body into the jsdom document (scripts do not run). */
export async function loadPage(file) {
  const html = await readFile(join(ROOT, file), 'utf8');
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
}

/** A fetch that serves the repo itself, so loadData gets the real dataset. */
export function installFetch() {
  globalThis.fetch = async (url) => {
    try {
      const text = readFileSync(join(ROOT, String(url)), 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(text) };
    } catch {
      return { ok: false, status: 404, json: async () => { throw new Error('404'); } };
    }
  };
}

/** The transport fake, standing where the vendored PeerJS script would. */
export function installPeer() {
  createBroker();
  globalThis.Peer = Peer;
}

/** A location double: pages read search/hash and build player links from it. */
export const fakeLocation = (overrides = {}) => ({
  search: '',
  hash: '',
  origin: 'http://harness.test',
  pathname: '/index.html',
  ...overrides,
});
