#!/usr/bin/env node
/**
 * Fourth probe — targeted at the DOM regions my parsers missed.
 * Read-only. No writes.
 *
 * Dumps raw HTML (tags shown as ‹ › so console doesn't render) for the
 * sections my v1 parsers can't handle:
 *
 * On the player dashboard:
 *   - ML Match Layer     (saw keys visible on screen but unknown markup)
 *   - Head-to-Head       (class starting with "matc..." — truncated in earlier probe)
 *   - Flag Statistics    (possibly tables, possibly something else)
 *   - Base Snapshot      (unknown)
 *   - Play Rate          (unknown)
 *
 * On a per-match page:
 *   - .team-board        (why does my regex see 4 instead of 2?)
 *   - .zones             (container end is ambiguous)
 *   - .weapons           (container end is ambiguous, row count wrong)
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
      headers: { 'User-Agent': 'quakesettings-probe/1.3', 'Accept': 'text/html' },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (err) => resolve({ status: 'ERR', body: '', err: err.message }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
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
      if (!JSON.stringify(players).includes(SID)) continue;
      if (!latest || (m.date && m.date > (latest.date || ''))) {
        latest = { uuid: m.uuid || m.id || m.match_id, date: m.date || '' };
      }
    } catch {}
  }
  return latest;
}

function visible(html) {
  return String(html).replace(/</g, '‹').replace(/>/g, '›').replace(/\s+/g, ' ').trim();
}

// Slice a region starting at the opening tag whose class contains `className`,
// and ending at the next sibling with the same class OR at a balanced </div>.
function sliceSection(html, className, maxLen = 1800) {
  const re = new RegExp(`<div[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'gi');
  const starts = [];
  let m;
  while ((m = re.exec(html)) !== null) starts.push({ start: m.index, openTagEnd: m.index + m[0].length });
  return starts.map((s, i) => {
    const next = i + 1 < starts.length ? starts[i + 1].start : Math.min(s.start + maxLen, html.length);
    return { start: s.start, sample: html.slice(s.start, Math.min(next, s.start + maxLen)) };
  });
}

// Grab everything under a section-header by title (dashboard only) up to next header.
function sliceDashboardSection(html, titleRegex, maxLen = 2500) {
  const headers = [];
  const re = /<div\s+class="section-header"[^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    headers.push({ title: m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < headers.length; i++) {
    if (titleRegex.test(headers[i].title)) {
      const end = i + 1 < headers.length ? headers[i + 1].start : Math.min(headers[i].end + maxLen, html.length);
      return { title: headers[i].title, sample: html.slice(headers[i].end, Math.min(end, headers[i].end + maxLen)) };
    }
  }
  return null;
}

async function main() {
  console.log(`Gap probe — targeted DOM dump\n`);

  // --- Dashboard ---
  const dash = await fetchPage(`${BASE}/matches/players/${SID}-${SLUG}.html`);
  console.log(`[${dash.status}] dashboard size=${dash.body.length}`);
  for (const [label, re] of [
    ['ML Match Layer',    /^ml match layer$/i],
    ['Head-to-Head',      /^head-to-head/i],
    ['Flag Statistics',   /flag statistics/i],
    ['Base Snapshot',     /base snapshot/i],
    ['Play Rate',         /^play rate/i],
    ['Position Heatmap',  /position heatmap/i],
  ]) {
    const sec = sliceDashboardSection(dash.body, re, 1500);
    if (!sec) { console.log(`\n=== ${label} — NOT FOUND ===`); continue; }
    console.log(`\n=== ${label} (title: "${sec.title}") ===`);
    console.log(visible(sec.sample).slice(0, 1500));
  }

  // --- Match page ---
  const sample = await getRecentUuidForMe();
  if (!sample?.uuid) { console.log(`\n(no sample UUID)`); return; }
  const match = await fetchPage(`${BASE}/matches/${sample.uuid}.html`);
  console.log(`\n\n[${match.status}] match=${sample.uuid} size=${match.body.length}`);

  // Team boards — count and sample
  const boards = sliceSection(match.body, 'team-board', 1200);
  console.log(`\n=== .team-board count: ${boards.length} ===`);
  boards.forEach((b, i) => {
    const head = match.body.slice(b.start, b.start + 200);
    console.log(`\n  [board #${i}] opening: ${visible(head)}`);
    console.log(`  sample (first 900 chars of region):`);
    console.log(`  ${visible(b.sample).slice(0, 900)}`);
  });

  // Zones region
  const zones = sliceSection(match.body, 'zones', 2000);
  console.log(`\n=== .zones region count: ${zones.length} ===`);
  zones.forEach((z, i) => {
    console.log(`\n  [zones #${i}] sample (first 1500 chars):`);
    console.log(`  ${visible(z.sample).slice(0, 1500)}`);
  });

  // Weapons region
  const weapons = sliceSection(match.body, 'weapons', 2000);
  console.log(`\n=== .weapons region count: ${weapons.length} ===`);
  weapons.forEach((w, i) => {
    console.log(`\n  [weapons #${i}] sample (first 1500 chars):`);
    console.log(`  ${visible(w.sample).slice(0, 1500)}`);
  });

  // Bonus: count weapon-row and zone-row occurrences for ground truth
  const zoneRows = (match.body.match(/<div\s+class="zone-row"/gi) || []).length;
  const weaponRows = (match.body.match(/<div\s+class="weapon-row"/gi) || []).length;
  console.log(`\n=== ground truth ===`);
  console.log(`  zone-row count: ${zoneRows}`);
  console.log(`  weapon-row count: ${weaponRows}`);
}

main().catch(err => { console.error('Probe failed:', err.message); process.exit(1); });
