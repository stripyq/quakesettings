#!/usr/bin/env node

// Import HoQ stats from hoq-stats-data.json into player YAML files.
// Usage: node scripts/import-hoq-stats.js

const fs = require('fs');
const path = require('path');

const STATS_FILE = path.join(__dirname, 'hoq-stats-data.json');
const PLAYERS_DIR = path.join(__dirname, '..', 'src', 'content', 'players');

const HOQ_FIELDS = [
  'favorite_map',
  'favorite_gametype',
  'favorite_weapon',
  'accuracy_rl',
  'accuracy_lg',
  'accuracy_rg',
];

const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));

// Build a reverse lookup: steamId -> stats
const steamIdToStats = new Map(Object.entries(stats));

const yamlFiles = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));

let updated = 0;
let skipped = 0;

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
  const playerStats = steamIdToStats.get(steamId);
  if (!playerStats) {
    skipped++;
    continue;
  }

  // Remove existing HoQ fields (for idempotency)
  let lines = content.split('\n');
  lines = lines.filter(line => {
    const trimmed = line.replace(/^\s+/, '');
    return !HOQ_FIELDS.some(field => trimmed.startsWith(field + ':'));
  });

  // Remove trailing blank lines, then ensure file ends with newline
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  // Append HoQ stats
  const newFields = [];
  for (const field of HOQ_FIELDS) {
    if (field in playerStats) {
      const value = playerStats[field];
      if (typeof value === 'string') {
        // Quote strings that contain YAML-significant characters
        if (/[:#{}[\],&*?|>!%@`'"]/.test(value) || value.includes('\n')) {
          newFields.push(`${field}: "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
        } else {
          newFields.push(`${field}: ${value}`);
        }
      } else {
        newFields.push(`${field}: ${value}`);
      }
    }
  }

  lines.push(...newFields);
  lines.push(''); // trailing newline

  fs.writeFileSync(filePath, lines.join('\n'));
  updated++;
  console.log(`Updated: ${file} (${steamId})`);
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
