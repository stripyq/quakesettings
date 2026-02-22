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
const BATCH_SIZE = 10; // Parallel fetches per batch
const BATCH_DELAY_MS = 100; // Delay between batches
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
    const [career, weapons, flagStats, nemesis, favoriteVictim, headToHead, mapStats] = await Promise.all([
      fetchJson(`${API_BASE}/ctf/players/${steamId}`),
      fetchJson(`${API_BASE}/ctf/weapons/${steamId}`),
      fetchJson(`${API_BASE}/ctf/ctf/${steamId}`),
      fetchJson(`${API_BASE}/ctf/players/${steamId}/nemesis`),
      fetchJson(`${API_BASE}/ctf/players/${steamId}/favorite-victim`),
      fetchJson(`${API_BASE}/ctf/players/${steamId}/head-to-head`),
      fetchJson(`${API_BASE}/ctf/players/${steamId}/maps`),
    ]);

    // head-to-head returns { data: [...], total, mode } — extract the array
    const h2hArray = Array.isArray(headToHead) ? headToHead
      : (Array.isArray(headToHead?.data) ? headToHead.data : null);

    return { career, weapons, flagStats, nemesis, favoriteVictim, headToHead: h2hArray, mapStats };
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

  // Process results for a single player
  function processResult(steamId, name, stats) {
    // flagStats/nemesis/favoriteVictim return { data: ... } wrappers — check .data for content
    const hasFlagData = stats && stats.flagStats && stats.flagStats.data;
    const hasNemesis = stats && stats.nemesis && stats.nemesis.data;
    const hasVictim = stats && stats.favoriteVictim && stats.favoriteVictim.data;
    const hasH2H = stats && stats.headToHead && stats.headToHead.length > 0;
    const hasData = stats && (stats.career || stats.weapons || hasFlagData);
    if (hasData) {
      const entry = { name, fetchedAt: new Date().toISOString() };
      if (stats.career) entry.career = stats.career;
      if (stats.weapons) entry.weapons = stats.weapons;
      if (hasFlagData) entry.flagStats = stats.flagStats;
      if (hasNemesis) entry.nemesis = stats.nemesis;
      if (hasVictim) entry.favoriteVictim = stats.favoriteVictim;
      if (hasH2H) entry.headToHead = stats.headToHead;
      if (stats.mapStats) entry.mapStats = stats.mapStats;
      results[steamId] = entry;
      fetchedCount++;
      return 'OK';
    } else if (stats) {
      noDataCount++;
      return 'no data';
    } else {
      errorCount++;
      return 'error';
    }
  }

  // Fetch in parallel batches
  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(players.length / BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async ({ steamId, name }) => {
        const stats = await fetchPlayerStats(steamId);
        return { steamId, name, stats };
      })
    );

    for (const { steamId, name, stats } of batchResults) {
      const status = processResult(steamId, name, stats);
      console.log(`  [batch ${batchNum}/${totalBatches}] ${name}: ${status}`);
    }

    // Small delay between batches to avoid overwhelming the API
    if (i + BATCH_SIZE < players.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // --- Phase 2: Fetch detailed head-to-head matchup data for profiled player pairs ---
  // This gets match win/loss records and per-map breakdowns that aren't in the basic h2h list
  const profiledIds = new Set(Object.keys(results));
  const matchupPairs = []; // [steamId, opponentId] pairs to fetch

  for (const steamId of profiledIds) {
    const h2h = results[steamId]?.headToHead;
    if (!Array.isArray(h2h)) continue;
    for (const entry of h2h) {
      const opId = entry.opponent_steam_id || entry.steam_id;
      if (opId && profiledIds.has(opId) && steamId < opId) {
        // Only fetch each pair once (steamId < opId avoids duplicates)
        matchupPairs.push([steamId, opId]);
      }
    }
  }

  if (matchupPairs.length > 0) {
    console.log(`\n--- Fetching detailed matchup data for ${matchupPairs.length} player pairs ---\n`);

    for (let i = 0; i < matchupPairs.length; i += BATCH_SIZE) {
      const batch = matchupPairs.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(matchupPairs.length / BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async ([sid, oid]) => {
          const data = await fetchJson(`${API_BASE}/ctf/players/${sid}/head-to-head/${oid}`);
          return { sid, oid, data };
        })
      );

      for (const { sid, oid, data } of batchResults) {
        const matchup = data?.data || data;
        if (!matchup) {
          console.log(`  [batch ${batchNum}/${totalBatches}] ${results[sid]?.name} vs ${results[oid]?.name}: no data`);
          continue;
        }

        // Store under both players keyed by opponent
        if (!results[sid].headToHeadMatchups) results[sid].headToHeadMatchups = {};
        if (!results[oid].headToHeadMatchups) results[oid].headToHeadMatchups = {};

        results[sid].headToHeadMatchups[oid] = matchup;

        // Invert W/L for the other player's perspective
        const inverted = {
          overall: matchup.overall ? {
            matches_won: matchup.overall.matches_lost,
            matches_lost: matchup.overall.matches_won,
            matches_played: matchup.overall.matches_played,
          } : null,
          maps: Array.isArray(matchup.maps) ? matchup.maps.map(m => ({
            map: m.map,
            matches_won: m.matches_lost,
            matches_lost: m.matches_won,
            matches_played: m.matches_played,
          })) : null,
        };
        results[oid].headToHeadMatchups[sid] = inverted;

        const name1 = results[sid]?.name || sid;
        const name2 = results[oid]?.name || oid;
        const w = matchup.overall?.matches_won ?? '?';
        const l = matchup.overall?.matches_lost ?? '?';
        console.log(`  [batch ${batchNum}/${totalBatches}] ${name1} vs ${name2}: ${w}W-${l}L`);
      }

      if (i + BATCH_SIZE < matchupPairs.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }
  }

  // Write results
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));

  console.log(`\n========================================`);
  console.log(`Fetched: ${fetchedCount} players with data`);
  console.log(`No data: ${noDataCount} players`);
  if (errorCount > 0) console.log(`Errors:  ${errorCount} players`);
  if (matchupPairs.length > 0) console.log(`Matchup pairs: ${matchupPairs.length} fetched`);
  console.log(`Total in output: ${Object.keys(results).length} players`);
  console.log(`Saved to: ${OUTPUT_PATH}`);
}

main().catch(console.error);
