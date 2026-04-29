#!/usr/bin/env node
/**
 * Sync HoQ rating/game fields to display fields in player YAML files.
 *
 * Copies:
 *   hoqCtfRating  → ctfRating   (+ ctfRatingUpdated timestamp)
 *   hoqCtfGames   → ctfGames
 *   hoqTdmRating  → tdmRating   (+ tdmRatingUpdated timestamp)
 *   hoqTdmGames   → tdmGames
 *
 * Only writes files where display values actually changed.
 * Does NOT touch accuracy fields (accuracy_rl, accuracy_rg, accuracy_lg).
 *
 * Usage: node scripts/sync-hoq-to-display.cjs
 */

const fs = require('fs');
const path = require('path');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const TODAY = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

// Map of hoq source field → { display field, updated field }
const FIELD_MAP = [
  { src: 'hoqCtfRating', dst: 'ctfRating', updated: 'ctfRatingUpdated' },
  { src: 'hoqCtfGames',  dst: 'ctfGames',  updated: null },
  { src: 'hoqTdmRating', dst: 'tdmRating', updated: 'tdmRatingUpdated' },
  { src: 'hoqTdmGames',  dst: 'tdmGames',  updated: null },
];

function extractField(content, field) {
  const re = new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, 'm');
  const m = content.match(re);
  return m ? m[1] : null;
}

function setField(content, field, value) {
  const re = new RegExp(`^${field}:.*$`, 'm');
  const line = `${field}: ${value}`;
  if (re.test(content)) {
    return content.replace(re, line);
  }
  // Insert after the corresponding hoq field, or after dataSource/category
  const hoqField = FIELD_MAP.find(f => f.dst === field || f.updated === field);
  const anchorField = hoqField ? hoqField.src : null;
  const anchorRe = anchorField
    ? new RegExp(`^${anchorField}:.*$`, 'm')
    : /^(dataSource:.*|category:.*)$/m;
  const anchorMatch = content.match(anchorRe);
  if (anchorMatch) {
    const pos = anchorMatch.index + anchorMatch[0].length;
    return content.slice(0, pos) + '\n' + line + content.slice(pos);
  }
  return content.trimEnd() + '\n' + line + '\n';
}

function main() {
  console.log('=== Sync HoQ → Display Fields ===\n');

  const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  let updatedCount = 0;

  for (const file of files) {
    const filePath = path.join(PLAYERS_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const changes = [];

    for (const { src, dst, updated } of FIELD_MAP) {
      let srcVal = extractField(content, src);
      if (srcVal == null) continue;

      // Round rating fields to 2 decimals — HoQ's API now returns full
      // float precision (e.g. 34.480995178222656). Without this, every
      // sync run produces a noisy diff and YAMLs get ugly long values.
      // Games fields stay as integers untouched.
      if (dst.endsWith('Rating')) {
        const num = parseFloat(srcVal);
        if (!Number.isNaN(num)) {
          srcVal = (Math.round(num * 100) / 100).toString();
        }
      }

      const dstVal = extractField(content, dst);
      if (dstVal === srcVal) continue;

      content = setField(content, dst, srcVal);
      changes.push(`${dst}: ${dstVal || '-'} → ${srcVal}`);

      if (updated) {
        content = setField(content, updated, `"${TODAY}"`);
      }
    }

    if (changes.length > 0) {
      fs.writeFileSync(filePath, content);
      updatedCount++;
      const name = extractField(content, 'name') || file.replace('.yaml', '');
      console.log(`  ${name}: ${changes.join(', ')}`);
    }
  }

  console.log(`\n--- Display Sync Summary ---`);
  console.log(`Updated: ${updatedCount} players`);
  console.log(`Scanned: ${files.length} files`);
}

main();
