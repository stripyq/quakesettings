#!/usr/bin/env node
/**
 * Fetch per-player map ratings from the HoQ rating API and cache locally.
 *
 * API endpoint: http://88.214.20.58/player/{steamid}/map_ratings.json
 * Cache location: data/api_cache/{steamid}_map_ratings.json
 *
 * Only fetches for rostered players (team2026 set) with a steamId.
 * Skips players whose cache file already exists (use --force to re-fetch all).
 *
 * Usage:
 *   node scripts/fetch-map-ratings.cjs
 *   node scripts/fetch-map-ratings.cjs --force
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const API_BASE = 'http://88.214.20.58/player';
const PLAYERS_DIR = path.join(__dirname, '..', 'src', 'content', 'players');
const CACHE_DIR = path.join(__dirname, '..', 'data', 'api_cache');
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 300;
const FORCE = process.argv.includes('--force');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRosteredPlayers() {
  const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const players = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(PLAYERS_DIR, f), 'utf8');
    const data = yaml.load(content) || {};
    if (data.team2026 && data.steamId) {
      players.push({
        slug: f.replace('.yaml', ''),
        name: data.name || f.replace('.yaml', ''),
        steamId: data.steamId,
        team2026: data.team2026,
        team2026Shortname: data.team2026Shortname || '',
      });
    }
  }
  return players;
}

async function fetchPlayerMapRatings(steamId, name) {
  const url = `${API_BASE}/${steamId}/map_ratings.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  [${res.status}] ${name} (${steamId})`);
      return null;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`  [ERROR] ${name} (${steamId}): ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('Map Ratings Fetcher');
  console.log('===================');

  // Ensure cache directory exists
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const players = getRosteredPlayers();
  console.log(`Found ${players.length} rostered players with Steam IDs`);

  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (player) => {
      const cachePath = path.join(CACHE_DIR, `${player.steamId}_map_ratings.json`);

      if (!FORCE && fs.existsSync(cachePath)) {
        skipped++;
        return;
      }

      const data = await fetchPlayerMapRatings(player.steamId, player.name);
      if (data != null) {
        fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
        console.log(`  Fetched: ${player.name} (${player.steamId})`);
        fetched++;
      } else {
        failed++;
      }
    });

    await Promise.all(promises);

    if (i + BATCH_SIZE < players.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`\nDone! Fetched: ${fetched}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`Cache directory: ${CACHE_DIR}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
