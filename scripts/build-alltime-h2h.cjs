#!/usr/bin/env node
/**
 * Build an all-time head-to-head dataset for registered players by scraping
 * every CTF scoreboard on HoQ (http://88.214.20.58/).
 *
 * For each match, for each cross-team pair where BOTH steamIds are in
 * src/data/player-registry.json, we record a +1 match and a win/loss to
 * the winning side. Pairs are keyed by sorted-steamId-pair joined with "|".
 *
 * Output: public/data/alltime-h2h.json
 *   {
 *     "<smaller_sid>|<larger_sid>": {
 *       "matches": 14,
 *       "wins_a": 9,   // smaller_sid's team won
 *       "wins_b": 5    // larger_sid's team won
 *     }, ...
 *   }
 *
 * ROBUST FAILURE HANDLING
 *   - Failed UUIDs stay in a retry queue instead of being silently dropped.
 *   - Each UUID is retried up to MAX_ATTEMPTS (default 4) before being
 *     marked dead. Dead UUIDs are 404s or persistently-failing matches.
 *   - On every run, the retry queue is processed first (slowly), then the
 *     never-attempted queue.
 *   - State: public/data/.alltime-h2h-checkpoint.json
 *
 * Usage:
 *   node scripts/build-alltime-h2h.cjs                     # normal speed
 *   node scripts/build-alltime-h2h.cjs --slow              # 1 req/s, serial
 *   node scripts/build-alltime-h2h.cjs --max-pages=5       # test: 5 listing pages
 *   node scripts/build-alltime-h2h.cjs --fresh             # wipe checkpoint, start over
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const HOQ_BASE = 'http://88.214.20.58';
const ROOT = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'src/data/player-registry.json');
const OUTPUT_PATH = path.join(ROOT, 'public/data/alltime-h2h.json');
const CHECKPOINT_PATH = path.join(ROOT, 'public/data/.alltime-h2h-checkpoint.json');

const args = process.argv.slice(2);
const SLOW = args.includes('--slow');
const FRESH = args.includes('--fresh');
const MAX_PAGES = (() => {
  const a = args.find(x => x.startsWith('--max-pages='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();

const DELAY_MS = SLOW ? 1000 : 200;
const CONCURRENT = SLOW ? 1 : 3;
const CHECKPOINT_EVERY = 200;
const MAX_ATTEMPTS = 4; // after this many errors, mark UUID dead
const FETCH_TIMEOUT_MS = 20000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Fetch a URL. Returns:
 *   { status: 'ok', body }  on 200
 *   { status: '404' }       on 404 (permanent dead)
 *   { status: 'err', msg }  on any other failure (retry later)
 */
