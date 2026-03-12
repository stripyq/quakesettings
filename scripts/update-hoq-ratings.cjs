#!/usr/bin/env node
/**
 * Fetch HoQ ratings from JSON API (or local JSON files), update hoq* fields
 * in player YAML files, sync CSVs in public/data/, then run sync-hoq-to-display.cjs.
 *
 * Primary data sources (JSON arrays with { _id, name, rating, n }):
 *   - http://88.214.20.58/export_rating/ctf.json  → saved to ctf.json
 *   - http://88.214.20.58/export_rating/tdm.json  → saved to tdm.json
 *
 * Falls back to repo-root ctf.json / tdm.json if API is unreachable.
 * After loading, also writes public/data/hoq_ctf.csv and hoq_tdm.csv
 * so other scripts that depend on the CSVs stay in sync.
 *
 * Updates: hoqCtfRating, hoqCtfGames, hoqTdmRating, hoqTdmGames
 * Does NOT touch accuracy fields (accuracy_rl, accuracy_rg, accuracy_lg).
 *
 * Usage:
 *   node scripts/update-hoq-ratings.cjs              # Fetch from API (fallback to local JSON)
 *   node scripts/update-hoq-ratings.cjs --from-json  # Skip API, read local ctf.json / tdm.json
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const PLAYERS_DIR = path.join(ROOT_DIR, 'src/content/players');
const CTF_URL = 'http://88.214.20.58/export_rating/ctf.json';
const TDM_URL = 'http://88.214.20.58/export_rating/tdm.json';
const CTF_JSON_PATH = path.join(ROOT_DIR, 'ctf.json');
const TDM_JSON_PATH = path.join(ROOT_DIR, 'tdm.json');
const CTF_CSV_PATH = path.join(ROOT_DIR, 'public/data/hoq_ctf.csv');
const TDM_CSV_PATH = path.join(ROOT_DIR, 'public/data/hoq_tdm.csv');
const SKIP_API = process.argv.includes('--from-json');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

/**
 * Load rating data: try API first, fall back to local JSON files.
 * Saves fetched JSON to repo root for future --from-json runs.
 */
async function loadRatings() {
  if (!SKIP_API) {
    try {
      console.log('Fetching CTF ratings from API...');
      const ctf = await fetchJson(CTF_URL);
      console.log(`  Got ${ctf.length} CTF entries`);

      console.log('Fetching TDM ratings from API...');
      const tdm = await fetchJson(TDM_URL);
      console.log(`  Got ${tdm.length} TDM entries`);

      // Cache to repo root
      fs.writeFileSync(CTF_JSON_PATH, JSON.stringify(ctf, null, 2));
      fs.writeFileSync(TDM_JSON_PATH, JSON.stringify(tdm, null, 2));
      console.log('  Saved ctf.json and tdm.json to repo root\n');

      return { ctf, tdm, source: 'api' };
    } catch (err) {
      console.log(`  API unavailable (${err.message}), falling back to local JSON...\n`);
    }
  }

  // Fall back to local JSON files
  if (!fs.existsSync(CTF_JSON_PATH) || !fs.existsSync(TDM_JSON_PATH)) {
    console.error(`Local JSON files not found: ${CTF_JSON_PATH} / ${TDM_JSON_PATH}`);
    console.error('Run without --from-json when the API is reachable to create them.');
    process.exit(1);
  }

  const ctf = JSON.parse(fs.readFileSync(CTF_JSON_PATH, 'utf8'));
  const tdm = JSON.parse(fs.readFileSync(TDM_JSON_PATH, 'utf8'));
  console.log(`Loaded ${ctf.length} CTF + ${tdm.length} TDM entries from local JSON\n`);

  return { ctf, tdm, source: 'json' };
}

/**
 * Write JSON rating data to CSV (matching existing hoq_ctf.csv / hoq_tdm.csv format).
 */
function writeCsv(rows, csvPath) {
  const lines = ['_id,name,rating,n'];
  for (const row of rows) {
    const id = String(row._id || '');
    const name = String(row.name || '').replace(/,/g, '');
    const rating = row.rating != null ? row.rating : '';
    const n = row.n != null ? row.n : '';
    lines.push(`${id},${name},${rating},${n}`);
  }
  fs.writeFileSync(csvPath, lines.join('\n') + '\n');
}

