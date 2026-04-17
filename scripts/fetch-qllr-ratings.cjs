#!/usr/bin/env node
/**
 * Fetch QLLR (qllr.xyz) CTF ratings and update qllrCtfRating / qllrCtfGames
 * in player YAML files.
 *
 * Source: https://qllr.xyz/ratings/ctf/{page}/ — paginated HTML tables.
 *         (pages start at 0; each page shows 10 active players by default.
 *          ?show_inactive=yes includes inactive players.)
 *
 * Updates ONLY:
 *   - qllrCtfRating  (number, e.g. 27.82)
 *   - qllrCtfGames   (number, e.g. 48)
 *
 * Never touches any other field. Matches players by steamId only.
 *
 * Usage:
 *   node scripts/fetch-qllr-ratings.cjs                     # Active players only
 *   node scripts/fetch-qllr-ratings.cjs --include-inactive  # Active + inactive
 *   node scripts/fetch-qllr-ratings.cjs --dry-run           # Preview only, no writes
 *   node scripts/fetch-qllr-ratings.cjs --from-html <path>  # Parse local HTML dump
 *                                                           # instead of fetching
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PLAYERS_DIR = path.join(ROOT_DIR, 'src/content/players');
const BASE_URL = 'https://qllr.xyz/ratings/ctf';
const MAX_PAGES = 50;
const PAGE_DELAY_MS = 400;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const INCLUDE_INACTIVE = argv.includes('--include-inactive');
const FROM_HTML = (() => {
  const i = argv.indexOf('--from-html');
  return i !== -1 ? argv[i + 1] : null;
})();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'quakesettings-bot/1.0 (+https://stripyq.github.io/quakesettings/)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

/**
 * Parse qllr.xyz ratings table rows.
 * Row shape:
 *   <tr>
 *     <td>RANK</td>
 *     <td><a href="/player/STEAMID"> ...nickname spans... </a></td>
 *     <td>RATING &plusmn; ERR </td>
 *     <td>MATCH_COUNT</td>
 *     <td>WIN_RATIO</td>
 *   </tr>
 */
