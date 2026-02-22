#!/usr/bin/env node
/**
 * Fetch HoQ 2026 S1 season stats from the HoQ Season API
 *
 * Source: http://77.90.2.137:8004/api
 *
 * Usage:
 *   node scripts/fetch-season-stats.cjs                  # Fetch from API and save JSON
 *   node scripts/fetch-season-stats.cjs --from-json      # Skip fetch, use existing JSON
 *   node scripts/fetch-season-stats.cjs --dry-run        # Show what would be fetched without saving
 *   node scripts/fetch-season-stats.cjs --debug          # Log full API responses for first player
 *
 * Output: public/data/season-stats.json
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://77.90.2.137:8004/api';
const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const OUTPUT_PATH = path.join(__dirname, '../public/data/season-stats.json');
const DELAY_MS = 200;
const USE_JSON = process.argv.includes('--from-json');
const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.argv.includes('--debug');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get all players with steam IDs from YAML files
function getPlayersWithSteamIds() {
  const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const players = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(PLAYERS_DIR, file), 'utf8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const steamIdMatch = content.match(/^steamId:\s*["']?(\d{17})["']?\s*$/m);

    if (nameMatch && steamIdMatch) {
      players.push({
        file,
        name: nameMatch[1].trim().replace(/^["']|["']$/g, ''),
        steamId: steamIdMatch[1],
      });
    }
  }

  return players;
}

// Fetch career/season stats for a player
async function fetchCareerStats(steamId) {
  const url = `${API_BASE}/ctf/players/${steamId}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

// Fetch weapon stats for a player
async function fetchWeaponStats(steamId) {
  const url = `${API_BASE}/ctf/weapons/${steamId}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

// Fetch both endpoints for a player
async function fetchPlayerStats(steamId) {
  try {
    const career = await fetchCareerStats(steamId);
    await sleep(DELAY_MS);
    const weapons = await fetchWeaponStats(steamId);
    return { career, weapons };
  } catch (error) {
    console.error(`  Error fetching ${steamId}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Fetching HoQ 2026 S1 Season Stats ===\n');
  if (DRY_RUN) console.log('(DRY RUN - no files will be written)\n');

  // If --from-json, just validate the existing file
  if (USE_JSON) {
    if (!fs.existsSync(OUTPUT_PATH)) {
      console.error(`Error: ${OUTPUT_PATH} not found. Run without --from-json first.`);
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    console.log(`Existing file has ${Object.keys(data).length} players.`);
    return;
  }

  const players = getPlayersWithSteamIds();
  console.log(`Found ${players.length} players with Steam IDs\n`);

  const results = {};
  let fetched = 0;
  let skipped = 0;
  let errors = 0;
  let debugDone = false;

  for (const player of players) {
    process.stdout.write(`  Fetching ${player.name} (${player.steamId})...`);

    const stats = await fetchPlayerStats(player.steamId);

    if (!stats) {
      console.log(' error');
      errors++;
      await sleep(DELAY_MS);
      continue;
    }

    // Debug: log first successful response to understand structure
    if (DEBUG && !debugDone && (stats.career || stats.weapons)) {
      console.log('\n\n--- DEBUG: Career response ---');
      console.log(JSON.stringify(stats.career, null, 2));
      console.log('\n--- DEBUG: Weapons response ---');
      console.log(JSON.stringify(stats.weapons, null, 2));
      console.log('--- END DEBUG ---\n');
      debugDone = true;
    }

    if (!stats.career && !stats.weapons) {
      console.log(' no data');
      skipped++;
      await sleep(DELAY_MS);
      continue;
    }

    results[player.steamId] = {
      name: player.name,
      career: stats.career,
      weapons: stats.weapons,
      fetchedAt: new Date().toISOString(),
    };

    const parts = [];
    if (stats.career) parts.push('career');
    if (stats.weapons) parts.push('weapons');
    console.log(` OK (${parts.join(', ')})`);
    fetched++;

    await sleep(DELAY_MS);
  }

  // Save results
  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
    console.log(`\nSaved ${Object.keys(results).length} players to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  }

  console.log(`\n=== Complete ===`);
  console.log(`Fetched: ${fetched}`);
  console.log(`No data: ${skipped}`);
  if (errors > 0) console.log(`Errors: ${errors}`);
}

main().catch(console.error);
