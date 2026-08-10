// The published build's commit, stamped in by CI during site assembly
// (see .github/workflows/ci.yml). Stays 'dev' in the repo and when served
// straight from a checkout — the version check is a no-op then.
export const BUILD = 'dev';
