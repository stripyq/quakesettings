#!/usr/bin/env node
/**
 * Backfill the June-August 2026 gap in public/data/hoq/<steamId>/history.json
 * from the QLLR server at stats.houseofquake.com.
 *
 * Background: the old HoQ server (88.214.20.58) provided per-game rating
 * history; it died in early July 2026 and the committed history files froze at
 * 2026-06-03. Its replacement (stats.houseofquake.com, QLLR software) has no
 * bulk history endpoint, but each match scoreboard JSON carries every
 * participant's post-match rating. This script rebuilds the missing window,
 * one point per rated match, in the exact file format the charts read.
 *
 * How it works:
 *   1. For every registry player (src/content/players/*.yaml with steamId),
 *      walk /matches/player/<id>/<gt>/<page>/ (newest first) collecting
 *      scoreboard match ids, per gametype (ctf, tdm).
 *   2. Fetch each unique scoreboard once (/scoreboard/<id>.json, cached in
 *      scripts/.backfill-cache/ so reruns and crashes resume cheaply).
 *      Stop walking a player's list once a page's oldest match predates the
 *      cutoff.
 *   3. From each scoreboard take summary.timestamp + gt_short and, for every
 *      registry player in team_stats.overall, rating.new.
 *   4. Insert points into each history.json in timestamp order. game_num
 *      continues from the last existing point before the inserted range.
 *
 * Guarantees:
 *   - Existing points are never modified or removed; inserts only.
 *   - Duplicate guard by (gametype, timestamp): idempotent, safe to rerun.
 *   - Only inserts points strictly newer than the player's last pre-cutoff
 *     point and strictly older than the first appended post-gap point.
 *   - Reports per-player coverage (points inserted vs games-count gap).
 *
 * Usage:
 *   node scripts/backfill-hoq-history.cjs --dry-run
 *   node scripts/backfill-hoq-history.cjs
 *   node scripts/backfill-hoq-history.cjs --players 76561197992882111,...
 *   Options: --cutoff 2026-06-01 (default), --delay-ms 350, --max-pages 200
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BASE = 'http://stats.houseofquake.com';
const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const HOQ_DIR = path.join(__dirname, '../public/data/hoq');
const CACHE_DIR = path.join(__dirname, '.backfill-cache');
const GAMETYPES = ['ctf', 'tdm'];

const DRY_RUN = process.argv.includes('--dry-run');
function argVal(name, dflt) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const CUTOFF = Math.floor(new Date(argVal('--cutoff', '2026-06-01') + 'T00:00:00Z').getTime() / 1000);
// Existing points at/after this moment are the append-era points written by
// append-hoq-history.cjs (started 2026-08-26); they form the insertion ceiling.
const APPEND_BOUNDARY = Math.floor(new Date(argVal('--append-boundary', '2026-08-26') + 'T00:00:00Z').getTime() / 1000);
const DELAY_MS = Number(argVal('--delay-ms', 350));
const MAX_PAGES = Number(argVal('--max-pages', 200));
const ONLY_PLAYERS = argVal('--players', null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, tries = 3) {
  for (let a = 1; a <= tries; a++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (a === tries) {
        console.error(`  FETCH FAILED ${url}: ${e.message}`);
        return null;
      }
      await sleep(1000 * a);
    }
  }
}

function loadYaml(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return yaml.load(raw);
  } catch {
    const body = raw.replace(/^---\r?\n/, '').split(/\r?\n---/)[0];
    return yaml.load(body);
  }
}

function getRegistry() {
  const out = new Map(); // steamId -> name
  for (const f of fs.readdirSync(PLAYERS_DIR).filter((x) => x.endsWith('.yaml'))) {
    try {
      const d = loadYaml(path.join(PLAYERS_DIR, f));
      if (d && d.steamId != null) out.set(String(d.steamId), d.name || f.replace('.yaml', ''));
    } catch {
      /* skip unparsable */
    }
  }
  return out;
}

async function getScoreboard(matchId) {
  const cachePath = path.join(CACHE_DIR, matchId + '.json');
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch {
      /* refetch */
    }
  }
  const txt = await fetchText(`${BASE}/scoreboard/${matchId}.json`);
  await sleep(DELAY_MS);
  if (txt == null) return null;
  let sb;
  try {
    sb = JSON.parse(txt);
  } catch {
    return null;
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(sb));
  return sb;
}

