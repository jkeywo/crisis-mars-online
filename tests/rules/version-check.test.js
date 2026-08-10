// The half-deploy guard: stale modules against fresh markup render nothing
// without throwing, so this compares the running build to what the server
// publishes and reveals the reload banner on a mismatch.

import { describe, it, expect, vi, afterEach } from 'vitest';

// build.js exports 'dev' in the tree; the tests that need a real build stamp
// it themselves via a module mock.
afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); vi.unstubAllGlobals(); });

function bannerStub() {
  return { hidden: true };
}

async function withBuild(build) {
  vi.doMock('../../gui/build.js', () => ({ BUILD: build }));
  return (await import('../../gui/version-check.js')).checkVersion;
}

describe('checkVersion', () => {
  it('does nothing on a dev checkout', async () => {
    const checkVersion = await withBuild('dev');
    const fetchSpy = vi.stubGlobal('fetch', vi.fn());
    const banner = bannerStub();
    await checkVersion(banner);
    expect(banner.hidden).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('leaves the banner hidden when the live version matches', async () => {
    const checkVersion = await withBuild('abc123');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      { ok: true, text: () => Promise.resolve('abc123\n2026-08-10T00:00:00Z\n') }));
    const banner = bannerStub();
    await checkVersion(banner);
    expect(banner.hidden).toBe(true);
  });

  it('reveals the banner when the running build is stale', async () => {
    const checkVersion = await withBuild('oldsha');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      { ok: true, text: () => Promise.resolve('newsha\n2026-08-10T00:00:00Z\n') }));
    const banner = bannerStub();
    await checkVersion(banner);
    expect(banner.hidden).toBe(false);
  });

  it('stays quiet when VERSION cannot be fetched (offline / file://)', async () => {
    const checkVersion = await withBuild('abc123');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const banner = bannerStub();
    await checkVersion(banner);
    expect(banner.hidden).toBe(true);
  });

  it('requests VERSION uncached', async () => {
    const checkVersion = await withBuild('abc123');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('abc123') });
    vi.stubGlobal('fetch', fetchMock);
    await checkVersion(bannerStub());
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^VERSION\?/);
    expect(opts).toEqual({ cache: 'no-store' });
  });
});
