#!/usr/bin/env node
/**
 * Fetch HoQ ratings from export_rating JSON endpoints and update player YAML files.
 *
 * Data sources:
 *   - http://88.214.20.58/export_rating/ctf.json
 *   - http://88.214.20.58/export_rating/tdm.json
 *
 * Each JSON entry has: { _id: steamId, name, rating, n (games) }
 * Matches players by steamId and updates hoqCtfRating, hoqCtfGames, hoqTdmRating, hoqTdmGames.
 *
 * Usage:
 *   node scripts/fetch-hoq-ratings.cjs                    # Fetch from API
 *   node scripts/fetch-hoq-ratings.cjs --from-json        # Import from local ctf.json / tdm.json in scripts/
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const CTF_URL = 'http://88.214.20.58/export_rating/ctf.json';
const TDM_URL = 'http://88.214.20.58/export_rating/tdm.json';
const USE_JSON = process.argv.includes('--from-json');
const CTF_JSON_PATH = path.join(__dirname, 'ctf.json');
const TDM_JSON_PATH = path.join(__dirname, 'tdm.json');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 30000 }, (res) => {
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

  // Extract current values
  const curCtfRating = content.match(/^hoqCtfRating:\s*(.+)$/m);
  const curCtfGames = content.match(/^hoqCtfGames:\s*(.+)$/m);
  const curTdmRating = content.match(/^hoqTdmRating:\s*(.+)$/m);
  const curTdmGames = content.match(/^hoqTdmGames:\s*(.+)$/m);

  const newCtfRating = ctfData ? ctfData.rating : null;
  const newCtfGames = ctfData ? (ctfData.n || ctfData.games || null) : null;
  const newTdmRating = tdmData ? tdmData.rating : null;
  const newTdmGames = tdmData ? (tdmData.n || tdmData.games || null) : null;

  // Check if anything changed
  function valStr(v) { return v != null ? String(v) : null; }
  function curVal(m) { return m ? m[1].trim().replace(/^["']|["']$/g, '') : null; }

  const ctfRatingChanged = valStr(newCtfRating) !== curVal(curCtfRating);
  const ctfGamesChanged = newCtfGames != null && valStr(newCtfGames) !== curVal(curCtfGames);
  const tdmRatingChanged = valStr(newTdmRating) !== curVal(curTdmRating);
  const tdmGamesChanged = newTdmGames != null && valStr(newTdmGames) !== curVal(curTdmGames);

  if (!ctfRatingChanged && !ctfGamesChanged && !tdmRatingChanged && !tdmGamesChanged) {
    return null; // Nothing changed
  }

  // Remove existing hoq fields
  content = content.replace(/^hoqCtfRating:.*\n?/gm, '');
  content = content.replace(/^hoqCtfGames:.*\n?/gm, '');
  content = content.replace(/^hoqTdmRating:.*\n?/gm, '');
  content = content.replace(/^hoqTdmGames:.*\n?/gm, '');

  // Build new lines
  const newLines = [];
  if (newCtfRating != null) {
    newLines.push(`hoqCtfRating: ${newCtfRating}`);
    if (ctfRatingChanged) changes.push(`ctfRating: ${curVal(curCtfRating) || '-'} → ${newCtfRating}`);
  }
  if (newCtfGames != null) {
    newLines.push(`hoqCtfGames: ${newCtfGames}`);
    if (ctfGamesChanged) changes.push(`ctfGames: ${curVal(curCtfGames) || '-'} → ${newCtfGames}`);
  }
  if (newTdmRating != null) {
    newLines.push(`hoqTdmRating: ${newTdmRating}`);
    if (tdmRatingChanged) changes.push(`tdmRating: ${curVal(curTdmRating) || '-'} → ${newTdmRating}`);
  }
  if (newTdmGames != null) {
    newLines.push(`hoqTdmGames: ${newTdmGames}`);
    if (tdmGamesChanged) changes.push(`tdmGames: ${curVal(curTdmGames) || '-'} → ${newTdmGames}`);
  }

  if (newLines.length > 0) {
    // Insert after dataSource line, or after category line, or append
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
  console.log('=== Fetching HoQ Ratings ===\n');

  let ctfJson, tdmJson;

  if (USE_JSON) {
    console.log('Loading from local JSON files...');
    ctfJson = JSON.parse(fs.readFileSync(CTF_JSON_PATH, 'utf8'));
    console.log(`  Loaded ${ctfJson.length} CTF entries from ${CTF_JSON_PATH}`);
    tdmJson = JSON.parse(fs.readFileSync(TDM_JSON_PATH, 'utf8'));
    console.log(`  Loaded ${tdmJson.length} TDM entries from ${TDM_JSON_PATH}`);
  } else {
    console.log('Fetching CTF ratings...');
    ctfJson = await fetchJson(CTF_URL);
    console.log(`  Got ${ctfJson.length} CTF entries`);

    console.log('Fetching TDM ratings...');
    tdmJson = await fetchJson(TDM_URL);
    console.log(`  Got ${tdmJson.length} TDM entries`);
  }

  // Build lookup maps by Steam ID
  const ctfBySteamId = new Map();
  for (const entry of ctfJson) {
    if (entry._id) ctfBySteamId.set(String(entry._id), entry);
  }

  const tdmBySteamId = new Map();
  for (const entry of tdmJson) {
    if (entry._id) tdmBySteamId.set(String(entry._id), entry);
  }

  // Get players
  const players = getPlayerFiles();
  console.log(`\nFound ${players.length} players with steamId\n`);

  let updatedCount = 0;
  let matchedCount = 0;
  const allChanges = [];

  for (const player of players) {
    const ctfData = ctfBySteamId.get(player.steamId) || null;
    const tdmData = tdmBySteamId.get(player.steamId) || null;

    if (!ctfData && !tdmData) continue;
    matchedCount++;

    const result = updateYaml(player, ctfData, tdmData);
    if (result) {
      fs.writeFileSync(player.path, result.content);
      updatedCount++;
      allChanges.push({ name: player.name, file: player.file, changes: result.changes });
      console.log(`✓ ${player.name}: ${result.changes.join(', ')}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Matched: ${matchedCount} players`);
  console.log(`Updated: ${updatedCount} players`);
  console.log(`Unchanged: ${matchedCount - updatedCount} players`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