function getPlayerFiles() {
  const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const players = [];

  for (const file of files) {
    const filePath = path.join(PLAYERS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const steamIdMatch = content.match(/^steamId:\s*["']?(\d{17})["']?\s*$/m);
    if (steamIdMatch) {
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      players.push({
        file,
        path: filePath,
        steamId: steamIdMatch[1],
        name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : file.replace('.yaml', ''),
        content,
      });
    }
  }

  return players;
}

function updateYaml(player, ctfData, tdmData) {
  let content = player.content;
  const changes = [];

  const curCtfRating = content.match(/^hoqCtfRating:\s*(.+)$/m);
  const curCtfGames = content.match(/^hoqCtfGames:\s*(.+)$/m);
  const curTdmRating = content.match(/^hoqTdmRating:\s*(.+)$/m);
  const curTdmGames = content.match(/^hoqTdmGames:\s*(.+)$/m);

  const newCtfRating = ctfData ? ctfData.rating : null;
  const newCtfGames = ctfData && ctfData.n != null ? ctfData.n : null;
  const newTdmRating = tdmData ? tdmData.rating : null;
  const newTdmGames = tdmData && tdmData.n != null ? tdmData.n : null;

  function valStr(v) { return v != null && v !== '' ? String(v) : null; }
  function curVal(m) { return m ? m[1].trim().replace(/^["']|["']$/g, '') : null; }

  const ctfRatingChanged = valStr(newCtfRating) !== curVal(curCtfRating);
  const ctfGamesChanged = valStr(newCtfGames) != null && valStr(newCtfGames) !== curVal(curCtfGames);
  const tdmRatingChanged = valStr(newTdmRating) !== curVal(curTdmRating);
  const tdmGamesChanged = valStr(newTdmGames) != null && valStr(newTdmGames) !== curVal(curTdmGames);

  if (!ctfRatingChanged && !ctfGamesChanged && !tdmRatingChanged && !tdmGamesChanged) {
    return null;
  }

  // Remove existing hoq rating/games fields
  content = content.replace(/^hoqCtfRating:.*\n?/gm, '');
  content = content.replace(/^hoqCtfGames:.*\n?/gm, '');
  content = content.replace(/^hoqTdmRating:.*\n?/gm, '');
  content = content.replace(/^hoqTdmGames:.*\n?/gm, '');

  // Build new lines
  const newLines = [];
  if (valStr(newCtfRating) != null) {
    newLines.push(`hoqCtfRating: ${newCtfRating}`);
    if (ctfRatingChanged) changes.push(`hoqCtfRating: ${curVal(curCtfRating) || '-'} → ${newCtfRating}`);
  }
  if (valStr(newCtfGames) != null) {
    newLines.push(`hoqCtfGames: ${newCtfGames}`);
    if (ctfGamesChanged) changes.push(`hoqCtfGames: ${curVal(curCtfGames) || '-'} → ${newCtfGames}`);
  }
  if (valStr(newTdmRating) != null) {
    newLines.push(`hoqTdmRating: ${newTdmRating}`);
    if (tdmRatingChanged) changes.push(`hoqTdmRating: ${curVal(curTdmRating) || '-'} → ${newTdmRating}`);
  }
  if (valStr(newTdmGames) != null) {
    newLines.push(`hoqTdmGames: ${newTdmGames}`);
    if (tdmGamesChanged) changes.push(`hoqTdmGames: ${curVal(curTdmGames) || '-'} → ${newTdmGames}`);
  }

  if (newLines.length > 0) {
    const insertAfter = /^(dataSource:.*|category:.*)$/m;
    const match = content.match(insertAfter);

    if (match) {
      const insertPos = match.index + match[0].length;
      content = content.slice(0, insertPos) + '\n' + newLines.join('\n') + content.slice(insertPos);
    } else {
      content = content.trimEnd() + '\n' + newLines.join('\n') + '\n';
    }
  }

  return { content, changes };
}

async function main() {
  console.log('=== Update HoQ Ratings ===\n');

  // --- Phase 1: Load ratings from API or local JSON ---
  const { ctf: ctfJson, tdm: tdmJson } = await loadRatings();

  // --- Phase 1b: Update CSVs in public/data/ to stay in sync ---
  writeCsv(ctfJson, CTF_CSV_PATH);
  writeCsv(tdmJson, TDM_CSV_PATH);
  console.log(`Wrote ${ctfJson.length} CTF + ${tdmJson.length} TDM entries to public/data/ CSVs\n`);

  // Build lookup maps by Steam ID (string comparison)
  const ctfBySteamId = new Map();
  for (const entry of ctfJson) {
    if (entry._id) ctfBySteamId.set(String(entry._id), entry);
  }

  const tdmBySteamId = new Map();
  for (const entry of tdmJson) {
    if (entry._id) tdmBySteamId.set(String(entry._id), entry);
  }

  // --- Phase 2: Update hoq fields in player YAMLs ---
  const players = getPlayerFiles();
  console.log(`Found ${players.length} players with steamId\n`);

  let updatedCount = 0;
  let matchedCount = 0;

  for (const player of players) {
    const ctfData = ctfBySteamId.get(player.steamId) || null;
    const tdmData = tdmBySteamId.get(player.steamId) || null;

    if (!ctfData && !tdmData) continue;
    matchedCount++;

    const result = updateYaml(player, ctfData, tdmData);
    if (result) {
      fs.writeFileSync(player.path, result.content);
      updatedCount++;
      console.log(`  ${player.name}: ${result.changes.join(', ')}`);
    }
  }

  console.log(`\n--- Ratings Summary ---`);
  console.log(`Matched: ${matchedCount} players`);
  console.log(`Updated: ${updatedCount} players`);
  console.log(`Unchanged: ${matchedCount - updatedCount} players`);

  // --- Phase 3: Sync hoq fields to display fields ---
  if (updatedCount > 0) {
    console.log('\nRunning sync-hoq-to-display.cjs to populate display fields...\n');
    const syncScript = path.join(__dirname, 'sync-hoq-to-display.cjs');
    execSync(`node "${syncScript}"`, { stdio: 'inherit' });
  } else {
    console.log('\nNo rating changes — skipping display sync.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
