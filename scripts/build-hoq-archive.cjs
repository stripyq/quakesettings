#!/usr/bin/env node
/**
 * HoQ match archive builder.
 *
 * Scrapes every match scoreboard on http://88.214.20.58/ for the requested
 * gametype(s) and saves a RICH per-match record to a JSONL archive. One
 * line per match. This is the foundation for many future analytics
 * features — from it we can derive H2H, medals leaderboards, rivalries,
 * personal bests, weapon accuracy, map performance, etc. via small
 * standalone "derive-*.cjs" scripts that read the archive.
 *
 * Supported gametypes (per HoQ's routing): ctf, tdm, tdm2v2, ft, ca, ad.
 *
 * Per-match record schema (JSONL, one per line):
 *   {
 *     "uuid":         string,       // scoreboard UUID
 *     "ts":           int,          // epoch seconds
 *     "gt":           string,       // "ctf"
 *     "map":          string|null,
 *     "duration_sec": int|null,     // total match duration
 *     "rating_diff":  float|null,
 *     "scores":       { "blue": int, "red": int },
 *     "winner":       "blue"|"red"|"draw",
 *     "players":      [ Player, ... ]  // all players across both teams
 *   }
 *
 * Player record:
 *   {
 *     "sid": string,          // 17-digit steamId
 *     "nick": string,
 *     "team": "blue"|"red",
 *     "score": int|null,
 *     "frags": int|null,
 *     "deaths": int|null,
 *     "caps": int|null,
 *     "assists": int|null,
 *     "defends": int|null,
 *     "dmg_dealt": int|null,
 *     "dmg_taken": int|null,
 *     "time_sec": int|null,
 *     "old_rating": float|null,
 *     "new_rating": float|null,
 *     "rating_diff": float|null,
 *     "weapons": {            // keys: gt, mg, sg, gl, rl, rg, pg
 *        "<w>": { "kills": int|null, "hits": int|null, "shots": int|null, "acc": int|null } },
 *     "medals": {             // keys: assists, captures, combokill, defends,
 *                             //        excellent, firstfrag, headshot,
 *                             //        humiliation, impressive, midair, revenge
 *        "<m>": int|null }
 *   }
 *
 * Usage:
 *   node scripts/build-hoq-archive.cjs --gt=ctf --slow           # single gametype, gentle
 *   node scripts/build-hoq-archive.cjs --gt=ctf,tdm              # multiple gametypes
 *   node scripts/build-hoq-archive.cjs --gt=ctf --max-pages=2    # test run
 *   node scripts/build-hoq-archive.cjs --gt=ctf --inspect        # dump first parsed match to console
 *   node scripts/build-hoq-archive.cjs --gt=ctf --fresh          # wipe checkpoint, start over
 *
 * Output layout:
 *   public/data/archive/<gt>.jsonl             # one match per line (gitignored)
 *   public/data/archive/<gt>.checkpoint.json   # resumable state (gitignored)
 *   public/data/archive/<gt>.meta.json         # small summary (commit-optional)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// ---------------- Config ----------------

const HOQ_BASE = 'http://88.214.20.58';
const ROOT = path.join(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'public/data/archive');

const SUPPORTED_GT = new Set(['ctf', 'tdm', 'tdm2v2', 'ft', 'ca', 'ad']);

const WEAPON_KEYS = ['gt', 'mg', 'sg', 'gl', 'rl', 'rg', 'pg'];
const MEDAL_KEYS = [
  'assists', 'captures', 'combokill', 'defends', 'excellent',
  'firstfrag', 'headshot', 'humiliation', 'impressive', 'midair', 'revenge',
];

// CLI
const args = process.argv.slice(2);
const SLOW = args.includes('--slow');
const FRESH = args.includes('--fresh');
const INSPECT = args.includes('--inspect');
const MAX_PAGES = (() => {
  const a = args.find(x => x.startsWith('--max-pages='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();
const GAMETYPES = (() => {
  const a = args.find(x => x.startsWith('--gt='));
  if (!a) { console.error('Missing --gt=<gametype>[,<gametype>...]'); process.exit(1); }
  const list = a.split('=')[1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  for (const gt of list) {
    if (!SUPPORTED_GT.has(gt)) {
      console.error(`Unknown gametype: ${gt}. Supported: ${[...SUPPORTED_GT].join(', ')}`);
      process.exit(1);
    }
  }
  return list;
})();

const DELAY_MS = SLOW ? 1000 : 200;
const CONCURRENT = SLOW ? 1 : 3;
const MAX_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 20000;

// ---------------- Fetch ----------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchPage(url) {
  return new Promise((resolve) => {
    const req = http.get(url, {
      headers: {
        'User-Agent': 'quakesettings-archive-builder/1.0',
        'Accept': 'text/html',
      },
    }, (res) => {
      if (res.statusCode === 404) { resolve({ status: '404' }); return; }
      if (res.statusCode !== 200) { resolve({ status: 'err', msg: `HTTP ${res.statusCode}` }); return; }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: 'ok', body: data }));
    });
    req.on('error', (err) => resolve({ status: 'err', msg: err.message }));
    req.setTimeout(FETCH_TIMEOUT_MS, () => { req.destroy(); resolve({ status: 'err', msg: 'timeout' }); });
  });
}

// ---------------- Enumeration ----------------

async function enumerateMatches(gt, alreadyKnown) {
  const uuids = [...alreadyKnown];
  const seen = new Set(alreadyKnown);
  let consecErrors = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = page === 0 ? `${HOQ_BASE}/matches/${gt}/` : `${HOQ_BASE}/matches/${gt}/${page}/`;
    let r = await fetchPage(url);
    let attempts = 0;
    while (r.status === 'err' && attempts < 3) {
      attempts++;
      const waitMs = 2000 * attempts;
      process.stdout.write(`\n  [${gt}] listing page ${page} failed (${r.msg}) — retry ${attempts}/3 after ${waitMs}ms\n`);
      await sleep(waitMs);
      r = await fetchPage(url);
    }
    if (r.status === '404') {
      process.stdout.write(`\n  [${gt}] page ${page} is 404 — end of listing\n`);
      break;
    }
    if (r.status !== 'ok') {
      consecErrors++;
      if (page === 0) {
        console.error(`\n  ❌ [${gt}] first listing page failed: ${r.msg}`);
        console.error(`  HoQ may be rate-limiting or the gametype has no matches.`);
        console.error(`  Verify: ${url}`);
        return uuids; // return whatever we have
      }
      if (consecErrors >= 5) {
        console.error(`\n  ❌ [${gt}] too many consecutive errors at page ${page}`);
        break;
      }
      continue;
    }
    consecErrors = 0;
    const pageUuids = [...r.body.matchAll(/\/scoreboard\/([a-f0-9-]{36})/gi)].map(m => m[1]);
    if (pageUuids.length === 0) {
      process.stdout.write(`\n  [${gt}] page ${page} has no match links — end\n`);
      break;
    }
    let added = 0;
    for (const u of pageUuids) {
      if (!seen.has(u)) { seen.add(u); uuids.push(u); added++; }
    }
    process.stdout.write(`\r  [${gt}] listing page ${page}: +${added} (${uuids.length} total)   `);
    if (page + 1 < MAX_PAGES) await sleep(DELAY_MS);
  }
  process.stdout.write('\n');
  return uuids;
}

// ---------------- Scoreboard parsing ----------------

// Parse an integer, returning null for "-" or unparseable
function parseIntOrNull(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (t === '' || t === '-' || t === '\u2014' || t === '&ndash;') return null;
  const n = parseInt(t.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}
function parseFloatOrNull(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (t === '' || t === '-') return null;
  const n = parseFloat(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// "19:57" -> 1197 seconds
function parseDuration(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d+):(\d+)$/);
  if (!m) return parseIntOrNull(s);
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Strip HTML tags, collapse whitespace, decode common entities
function stripHtml(s) {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&plusmn;|&#177;/g, '±')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a <thead>...</thead> block and return an array of column descriptors,
 * one per <th>. Each descriptor: { kind, key, idx } where:
 *   kind = 'summary' | 'weapon_kills' | 'weapon_acc' | 'medal' | 'other'
 *   key  = label (for summary) or weapon/medal key (e.g. 'rg', 'defends')
 */
