#!/usr/bin/env node
/**
 * Read HoQ ratings from local CSV files and update hoq* fields in player YAML files,
 * then run sync-hoq-to-display.cjs to populate display fields.
 *
 * Data sources (CSV with columns: _id, name, rating, n):
 *   - public/data/hoq_ctf.csv
 *   - public/data/hoq_tdm.csv
 *
 * Matches players by steamId (YAML) against _id (CSV), compared as strings.
 * Updates: hoqCtfRating, hoqCtfGames, hoqTdmRating, hoqTdmGames
 * Does NOT touch accuracy fields (accuracy_rl, accuracy_rg, accuracy_lg).
 *
 * Usage:
 *   node scripts/update-hoq-ratings.cjs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const CTF_CSV = path.join(__dirname, '../public/data/hoq_ctf.csv');
const TDM_CSV = path.join(__dirname, '../public/data/hoq_tdm.csv');

/**
 * Parse a simple CSV file (columns: _id, name, rating, n) into an array of objects.
 * Handles BOM and empty trailing fields.
 */
function parseCsv(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Strip BOM
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] || '';
    }
    rows.push(row);
  }

  return rows;
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

  const newCtfRating = ctfData ? ctfData.rating || null : null;
  const newCtfGames = ctfData ? ctfData.n || null : null;
  const newTdmRating = tdmData ? tdmData.rating || null : null;
  const newTdmGames = tdmData ? tdmData.n || null : null;

  function valStr(v) { return v != null && v !== '' ? String(v) : null; }
  function curVal(m) { return m ? m[1].trim().replace(/^["']|["']$/g, '') : null; }

  const ctfRatingChanged = valStr(newCtfRating) !== curVal(curCtfRating);
  const ctfGamesChanged = valStr(newCtfGames) != null && valStr(newCtfGames) !== curVal(curCtfGames);
  const tdmRatingChanged = valStr(newTdmRating) !== curVal(curTdmRating);
  const tdmGamesChanged = valStr(newTdmGames) != null && valStr(newTdmGames) !== curVal(curTdmGames);

  if (!ctfRatingChanged && !ctfGamesChanged && !tdmRatingChanged && !tdmGamesChanged) {
    return null; // Nothing changed
  }

  // Remove existing hoq rating/games fields
  content = content.replace(/^hoqCtfRating:.*\n?/gm, '');
  content = content.replace(/^hoqCtfGames:.*\n?/gm, '');
  content = content.replace(/^hoqTdmRating:.*\n?/gm, '');
  content = content.replace(/^hoqTdmGames:.*\n?/gm, '');

  // Build new lines
  const newLines = [];
  if (valStr(newCtfRating)) {
    newLines.push(`hoqCtfRating: ${newCtfRating}`);
    if (ctfRatingChanged) changes.push(`hoqCtfRating: ${curVal(curCtfRating) || '-'} → ${newCtfRating}`);
  }
  if (valStr(newCtfGames)) {
    newLines.push(`hoqCtfGames: ${newCtfGames}`);
    if (ctfGamesChanged) changes.push(`hoqCtfGames: ${curVal(curCtfGames) || '-'} → ${newCtfGames}`);
  }
  if (valStr(newTdmRating)) {
    newLines.push(`hoqTdmRating: ${newTdmRating}`);
    if (tdmRatingChanged) changes.push(`hoqTdmRating: ${curVal(curTdmRating) || '-'} → ${newTdmRating}`);
  }
  if (valStr(newTdmGames)) {
    newLines.push(`hoqTdmGames: ${newTdmGames}`);
    if (tdmGamesChanged) changes.push(`hoqTdmGames: ${curVal(curTdmGames) || '-'} → ${newTdmGames}`);
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

function main() {
  console.log('=== Update HoQ Ratings ===\n');

  // --- Phase 1: Load ratings from CSV files ---
  if (!fs.existsSync(CTF_CSV)) {
    console.error(`CTF CSV not found: ${CTF_CSV}`);
    process.exit(1);
  }
  if (!fs.existsSync(TDM_CSV)) {
    console.error(`TDM CSV not found: ${TDM_CSV}`);
    process.exit(1);
  }

  const ctfRows = parseCsv(CTF_CSV);
  console.log(`Loaded ${ctfRows.length} CTF entries from hoq_ctf.csv`);

  const tdmRows = parseCsv(TDM_CSV);
  console.log(`Loaded ${tdmRows.length} TDM entries from hoq_tdm.csv`);

  // Build lookup maps by Steam ID (string comparison)
  const ctfBySteamId = new Map();
  for (const row of ctfRows) {
    const id = String(row._id || '').trim();
    if (id) ctfBySteamId.set(id, row);
  }

  const tdmBySteamId = new Map();
  for (const row of tdmRows) {
    const id = String(row._id || '').trim();
    if (id) tdmBySteamId.set(id, row);
  }

  // --- Phase 2: Update hoq fields in player YAMLs ---
  const players = getPlayerFiles();
  console.log(`\nFound ${players.length} players with steamId\n`);

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

main();
