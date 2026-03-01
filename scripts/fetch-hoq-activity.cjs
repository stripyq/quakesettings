#!/usr/bin/env node
/**
 * Scrape CTF match history from the HoQ all-time tracker (QLLR) at
 * http://88.214.20.58/matches/ctf/ and aggregate into weekly buckets.
 *
 * Pages: /matches/ctf/ (page 0), /matches/ctf/1/, /matches/ctf/2/, ...
 * Each page has a table with <span class="abstime" data-epoch="..."> on date cells.
 *
 * Merges with existing public/data/activity-ctf.json (from the season tracker API)
 * so both data sources are combined. Deduplicates by week key.
 *
 * Output: public/data/activity-ctf.json
 *   [ { "week": "2024-05-06", "games": 12 }, ... ]
 *   (keys are the Monday of each ISO week, YYYY-MM-DD)
 *
 * Usage:
 *   node scripts/fetch-hoq-activity.cjs
 *   node scripts/fetch-hoq-activity.cjs --max-pages=100   # limit pages fetched
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const HOQ_BASE = 'http://88.214.20.58';
const OUTPUT_PATH = path.join(__dirname, '../public/data/activity-ctf.json');
const DELAY_MS = 200;
const CONCURRENT = 5;

// Parse CLI args
const maxPagesArg = process.argv.find(a => a.startsWith('--max-pages='));
const MAX_PAGES = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : Infinity;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a URL using Node's http module (no external deps).
 * Returns the response body as a string.
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    }, (res) => {
      if (res.statusCode === 404) {
        resolve(null);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * Extract all data-epoch values from an HTML page.
 * Matches: <span class="abstime" data-epoch="1234567890">
 */
function extractEpochs(html) {
  const epochs = [];
  const re = /data-epoch="(\d+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    epochs.push(parseInt(m[1], 10));
  }
  return epochs;
}

/**
 * Fetch a single page and return its epochs.
 * Page 0 = /matches/ctf/, page N = /matches/ctf/N/
 */
async function fetchMatchPage(page) {
  const url = page === 0
    ? `${HOQ_BASE}/matches/ctf/`
    : `${HOQ_BASE}/matches/ctf/${page}/`;

  const html = await fetchPage(url);
  if (!html) return null;

  return extractEpochs(html);
}

/**
 * Fetch all match pages, collecting every epoch timestamp.
 */
async function fetchAllEpochs() {
  const allEpochs = [];
  let page = 0;
  let emptyStreak = 0;

  console.log('Scraping CTF match history from HoQ (88.214.20.58)...');

  while (page < MAX_PAGES) {
    // Fetch a batch of pages concurrently
    const batch = [];
    for (let i = 0; i < CONCURRENT && page + i < MAX_PAGES; i++) {
      batch.push(page + i);
    }

    const results = await Promise.all(
      batch.map(async (p) => {
        try {
          return { page: p, epochs: await fetchMatchPage(p) };
        } catch (err) {
          console.warn(`  Page ${p}: ${err.message}`);
          return { page: p, epochs: null };
        }
      })
    );

    let batchHadData = false;
    for (const { page: p, epochs } of results) {
      if (epochs && epochs.length > 0) {
        allEpochs.push(...epochs);
        batchHadData = true;
        emptyStreak = 0;
      } else if (epochs !== null) {
        // Page loaded but had no matches
        emptyStreak++;
      } else {
        // 404 or error
        emptyStreak++;
      }
    }

    page += batch.length;
    process.stdout.write(`  Scraped ${page} pages, ${allEpochs.length} matches so far...\r`);

    if (!batchHadData && emptyStreak >= CONCURRENT) {
      // Multiple consecutive empty/404 pages — we've reached the end
      break;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n  Total: ${allEpochs.length} matches from ${page} pages.`);
  return allEpochs;
}

/**
 * Get the Monday of the ISO week containing a given date, as YYYY-MM-DD.
 */
function getWeekMonday(d) {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday = 1, Sunday shifts back 6
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

/**
 * Aggregate epoch timestamps into weekly buckets (keyed by Monday date).
 */
function aggregateByWeek(epochs) {
  const buckets = {};

  for (const epoch of epochs) {
    const d = new Date(epoch * 1000);
    const key = getWeekMonday(d);
    buckets[key] = (buckets[key] || 0) + 1;
  }

  return buckets;
}

/**
 * Load existing activity data and return as a week→games map.
 */
function loadExisting() {
  const buckets = {};
  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    for (const entry of data) {
      const key = entry.week || entry.month; // support legacy monthly format
      if (key) buckets[key] = entry.games;
    }
  } catch {
    // No existing file or invalid
  }
  return buckets;
}

/**
 * Merge two week→games maps. For overlapping weeks, take the larger value
 * (since both sources may have partial data for a given week).
 */
function mergeBuckets(a, b) {
  const merged = { ...a };
  for (const [week, games] of Object.entries(b)) {
    merged[week] = Math.max(merged[week] || 0, games);
  }
  return merged;
}

async function main() {
  console.log('=== Fetch HoQ Activity Data (QLLR Scraper) ===\n');

  const epochs = await fetchAllEpochs();

  if (epochs.length === 0) {
    console.error('No matches found. Check that http://88.214.20.58 is reachable.');
    process.exit(1);
  }

  const scrapedBuckets = aggregateByWeek(epochs);
  const existingBuckets = loadExisting();
  const merged = mergeBuckets(existingBuckets, scrapedBuckets);

  // Filter out any legacy monthly keys (YYYY-MM format, 7 chars) — only keep
  // weekly keys (YYYY-MM-DD format, 10 chars) so the output is clean.
  const activity = Object.entries(merged)
    .filter(([key]) => key.length === 10)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, games]) => ({ week, games }));

  console.log(`\nWeekly breakdown (${activity.length} weeks):`);
  for (const { week, games } of activity) {
    console.log(`  ${week}: ${games} games`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(activity, null, 2));
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