function parseThead(theadHtml) {
  const cols = [];
  const thRe = /<th([^>]*)>([\s\S]*?)<\/th>/g;
  let m;
  let idx = 0;
  while ((m = thRe.exec(theadHtml)) !== null) {
    const attrs = m[1];
    const inner = m[2];

    const classMatch = attrs.match(/class="([^"]*)"/);
    const cls = classMatch ? classMatch[1] : '';

    // Weapon column? Uses <div class="w-<key>"></div>
    const wMatch = inner.match(/class="w-(\w+)"/);
    // Medal column? Uses <div class="m-<key>"></div>
    const mMatch = inner.match(/class="m-(\w+)"/);

    let kind = 'other', key = null;
    if (wMatch) {
      // "s sw" = kills count, "s sa" = accuracy
      if (cls.includes(' sw')) { kind = 'weapon_kills'; key = wMatch[1]; }
      else if (cls.includes(' sa')) { kind = 'weapon_acc'; key = wMatch[1]; }
      else { kind = 'weapon_kills'; key = wMatch[1]; }
    } else if (mMatch) {
      kind = 'medal'; key = mMatch[1];
    } else if (cls.includes('s1') || cls === '') {
      kind = 'summary'; key = stripHtml(inner).toLowerCase();
    }

    cols.push({ kind, key, idx });
    idx++;
  }
  return cols;
}