function parseHtml(html) {
  const rows = [];
  const rowRe = /<tr[^>]*>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>\s*<a\s+href="\/player\/(\d{17})"[^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td[^>]*>\s*([\d.]+)\s*(?:&plusmn;|&#177;|\u00b1)[^<]*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const rank = parseInt(m[1], 10);
    const steamId = m[2];
    const name = m[3].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    const rating = parseFloat(m[4]);
    const matches = parseInt(m[5], 10);
    if (!Number.isNaN(rating) && !Number.isNaN(matches)) {
      rows.push({ rank, steamId, name, rating, matches });
    }
  }
  return rows;
}

async function fetchAllPages(includeInactive) {
  const qs = includeInactive ? '?show_inactive=yes' : '';
  const byId = new Map();
  let totalRows = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${BASE_URL}/${page}/${qs}`;
    console.log(`  Fetching ${url}`);
    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      console.log(`    ${err.message} — stopping pagination`);
      break;
    }
    const rows = parseHtml(html);
    if (rows.length === 0) {
      console.log(`    no rows — stopping pagination`);
      break;
    }
    let added = 0;
    for (const row of rows) {
      if (!byId.has(row.steamId)) { byId.set(row.steamId, row); added++; }
    }
    totalRows += rows.length;
    console.log(`    ${rows.length} rows (${added} new, ${byId.size} unique so far)`);
    // If page returned rows but none were new, we're looping back to the top (past last page).
    if (added === 0) break;
    await sleep(PAGE_DELAY_MS);
  }
  console.log(`  Total rows parsed: ${totalRows} → ${byId.size} unique steamIds\n`);
  return byId;
}

function loadFromHtml(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const rows = parseHtml(html);
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.steamId)) byId.set(row.steamId, row);
  }
  console.log(`Loaded ${byId.size} unique players from ${filePath}\n`);
  return byId;
}

function getPlayerFiles() {
  const files = fs.readdirSync(PLAYERS_DIR).filter((f) => f.endsWith('.yaml'));
  const players = [];
  for (const file of files) {
    const filePath = path.join(PLAYERS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const sidMatch = content.match(/^steamId:\s*["']?(\d{17})["']?\s*$/m);
    if (!sidMatch) continue;
    players.push({ file, filePath, steamId: sidMatch[1], content });
  }
  return players;
}

function curVal(content, field) {
  const re = new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm');
  const m = content.match(re);
  return m ? m[1].replace(/^["']|["']$/g, '') : null;
}

function buildUpdated(content, newRating, newGames) {
  // Remove any existing qllr lines so we can re-insert cleanly
  let c = content;
  c = c.replace(/^qllrCtfRating:.*\n?/gm, '');
  c = c.replace(/^qllrCtfGames:.*\n?/gm, '');

  const newLines = [
    `qllrCtfRating: ${newRating}`,
    `qllrCtfGames: ${newGames}`,
  ];

  // Prefer to insert after ctfRatingUpdated (keeps rating block together).
  // Fall back to after ctfRating, then after dataSource/category.
  let anchorRe = /^ctfRatingUpdated:.*$/m;
  let m = c.match(anchorRe);
  if (!m) { anchorRe = /^ctfRating:.*$/m; m = c.match(anchorRe); }
  if (!m) { anchorRe = /^(dataSource:.*|category:.*)$/m; m = c.match(anchorRe); }

  if (m) {
    const pos = m.index + m[0].length;
    c = c.slice(0, pos) + '\n' + newLines.join('\n') + c.slice(pos);
  } else {
    c = c.trimEnd() + '\n' + newLines.join('\n') + '\n';
  }
  return c;
}

async function main() {
  console.log('=== Update QLLR CTF Ratings ===\n');
  if (DRY_RUN) console.log('(--dry-run: no files will be modified)\n');

  let qllrById;
  if (FROM_HTML) {
    console.log(`Source: local HTML dump ${FROM_HTML}`);
    qllrById = loadFromHtml(FROM_HTML);
  } else {
    console.log(`Source: ${BASE_URL}/ (${INCLUDE_INACTIVE ? 'active + inactive' : 'active only'})`);
    qllrById = await fetchAllPages(INCLUDE_INACTIVE);
  }

  const players = getPlayerFiles();
  console.log(`Player YAMLs with steamId: ${players.length}`);
  console.log(`QLLR players loaded:       ${qllrById.size}\n`);

  let matched = 0;
  let updated = 0;
  let unchanged = 0;
  let noData = 0;
  const missingWithQllr = [];

  for (const p of players) {
    const row = qllrById.get(p.steamId);
    if (!row) {
      noData++;
      if (/^qllrCtfRating:/m.test(p.content)) {
        missingWithQllr.push(p.file.replace('.yaml', ''));
      }
      continue;
    }
    matched++;
    const curR = curVal(p.content, 'qllrCtfRating');
    const curG = curVal(p.content, 'qllrCtfGames');
    const newR = String(row.rating);
    const newG = String(row.matches);
    if (curR === newR && curG === newG) {
      unchanged++;
      continue;
    }
    const newContent = buildUpdated(p.content, row.rating, row.matches);
    console.log(`  ${p.file.replace('.yaml', '')}: qllrCtfRating ${curR ?? '-'} → ${newR}, qllrCtfGames ${curG ?? '-'} → ${newG}`);
    if (!DRY_RUN) fs.writeFileSync(p.filePath, newContent);
    updated++;
  }

  console.log(`\n--- Summary ---`);
  console.log(`Matched:     ${matched}`);
  console.log(`Updated:     ${updated}`);
  console.log(`Unchanged:   ${unchanged}`);
  console.log(`Not in QLLR: ${noData} (YAMLs with no qllr data available)`);
  if (missingWithQllr.length) {
    console.log(`\nHave qllr* but missing from this QLLR fetch (${missingWithQllr.length}):`);
    for (const n of missingWithQllr) console.log(`  - ${n}`);
    console.log('  → likely inactive. Re-run with --include-inactive to refresh them.');
  }
  if (DRY_RUN) console.log('\n(dry-run: no files were modified)');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
