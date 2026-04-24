#!/usr/bin/env node
/**
 * Second-pass probe. Read-only. No writes.
 *
 * Answers three questions before we build the enricher:
 *   1. What is /players/<sid>.html (the small 10KB page)?
 *   2. What is the single UUID found on the big player dashboard, and
 *      what URL does it correspond to?
 *   3. What structure does a per-match page (/matches/<uuid>.html) have?
 *      I.e. are the rich sections (kill matrix, zones, per-weapon detail)
 *      present per-match or only aggregated on the player dashboard?
 *
 * Picks one sample UUID from the local ctf.jsonl archive.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE = 'http://77.90.2.137';
const SID = '76561197992882111';
const SLUG = 'cbd0a2e9';
const ROOT = path.join(__dirname, '..');
const ARCHIVE = path.join(ROOT, 'public/data/archive/ctf.jsonl');

const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;

function fetchPage(url) {
  return new Promise((resolve) => {
    const req = http.get(url, {
      headers: { 'User-Agent': 'quakesettings-probe/1.1', 'Accept': 'text/html' },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (err) => resolve({ status: 'ERR', body: '', err: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
  });
}

// Get the most recent match UUID that contains your steamId, from the local archive.
async function getRecentUuidForMe() {
  if (!fs.existsSync(ARCHIVE)) return null;
  const rl = readline.createInterface({ input: fs.createReadStream(ARCHIVE), crlfDelay: Infinity });
  let latest = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      const players = m.scoreboard || m.players || [];
      const iAmIn = JSON.stringify(players).includes(SID);
      if (!iAmIn) continue;
      if (!latest || (m.date && m.date > latest.date)) {
        latest = { uuid: m.uuid || m.id || m.match_id, date: m.date || '' };
      }
    } catch {}
  }
  return latest;
}

// Dump section-like headings so we understand page structure without pasting HTML.
function extractStructure(body, label) {
  const headings = [...body.matchAll(/<h[1-4][^>]*>([^<]+)<\/h[1-4]>/gi)]
    .map(m => m[1].trim())
    .filter(h => h.length > 0 && h.length < 80);
  const classLikeSections = [...body.matchAll(/class="(?:section|panel|card|stat-[a-z-]+|widget-[a-z-]+)[^"]*"[^>]*>\s*<h[1-4][^>]*>([^<]+)/gi)]
    .map(m => m[1].trim());
  const uuids = [...new Set(body.match(UUID_RE) || [])];
  const hrefs = [...body.matchAll(/href="([^"]+)"/gi)].map(m => m[1]);
  const matchHrefs = hrefs.filter(h => /matches\//i.test(h) && !/players\//i.test(h));
  const playerHrefs = hrefs.filter(h => /players\//i.test(h));

  // Heuristic: look for words that appear in the screenshot's section titles
  const sectionHints = [
    'Performance Summary', 'ML Match Layer', 'Position Heatmap', 'Weapon Statistics',
    'Stack Even', 'Damage Rate', 'Weapon Identity', 'Head-to-Head', 'Base Snapshot',
    'Flag Statistics', 'Play Rate', 'Match Timeline', 'Kill Feed', 'Kill Matrix',
    'Zones', 'Well Distance', 'Life & Span', 'Life and Span',
  ].filter(hint => new RegExp(hint.replace(/[-&]/g, '.?'), 'i').test(body));

  console.log(`\n=== ${label} ===`);
  console.log(`  size: ${body.length.toLocaleString()} bytes`);
  console.log(`  unique UUIDs on page: ${uuids.length}`);
  if (uuids.length > 0 && uuids.length <= 10) {
    uuids.forEach(u => console.log(`    - ${u}`));
  } else if (uuids.length > 10) {
    console.log(`    (first 5) ${uuids.slice(0, 5).join(', ')}`);
  }
  console.log(`  hrefs total: ${hrefs.length}   match-hrefs: ${matchHrefs.length}   player-hrefs: ${playerHrefs.length}`);
  if (matchHrefs.length) console.log(`    sample match href: ${matchHrefs[0]}`);
  if (playerHrefs.length) console.log(`    sample player href: ${playerHrefs[0]}`);
  console.log(`  <h1..h4> headings (first 15):`);
  headings.slice(0, 15).forEach(h => console.log(`    • ${h}`));
  console.log(`  section hints present: ${sectionHints.join(', ') || '(none)'}`);
}

async function main() {
  console.log(`Structural probe of ${BASE}`);
  console.log(`steamId: ${SID}\n`);

  // 1) Big player dashboard — re-fetch just to extract structure + the 1 UUID
  const big = await fetchPage(`${BASE}/matches/players/${SID}-${SLUG}.html`);
  console.log(`[${big.status}] /matches/players/${SID}-${SLUG}.html`);
  extractStructure(big.body, 'BIG PLAYER DASHBOARD');

  // 2) Small /players/<sid>.html page
  const small = await fetchPage(`${BASE}/players/${SID}.html`);
  console.log(`\n[${small.status}] /players/${SID}.html`);
  extractStructure(small.body, 'SMALL PLAYERS PAGE');

  // 3) Sample recent match from local archive
  const sample = await getRecentUuidForMe();
  if (!sample || !sample.uuid) {
    console.log(`\n(no sample UUID found in local archive at ${ARCHIVE})`);
    return;
  }
  console.log(`\n--- sample UUID from local archive: ${sample.uuid} (date=${sample.date}) ---`);

  // Try several match URL shapes, since we don't know if matches also have slugs
  const matchCandidates = [
    `/matches/${sample.uuid}.html`,
    `/matches/${sample.uuid}/`,
    `/match/${sample.uuid}.html`,
  ];
  for (const p of matchCandidates) {
    const r = await fetchPage(BASE + p);
    console.log(`\n[${r.status}] ${p}   size=${r.body.length}`);
    if (r.status === 200 && r.body.length > 500) {
      extractStructure(r.body, `MATCH PAGE (${p})`);
      break;
    }
  }

  console.log(`\n================================================================`);
  console.log(`Done. Paste the output back — it tells us whether we enrich from`);
  console.log(`per-match pages, from the aggregate player dashboard, or both.`);
}

main().catch(err => { console.error('Probe failed:', err.message); process.exit(1); });
