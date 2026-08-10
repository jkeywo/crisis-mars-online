// Catch the silent half-deploy: a browser that cached the JS (Cloudflare
// serves it with a four-hour TTL) but re-fetched the ten-minute HTML runs
// old modules against new markup, finds none of the elements it expects,
// and renders nothing — without throwing, so the boot watchdog never fires.
//
// Every deploy stamps its commit into build.js AND into the VERSION file.
// If the module we are running was built from a different commit than the
// one the server is publishing now, this module is stale: reveal the reload
// banner. A checkout (BUILD === 'dev') or an offline load skips the check.

import { BUILD } from './build.js';

export async function checkVersion(banner = document.getElementById('stale-banner')) {
  if (BUILD === 'dev' || !banner) return;
  try {
    const res = await fetch(`VERSION?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const live = (await res.text()).trim().split(/\s+/)[0];
    if (live && live !== BUILD) banner.hidden = false;
  } catch {
    // Offline, file://, or VERSION absent — nothing to compare against.
  }
}