function fetchPage(url) {
  return new Promise((resolve) => {
    const req = http.get(url, {
      headers: {
        'User-Agent': 'quakesettings-h2h-builder/1.0',
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

// ---------- Phase 1: enumerate match UUIDs ----------

async function enumerateMatches(alreadyKnown) {
  const uuids = [...alreadyKnown];
  const seen = new Set(alreadyKnown);
  let consecErrors = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = page === 0 ? `${HOQ_BASE}/matches/ctf/` : `${HOQ_BASE}/matches/ctf/${page}/`;
    let r = await fetchPage(url);

    // Retry with increasing backoff if we hit a transient error (common after rate limiting)
    let attempts = 0;
    while (r.status === 'err' && attempts < 3) {
      attempts++;
      const waitMs = 2000 * attempts;
      process.stdout.write(`\n  listing page ${page} failed: ${r.msg} — waiting ${waitMs}ms and retrying (${attempts}/3)...\n`);
      await sleep(waitMs);
      r = await fetchPage(url);
    }

    if (r.status === '404') {
      process.stdout.write(`\n  page ${page} returned 404 — end of listing reached\n`);
      break;
    }
    if (r.status !== 'ok') {
      consecErrors++;
      console.error(`\n  ❌ page ${page} gave up after retries: ${r.msg}`);
      if (page === 0) {
        console.error(`\n  First listing page failed — HoQ is likely still rate-limiting you from earlier requests.`);
        console.error(`  Wait 30-60 minutes and try again.`);
        console.error(`  You can test it manually: open http://88.214.20.58/matches/ctf/ in your browser.`);
        console.error(`  If the page loads in-browser but this script fails, our User-Agent may be blocked.\n`);
        process.exit(1);
      }
      if (consecErrors >= 5) {
        console.error(`  Too many consecutive errors — stopping enumeration at page ${page}.\n`);
        break;
      }
      continue;
    }
    consecErrors = 0;

    const pageUuids = [...r.body.matchAll(/\/scoreboard\/([a-f0-9-]{36})/gi)].map(m => m[1]);
    if (pageUuids.length === 0) {
      process.stdout.write(`\n  page ${page} has no match links — end of listing\n`);
      break;
    }
    let newOnPage = 0;
    for (const u of pageUuids) {
      if (!seen.has(u)) { seen.add(u); uuids.push(u); newOnPage++; }
    }
    process.stdout.write(`\r  listing page ${page}: +${newOnPage} (${uuids.length} total)   `);
    if (page + 1 < MAX_PAGES) await sleep(DELAY_MS);
  }
  process.stdout.write('\n');
  return uuids;
}

// ---------- Phase 2: parse a scoreboard ----------

function parseScoreboard(html) {
  const scoreMatch = html.match(/Scores:\s*<span class="qc\d+">(\d+)<\/span>\s*:\s*<span class="qc\d+">(\d+)<\/span>/);
  if (!scoreMatch) return null;
  const redScore  = parseInt(scoreMatch[1], 10);
  const blueScore = parseInt(scoreMatch[2], 10);

  const blue = [...html.matchAll(/<tr class="blue"[^>]*>[\s\S]*?<a\s+href="\/player\/(\d{17})"/g)].map(m => m[1]);
  const red  = [...html.matchAll(/<tr class="red"[^>]*>[\s\S]*?<a\s+href="\/player\/(\d{17})"/g)].map(m => m[1]);

  if (blue.length === 0 || red.length === 0) return null;
  if (blueScore === redScore) return { blue, red, winner: 'draw' };

  return { blue, red, winner: blueScore > redScore ? 'blue' : 'red' };
}

// ---------- Aggregation ----------

function aggregate(map, match, registrySet) {
  if (match.winner === 'draw') return 0;
  let recorded = 0;
  for (const b of match.blue) {
    if (!registrySet.has(b)) continue;
    for (const r of match.red) {
      if (!registrySet.has(r)) continue;
      const [a, c] = b < r ? [b, r] : [r, b];
      const key = `${a}|${c}`;
      if (!map[key]) map[key] = { matches: 0, wins_a: 0, wins_b: 0 };
      map[key].matches++;
      const winnerSid = match.winner === 'blue' ? b : r;
      if (winnerSid === a) map[key].wins_a++;
      else                 map[key].wins_b++;
      recorded++;
    }
  }
  return recorded;
}

// ---------- State helpers ----------

function newState() {
  return { uuids: [], successful: [], dead: [], failed: {}, h2h: {} };
}

function saveState(state) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(state));
}

function loadState() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return newState();
  try {
    const s = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
    // Ensure all fields exist (for checkpoints from older script versions)
    return {
      uuids: s.uuids || [],
      successful: s.successful || [],
      dead: s.dead || [],
      failed: s.failed || {},
      h2h: s.h2h || {},
    };
  } catch { return newState(); }
}

// ---------- Main ----------

async function main() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`Registry not found: ${REGISTRY_PATH}`);
    process.exit(1);
  }
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const registrySet = new Set((registry.players || []).map(p => String(p.steamId || '')).filter(Boolean));
  console.log(`Registry: ${registrySet.size} players with steamIds`);
  console.log(`Speed:    ${SLOW ? 'SLOW (1 req/s, serial)' : 'FAST (~6 req/s, 3 parallel)'}\n`);

  let state = FRESH ? newState() : loadState();
  const successfulSet = new Set(state.successful);
  const deadSet = new Set(state.dead);

  console.log(`Starting state:`);
  console.log(`  UUIDs known:   ${state.uuids.length}`);
  console.log(`  Successful:    ${successfulSet.size}`);
  console.log(`  Dead (404 or >${MAX_ATTEMPTS} fails): ${deadSet.size}`);
  console.log(`  Pending retry: ${Object.keys(state.failed).length}`);
  console.log(`  Pairs:         ${Object.keys(state.h2h).length}\n`);

  // Phase 1: enumerate if missing
  if (state.uuids.length === 0 || MAX_PAGES < Infinity) {
    console.log('Phase 1: enumerating match pages...');
    state.uuids = await enumerateMatches(state.uuids);
    saveState(state);
  }

  // Build todo: failed-retry queue first, then never-attempted
  const retryQueue = Object.keys(state.failed);
  const neverAttempted = state.uuids.filter(u => !successfulSet.has(u) && !deadSet.has(u) && !state.failed[u]);
  const todo = [...retryQueue, ...neverAttempted];

  console.log(`Phase 2: processing ${todo.length} UUIDs (${retryQueue.length} retries + ${neverAttempted.length} new)\n`);

  let okCount = 0, errCount = 0, deadCount = 0, recordedEvents = 0;
  let lastCheckpoint = Date.now();

  for (let i = 0; i < todo.length; i += CONCURRENT) {
    const batch = todo.slice(i, i + CONCURRENT);
    const results = await Promise.all(batch.map(async (uuid) => {
      const r = await fetchPage(`${HOQ_BASE}/scoreboard/${uuid}`);
      return { uuid, r };
    }));

    for (const { uuid, r } of results) {
      if (r.status === 'ok') {
        const parsed = parseScoreboard(r.body);
        if (parsed) {
          recordedEvents += aggregate(state.h2h, parsed, registrySet);
          successfulSet.add(uuid);
          delete state.failed[uuid];
          okCount++;
        } else {
          // HTML fetched but couldn't parse — treat as dead (malformed match)
          deadSet.add(uuid);
          delete state.failed[uuid];
          deadCount++;
        }
      } else if (r.status === '404') {
        deadSet.add(uuid);
        delete state.failed[uuid];
        deadCount++;
      } else {
        // Transient error — bump retry count
        state.failed[uuid] = (state.failed[uuid] || 0) + 1;
        if (state.failed[uuid] >= MAX_ATTEMPTS) {
          deadSet.add(uuid);
          delete state.failed[uuid];
          deadCount++;
        }
        errCount++;
      }
    }

    const totalDone = successfulSet.size + deadSet.size;
    if ((i % 100) < CONCURRENT || i + CONCURRENT >= todo.length) {
      process.stdout.write(
        `\r  done=${totalDone}/${state.uuids.length} · this-run: ok=${okCount} err=${errCount} dead=${deadCount} · pairs=${Object.keys(state.h2h).length} · retry-queue=${Object.keys(state.failed).length}   `
      );
    }

    // Checkpoint every N seconds
    if (Date.now() - lastCheckpoint > 10000) {
      state.successful = [...successfulSet];
      state.dead = [...deadSet];
      saveState(state);
      lastCheckpoint = Date.now();
    }

    await sleep(DELAY_MS);
  }
  process.stdout.write('\n');

  // Final save
  state.successful = [...successfulSet];
  state.dead = [...deadSet];
  saveState(state);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(state.h2h, null, 0));

  const size = fs.statSync(OUTPUT_PATH).size;
  const totalAttempted = successfulSet.size + deadSet.size;
  const successPct = (successfulSet.size / Math.max(1, totalAttempted) * 100).toFixed(1);

  console.log(`\n=== Done ===`);
  console.log(`Total UUIDs:      ${state.uuids.length}`);
  console.log(`Successful:       ${successfulSet.size} (${successPct}% of attempted)`);
  console.log(`Dead/permanent:   ${deadSet.size}`);
  console.log(`Still in retry:   ${Object.keys(state.failed).length}  ← run again if >0`);
  console.log(`Pairs recorded:   ${Object.keys(state.h2h).length}`);
  console.log(`Output: ${OUTPUT_PATH} (${(size / 1024).toFixed(1)} KB)`);
  if (Object.keys(state.failed).length > 0) {
    console.log(`\nTIP: re-run (without --fresh) to retry the ${Object.keys(state.failed).length} still-failing UUIDs.`);
    console.log(`     Use --slow if HoQ is rate-limiting.`);
  }
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
