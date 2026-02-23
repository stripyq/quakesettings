#!/usr/bin/env node
/**
 * Fetch VQL race data from qlrace.com and write into player YAML files.
 *
 * Fetches mode=2 (VQL Weapons) first, falls back to mode=3 (VQL Strafe).
 * Writes a `qlrace:` block into each player's YAML if data is found.
 *
 * Usage:
 *   node scripts/fetch-qlrace.js                     # Fetch all players with steamId
 *   node scripts/fetch-qlrace.js --player <steamId>  # Fetch a single player
 *   node scripts/fetch-qlrace.js --dry-run            # Don't write files, just show what would happen
 *   node scripts/fetch-qlrace.js --force              # Re-fetch even if qlrace data already exists
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
// qlrace.com public API for Quake Live race/defrag records
const API_BASE = 'https://qlrace.com/api';
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 1000; // Be polite to qlrace.com
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const SINGLE_PLAYER = (() => {
  const idx = process.argv.indexOf('--player');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Format milliseconds as m:ss.SSS
 */
function formatTime(ms) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const secStr = seconds < 10 ? '0' + seconds.toFixed(3) : seconds.toFixed(3);
  return `${minutes}:${secStr}`;
}

/**
 * Fetch race data for a player. Try mode=2 (VQL Weapons) first, fall back to mode=3 (VQL Strafe).
 */
async function fetchPlayerRaceData(steamId) {
  for (const mode of [2, 3]) {
    const data = await fetchJson(`${API_BASE}/player/${steamId}?mode=${mode}`);
    if (data && data.records && data.records.length > 0) {
      return { data, mode };
    }
  }
  return null;
}

/**
 * Build the qlrace YAML block from API response.
 *
 * API response shape (from QLRace source: db/functions/player_scores_v02.sql):
 *   {
 *     name: string, id: number, average: number,
 *     medals: [gold, silver, bronze],
 *     records: [{ id, map, mode, time, checkpoints, speed_start, speed_end,
 *                 speed_top, speed_average, date, rank, total_records }]
 *   }
 */
function buildQlraceBlock(apiData, mode) {
  const records = apiData.records || [];

  // Use API-provided medals array: [gold, silver, bronze]
  const apiMedals = Array.isArray(apiData.medals) ? apiData.medals : [0, 0, 0];
  const gold = apiMedals[0] || 0;
  const silver = apiMedals[1] || 0;
  const bronze = apiMedals[2] || 0;
  const wrs = gold; // WRs = rank 1 = gold medals

  // Find top speed across all records (field: speed_top)
  const speeds = records.map(r => r.speed_top).filter(s => s != null && s > 0);
  const speedTop = speeds.length > 0 ? Math.max(...speeds) : null;

  // Calculate average rank percentage: mean of (rank / total_records * 100)
  const rankPcts = records.map(r => {
    if (r.rank && r.total_records && r.total_records > 0) {
      return (r.rank / r.total_records) * 100;
    }
    return null;
  }).filter(v => v != null);
  const averageRankPct = rankPcts.length > 0
    ? Math.round((rankPcts.reduce((a, b) => a + b, 0) / rankPcts.length) * 10) / 10
    : null;

  // Sort records by rank percentage to find best and top maps
  const sorted = records
    .filter(r => r.rank && r.total_records && r.total_records > 0)
    .map(r => ({
      map: r.map,
      rank: r.rank,
      total: r.total_records,
      time: r.time,
      rank_pct: Math.round((r.rank / r.total_records) * 1000) / 10,
    }))
    .sort((a, b) => a.rank_pct - b.rank_pct);

  const bestRecord = sorted.length > 0 ? sorted[0] : null;
  const topMaps = sorted.slice(0, 5);

  const block = {
    mode,
    records: records.length,
    wrs,
    medals: { gold, silver, bronze },
  };

  if (speedTop != null) block.speed_top = Math.round(speedTop * 10) / 10;
  if (averageRankPct != null) block.average_rank_pct = averageRankPct;
  if (bestRecord) block.best_record = bestRecord;
  if (topMaps.length > 0) block.top_maps = topMaps;
  block.fetched_at = new Date().toISOString().split('T')[0];

  return block;
}

