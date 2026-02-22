#!/usr/bin/env node
/**
 * Fetch HoQ 2026 Season 1 stats from the CTF API and save to public/data/season-stats.json
 *
 * Data sources (in priority order):
 *   1. player-registry.json — 2000+ players with Steam IDs from HoQ CSVs
 *   2. YAML player profiles — fallback for any profiles with steamId not in registry
 *
 * Usage:
 *   node scripts/fetch-season-stats.cjs                 # Fetch all players
 *   node scripts/fetch-season-stats.cjs --profiles-only # Only fetch players with YAML profiles
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://77.90.2.137:8004/api';
const REGISTRY_PATH = path.join(__dirname, '../src/data/player-registry.json');
const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const OUTPUT_PATH = path.join(__dirname, '../public/data/season-stats.json');
const DELAY_MS = 200; // Rate limit between requests
const PROFILES_ONLY = process.argv.includes('--profiles-only');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build a deduplicated list of { steamId, name } from all available sources.
 * Registry is the primary source (has all players from HoQ CSVs).
 * YAML profiles are checked as a fallback for any missing Steam IDs.
 */
function getAllPlayers() {
  const seen = new Set();
  const players = [];

  // Source 1: player-registry.json (authoritative, 2000+ entries)
  if (fs.existsSync(REGISTRY_PATH)) {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    const entries = registry.players || [];
    console.log(`Registry: ${entries.length} total players`);

    for (const entry of entries) {
      if (!entry.steamId) continue;

      // In --profiles-only mode, skip players without YAML profiles
      if (PROFILES_ONLY && !entry.hasProfile) continue;

      if (!seen.has(entry.steamId)) {
        seen.add(entry.steamId);
        players.push({ steamId: entry.steamId, name: entry.name || entry.steamId });
      }
    }
  } else {
    console.warn('Warning: player-registry.json not found, falling back to YAML files only');
  }

  // Source 2: YAML player profiles (catch any with steamId not in registry)
  const yamlFiles = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  let yamlAdded = 0;
  for (const file of yamlFiles) {
    const content = fs.readFileSync(path.join(PLAYERS_DIR, file), 'utf8');
    const steamIdMatch = content.match(/^steamId:\s*["']?(\d{17})["']?/m);
    const nameMatch = content.match(/^name:\s*["']?([^"'\n]+)["']?/m);

    if (steamIdMatch && !seen.has(steamIdMatch[1])) {
      seen.add(steamIdMatch[1]);
      players.push({
        steamId: steamIdMatch[1],
        name: nameMatch ? nameMatch[1].trim() : file.replace('.yaml', ''),
      });
      yamlAdded++;
    }
  }

  if (yamlAdded > 0) {
    console.log(`YAML fallback: added ${yamlAdded} extra players not in registry`);
  }

  return players;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function fetchPlayerStats(steamId) {
  try {
    const [career, weapons, flagStats, nemesis, favoriteVictim] = await Promise.all([
      fetchJson(`${API_BASE}/ctf/players/${steamId}`),
      fetchJson(`${API_BASE}/ctf/weapons/${steamId}`),
      fetchJson(`${API_BASE}/ctf/ctf/${steamId}`),
      fetchJson(`${API_BASE}/ctf/players/${steamId}/nemesis`),
      fetchJson(`${API_BASE}/ctf/players/${steamId}/favorite-victim`),
    ]);

    return { career, weapons, flagStats, nemesis, favoriteVictim };
  } catch (error) {
    console.error(`  Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Fetching HoQ 2026 Season Stats ===\n');
  if (PROFILES_ONLY) console.log('(--profiles-only: only fetching players with YAML profiles)\n');

  const players = getAllPlayers();
  console.log(`\nTotal players to fetch: ${players.length}\n`);

  if (players.length === 0) {
    console.error('No players with Steam IDs found. Run the build first to generate player-registry.json.');
    process.exit(1);
  }

  // Load existing results so we can do incremental updates in future
  let results = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      results = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    } catch {
      // Corrupted file, start fresh
    }
  }

  let fetchedCount = 0;
  let noDataCount = 0;
  let errorCount = 0;

  for (let i = 0; i < players.length; i++) {
    const { steamId, name } = players[i];
    const progress = `[${i + 1}/${players.length}]`;

    process.stdout.write(`${progress} ${name} (${steamId})... `);

    const stats = await fetchPlayerStats(steamId);

    const hasData = stats && (stats.career || stats.weapons || stats.flagStats);
    if (hasData) {
      const entry = { name, fetchedAt: new Date().toISOString() };
      if (stats.career) entry.career = stats.career;
      if (stats.weapons) entry.weapons = stats.weapons;
      if (stats.flagStats) entry.flagStats = stats.flagStats;
      if (stats.nemesis) entry.nemesis = stats.nemesis;
      if (stats.favoriteVictim) entry.favoriteVictim = stats.favoriteVictim;
      results[steamId] = entry;
      fetchedCount++;
      console.log('OK');
    } else if (stats) {
      // API responded but no data for this player
      noDataCount++;
      console.log('no data');
    } else {
      errorCount++;
      // Error already logged by fetchPlayerStats
    }

    // Rate limit
    if (i < players.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Write results
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));

  console.log(`\n========================================`);
  console.log(`Fetched: ${fetchedCount} players with data`);
  console.log(`No data: ${noDataCount} players`);
  if (errorCount > 0) console.log(`Errors:  ${errorCount} players`);
  console.log(`Total in output: ${Object.keys(results).length} players`);
  console.log(`Saved to: ${OUTPUT_PATH}`);
}

main().catch(console.error);
