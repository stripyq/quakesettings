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
  let total = Infinity;

  console.log('Fetching CTF matches from API...');

  while (offset < total) {
    const url = `${API_BASE}/matches?mode=ctf&limit=${PAGE_SIZE}&skip=${offset}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`API returned ${res.status} at skip=${offset}, stopping.`);
        break;
      }
      const data = await res.json();

      // Use data.total to know when we've fetched everything
      if (data.total != null) total = data.total;

      const matches = Array.isArray(data) ? data : (data.matches || data.data || []);

      if (matches.length === 0) break;

      allMatches.push(...matches);
      offset += matches.length;

      process.stdout.write(`  Fetched ${allMatches.length}/${total === Infinity ? '?' : total} matches...\r`);
      await sleep(100);
    } catch (err) {
      console.warn(`\nFetch error at skip=${offset}: ${err.message}`);
      break;
    }
  }

  console.log(`\n  Total matches fetched: ${allMatches.length}`);
  return allMatches;
}

/**
 * Get the Monday of the ISO week containing a given date, as YYYY-MM-DD.
 */
function getWeekMonday(d) {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

function aggregateByWeek(matches) {
  const buckets = {};

  for (const match of matches) {
    const ts = match.started_at ?? match.timestamp ?? match.date;
    if (ts == null) continue;

    // Handle Unix timestamp (seconds) or milliseconds
    const ms = ts > 1e12 ? ts : ts * 1000;
    const d = new Date(ms);
    const key = getWeekMonday(d);

    buckets[key] = (buckets[key] || 0) + 1;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, games]) => ({ week, games }));
}

/**
 * Fill missing weeks between the earliest and latest entry with games: 0.
 */
function fillWeekGaps(activity) {
  if (activity.length < 2) return activity;
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  const existing = new Map(activity.map(a => [a.week, a.games]));
  const start = new Date(activity[0].week).getTime();
  const end = new Date(activity[activity.length - 1].week).getTime();
  const filled = [];
  for (let t = start; t <= end; t += WEEK_MS) {
    const key = new Date(t).toISOString().slice(0, 10);
    filled.push({ week: key, games: existing.get(key) || 0 });
  }
  return filled;
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

  const sparse = aggregateByWeek(matches);

  if (sparse.length === 0) {
    console.error('No timestamp data found in matches. Check field names.');
    console.log('Available fields:', Object.keys(matches[0]).join(', '));
    process.exit(1);
  }

  const activity = fillWeekGaps(sparse);

  console.log(`\nWeekly breakdown (${activity.length} weeks, ${sparse.length} with games):`);
  for (const { week, games } of activity) {
    if (games > 0) console.log(`  ${week}: ${games} games`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(activity, null, 2));
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