/**
 * Parse a single <tr class="blue|red">...</tr> row using the column map
 * from parseThead. Returns a Player record or null on failure.
 */
function parsePlayerRow(rowHtml, columns, team) {
  // steamId from /player/<17 digits>
  const sidMatch = rowHtml.match(/href="\/player\/(\d{17})"/);
  if (!sidMatch) return null;
  const sid = sidMatch[1];

  // Nick: text inside the <a> link, strip spans
  const nickMatch = rowHtml.match(/<a\s+href="\/player\/\d{17}"[^>]*>([\s\S]*?)<\/a>/);
  const nick = nickMatch ? stripHtml(nickMatch[1]) : '';

  // Collect all <td>...</td> in order
  const tdRe = /<td([^>]*)>([\s\S]*?)<\/td>/g;
  const cells = [];
  let m;
  while ((m = tdRe.exec(rowHtml)) !== null) cells.push({ attrs: m[1], inner: m[2] });

  const player = {
    sid,
    nick,
    team,
    score: null, frags: null, deaths: null, caps: null, assists: null, defends: null,
    dmg_dealt: null, dmg_taken: null,
    time_sec: null,
    old_rating: null, new_rating: null, rating_diff: null,
    weapons: {},
    medals: {},
  };
  for (const w of WEAPON_KEYS) player.weapons[w] = { kills: null, hits: null, shots: null, acc: null };
  for (const k of MEDAL_KEYS) player.medals[k] = null;

  // Column 0 is the player-nick cell; columns start mapping at index 1
  // But first cell order matches thead, so we align cells[i] with columns[i].
  // The player cell is typically columns[0] (just "Nick" header).
  for (let i = 0; i < Math.min(cells.length, columns.length); i++) {
    const col = columns[i];
    const cell = cells[i];
    const rawText = stripHtml(cell.inner);

    if (col.kind === 'summary') {
      const label = col.key;
      if (label === 'score') player.score = parseIntOrNull(rawText);
      else if (label === 'frags') player.frags = parseIntOrNull(rawText);
      else if (label === 'deaths') player.deaths = parseIntOrNull(rawText);
      else if (label === 'captures') player.caps = parseIntOrNull(rawText);
      else if (label === 'assists') player.assists = parseIntOrNull(rawText);
      else if (label === 'defends') player.defends = parseIntOrNull(rawText);
      else if (label === 'damage dealt') player.dmg_dealt = parseIntOrNull(rawText);
      else if (label === 'damage taken') player.dmg_taken = parseIntOrNull(rawText);
      else if (label === 'time') player.time_sec = parseDuration(rawText);
      else if (label === 'old rating') player.old_rating = parseFloatOrNull(rawText.split('±')[0]);
      else if (label === 'new rating') player.new_rating = parseFloatOrNull(rawText.split('±')[0]);
      else if (label === 'diff') player.rating_diff = parseFloatOrNull(rawText);
    } else if (col.kind === 'weapon_kills') {
      if (!player.weapons[col.key]) player.weapons[col.key] = { kills: null, hits: null, shots: null, acc: null };
      player.weapons[col.key].kills = parseIntOrNull(rawText);
    } else if (col.kind === 'weapon_acc') {
      if (!player.weapons[col.key]) player.weapons[col.key] = { kills: null, hits: null, shots: null, acc: null };
      // Accuracy cell format: <span title="HITS / SHOTS">PCT%</span> OR "-"
      const titleMatch = cell.inner.match(/title="(\d+)\s*\/\s*(\d+)"/);
      if (titleMatch) {
        player.weapons[col.key].hits = parseInt(titleMatch[1], 10);
        player.weapons[col.key].shots = parseInt(titleMatch[2], 10);
      }
      const pctMatch = rawText.match(/(\d+)\s*%/);
      if (pctMatch) player.weapons[col.key].acc = parseInt(pctMatch[1], 10);
    } else if (col.kind === 'medal') {
      if (!(col.key in player.medals)) player.medals[col.key] = null;
      player.medals[col.key] = parseIntOrNull(rawText);
    }
  }
  return player;
}

