#!/usr/bin/env node
/**
 * Filter public/data/alltime-h2h.json (registry-wide, ~2 MB) to only pairs
 * where BOTH players have a published YAML profile — i.e. the only pairs
 * the compare page could actually display.
 *
 * Input:  public/data/alltime-h2h.json
 * Output: public/data/alltime-h2h-featured.json (committed, small)
 *
 * Run after build-alltime-h2h.cjs finishes. Cheap (no network). Re-run
 * whenever you publish new player profiles — no re-scrape needed.
 *
 * Usage: node scripts/filter-h2h-to-featured.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLAYERS_DIR = path.join(ROOT, 'src/content/players');
const FULL_H2H = path.join(ROOT, 'public/data/alltime-h2h.json');
const FEATURED_H2H = path.join(ROOT, 'public/data/alltime-h2h-featured.json');

// Collect steamIds from every YAML in src/content/players/ that is published
// (published: true OR published field absent — matches existing site behavior).
function getFeaturedSteamIds() {
  const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const ids = new Set();
  for (const file of files) {
    const content = fs.readFileSync(path.join(PLAYERS_DIR, file), 'utf8');
    const sidMatch = content.match(/^steamId:\s*["']?(\d{17})["']?\s*$/m);
    if (!sidMatch) continue;
    const publishedMatch = content.match(/^published:\s*(\S+)/m);
    // Unpublished players are excluded; missing field defaults to published
    if (publishedMatch && publishedMatch[1].trim().toLowerCase() === 'false') continue;
    ids.add(sidMatch[1]);
  }
  return ids;
}

function main() {
  if (!fs.existsSync(FULL_H2H)) {
    console.error(`Input not found: ${FULL_H2H}`);
    console.error(`Run scripts/build-alltime-h2h.cjs first.`);
    process.exit(1);
  }
  const full = JSON.parse(fs.readFileSync(FULL_H2H, 'utf8'));
  const featured = getFeaturedSteamIds();
  console.log(`Featured players (published YAMLs with steamId): ${featured.size}`);
  console.log(`Full h2h pairs: ${Object.keys(full).length}`);

  const filtered = {};
  for (const [key, val] of Object.entries(full)) {
    const [a, b] = key.split('|');
    if (featured.has(a) && featured.has(b)) filtered[key] = val;
  }

  fs.writeFileSync(FEATURED_H2H, JSON.stringify(filtered));
  const size = fs.statSync(FEATURED_H2H).size;
  console.log(`Featured pairs: ${Object.keys(filtered).length}`);
  console.log(`Output: ${FEATURED_H2H} (${(size / 1024).toFixed(1)} KB)`);
}

main();
