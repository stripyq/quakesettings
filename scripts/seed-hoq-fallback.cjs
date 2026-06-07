#!/usr/bin/env node
/**
 * Seed public/data/hoq/ from the DEPLOYED site (last-good data) for any player whose
 * per-player JSON is missing locally. Used to build the committed deploy fallback when
 * HoQ itself is unreachable: the live site still serves these files from the last green
 * deploy, so we copy them back into the repo.
 *
 * Skips files that already exist locally (e.g. freshly fetched from HoQ), so run
 * fetch-hoq-maps.cjs first and this second.
 *
 * Usage: node scripts/seed-hoq-fallback.cjs
 */
const fs = require('fs');
const path = require('path');

const SITE_BASE = 'https://stripyq.github.io/quakesettings/data/hoq';
const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const OUTPUT_DIR = path.join(__dirname, '../public/data/hoq');
const FILES = ['map_ratings.json', 'history.json'];
const BATCH_SIZE = 10; // github.io is a CDN; this is fine
const BATCH_DELAY_MS = 200;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getPlayersWithSteamId() {
  const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const ids = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(PLAYERS_DIR, file), 'utf8');
    const m = content.match(/^steamId:\s*["']?(\d+)["']?/m);
    if (m) ids.push(m[1]);
  }
  return ids;
}

async function fetchJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function seedPlayer(id) {
  const dir = path.join(OUTPUT_DIR, id);
  let seeded = 0, had = 0, missing = 0;
  for (const f of FILES) {
    const dest = path.join(dir, f);
    if (fs.existsSync(dest)) { had++; continue; } // keep fresher local data
    const data = await fetchJson(`${SITE_BASE}/${id}/${f}`);
    if (data == null) { missing++; continue; }    // not on the live site either
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(data));
    seeded++;
  }
  return { seeded, had, missing };
}

async function main() {
  const ids = getPlayersWithSteamId();
  console.log(`Found ${ids.length} players with steamId`);

  let seeded = 0, had = 0, missing = 0, done = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(seedPlayer));
    for (const r of results) { seeded += r.seeded; had += r.had; missing += r.missing; done++; }
    console.log(`  ${done}/${ids.length} players processed...`);
    if (i + BATCH_SIZE < ids.length) await sleep(BATCH_DELAY_MS);
  }

  console.log(`Done: ${seeded} files seeded from the live site, ${had} already present locally, ${missing} unavailable anywhere.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