/**
 * Parse an entire scoreboard page. Returns a full Match record or null.
 */
function parseScoreboard(html, uuid, gametype) {
  // Match timestamp: data-timestamp="1691874994"
  const tsMatch = html.match(/data-timestamp="(\d+)"/);
  const ts = tsMatch ? parseInt(tsMatch[1], 10) : null;

  // Map + duration from <ul> metadata list
  const mapMatch = html.match(/<li>Arena:\s*([^<]+)<\/li>/i);
  const mapName = mapMatch ? mapMatch[1].trim() : null;
  const durMatch = html.match(/<li>Duration:\s*([^<]+)<\/li>/i);
  const durationSec = durMatch ? parseDuration(durMatch[1].trim()) : null;
  const diffMatch = html.match(/<li>Rating diff:\s*([-\d.]+)<\/li>/i);
  const ratingDiff = diffMatch ? parseFloatOrNull(diffMatch[1]) : null;

  // Scores: <li>Scores: <span class="qc1">RED</span> : <span class="qc4">BLUE</span></li>
  const scoresMatch = html.match(/Scores:\s*<span class="qc\d+">(\d+)<\/span>\s*:\s*<span class="qc\d+">(\d+)<\/span>/);
  if (!scoresMatch) return null;
  const redScore  = parseInt(scoresMatch[1], 10);
  const blueScore = parseInt(scoresMatch[2], 10);

  // Each team has its OWN <table> with its own <thead>+<tbody>. Extract them.
  // The scoreboard page has multiple tables but only the team scoreboards
  // include <tr class="blue|red"> rows. We match table-by-table.
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map(m => m[1]);

  const players = [];
  for (const tbl of tables) {
    // Team = color of the FIRST <tr class="color"> in the table
    const teamClassMatch = tbl.match(/<tr class="(blue|red)"/);
    if (!teamClassMatch) continue;
    const team = teamClassMatch[1];

    const theadMatch = tbl.match(/<thead>([\s\S]*?)<\/thead>/);
    if (!theadMatch) continue;
    const columns = parseThead(theadMatch[1]);

    const tbodyMatch = tbl.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) continue;
    const rowRe = new RegExp(`<tr class="${team}"[^>]*>([\\s\\S]*?)<\\/tr>`, 'g');
    let rm;
    while ((rm = rowRe.exec(tbodyMatch[1])) !== null) {
      const row = parsePlayerRow(rm[1], columns, team);
      if (row) players.push(row);
    }
  }

  if (players.length === 0) return null;

  let winner = 'draw';
  if (blueScore > redScore) winner = 'blue';
  else if (redScore > blueScore) winner = 'red';

  return {
    uuid,
    ts,
    gt: gametype,
    map: mapName,
    duration_sec: durationSec,
    rating_diff: ratingDiff,
    scores: { blue: blueScore, red: redScore },
    winner,
    players,
  };
}

