#!/usr/bin/env node
/**
 * Fetch per-player CTF match history from the HoQ Season Tracker API and
 * aggregate each player's matches into monthly activity buckets.
 *
 * Endpoint: /api/matches/{steamId}/history?mode=ctf&limit=100&skip=N
 * Response: { data: [...], total: N } — each match has a started_at Unix timestamp.
 *
 * Output: public/data/player-activity/{steamId}.json
 *   [ { "week": "2025-12-01", "games": 5 }, ... ]
 *
 * Usage:
 *   node scripts/fetch-player-activity.cjs
 *   node scripts/fetch-player-activity.cjs --profiles-only   # (default — only YAML profiles)
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://77.90.2.137:8004/api';
const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const OUTPUT_DIR = path.join(__dirname, '../public/data/player-activity');
const PAGE_SIZE = 100;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get all players with Steam IDs from YAML profile files.
 */
function getPlayers() {
  const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const players = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(PLAYERS_DIR, file), 'utf8');
    const steamIdMatch = content.match(/^steamId:\s*["']?(\d{17})["']?/m);
    const nameMatch = content.match(/^name:\s*["']?([^"'\n]+)["']?/m);

    if (steamIdMatch) {
      players.push({
        steamId: steamIdMatch[1],
        name: nameMatch ? nameMatch[1].trim() : file.replace('.yaml', ''),
      });
    }
  }

  return players;
}

/**
 * Fetch all CTF match timestamps for a single player.
 */
async function fetchPlayerMatches(steamId) {
  const timestamps = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = `${API_BASE}/matches/${steamId}/history?mode=ctf&limit=${PAGE_SIZE}&skip=${offset}`;
    try {
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();

      if (data.total != null) total = data.total;

      const matches = Array.isArray(data) ? data : (data.data || data.matches || []);
      if (matches.length === 0) break;

      for (const match of matches) {
        const ts = match.started_at ?? match.timestamp ?? match.date;
        if (ts != null) timestamps.push(ts);
      }

      offset += matches.length;
    } catch {
      break;
    }
  }

  return timestamps;
}

/**
 * Get the Monday of the ISO week containing a given date, as YYYY-MM-DD.
 */
function getWeekMonday(d) {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

/**
 * Aggregate Unix timestamps into weekly buckets (keyed by Monday date).
 */
function aggregateByWeek(timestamps) {
  const buckets = {};

  for (const ts of timestamps) {
    const ms = ts > 1e12 ? ts : ts * 1000;
    const d = new Date(ms);
    const key = getWeekMonday(d);
    buckets[key] = (buckets[key] || 0) + 1;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, games]) => ({ week, games }));
}

async function main() {
  console.log('=== Fetch Per-Player CTF Activity ===\n');

  const players = getPlayers();
  console.log(`Players with Steam IDs: ${players.length}\n`);

  if (players.length === 0) {
    console.error('No players found with Steam IDs.');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let fetched = 0;
  let withData = 0;
  let noData = 0;
  let errors = 0;

  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(players.length / BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async ({ steamId, name }) => {
        try {
          const timestamps = await fetchPlayerMatches(steamId);
          return { steamId, name, timestamps };
        } catch (err) {
          return { steamId, name, timestamps: null, error: err.message };
        }
      })
    );

    for (const { steamId, name, timestamps, error } of results) {
      fetched++;
      if (error || !timestamps) {
        errors++;
        console.log(`  [${batchNum}/${totalBatches}] ${name}: error`);
        continue;
      }

      if (timestamps.length === 0) {
        noData++;
        console.log(`  [${batchNum}/${totalBatches}] ${name}: no matches`);
        continue;
      }

      const activity = aggregateByWeek(timestamps);
      const outPath = path.join(OUTPUT_DIR, `${steamId}.json`);
      fs.writeFileSync(outPath, JSON.stringify(activity, null, 2));
      withData++;
      console.log(`  [${batchNum}/${totalBatches}] ${name}: ${timestamps.length} matches, ${activity.length} months`);
    }

    if (i + BATCH_SIZE < players.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`With data: ${withData}`);
  console.log(`No matches: ${noData}`);
  if (errors > 0) console.log(`Errors: ${errors}`);
  console.log(`Output: ${OUTPUT_DIR}/`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
