#!/usr/bin/env node

// Sync HoQ game counts from CSV files into player YAML files.
// This makes YAML the single source of truth for game counts.
//
// Reads: public/data/hoq_ctf.csv, public/data/hoq_tdm.csv
// Writes: src/content/players/*.yaml (ctfGames, tdmGames fields)
// Note: duelGames stays manual (no HoQ duel CSV exists)
//
// Usage: node scripts/sync-hoq-games.cjs

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const PLAYERS_DIR = path.join(__dirname, '..', 'src', 'content', 'players');

const GAME_FIELDS = ['ctfGames', 'tdmGames'];

// Parse a simple CSV file, returning rows as objects keyed by header names
function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim()] = (values[j] || '').trim();
    }
    rows.push(row);
  }
  return rows;
}

// Build a Map of steamId -> { ctfGames, tdmGames } from HoQ CSVs
function readHoqGameCounts() {
  const counts = new Map();

  const csvFiles = [
    { path: path.join(DATA_DIR, 'hoq_ctf.csv'), field: 'ctfGames' },
    { path: path.join(DATA_DIR, 'hoq_tdm.csv'), field: 'tdmGames' },
  ];

  for (const { path: csvPath, field } of csvFiles) {
    if (!fs.existsSync(csvPath)) {
      console.warn(`Warning: ${csvPath} not found, skipping`);
      continue;
    }

    const rows = parseCsv(csvPath);
    for (const row of rows) {
      const steamId = String(row._id || '').trim();
      const games = parseInt(row.n);
      if (!steamId || isNaN(games)) continue;

      if (!counts.has(steamId)) {
        counts.set(steamId, {});
      }
      counts.get(steamId)[field] = games;
    }
  }

  return counts;
}

// Main
const hoqCounts = readHoqGameCounts();
console.log(`Loaded HoQ game counts for ${hoqCounts.size} Steam IDs`);

const yamlFiles = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));

let updated = 0;
let skipped = 0;
let unchanged = 0;

for (const file of yamlFiles) {
  const filePath = path.join(PLAYERS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract steamId from YAML (handles quoted and unquoted values)
  const steamIdMatch = content.match(/^steamId:\s*['"]?(\d+)['"]?\s*$/m);
  if (!steamIdMatch) {
    skipped++;
    continue;
  }

  const steamId = steamIdMatch[1];
  const gameCounts = hoqCounts.get(steamId);
  if (!gameCounts) {
    skipped++;
    continue;
  }

  // Check if values already match (avoid unnecessary writes)
  let needsUpdate = false;
  for (const field of GAME_FIELDS) {
    if (!(field in gameCounts)) continue;
    const regex = new RegExp(`^${field}:\\s*(\\d+)\\s*$`, 'm');
    const match = content.match(regex);
    if (!match || parseInt(match[1]) !== gameCounts[field]) {
      needsUpdate = true;
      break;
    }
  }

  if (!needsUpdate) {
    unchanged++;
    continue;
  }

  // Remove existing game count fields (for idempotency)
  let lines = content.split('\n');
  lines = lines.filter(line => {
    const trimmed = line.replace(/^\s+/, '');
    return !GAME_FIELDS.some(field => trimmed.startsWith(field + ':'));
  });

  // Remove trailing blank lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  // Find insertion point: before duelGames if it exists, or before accuracy/favorite fields
  let insertIndex = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].replace(/^\s+/, '');
    if (trimmed.startsWith('duelGames:')) {
      insertIndex = i;
      break;
    }
    if (trimmed.startsWith('favorite_') || trimmed.startsWith('accuracy_')) {
      insertIndex = i;
      break;
    }
  }

  // Build new fields to insert
  const newFields = [];
  for (const field of GAME_FIELDS) {
    if (field in gameCounts) {
      newFields.push(`${field}: ${gameCounts[field]}`);
    }
  }

  // Insert the fields
  lines.splice(insertIndex, 0, ...newFields);
  lines.push(''); // trailing newline

  fs.writeFileSync(filePath, lines.join('\n'));
  updated++;

  const parts = [];
  if (gameCounts.ctfGames != null) parts.push(`ctf=${gameCounts.ctfGames}`);
  if (gameCounts.tdmGames != null) parts.push(`tdm=${gameCounts.tdmGames}`);
  console.log(`Updated: ${file} (${parts.join(', ')})`);
}

console.log(`\nDone. Updated: ${updated}, Unchanged: ${unchanged}, Skipped (no steamId/HoQ match): ${skipped}`);
