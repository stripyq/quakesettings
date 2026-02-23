#!/usr/bin/env node
/**
 * Map and Cap Statistics Analysis
 *
 * Produces console/file output with:
 *   1. Player caps per map (average per game)
 *   2. Global map play frequency (from match history)
 *   3. Average caps per map globally
 *
 * Usage:
 *   node scripts/analyze-maps.cjs
 *   node scripts/analyze-maps.cjs --matches=500
 *   node scripts/analyze-maps.cjs --output=analysis/map-stats.txt
 *   node scripts/analyze-maps.cjs --matches=500 --output=analysis/map-stats.txt
 */

const fs = require('fs');
const path = require('path');

// --- Configuration ---
const API_BASE = 'http://77.90.2.137:8004/api';
const SEASON_STATS_PATH = path.join(__dirname, '../public/data/season-stats.json');
const DEFAULT_MATCH_LIMIT = 500;
const FETCH_BATCH_SIZE = 100; // API max per request

// --- Parse CLI args ---
function parseArgs() {
  const args = { matches: DEFAULT_MATCH_LIMIT, output: null };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--matches=')) {
      args.matches = parseInt(arg.split('=')[1], 10) || DEFAULT_MATCH_LIMIT;
    } else if (arg.startsWith('--output=')) {
      args.output = arg.split('=')[1];
    }
  }
  return args;
}

