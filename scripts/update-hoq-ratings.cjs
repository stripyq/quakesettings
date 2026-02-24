#!/usr/bin/env node
/**
 * Update hoqCtfRating, hoqCtfGames, hoqTdmRating, hoqTdmGames in player YAML files
 * from HoQ export data (CSV or JSON).
 *
 * Usage:
 *   node scripts/update-hoq-ratings.cjs
 *   node scripts/update-hoq-ratings.cjs --ctf-json path/to/ctf.json --tdm-json path/to/tdm.json
 */

const fs = require('fs');
const path = require('path');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const CTF_CSV = path.join(__dirname, '../public/data/hoq_ctf.csv');
const TDM_CSV = path.join(__dirname, '../public/data/hoq_tdm.csv');

// Parse command-line args
const args = process.argv.slice(2);
let ctfJsonPath = null;
let tdmJsonPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ctf-json' && args[i + 1]) ctfJsonPath = args[++i];
  if (args[i] === '--tdm-json' && args[i + 1]) tdmJsonPath = args[++i];
}

// Parse CSV file into Map<steamId, {rating, n}>
function parseCsv(filePath) {
  const map = new Map();
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').slice(1); // skip header
  for (const line of lines) {
    // Format: _id,name,rating,n
    // Name can contain commas, so we parse from both ends
    const firstComma = line.indexOf(',');
    const lastComma = line.lastIndexOf(',');
    const secondLastComma = line.lastIndexOf(',', lastComma - 1);

    const steamId = line.substring(0, firstComma);
    const ratingStr = line.substring(secondLastComma + 1, lastComma);
    const nStr = line.substring(lastComma + 1);

    const rating = parseFloat(ratingStr);
    const n = nStr.trim() ? parseInt(nStr.trim(), 10) : null;

    if (steamId && !isNaN(rating)) {
      map.set(steamId, { rating: Math.round(rating * 100) / 100, n });
    }
  }
  return map;
}

// Parse JSON file into Map<steamId, {rating, n}>
function parseJson(filePath) {
  const map = new Map();
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const entries = content.response || content;
  for (const entry of entries) {
    if (entry._id && entry.rating != null) {
      map.set(entry._id, {
        rating: Math.round(entry.rating * 100) / 100,
        n: entry.n != null ? entry.n : null,
      });
    }
  }
  return map;
}

// Load CTF data
let ctfMap;
if (ctfJsonPath) {
  console.log(`Loading CTF from JSON: ${ctfJsonPath}`);
  ctfMap = parseJson(ctfJsonPath);
} else {
  console.log(`Loading CTF from CSV: ${CTF_CSV}`);
  ctfMap = parseCsv(CTF_CSV);
}
console.log(`  CTF entries: ${ctfMap.size}`);

// Load TDM data
let tdmMap;
if (tdmJsonPath) {
  console.log(`Loading TDM from JSON: ${tdmJsonPath}`);
  tdmMap = parseJson(tdmJsonPath);
} else {
  console.log(`Loading TDM from CSV: ${TDM_CSV}`);
  tdmMap = parseCsv(TDM_CSV);
}
console.log(`  TDM entries: ${tdmMap.size}`);

// Process player YAML files
const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
console.log(`\nProcessing ${files.length} player files...\n`);

let updatedCount = 0;
let skippedCount = 0;
const changes = [];

