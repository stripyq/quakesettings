#!/usr/bin/env node
/**
 * Pre-fetch HoQ history.json and map_ratings.json for every player with a steamId.
 * Saves per-player JSON files into public/data/hoq/{steamId}/ so client-side JS can
 * fetch them from the same origin (avoiding mixed-content / CORS issues).
 *
 * Usage:
 *   node scripts/fetch-hoq-maps.cjs
 */

const fs = require('fs');
const path = require('path');

const HOQ_BASE = 'http://88.214.20.58';
const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const OUTPUT_DIR = path.join(__dirname, '../public/data/hoq');
// Gentle by default: this hits the same small HoQ host as the ratings/archive fetchers, and
// each player makes 2 calls. Override via HOQ_MAPS_BATCH_SIZE / HOQ_MAPS_BATCH_DELAY_MS.
const BATCH_SIZE = Number(process.env.HOQ_MAPS_BATCH_SIZE || 5);
const BATCH_DELAY_MS = Number(process.env.HOQ_MAPS_BATCH_DELAY_MS || 500);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getPlayersWithSteamId() {
  const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const players = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(PLAYERS_DIR, file), 'utf8');
    const match = content.match(/^steamId:\s*["']?(\d+)["']?/m);
    if (match) {
      players.push(match[1]);
    }
  }
  return players;
}

async function fetchJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // timeout (HoQ's per-player JSON 504s after 60s when its backend stalls) or network error
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPlayer(steamId) {
  const dir = path.join(OUTPUT_DIR, steamId);
  fs.mkdirSync(dir, { recursive: true });

  const [history, mapRatings] = await Promise.all([
    fetchJson(`${HOQ_BASE}/player/${steamId}/history.json`).catch(() => null),
    fetchJson(`${HOQ_BASE}/player/${steamId}/map_ratings.json`).catch(() => null),
  ]);

  if (history) {
    fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify(history));
  }
  if (mapRatings) {
    fs.writeFileSync(path.join(dir, 'map_ratings.json'), JSON.stringify(mapRatings));
  }

  return { history: !!history, mapRatings: !!mapRatings };
}

async function main() {
  const steamIds = getPlayersWithSteamId();
  console.log(`Found ${steamIds.length} players with steamId`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let fetched = 0;
  let historyCount = 0;
  let mapCount = 0;

  for (let i = 0; i < steamIds.length; i += BATCH_SIZE) {
    const batch = steamIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(sid => fetchPlayer(sid)));

    for (const r of results) {
      fetched++;
      if (r.history) historyCount++;
      if (r.mapRatings) mapCount++;
    }

    console.log(`  ${fetched}/${steamIds.length} players fetched...`);

    if (i + BATCH_SIZE < steamIds.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`Done: ${historyCount} history files, ${mapCount} map_ratings files saved to public/data/hoq/`);

  // Coverage gate: a near-empty result means HoQ was unreachable (or changed format), not that
  // players genuinely have no maps. Fail loudly so the deploy keeps the last-good site instead of
  // shipping empty map leaderboards. Tune via MIN_MAP_COVERAGE (default 0.25 of profiled players).
  const minCoverage = Number(process.env.MIN_MAP_COVERAGE || 0.25);
  const minFiles = Math.max(1, Math.floor(steamIds.length * minCoverage));
  if (mapCount < minFiles) {
    console.error(`\nFATAL: only ${mapCount}/${steamIds.length} map_ratings fetched (need >= ${minFiles}). HoQ likely down; failing so empty leaderboards are not deployed.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
