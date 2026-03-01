#!/usr/bin/env node
/**
 * Scrape CTF match history from the HoQ all-time tracker (QLLR) at
 * http://88.214.20.58/matches/ctf/ and aggregate into monthly buckets.
 *
 * Pages: /matches/ctf/ (page 0), /matches/ctf/1/, /matches/ctf/2/, ...
 * Each page has a table with <span class="abstime" data-epoch="..."> on date cells.
 *
 * Merges with existing public/data/activity-ctf.json (from the season tracker API)
 * so both data sources are combined. Deduplicates by month key.
 *
 * Output: public/data/activity-ctf.json
 *   [ { "month": "2024-05", "games": 47 }, ... ]
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
 * Aggregate epoch timestamps into monthly buckets.
 */
function aggregateByMonth(epochs) {
  const buckets = {};

  for (const epoch of epochs) {
    const d = new Date(epoch * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }

  return buckets;
}

/**
 * Load existing activity data and return as a month→games map.
 */
function loadExisting() {
  const buckets = {};
  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    for (const { month, games } of data) {
      buckets[month] = games;
    }
  } catch {
    // No existing file or invalid
  }
  return buckets;
}

/**
 * Merge two month→games maps. For overlapping months, take the larger value
 * (since both sources may have partial data for a given month).
 */
function mergeBuckets(a, b) {
  const merged = { ...a };
  for (const [month, games] of Object.entries(b)) {
    merged[month] = Math.max(merged[month] || 0, games);
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

  const scrapedBuckets = aggregateByMonth(epochs);
  const existingBuckets = loadExisting();
  const merged = mergeBuckets(existingBuckets, scrapedBuckets);

  const activity = Object.entries(merged)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, games]) => ({ month, games }));

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
