#!/usr/bin/env node
/**
 * Fetch all CTF matches from the HoQ Season Tracker API and aggregate into
 * monthly activity buckets.
 *
 * Output: public/data/activity-ctf.json
 *   [ { "month": "2024-05", "games": 47 }, ... ]
 *
 * Usage:
 *   node scripts/fetch-activity-data.cjs
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://77.90.2.137:8004/api';
const OUTPUT_PATH = path.join(__dirname, '../public/data/activity-ctf.json');
const PAGE_SIZE = 100;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllMatches() {
  const allMatches = [];
  let offset = 0;

  console.log('Fetching CTF matches from API...');

  while (true) {
    const url = `${API_BASE}/matches?mode=ctf&limit=${PAGE_SIZE}&offset=${offset}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`API returned ${res.status} at offset=${offset}, stopping.`);
        break;
      }
      const data = await res.json();
      const matches = Array.isArray(data) ? data : (data.matches || data.data || []);

      if (matches.length === 0) break;

      allMatches.push(...matches);
      offset += matches.length;

      process.stdout.write(`  Fetched ${allMatches.length} matches so far...\r`);

      if (matches.length < PAGE_SIZE) break;
      await sleep(100);
    } catch (err) {
      console.warn(`\nFetch error at offset=${offset}: ${err.message}`);
      break;
    }
  }

  console.log(`\n  Total matches fetched: ${allMatches.length}`);
  return allMatches;
}

function aggregateByMonth(matches) {
  const buckets = {};

  for (const match of matches) {
    const ts = match.started_at ?? match.timestamp ?? match.date;
    if (ts == null) continue;

    // Handle Unix timestamp (seconds) or milliseconds
    const ms = ts > 1e12 ? ts : ts * 1000;
    const d = new Date(ms);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    buckets[key] = (buckets[key] || 0) + 1;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, games]) => ({ month, games }));
}

async function main() {
  console.log('=== Fetch CTF Activity Data ===\n');

  const matches = await fetchAllMatches();

  if (matches.length === 0) {
    console.error('No matches retrieved. Check API availability.');
    process.exit(1);
  }

  // Log a sample match to help debug field names
  console.log('\nSample match object:');
  console.log(JSON.stringify(matches[0], null, 2));

  const activity = aggregateByMonth(matches);

  if (activity.length === 0) {
    console.error('No timestamp data found in matches. Check field names.');
    console.log('Available fields:', Object.keys(matches[0]).join(', '));
    process.exit(1);
  }

  console.log(`\nMonthly breakdown (${activity.length} months):`);
  for (const { month, games } of activity) {
    console.log(`  ${month}: ${games} games`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(activity, null, 2));
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
