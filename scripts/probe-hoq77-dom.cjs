#!/usr/bin/env node
/**
 * Third probe — DOM/data shape. Read-only. No writes.
 *
 * Goal: decide whether to parse JSON (preferred) or HTML (fallback),
 * and learn the wrapper structure around named sections.
 *
 * Checks:
 *   1. Embedded JSON: <script type="application/json">, window.* = {...},
 *      large inline arrays/objects, data-* JSON attributes.
 *   2. The match_player_v2.html?match=...&archive=1&summary=1 deep-link —
 *      does it return JSON or HTML?
 *   3. HTML samples (120 chars before + 400 chars after) around section
 *      anchor words on both the player dashboard and a sample match page.
 *
 * Targets:
 *   - Player dashboard: /matches/players/<sid>-cbd0a2e9.html  (1.4MB)
 *   - Match page:       /matches/<uuid>.html                  (sample from archive)
 *   - Deep link:        /matches/match_player_v2.html?match=<uuid8>&archive=1&summary=1
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

function fetchPage(url) {
  return new Promise((resolve) => {
    const req = http.get(url, {
      headers: { 'User-Agent': 'quakesettings-probe/1.2', 'Accept': 'text/html, application/json' },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({
        status: res.statusCode,
        body: data,
        ctype: res.headers['content-type'] || '',
      }));
    });
    req.on('error', (err) => resolve({ status: 'ERR', body: '', err: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
  });
}

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
      if (!latest || (m.date && m.date > (latest.date || ''))) {
        latest = { uuid: m.uuid || m.id || m.match_id, date: m.date || '' };
      }
    } catch {}
  }
  return latest;
}

function analyzeJson(body, label) {
  // 1) <script type="application/json"> blocks
  const jsonScripts = [...body.matchAll(/<script[^>]+type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => ({ size: m[1].length, preview: m[1].slice(0, 200).replace(/\s+/g, ' ') }));

  // 2) window.* = { or window.* = [ assignments
  const windowAssigns = [...body.matchAll(/window\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\{|\[)/gi)]
    .map(m => m[1]);

  // 3) inline <script>...</script> that contains big JSON-ish blocks
  const inlineScripts = [...body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/type\s*=\s*["']application\/json["']/i.test(m[0]))
    .map(m => m[1])
    .filter(s => s.length > 2000);
  const inlineWithJson = inlineScripts
    .map((s, i) => {
      const keys = [...s.matchAll(/(?:var|let|const)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*[\{\[]/g)].map(m => m[1]);
      const braceChars = (s.match(/[{}[\]]/g) || []).length;
      return { idx: i, size: s.length, braceChars, topVars: keys.slice(0, 8) };
    })
    .filter(x => x.braceChars > 200);

  // 4) data-* attributes with JSON-ish values
  const dataAttrs = [...body.matchAll(/\bdata-([a-z][a-z0-9-]*)\s*=\s*["']([\{\[][^"']{80,})["']/gi)]
    .map(m => ({ name: m[1], preview: m[2].slice(0, 120) }));

  console.log(`\n=== [${label}] data-shape analysis ===`);
  console.log(`  <script type="application/json"> blocks: ${jsonScripts.length}`);
  jsonScripts.slice(0, 5).forEach((s, i) => {
    console.log(`    [${i}] size=${s.size}  preview: ${s.preview.slice(0, 160)}`);
  });
  console.log(`  window.* assignments: ${windowAssigns.length}`);
  if (windowAssigns.length) console.log(`    names: ${[...new Set(windowAssigns)].join(', ')}`);
  console.log(`  large inline <script> blocks (>2KB): ${inlineScripts.length}, with JSON-ish: ${inlineWithJson.length}`);
  inlineWithJson.slice(0, 4).forEach(x => {
    console.log(`    idx=${x.idx} size=${x.size} braces=${x.braceChars} topVars=${x.topVars.join(', ') || '(none)'}`);
  });
  console.log(`  data-* JSON-ish attributes: ${dataAttrs.length}`);
  dataAttrs.slice(0, 5).forEach(d => console.log(`    data-${d.name}: ${d.preview}`));
}

function dumpAround(body, anchor, contextBefore = 120, contextAfter = 400, label = '') {
  const idx = body.search(new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  if (idx < 0) {
    console.log(`  [${label || anchor}] NOT FOUND`);
    return;
  }
  const start = Math.max(0, idx - contextBefore);
  const end = Math.min(body.length, idx + anchor.length + contextAfter);
  const snippet = body.slice(start, end)
    .replace(/\s+/g, ' ')
    .replace(/</g, '‹')
    .replace(/>/g, '›');
  console.log(`  [${label || anchor}] @${idx}:`);
  console.log(`    ${snippet}`);
}

async function main() {
  console.log(`Third-pass DOM probe of ${BASE}\n`);

  // --- 1) Player dashboard ---
  const dash = await fetchPage(`${BASE}/matches/players/${SID}-${SLUG}.html`);
  console.log(`[${dash.status}] /matches/players/${SID}-${SLUG}.html  size=${dash.body.length}`);
  analyzeJson(dash.body, 'DASHBOARD');

  console.log(`\n--- DASHBOARD: HTML samples around section anchors ---`);
  for (const anchor of ['Performance Summary', 'Weapon Statistics', 'Kill Feed', 'Head-to-Head', 'Position Heatmap']) {
    dumpAround(dash.body, anchor, 80, 360, anchor);
  }

  // --- 2) Per-match page ---
  const sample = await getRecentUuidForMe();
  if (!sample?.uuid) {
    console.log(`\n(no sample UUID available from local archive)`);
    return;
  }
  const matchUrl = `${BASE}/matches/${sample.uuid}.html`;
  const match = await fetchPage(matchUrl);
  console.log(`\n[${match.status}] /matches/${sample.uuid}.html  size=${match.body.length}`);
  analyzeJson(match.body, 'MATCH');

  console.log(`\n--- MATCH PAGE: HTML samples around section anchors ---`);
  for (const anchor of ['Performance Summary', 'Scoreboard', 'Kill Matrix', 'Zones', 'Weapon', 'Team']) {
    dumpAround(match.body, anchor, 80, 360, anchor);
  }

  // --- 3) match_player_v2.html deep link ---
  const uuid8 = sample.uuid.slice(0, 8);
  const deepUrl = `${BASE}/matches/match_player_v2.html?match=${uuid8}&archive=1&summary=1`;
  const deep = await fetchPage(deepUrl);
  console.log(`\n[${deep.status}] ${deepUrl}`);
  console.log(`  content-type: ${deep.ctype}   size=${deep.body.length}`);
  if (deep.body.length > 0) {
    const head = deep.body.slice(0, 400).replace(/\s+/g, ' ');
    console.log(`  head: ${head}`);
    // is it JSON?
    try { JSON.parse(deep.body); console.log(`  >>> RESPONSE IS VALID JSON <<<`); } catch {}
  }

  console.log(`\n================================================================`);
  console.log(`Paste output. We'll finalize parser strategy and build both enrichers.`);
}

main().catch(err => { console.error('Probe failed:', err.message); process.exit(1); });