// --- Helpers ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function padRight(str, len) {
  const s = String(str);
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function padLeft(str, len) {
  const s = String(str);
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// --- Data Loading ---
function loadSeasonStats() {
  if (!fs.existsSync(SEASON_STATS_PATH)) {
    console.error(`Error: season-stats.json not found at ${SEASON_STATS_PATH}`);
    console.error('Run "npm run fetch:season" first to fetch player data.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(SEASON_STATS_PATH, 'utf8'));
}

async function fetchMatches(totalLimit) {
  const allMatches = [];
  let offset = 0;

  console.log(`Fetching up to ${totalLimit} CTF matches from API...`);

  while (allMatches.length < totalLimit) {
    const limit = Math.min(FETCH_BATCH_SIZE, totalLimit - allMatches.length);
    const url = `${API_BASE}/matches?mode=ctf&limit=${limit}&offset=${offset}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`API returned ${res.status} for offset=${offset}, stopping.`);
        break;
      }
      const data = await res.json();
      const matches = Array.isArray(data) ? data : (data.matches || data.data || []);

      if (matches.length === 0) break;

      allMatches.push(...matches);
      offset += matches.length;

      if (matches.length < limit) break; // No more data

      process.stdout.write(`  Fetched ${allMatches.length}/${totalLimit} matches\r`);
      await sleep(100);
    } catch (err) {
      console.warn(`\nFetch error at offset=${offset}: ${err.message}`);
      break;
    }
  }

  console.log(`  Fetched ${allMatches.length} matches total.`);
  return allMatches;
}

// --- Analysis 1: Player Caps Per Map ---
function analyzePlayerCapsPerMap(seasonStats) {
  const lines = [];
  lines.push('=' .repeat(80));
  lines.push('PLAYER CAPS PER MAP (estimated avg per game)');
  lines.push('=' .repeat(80));
  lines.push('');
  lines.push('Note: Per-map capture data is not available in the current dataset.');
  lines.push('Showing estimated caps/game using overall capture rate applied to map matches.');
  lines.push('Formula: (total_captures / total_matches) = avg caps/game across all maps');
  lines.push('');

  // Collect players with both flagStats and mapStats
  const playerRows = [];
  const allMaps = new Set();

  for (const [steamId, player] of Object.entries(seasonStats)) {
    const ctf = player.ctf;
    if (!ctf || !ctf.mapStats || !ctf.flagStats) continue;

    const flagData = ctf.flagStats.data || ctf.flagStats;
    const captures = flagData.captures;
    const totalMatches = flagData.matches_played;

    if (!captures || !totalMatches || totalMatches === 0) continue;

    const avgCapsPerGame = captures / totalMatches;
    const mapData = {};

    for (const ms of ctf.mapStats) {
      allMaps.add(ms.map);
      mapData[ms.map] = {
        matches: ms.matches,
        // Estimate: assume uniform capture rate across maps
        estimatedCapsPerGame: avgCapsPerGame,
        kills: ms.total_kills,
        kd: ms.kd_ratio,
      };
    }

    playerRows.push({
      name: player.name || steamId,
      captures,
      totalMatches,
      avgCapsPerGame,
      mapData,
    });
  }

  // Sort by total captures descending
  playerRows.sort((a, b) => b.captures - a.captures);

  // Sort maps by total matches across all players
  const mapMatchCounts = {};
  for (const row of playerRows) {
    for (const [map, data] of Object.entries(row.mapData)) {
      mapMatchCounts[map] = (mapMatchCounts[map] || 0) + data.matches;
    }
  }
  const sortedMaps = [...allMaps].sort((a, b) => (mapMatchCounts[b] || 0) - (mapMatchCounts[a] || 0));

  if (playerRows.length === 0) {
    lines.push('No players found with both flag stats and map stats.');
    lines.push('');
    return lines;
  }

  // Build table
  const nameWidth = 18;
  const colWidth = 14;
  const totalCapsWidth = 10;

  // Header
  let header = padRight('Player', nameWidth) + padLeft('Tot Caps', totalCapsWidth) + padLeft('Avg/Game', totalCapsWidth);
  for (const map of sortedMaps) {
    const shortName = map.length > colWidth - 2 ? map.substring(0, colWidth - 2) : map;
    header += padLeft(shortName, colWidth);
  }
  lines.push(header);
  lines.push('-'.repeat(header.length));

  // Data rows
  for (const row of playerRows) {
    let line = padRight(row.name.substring(0, nameWidth - 1), nameWidth);
    line += padLeft(String(row.captures), totalCapsWidth);
    line += padLeft(row.avgCapsPerGame.toFixed(2), totalCapsWidth);

    for (const map of sortedMaps) {
      const md = row.mapData[map];
      if (md) {
        line += padLeft(row.avgCapsPerGame.toFixed(2), colWidth);
      } else {
        line += padLeft('-', colWidth);
      }
    }
    lines.push(line);
  }

  lines.push('');
  lines.push(`Players shown: ${playerRows.length} (those with flag stats + map stats)`);
  lines.push('');

  // Also show per-map breakdown with matches played
  lines.push('-'.repeat(80));
  lines.push('PLAYER MAP MATCH BREAKDOWN');
  lines.push('-'.repeat(80));
  lines.push('');

  let breakdownHeader = padRight('Player', nameWidth);
  for (const map of sortedMaps) {
    const shortName = map.length > colWidth - 2 ? map.substring(0, colWidth - 2) : map;
    breakdownHeader += padLeft(shortName, colWidth);
  }
  breakdownHeader += padLeft('Total', 10);
  lines.push(breakdownHeader);
  lines.push('-'.repeat(breakdownHeader.length));

  for (const row of playerRows) {
    let line = padRight(row.name.substring(0, nameWidth - 1), nameWidth);
    let rowTotal = 0;
    for (const map of sortedMaps) {
      const md = row.mapData[map];
      if (md) {
        line += padLeft(String(md.matches), colWidth);
        rowTotal += md.matches;
      } else {
        line += padLeft('-', colWidth);
      }
    }
    line += padLeft(String(rowTotal), 10);
    lines.push(line);
  }
  lines.push('');

  return lines;
}

// --- Analysis 2: Global Map Play Frequency ---
function analyzeMapFrequency(matches) {
  const lines = [];
  lines.push('=' .repeat(80));
  lines.push(`MAP FREQUENCY (from ${matches.length} matches)`);
  lines.push('=' .repeat(80));
  lines.push('');

  if (matches.length === 0) {
    lines.push('No match data available. Ensure the API is reachable.');
    lines.push('');
    return lines;
  }

  // Count map occurrences
  const mapCounts = {};
  for (const match of matches) {
    const map = match.map || match.map_name || match.mapname || 'unknown';
    mapCounts[map] = (mapCounts[map] || 0) + 1;
  }

  // Sort by frequency
  const sorted = Object.entries(mapCounts).sort((a, b) => b[1] - a[1]);
  const total = matches.length;

  const mapWidth = 22;
  const gamesWidth = 10;
  const pctWidth = 12;

  lines.push(padRight('Map', mapWidth) + padLeft('Games', gamesWidth) + padLeft('% of total', pctWidth));
  lines.push('-'.repeat(mapWidth + gamesWidth + pctWidth));

  for (const [map, count] of sorted) {
    const pct = ((count / total) * 100).toFixed(1) + '%';
    lines.push(
      padRight(map, mapWidth) +
      padLeft(String(count), gamesWidth) +
      padLeft(pct, pctWidth)
    );
  }

  lines.push('');
  lines.push(`Total unique maps: ${sorted.length}`);
  lines.push('');

  return lines;
}

// --- Analysis 3: Average Caps Per Map Globally ---
function analyzeAvgCapsPerMap(matches) {
  const lines = [];
  lines.push('=' .repeat(80));
  lines.push('AVERAGE CAPS PER MAP (from match data)');
  lines.push('=' .repeat(80));
  lines.push('');

  if (matches.length === 0) {
    lines.push('No match data available. Ensure the API is reachable.');
    lines.push('');
    return lines;
  }

  // Aggregate per map
  const mapStats = {};
  for (const match of matches) {
    const map = match.map || match.map_name || match.mapname || 'unknown';

    if (!mapStats[map]) {
      mapStats[map] = { games: 0, totalCaps: 0, totalDuration: 0, hasDuration: false };
    }

    mapStats[map].games++;

    // Try various field names for scores
    const redScore = match.red_score ?? match.score_red ?? match.team1_score ?? 0;
    const blueScore = match.blue_score ?? match.score_blue ?? match.team2_score ?? 0;
    mapStats[map].totalCaps += redScore + blueScore;

    // Try various field names for duration
    const duration = match.duration ?? match.game_length ?? match.length ?? match.time ?? 0;
    if (duration > 0) {
      mapStats[map].totalDuration += duration;
      mapStats[map].hasDuration = true;
    }
  }

  // Sort by games played
  const sorted = Object.entries(mapStats).sort((a, b) => b[1].games - a[1].games);

  const mapWidth = 22;
  const capsWidth = 16;
  const durationWidth = 18;

  lines.push(
    padRight('Map', mapWidth) +
    padLeft('Avg Total Caps', capsWidth) +
    padLeft('Avg Game Length', durationWidth)
  );
  lines.push('-'.repeat(mapWidth + capsWidth + durationWidth));

  for (const [map, stats] of sorted) {
    const avgCaps = (stats.totalCaps / stats.games).toFixed(1);
    const avgDuration = stats.hasDuration
      ? formatDuration(stats.totalDuration / stats.games)
      : '-';

    lines.push(
      padRight(map, mapWidth) +
      padLeft(avgCaps, capsWidth) +
      padLeft(avgDuration, durationWidth)
    );
  }

  lines.push('');

  return lines;
}

// --- Analysis: Player Map Stats from season-stats.json (bonus detail) ---
function analyzePlayerMapStatsFromLocal(seasonStats) {
  const lines = [];
  lines.push('=' .repeat(80));
  lines.push('PLAYER MAP PERFORMANCE (from season-stats.json)');
  lines.push('=' .repeat(80));
  lines.push('');
  lines.push('KD ratio and DPM per map for players with map data.');
  lines.push('');

  const playerRows = [];
  const allMaps = new Set();

  for (const [steamId, player] of Object.entries(seasonStats)) {
    const ctf = player.ctf;
    if (!ctf || !ctf.mapStats || ctf.mapStats.length === 0) continue;

    const career = ctf.career || {};
    const mapData = {};

    for (const ms of ctf.mapStats) {
      allMaps.add(ms.map);
      mapData[ms.map] = ms;
    }

    playerRows.push({
      name: player.name || steamId,
      totalMatches: career.matches_played || 0,
      mapData,
    });
  }

  playerRows.sort((a, b) => b.totalMatches - a.totalMatches);

  const mapMatchCounts = {};
  for (const row of playerRows) {
    for (const [map, data] of Object.entries(row.mapData)) {
      mapMatchCounts[map] = (mapMatchCounts[map] || 0) + data.matches;
    }
  }
  const sortedMaps = [...allMaps].sort((a, b) => (mapMatchCounts[b] || 0) - (mapMatchCounts[a] || 0));

  if (playerRows.length === 0) {
    lines.push('No players found with map stats.');
    lines.push('');
    return lines;
  }

  // KD table
  const nameWidth = 18;
  const colWidth = 14;

  lines.push('--- KD Ratio per Map ---');
  lines.push('');
  let header = padRight('Player', nameWidth);
  for (const map of sortedMaps) {
    const shortName = map.length > colWidth - 2 ? map.substring(0, colWidth - 2) : map;
    header += padLeft(shortName, colWidth);
  }
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const row of playerRows.slice(0, 40)) { // Top 40 by matches
    let line = padRight(row.name.substring(0, nameWidth - 1), nameWidth);
    for (const map of sortedMaps) {
      const md = row.mapData[map];
      line += padLeft(md ? md.kd_ratio.toFixed(2) : '-', colWidth);
    }
    lines.push(line);
  }

  lines.push('');
  lines.push(`Showing top 40 of ${playerRows.length} players by total matches.`);
  lines.push('');

  // Win rate table
  lines.push('--- Win Rate per Map (%) ---');
  lines.push('');
  header = padRight('Player', nameWidth);
  for (const map of sortedMaps) {
    const shortName = map.length > colWidth - 2 ? map.substring(0, colWidth - 2) : map;
    header += padLeft(shortName, colWidth);
  }
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const row of playerRows.slice(0, 40)) {
    let line = padRight(row.name.substring(0, nameWidth - 1), nameWidth);
    for (const map of sortedMaps) {
      const md = row.mapData[map];
      line += padLeft(md ? md.win_rate.toFixed(1) : '-', colWidth);
    }
    lines.push(line);
  }

  lines.push('');
  lines.push(`Showing top 40 of ${playerRows.length} players by total matches.`);
  lines.push('');

  return lines;
}

// --- Main ---
async function main() {
  const args = parseArgs();

  console.log('Map & Cap Statistics Analysis');
  console.log('============================');
  console.log(`Match limit: ${args.matches}`);
  if (args.output) console.log(`Output file: ${args.output}`);
  console.log('');

  // Load season stats
  console.log('Loading season-stats.json...');
  const seasonStats = loadSeasonStats();
  const playerCount = Object.keys(seasonStats).length;
  console.log(`  Loaded ${playerCount} players.`);
  console.log('');

  // Fetch match data from API
  let matches = [];
  try {
    matches = await fetchMatches(args.matches);
  } catch (err) {
    console.warn(`Could not fetch match data: ${err.message}`);
    console.warn('Global map statistics will not be available.');
  }
  console.log('');

  // Run analyses
  const output = [];

  output.push('Map & Cap Statistics Analysis');
  output.push(`Generated: ${new Date().toISOString()}`);
  output.push(`Season stats: ${playerCount} players`);
  output.push(`Match data: ${matches.length} matches`);
  output.push('');

  // 1. Player caps per map
  output.push(...analyzePlayerCapsPerMap(seasonStats));

  // 2. Global map play frequency
  output.push(...analyzeMapFrequency(matches));

  // 3. Average caps per map globally
  output.push(...analyzeAvgCapsPerMap(matches));

  // 4. Bonus: player map performance from local data
  output.push(...analyzePlayerMapStatsFromLocal(seasonStats));

  // Output results
  const text = output.join('\n');
  console.log(text);

  // Save to file if requested
  if (args.output) {
    const outputPath = path.resolve(args.output);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, text, 'utf8');
    console.log(`\nResults saved to ${outputPath}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
