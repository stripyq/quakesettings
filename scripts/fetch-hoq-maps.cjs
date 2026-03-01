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
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 200;

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

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
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
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