async function enumeratePlayer(steamId, gt, wanted) {
  // Adds match ids with timestamp >= CUTOFF to `wanted`. Uses the match rows'
  // data-timestamp attributes so no scoreboard fetches happen during
  // enumeration; falls back to fetching a scoreboard only if they are absent.
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${BASE}/matches/player/${steamId}/${gt}/${page ? page + '/' : ''}`;
    const html = await fetchText(url);
    await sleep(DELAY_MS);
    if (html == null) break;
    const pageIds = [...html.matchAll(/\/scoreboard\/([0-9a-f-]{36})/g)].map((m) => m[1]);
    if (pageIds.length === 0) break;
    const pageTs = [...html.matchAll(/data-timestamp="(\d+)"/g)].map((m) => Number(m[1]));
    let oldestTs = Infinity;
    if (pageTs.length === pageIds.length) {
      for (let i = 0; i < pageIds.length; i++) {
        oldestTs = Math.min(oldestTs, pageTs[i]);
        if (pageTs[i] >= CUTOFF) wanted.add(pageIds[i]);
      }
    } else {
      // Fallback: timestamps not parseable; take the whole page and let the
      // scoreboard fetch phase filter by window. Use last id's scoreboard for
      // the stop check.
      for (const mid of pageIds) wanted.add(mid);
      const sb = await getScoreboard(pageIds[pageIds.length - 1]);
      if (sb && sb.summary && sb.summary.timestamp != null) oldestTs = sb.summary.timestamp;
    }
    if (oldestTs < CUTOFF) break; // reached pre-gap territory, stop paging
  }
}

async function main() {
  console.log(`=== Backfill HoQ history from QLLR scoreboards (${DRY_RUN ? 'dry-run' : 'write'}) ===`);
  console.log(`Cutoff: ${new Date(CUTOFF * 1000).toISOString()} | delay ${DELAY_MS}ms`);

  const registry = getRegistry();
  let players = [...registry.keys()];
  if (ONLY_PLAYERS) {
    const want = new Set(ONLY_PLAYERS.split(','));
    players = players.filter((p) => want.has(p));
  }
  console.log(`Registry players: ${players.length}`);
  const playerSet = new Set(players);

  // Phase 1: enumerate match ids in the window (cheap HTML pages only)
  const wanted = new Set();
  let done = 0;
  for (const sid of players) {
    for (const gt of GAMETYPES) {
      await enumeratePlayer(sid, gt, wanted);
    }
    done++;
    if (done % 10 === 0) console.log(`  enumerated ${done}/${players.length} players, ${wanted.size} unique matches so far`);
  }
  console.log(`Enumeration done: ${wanted.size} unique matches to fetch`);

  // Phase 2: fetch scoreboards (deduped, cached on disk)
  const boards = [];
  let fetched = 0;
  for (const mid of wanted) {
    const sb = await getScoreboard(mid);
    fetched++;
    if (fetched % 100 === 0) console.log(`  scoreboards ${fetched}/${wanted.size}`);
    if (sb && sb.summary && sb.summary.timestamp >= CUTOFF) boards.push(sb);
  }
  console.log(`Unique scoreboards in window: ${boards.length} (of ${wanted.size} fetched)`);

  // Phase 3: per-player points from scoreboards
  const points = new Map(); // steamId -> [{timestamp, gt, rating}]
  for (const sb of boards) {
    const gt = sb.summary.gt_short;
    if (!GAMETYPES.includes(gt)) continue;
    const overall = sb.team_stats && sb.team_stats.overall;
    if (!Array.isArray(overall)) continue;
    for (const p of overall) {
      const sid = String(p.steam_id);
      if (!playerSet.has(sid)) continue;
      if (!p.rating || p.rating.new == null) continue;
      if (!points.has(sid)) points.set(sid, []);
      points.get(sid).push({ timestamp: sb.summary.timestamp, gt, rating: p.rating.new });
    }
  }

  // Phase 4: merge into history files
  let totalInserted = 0;
  let filesTouched = 0;
  for (const [sid, pts] of points) {
    const histPath = path.join(HOQ_DIR, sid, 'history.json');
    let hist = [];
    if (fs.existsSync(histPath)) {
      try {
        hist = JSON.parse(fs.readFileSync(histPath, 'utf8'));
      } catch (e) {
        console.error(`  SKIP ${registry.get(sid)}: unreadable history.json (${e.message})`);
        continue;
      }
    }
    if (!Array.isArray(hist)) continue;

    let inserted = 0;
    for (const gt of GAMETYPES) {
      const cand = pts.filter((p) => p.gt === gt).sort((a, b) => a.timestamp - b.timestamp);
      if (cand.length === 0) continue;
      const existing = hist.filter((h) => h.gametype_short === gt);
      const existingTs = new Set(existing.map((h) => h.timestamp));
      // Anchor: last old-era point; ceiling: first append-era point (if any)
      const before = existing.filter((h) => h.timestamp < APPEND_BOUNDARY);
      const after = existing.filter((h) => h.timestamp >= APPEND_BOUNDARY);
      const anchorNum = before.length ? before[before.length - 1].game_num : 0;
      const anchorTs = before.length ? before[before.length - 1].timestamp : 0;
      const ceilTs = after.length ? after[0].timestamp : Infinity;
      const ceilNum = after.length ? after[0].game_num : Infinity;

      let n = anchorNum;
      const newPts = [];
      for (const c of cand) {
        if (c.timestamp <= anchorTs || c.timestamp >= ceilTs) continue; // outside the gap window
        if (existingTs.has(c.timestamp)) continue; // duplicate guard (idempotency)
        n++;
        newPts.push({ timestamp: c.timestamp, gametype_short: gt, rating: c.rating, game_num: n });
      }
      if (n > ceilNum) {
        console.warn(`  WARN ${registry.get(sid)} ${gt}: backfill count overruns post-gap game_num (${n} > ${ceilNum}); inserting anyway, game numbers approximate`);
      }
      hist.push(...newPts);
      inserted += newPts.length;
      const expected = ceilNum !== Infinity ? ceilNum - anchorNum : null;
      if (newPts.length || expected) {
        console.log(
          `  ${registry.get(sid)} ${gt}: +${newPts.length} points${expected != null ? ` (games gap was ${expected}, coverage ${expected > 0 ? Math.round((100 * newPts.length) / expected) : 100}%)` : ''}`
        );
      }
    }
    if (inserted > 0) {
      hist.sort((a, b) => a.timestamp - b.timestamp);
      if (!DRY_RUN) {
        fs.mkdirSync(path.dirname(histPath), { recursive: true });
        fs.writeFileSync(histPath, JSON.stringify(hist));
      }
      filesTouched++;
      totalInserted += inserted;
    }
  }

  console.log('--- Summary ---');
  console.log(`Inserted ${totalInserted} points across ${filesTouched} players${DRY_RUN ? ' (dry-run, nothing written)' : ''}`);
  console.log(`Scoreboard cache: ${CACHE_DIR} (safe to delete after a successful commit)`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