// ---------------- State / checkpoint ----------------

function pathsFor(gt) {
  return {
    jsonl: path.join(ARCHIVE_DIR, `${gt}.jsonl`),
    checkpoint: path.join(ARCHIVE_DIR, `${gt}.checkpoint.json`),
    meta: path.join(ARCHIVE_DIR, `${gt}.meta.json`),
  };
}

function newState() {
  return { uuids: [], successful: [], dead: [], failed: {} };
}

function loadState(gt) {
  const p = pathsFor(gt).checkpoint;
  if (!fs.existsSync(p)) return newState();
  try {
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      uuids: s.uuids || [],
      successful: s.successful || [],
      dead: s.dead || [],
      failed: s.failed || {},
    };
  } catch { return newState(); }
}

function saveState(gt, state) {
  fs.writeFileSync(pathsFor(gt).checkpoint, JSON.stringify(state));
}

function saveMeta(gt, state) {
  const meta = {
    gametype: gt,
    total_uuids: state.uuids.length,
    successful: state.successful.length,
    dead: state.dead.length,
    still_in_retry: Object.keys(state.failed).length,
    last_update: new Date().toISOString(),
  };
  fs.writeFileSync(pathsFor(gt).meta, JSON.stringify(meta, null, 2));
}

// ---------------- Main per-gametype loop ----------------