/**
 * Read a YAML file, update/add the qlrace block, and write back.
 * Preserves existing content by doing string-level replacement.
 */
function updateYamlFile(filePath, qlraceBlock) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Serialize the qlrace block
  const qlraceYaml = yaml.dump({ qlrace: qlraceBlock }, {
    flowLevel: 3,
    lineWidth: 120,
    noRefs: true,
  }).trimEnd();

  // Check if qlrace block already exists
  const qlraceRegex = /^qlrace:[\s\S]*?(?=^[a-zA-Z_]|\z)/m;
  let newContent;

  if (qlraceRegex.test(content)) {
    // Replace existing qlrace block
    newContent = content.replace(qlraceRegex, qlraceYaml + '\n');
  } else {
    // Append at end of file
    newContent = content.trimEnd() + '\n' + qlraceYaml + '\n';
  }

  fs.writeFileSync(filePath, newContent, 'utf8');
}

async function main() {
  console.log('=== Fetching QLRace.com VQL Race Data ===\n');
  if (DRY_RUN) console.log('(--dry-run mode: no files will be modified)\n');
  if (FORCE) console.log('(--force mode: re-fetching all players)\n');

  // Find all player YAML files with steamIds
  const yamlFiles = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const players = [];

  for (const file of yamlFiles) {
    const filePath = path.join(PLAYERS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const steamIdMatch = content.match(/^steamId:\s*["']?(\d{17})["']?/m);
    if (!steamIdMatch) continue;

    const steamId = steamIdMatch[1];

    // Filter by single player if specified
    if (SINGLE_PLAYER && steamId !== SINGLE_PLAYER) continue;

    // Skip if already has qlrace data (unless --force)
    if (!FORCE && /^qlrace:/m.test(content)) {
      continue;
    }

    const nameMatch = content.match(/^name:\s*["']?([^"'\n]+)["']?/m);
    const name = nameMatch ? nameMatch[1].trim() : file.replace('.yaml', '');

    players.push({ steamId, name, file, filePath });
  }

  console.log(`Found ${players.length} players to fetch\n`);

  if (players.length === 0) {
    console.log('No players to fetch. Use --force to re-fetch existing data.');
    return;
  }

  let fetched = 0;
  let noData = 0;
  let errors = 0;

  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(players.length / BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async ({ steamId, name, file, filePath }) => {
        const result = await fetchPlayerRaceData(steamId);
        return { steamId, name, file, filePath, result };
      })
    );

    for (const { steamId, name, file, filePath, result } of results) {
      if (result) {
        const block = buildQlraceBlock(result.data, result.mode);
        const modeLabel = result.mode === 2 ? 'VQL Weapons' : 'VQL Strafe';
        console.log(`  [${batchNum}/${totalBatches}] ${name}: ${block.records} records (${modeLabel}), best: ${block.best_record?.map || 'N/A'}`);

        if (DRY_RUN) {
          // Show the full YAML block that would be written
          const qlraceYaml = yaml.dump({ qlrace: block }, {
            flowLevel: 3,
            lineWidth: 120,
            noRefs: true,
          }).trimEnd();
          console.log('\n--- Would write to ' + file + ' ---');
          console.log(qlraceYaml);
          console.log('---\n');
        } else {
          updateYamlFile(filePath, block);
        }
        fetched++;
      } else {
        console.log(`  [${batchNum}/${totalBatches}] ${name}: no race data`);
        noData++;
      }
    }

    if (i + BATCH_SIZE < players.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`\n========================================`);
  console.log(`Fetched: ${fetched} players with race data`);
  console.log(`No data: ${noData} players`);
  if (errors > 0) console.log(`Errors:  ${errors}`);
  if (DRY_RUN) console.log(`(dry-run: no files were modified)`);
}

main().catch(console.error);