for (const file of files) {
  const filePath = path.join(PLAYERS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract steamId
  const steamIdMatch = content.match(/^steamId:\s*["']?(\d{17})["']?\s*$/m);
  if (!steamIdMatch) {
    skippedCount++;
    continue;
  }

  const steamId = steamIdMatch[1];
  const ctfData = ctfMap.get(steamId);
  const tdmData = tdmMap.get(steamId);

  if (!ctfData && !tdmData) {
    skippedCount++;
    continue;
  }

  // Extract current values
  const currentCtfRating = content.match(/^hoqCtfRating:\s*(.+)$/m);
  const currentCtfGames = content.match(/^hoqCtfGames:\s*(.+)$/m);
  const currentTdmRating = content.match(/^hoqTdmRating:\s*(.+)$/m);
  const currentTdmGames = content.match(/^hoqTdmGames:\s*(.+)$/m);

  const curCtfR = currentCtfRating ? parseFloat(currentCtfRating[1]) : null;
  const curCtfG = currentCtfGames ? parseInt(currentCtfGames[1], 10) : null;
  const curTdmR = currentTdmRating ? parseFloat(currentTdmRating[1]) : null;
  const curTdmG = currentTdmGames ? parseInt(currentTdmGames[1], 10) : null;

  const newCtfR = ctfData ? ctfData.rating : null;
  const newCtfG = ctfData ? ctfData.n : null;
  const newTdmR = tdmData ? tdmData.rating : null;
  const newTdmG = tdmData ? tdmData.n : null;

  // Check if anything changed
  const ctfRatingChanged = newCtfR !== null && newCtfR !== curCtfR;
  const ctfGamesChanged = newCtfG !== null && newCtfG !== curCtfG;
  const tdmRatingChanged = newTdmR !== null && newTdmR !== curTdmR;
  const tdmGamesChanged = newTdmG !== null && newTdmG !== curTdmG;

  if (!ctfRatingChanged && !ctfGamesChanged && !tdmRatingChanged && !tdmGamesChanged) {
    skippedCount++;
    continue;
  }

  // Build updated content
  let updated = content;

  // Remove existing hoq fields
  updated = updated.replace(/^hoqCtfRating:.*\n?/gm, '');
  updated = updated.replace(/^hoqCtfGames:.*\n?/gm, '');
  updated = updated.replace(/^hoqTdmRating:.*\n?/gm, '');
  updated = updated.replace(/^hoqTdmGames:.*\n?/gm, '');

  // Build new lines
  const newLines = [];
  if (newCtfR !== null) newLines.push(`hoqCtfRating: ${newCtfR}`);
  if (newCtfG !== null) newLines.push(`hoqCtfGames: ${newCtfG}`);
  if (newTdmR !== null) newLines.push(`hoqTdmRating: ${newTdmR}`);
  if (newTdmG !== null) newLines.push(`hoqTdmGames: ${newTdmG}`);

  if (newLines.length > 0) {
    // Insert after qllrCtfGames, or after ctfGames/tdmGames, or after category line
    const insertPatterns = [
      /^qllrCtfGames:.*$/m,
      /^qllrCtfRating:.*$/m,
      /^tdmGames:.*$/m,
      /^ctfGames:.*$/m,
      /^tdmRatingUpdated:.*$/m,
      /^ctfRatingUpdated:.*$/m,
      /^tdmRating:.*$/m,
      /^ctfRating:.*$/m,
      /^duelRatingUpdated:.*$/m,
      /^duelRating:.*$/m,
      /^dataSource:.*$/m,
      /^category:.*$/m,
    ];

    let inserted = false;
    for (const pattern of insertPatterns) {
      const match = updated.match(pattern);
      if (match) {
        const insertPos = match.index + match[0].length;
        updated = updated.slice(0, insertPos) + '\n' + newLines.join('\n') + updated.slice(insertPos);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      // Append before trailing newline
      updated = updated.trimEnd() + '\n' + newLines.join('\n') + '\n';
    }
  }

  // Write if changed
  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
    updatedCount++;

    const playerName = (content.match(/^name:\s*(.+)$/m) || [, file])[1].trim();
    const changeDetails = [];
    if (ctfRatingChanged) changeDetails.push(`ctfRating: ${curCtfR || '-'} → ${newCtfR}`);
    if (ctfGamesChanged) changeDetails.push(`ctfGames: ${curCtfG || '-'} → ${newCtfG}`);
    if (tdmRatingChanged) changeDetails.push(`tdmRating: ${curTdmR || '-'} → ${newTdmR}`);
    if (tdmGamesChanged) changeDetails.push(`tdmGames: ${curTdmG || '-'} → ${newTdmG}`);
    changes.push(`  ${playerName}: ${changeDetails.join(', ')}`);
  }
}

console.log('=== Results ===');
console.log(`Updated: ${updatedCount} players`);
console.log(`Skipped: ${skippedCount} players (no steamId or no data)`);
console.log('');
if (changes.length > 0) {
  console.log('Changes:');
  for (const c of changes) console.log(c);
}