async function runGametype(gt) {
  console.log(`\n========== Gametype: ${gt} ==========`);
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const paths = pathsFor(gt);

  if (FRESH) {
    [paths.jsonl, paths.checkpoint, paths.meta].forEach(p => {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    console.log(`  (fresh: wiped ${gt} archive + checkpoint + meta)`);
  }

  let state = loadState(gt);
  const successfulSet = new Set(state.successful);
  const deadSet = new Set(state.dead);

  console.log(`Current state:`);
  console.log(`  UUIDs known:   ${state.uuids.length}`);
  console.log(`  Successful:    ${successfulSet.size}`);
  console.log(`  Dead/permanent: ${deadSet.size}`);
  console.log(`  Pending retry: ${Object.keys(state.failed).length}\n`);

  // Enumerate
  if (state.uuids.length === 0 || MAX_PAGES < Infinity) {
    console.log(`Phase 1: enumerating ${gt} match pages...`);
    state.uuids = await enumerateMatches(gt, state.uuids);
    saveState(gt, state);
  }

  // Build todo
  const retryQueue = Object.keys(state.failed);
  const neverAttempted = state.uuids.filter(u => !successfulSet.has(u) && !deadSet.has(u) && !state.failed[u]);
  const todo = [...retryQueue, ...neverAttempted];
  if (todo.length === 0) {
    console.log(`All ${gt} matches already processed.`);
    saveMeta(gt, state);
    return;
  }
  console.log(`\nPhase 2: fetching ${todo.length} scoreboards (${retryQueue.length} retries + ${neverAttempted.length} new)\n`);

  const jsonlStream = fs.openSync(paths.jsonl, 'a');

  let okCount = 0, errCount = 0, deadCount = 0, malformedCount = 0;
  let lastCheckpoint = Date.now();
  let inspected = false;

  try {
    for (let i = 0; i < todo.length; i += CONCURRENT) {
      const batch = todo.slice(i, i + CONCURRENT);
      const results = await Promise.all(batch.map(async (uuid) => {
        const r = await fetchPage(`${HOQ_BASE}/scoreboard/${uuid}`);
        return { uuid, r };
      }));

      for (const { uuid, r } of results) {
        if (r.status === 'ok') {
          let parsed = null;
          try {
            parsed = parseScoreboard(r.body, uuid, gt);
          } catch (parseErr) {
            // Don't let one bad scoreboard kill the whole run
            console.error(`\n  parse error for ${uuid}: ${parseErr.message}`);
            parsed = null;
          }
          if (parsed) {
            fs.writeSync(jsonlStream, JSON.stringify(parsed) + '\n');
            successfulSet.add(uuid);
            delete state.failed[uuid];
            okCount++;

            if (INSPECT && !inspected) {
              console.log('\n--- First parsed match (inspect) ---');
              console.log(JSON.stringify(parsed, null, 2));
              console.log('--- end ---\n');
              inspected = true;
            }
          } else {
            deadSet.add(uuid); delete state.failed[uuid];
            malformedCount++; deadCount++;
          }
        } else if (r.status === '404') {
          deadSet.add(uuid); delete state.failed[uuid];
          deadCount++;
        } else {
          state.failed[uuid] = (state.failed[uuid] || 0) + 1;
          if (state.failed[uuid] >= MAX_ATTEMPTS) {
            deadSet.add(uuid); delete state.failed[uuid];
            deadCount++;
          }
          errCount++;
        }
      }

      const totalDone = successfulSet.size + deadSet.size;
      if ((i % 100) < CONCURRENT || i + CONCURRENT >= todo.length) {
        process.stdout.write(
          `\r  [${gt}] done=${totalDone}/${state.uuids.length} · ok=${okCount} err=${errCount} dead=${deadCount} (malformed=${malformedCount}) · retry-q=${Object.keys(state.failed).length}   `
        );
      }

      if (Date.now() - lastCheckpoint > 10000) {
        state.successful = [...successfulSet];
        state.dead = [...deadSet];
        saveState(gt, state);
        lastCheckpoint = Date.now();
      }

      await sleep(DELAY_MS);
    }
    process.stdout.write('\n');
  } finally {
    fs.closeSync(jsonlStream);
    state.successful = [...successfulSet];
    state.dead = [...deadSet];
    saveState(gt, state);
    saveMeta(gt, state);
  }

  const size = fs.existsSync(paths.jsonl) ? fs.statSync(paths.jsonl).size : 0;
  const totalAttempted = successfulSet.size + deadSet.size;
  const successPct = (successfulSet.size / Math.max(1, totalAttempted) * 100).toFixed(1);

  console.log(`\n  --- ${gt} done ---`);
  console.log(`  Total UUIDs:     ${state.uuids.length}`);
  console.log(`  Successful:      ${successfulSet.size} (${successPct}%)`);
  console.log(`  Dead/permanent:  ${deadSet.size}  (malformed in this run: ${malformedCount})`);
  console.log(`  Still in retry:  ${Object.keys(state.failed).length}`);
  console.log(`  Archive file:    ${paths.jsonl} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  if (Object.keys(state.failed).length > 0) {
    console.log(`  Tip: re-run (without --fresh) to retry the still-failing UUIDs.`);
  }
}

// ---------------- Top level ----------------

(async () => {
  console.log(`HoQ archive builder`);
  console.log(`Gametypes: ${GAMETYPES.join(', ')}`);
  console.log(`Speed:     ${SLOW ? 'SLOW (1 req/s, serial)' : 'FAST (~6 req/s, 3 parallel)'}`);
  console.log(`Inspect:   ${INSPECT ? 'yes (dumps first parsed match)' : 'no'}`);
  console.log(`Fresh:     ${FRESH ? 'yes (wipes existing archive for these gametypes)' : 'no'}`);
  if (MAX_PAGES < Infinity) console.log(`Max pages: ${MAX_PAGES}`);

  for (const gt of GAMETYPES) {
    await runGametype(gt);
  }

  console.log(`\n========== All done ==========`);
  console.log(`Archive dir: ${ARCHIVE_DIR}`);
  console.log(`Add derive-*.cjs scripts to generate focused JSON files from these archives.`);
})().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
