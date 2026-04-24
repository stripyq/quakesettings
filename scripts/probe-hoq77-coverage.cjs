#!/usr/bin/env node
/**
 * Probe 77.90.2.137/matches/<uuid>.html coverage against the UUIDs we
 * already enumerated from 88.214.20.58. Read-only. Writes nothing.
 *
 * Picks N UUIDs spread across the timeline (oldest, middle, newest) and
 * checks which return 200 on the new mirror. Reports hit rate + HTTP
 * codes so we can decide whether it's worth building an enricher.
 *
 * Usage:
 *   node scripts/probe-hoq77-coverage.cjs              # default sample=30 for ctf
 *   node scripts/probe-hoq77-coverage.cjs --gt=tdm     # check tdm
 *   node scripts/probe-hoq77-coverage.cjs --sample=60  # bigger sample
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = 'http://77.90.2.137';
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);

const GT = (() => {
  const a = args.find(x => x.startsWith('--gt='));
  return a ? a.split('=')[1] : 'ctf';
})();
const SAMPLE = (() => {
  const a = args.find(x => x.startsWith('--sample='));
  return a ? parseInt(a.split('=')[1], 10) : 30;
})();

const CHECKPOINT = path.join(ROOT, 'public/data/archive', `${GT}.checkpoint.json`);

function fetchHead(url) {
  return new Promise((resolve) => {
    const req = http.get(url, {
      headers: { 'User-Agent': 'quakesettings-probe/1.0' },
    }, (res) => {
      const len = res.headers['content-length'] || '?';
      res.resume(); // discard body
      resolve({ status: res.statusCode, len });
    });
    req.on('error', (err) => resolve({ status: 'ERR', len: 0, err: err.message }));
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 'TIMEOUT', len: 0 }); });
  });
}

async function main() {
  if (!fs.existsSync(CHECKPOINT)) {
    console.error(`Checkpoint not found: ${CHECKPOINT}`);
    console.error(`Run build-hoq-archive.cjs --gt=${GT} first (or use a gametype you've scraped).`);
    process.exit(1);
  }
  const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
  const uuids = cp.uuids || [];
  console.log(`Gametype:    ${GT}`);
  console.log(`Total UUIDs: ${uuids.length}`);
  console.log(`Sample size: ${SAMPLE}`);
  console.log(`Target:      ${BASE}/matches/<uuid>.html\n`);

  if (uuids.length === 0) {
    console.error(`No UUIDs in checkpoint.`);
    process.exit(1);
  }

  // Spread sample: first N/3 from oldest, N/3 from middle, N/3 from newest.
  // Enumeration order on HoQ is newest-first, so uuids[0] = most recent.
  const n = Math.min(SAMPLE, uuids.length);
  const third = Math.floor(n / 3);
  const picks = [];
  for (let i = 0; i < third; i++) picks.push({ bucket: 'NEW', uuid: uuids[i] });
  for (let i = 0; i < third; i++) {
    const mid = Math.floor(uuids.length / 2) + i - Math.floor(third / 2);
    picks.push({ bucket: 'MID', uuid: uuids[mid] });
  }
  for (let i = 0; i < n - 2 * third; i++) {
    picks.push({ bucket: 'OLD', uuid: uuids[uuids.length - 1 - i] });
  }

  const buckets = { NEW: { hit: 0, miss: 0 }, MID: { hit: 0, miss: 0 }, OLD: { hit: 0, miss: 0 } };
  const codes = {};

  for (const { bucket, uuid } of picks) {
    const url = `${BASE}/matches/${uuid}.html`;
    const r = await fetchHead(url);
    const code = String(r.status);
    codes[code] = (codes[code] || 0) + 1;
    const hit = r.status === 200;
    buckets[bucket][hit ? 'hit' : 'miss']++;
    const flag = hit ? '✓' : '✗';
    console.log(`  [${bucket}] ${flag} ${code}  ${uuid}  (${r.len}b)`);
    await new Promise(r => setTimeout(r, 150)); // gentle
  }

  console.log('\n================================================================');
  console.log('Coverage by age bucket:');
  for (const b of ['NEW', 'MID', 'OLD']) {
    const { hit, miss } = buckets[b];
    const total = hit + miss;
    if (total === 0) continue;
    const pct = ((hit / total) * 100).toFixed(0);
    console.log(`  ${b}:  ${hit}/${total}  (${pct}%)`);
  }
  console.log('\nHTTP code distribution:');
  for (const [code, count] of Object.entries(codes).sort()) {
    console.log(`  ${code}: ${count}`);
  }
  const totalHit = buckets.NEW.hit + buckets.MID.hit + buckets.OLD.hit;
  const overall = ((totalHit / picks.length) * 100).toFixed(0);
  console.log(`\nOverall hit rate: ${totalHit}/${picks.length}  (${overall}%)`);
  console.log(`\nVerdict:`);
  if (overall >= 80) {
    console.log(`  ✓ High coverage — worth building the enricher.`);
  } else if (overall >= 40) {
    console.log(`  ~ Partial coverage — check if only recent matches are mirrored.`);
    console.log(`    NEW vs OLD bucket rates tell you if it's a rolling window.`);
  } else {
    console.log(`  ✗ Low coverage — mirror has a different/smaller UUID set.`);
    console.log(`    Enrichment not viable without finding their API.`);
  }
}

main().catch(err => { console.error('Probe failed:', err.message); process.exit(1); });
