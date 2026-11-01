// Preloaded (node --require) by tests that run a script against a fixture disk cache: any
// request that misses the cache fails at once instead of reaching hoqstats.vercel.app.
// `fatal` makes scripts/lib/hoqstats.cjs skip its retries.
globalThis.fetch = async url => {
  throw Object.assign(new Error(`network disabled in tests: ${url}`), { fatal: true });
};
