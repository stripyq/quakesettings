#!/usr/bin/env node
/**
 * Probe 77.90.2.137 for the personal player page. Read-only. No writes.
 *
 * If the player page exists and lists match UUIDs, we have a direct
 * enumeration path to just your games — no need to scrape the whole
 * match archive on the new mirror.
 *
 * Default: checks stripy's steamId. Pass --sid= to check another player.
 *
 * Usage:
 *   node scripts/probe-hoq77-player.cjs
 *   node scripts/probe-hoq77-player.cjs --sid=76561197992882111
 */

const http = require('http');

const BASE = 'http://77.90.2.137';
const SID = (() => {
  const a = process.argv.find(x => x.startsWith('--sid='));
  return a ? a.split('=')[1] : '76561197992882111'; // stripyツ
})();

// The earlier match HTML showed this slug suffix pattern
const SLUG_SUFFIX = 'cbd0a2e9';

const CANDIDATES = [
  `/matches/players/${SID}-${SLUG_SUFFIX}.html`,
  `/matches/players/${SID}.html`,
  `/players/${SID}.html`,
  `/player/${SID}.html`,
  `/matches/players/${SID}/`,
];

const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;

function fetchPage(url) {
  return new Promise((resolve) => {
    const req = http.get(url, {
      headers: { 'User-Agent': 'quakesettings-probe/1.0', 'Accept': 'text/html' },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (err) => resolve({ status: 'ERR', body: '', err: err.message }));
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
  });
}

async function main() {
  console.log(`Probing player pages on ${BASE}`);
  console.log(`steamId: ${SID}\n`);

  let firstHit = null;

  for (const path of CANDIDATES) {
    const url = BASE + path;
    const r = await fetchPage(url);
    const size = r.body.length;
    const uuids = [...new Set(r.body.match(UUID_RE) || [])];
    const matchLinks = [...r.body.matchAll(/href="([^"]*\/?matches\/[a-f0-9-]+\.html[^"]*)"/gi)].map(m => m[1]);

    console.log(`[${r.status}] ${path}`);
    console.log(`   size=${size}   uuids=${uuids.length}   match-links=${matchLinks.length}`);

    if (r.status === 200 && matchLinks.length > 0 && !firstHit) {
      firstHit = { path, body: r.body, uuids, matchLinks };
    }
    if (r.status === 200 && matchLinks.length > 0) {
      console.log(`   first 3 match links:`);
      matchLinks.slice(0, 3).forEach(l => console.log(`      ${l}`));
    }
  }

  console.log('\n================================================================');
  if (firstHit) {
    console.log(`✓ PLAYER PAGE FOUND: ${firstHit.path}`);
    console.log(`  ${firstHit.matchLinks.length} match links on the page`);
    console.log(`  ${firstHit.uuids.length} unique UUIDs mentioned`);
    console.log(`\n  If that match count roughly matches how many recent games you've`);
    console.log(`  played, we can enumerate your games directly from this page.`);
    console.log(`  Paste this output back and we'll build the enricher.`);
  } else {
    console.log(`✗ No player page with match links found.`);
    console.log(`  Possible causes: slug suffix differs from 'cbd0a2e9', or`);
    console.log(`  player pages require the SPA's API to populate. Re-run with`);
    console.log(`  --sid=<your-actual-sid> if different, or share the URL shape`);
    console.log(`  you saw in DevTools.`);
  }
}

main().catch(err => { console.error('Probe failed:', err.message); process.exit(1); });
