#!/usr/bin/env node
/**
 * Probe the new HoQ mirror at 77.90.2.137 to confirm the match-listing page
 * is scrapable and figure out its pagination pattern.
 *
 * Read-only. Fetches a handful of likely listing URLs, counts match UUIDs
 * on each, dumps a short report. Nothing is saved; safe to re-run.
 *
 * Usage:
 *   node scripts/probe-hoq77-listing.cjs            # fetches all candidates
 *   node scripts/probe-hoq77-listing.cjs --dump     # also dumps first 600 chars of each body
 *
 * If any candidate returns UUIDs, we know the mirror is scrapable and have
 * our entry point for build-hoq77-archive.cjs.
 */

const http = require('http');

const BASE = 'http://77.90.2.137';
const DUMP = process.argv.includes('--dump');

// Candidate URLs. We don't know the routing pattern yet, so cast wide.
const CANDIDATES = [
  '/matches/',
  '/matches/index.html',
  '/matches/1/',
  '/matches/2/',
  '/matches/ctf/',
  '/matches/ctf/1/',
  '/matches/ctf.html',
  '/matches/?page=1',
  '/matches/?page=2',
  '/',
  '/index.html',
];

const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;

function fetchPage(url) {
  return new Promise((resolve) => {
    const req = http.get(url, {
      headers: {
        'User-Agent': 'quakesettings-probe/1.0',
        'Accept': 'text/html',
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', (err) => resolve({ status: 'ERR', body: '', err: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
  });
}

function findPaginationHints(body) {
  const hints = new Set();
  // Look for explicit pagination patterns
  const patterns = [
    /href="([^"]*\/matches\/\d+\/?[^"]*)"/gi,         // /matches/2/
    /href="([^"]*\?page=\d+)"/gi,                      // ?page=2
    /href="([^"]*page=\d+)"/gi,                        // page=2 anywhere
    /href="([^"]*\/matches\/ctf\/\d+\/?[^"]*)"/gi,     // /matches/ctf/1/
    /class="[^"]*pagin[^"]*"/gi,                       // any pagination container
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(body)) !== null) {
      hints.add(m[1] || m[0]);
      if (hints.size > 10) break;
    }
  }
  return [...hints];
}

function findNextPageLink(body) {
  // Common "next" patterns
  const nextRe = /href="([^"]+)"[^>]*>\s*(?:Next|next|»|&raquo;|older)/i;
  const m = body.match(nextRe);
  return m ? m[1] : null;
}

async function main() {
  console.log(`Probing ${BASE}\n`);
  let firstHit = null;

  for (const path of CANDIDATES) {
    const url = BASE + path;
    const r = await fetchPage(url);
    const len = r.body ? r.body.length : 0;
    const uuids = r.body ? [...new Set((r.body.match(UUID_RE) || []))] : [];
    const matchHtmlLinks = r.body
      ? [...r.body.matchAll(/href="([^"]*\/matches\/[a-f0-9-]+\.html)"/gi)].map(m => m[1])
      : [];

    console.log(`[${r.status}] ${path}`);
    console.log(`   size=${len}   uuids=${uuids.length}   match-html-links=${matchHtmlLinks.length}`);

    if (matchHtmlLinks.length > 0) {
      console.log(`   first match link: ${matchHtmlLinks[0]}`);
      if (!firstHit) firstHit = { path, body: r.body, links: matchHtmlLinks, uuids };
    }

    if (r.status === 200 && r.body) {
      const nextLink = findNextPageLink(r.body);
      if (nextLink) console.log(`   next-link hint: ${nextLink}`);
      const hints = findPaginationHints(r.body);
      if (hints.length > 0) {
        console.log(`   pagination hints (${hints.length}):`);
        hints.slice(0, 5).forEach(h => console.log(`      ${h}`));
      }
    }

    if (DUMP && r.status === 200 && r.body) {
      console.log(`   --- body preview (first 600 chars) ---`);
      console.log('   ' + r.body.slice(0, 600).replace(/\n/g, '\n   '));
      console.log(`   --- end preview ---`);
    }

    console.log('');
  }

  console.log('================================================================');
  if (firstHit) {
    console.log(`✓ SCRAPABLE. Entry point: ${firstHit.path}`);
    console.log(`  ${firstHit.links.length} match links on that single page`);
    console.log(`  Sample UUIDs: ${firstHit.uuids.slice(0, 3).join(', ')}`);
    console.log(``);
    console.log(`Next step: paste the output of this script back to me and I'll`);
    console.log(`spec the full build-hoq77-archive.cjs against this entry point.`);
  } else {
    console.log(`✗ NO MATCH LINKS FOUND on any candidate URL.`);
    console.log(`  Mirror may use a different routing pattern or require auth.`);
    console.log(`  Re-run with --dump to see what the listing pages actually contain:`);
    console.log(`    node scripts/probe-hoq77-listing.cjs --dump`);
  }
}

main().catch(err => {
  console.error('Probe failed:', err.message);
  process.exit(1);
});
