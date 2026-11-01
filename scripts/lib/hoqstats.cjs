/**
 * Shared helpers for reading the HoQ match data published on https://hoqstats.vercel.app.
 *
 * The site is a static nightly build. Its data lives in plain JS files that assign JSON
 * literals to window globals, e.g.
 *   window.HOQ_MATCH_ROUTE_META["ctf-y2026-s4"]={...};
 *   window.HOQ_MATCH_DETAIL_CHUNKS["data/details/chunk-400.js"]=[{...}, ...];
 * extractAssignment() pulls exactly one such literal out of a file with a bracket-aware
 * scanner and JSON.parse. Nothing is ever evaluated (no vm, no eval).
 *
 * Exports:
 *   fetchText(srcPath, opts)        HTTPS GET (polite UA, 500 ms spacing, retries) + disk cache
 *   extractAssignment(text, name)   JSON value assigned to window.<name>
 *   parseIndexRow(row)              positional match-index row -> object
 *   normalizeDetail(detail)         vercel detail record -> public/data/archive/<gt>.jsonl record
 *   seasonWindowSec(season)         [startSec, endSec) for a HOQ_MATCH_SEASONS entry
 *
 * Cache: data-archive/hoqstats-cache/<source path>. Detail chunks are cached indefinitely
 * (callers re-fetch a chunk when an id they expect is missing from the cached copy).
 * Index/page files change nightly, so callers pass maxAgeMs for those. refresh: true skips
 * the cache entirely (scripts expose this as --refresh-cache).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BASE_URL = 'https://hoqstats.vercel.app';
const USER_AGENT = 'quakesettings-bot/1.0 (+https://stripyq.github.io/quakesettings/)';
const CACHE_DIR = path.join(ROOT, 'data-archive/hoqstats-cache');
const REQUEST_GAP_MS = 500;
const MAX_ATTEMPTS = 4;
const TIMEOUT_MS = 120000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
let lastRequestAt = 0;

// ---------- HTTP + cache ----------

function cachePathFor(srcPath) {
  const clean = srcPath.replace(/^\/+/, '').replace(/\/$/, '/index.html');
  if (!clean || clean.split('/').some(seg => seg === '..' || seg === '')) {
    throw new Error(`Refusing odd source path: ${srcPath}`);
  }
  return path.join(CACHE_DIR, ...clean.split('/'));
}

async function httpGet(srcPath) {
  const url = BASE_URL + srcPath;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: ctrl.signal });
      if (res.status === 404) throw Object.assign(new Error(`404 Not Found: ${url}`), { fatal: true });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (err.fatal) throw err;
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        const backoff = 1000 * 2 ** (attempt - 1);
        console.warn(`  GET ${srcPath} failed (${err.message}); retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoff} ms`);
        await sleep(backoff);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`GET ${url} failed after ${MAX_ATTEMPTS} attempts: ${lastErr && lastErr.message}`);
}

/**
 * Fetch a site path (e.g. '/matches/data/details/chunk-400.js'), via the disk cache.
 *   refresh: true   ignore any cached copy
 *   maxAgeMs: n     treat a cached copy older than n ms as stale
 * Returns { text, fromCache }.
 */
async function fetchText(srcPath, { refresh = false, maxAgeMs = Infinity } = {}) {
  const file = cachePathFor(srcPath);
  if (!refresh && fs.existsSync(file)) {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (age <= maxAgeMs) return { text: fs.readFileSync(file, 'utf8'), fromCache: true };
  }
  const text = await httpGet(srcPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  return { text, fromCache: false };
}

// ---------- literal extraction ----------

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Index just past the JSON literal starting at text[start]. Throws on anything that is not
// a well-formed JSON-ish literal (JSON.parse does the final validation).
function scanLiteral(text, start) {
  const c = text[start];
  if (c === '{' || c === '[') {
    const stack = [];
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        while (i < text.length && text[i] !== '"') {
          if (text[i] === '\\') i++;
          i++;
        }
        if (i >= text.length) break;
        continue;
      }
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') {
        const open = stack.pop();
        if ((ch === '}' && open !== '{') || (ch === ']' && open !== '[')) {
          throw new Error(`Mismatched '${ch}' at offset ${i}`);
        }
        if (stack.length === 0) return i + 1;
      }
    }
    throw new Error(`Unterminated literal starting at offset ${start}`);
  }
  if (c === '"') {
    let i = start + 1;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') i++;
      i++;
    }
    if (i >= text.length) throw new Error(`Unterminated string at offset ${start}`);
    return i + 1;
  }
  const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(start, start + 64));
  if (m) return start + m[0].length;
  throw new Error(`Not a JSON literal at offset ${start}: ${JSON.stringify(text.slice(start, start + 40))}`);
}

/**
 * Return the JSON value assigned to window.<name>. `name` may carry a bracket key,
 * e.g. 'HOQ_MATCH_ROUTE_META["ctf"]'. There must be exactly one such assignment and its
 * right-hand side must be a single JSON literal followed by ';', '<', a newline or EOF.
 */
function extractAssignment(text, name) {
  // The lookahead stops HOQ_MATCH_INDEX from matching HOQ_MATCH_INDEX_RAW; (?!=) skips '=='.
  const re = new RegExp(`window\\.${escapeRegExp(name)}(?![\\w$\\[])\\s*=(?!=)\\s*`, 'g');
  const hits = [...text.matchAll(re)];
  if (hits.length !== 1) throw new Error(`Expected exactly one assignment to window.${name}, found ${hits.length}`);
  const start = hits[0].index + hits[0][0].length;
  const end = scanLiteral(text, start);
  let after = end;
  while (after < text.length && (text[after] === ' ' || text[after] === '\t')) after++;
  if (after < text.length && !';\r\n<'.includes(text[after])) {
    throw new Error(`Unexpected ${JSON.stringify(text.slice(after, after + 20))} after window.${name} literal`);
  }
  try {
    return JSON.parse(text.slice(start, end));
  } catch (err) {
    throw new Error(`window.${name} is not valid JSON: ${err.message}`);
  }
}

// ---------- index rows ----------

// [matchId, playedAt(sec), gametype, arena, duration "mm:ss", redScore, blueScore, winner, avgRating, chunkFile, search]
function parseIndexRow(row) {
  if (!Array.isArray(row) || row.length < 10 || typeof row[0] !== 'string' || !Number.isFinite(row[1])) {
    throw new Error(`Malformed index row: ${JSON.stringify(row).slice(0, 120)}`);
  }
  return {
    matchId: row[0], playedAt: row[1], gametype: String(row[2]).toLowerCase(), arena: row[3],
    duration: row[4], red: row[5], blue: row[6], winner: row[7], avgRating: row[8], chunk: row[9],
  };
}

// ---------- normalizer ----------

// Archive weapon keys: these seven always, lg/hmg only when someone in the match used them
// (the old HoQ scoreboard showed a column per weapon used in the match).
const BASE_WEAPONS = ['gt', 'mg', 'sg', 'gl', 'rl', 'rg', 'pg'];
const OPTIONAL_WEAPONS = ['lg', 'hmg'];
const KNOWN_WEAPONS = new Set([...BASE_WEAPONS, ...OPTIONAL_WEAPONS]);
// Archive medal keys present on every player (null when zero); other medals (perforated,
// quadgod, rampage) on every player of a match where anyone earned them, like lg/hmg.
const BASE_MEDALS = ['assists', 'captures', 'combokill', 'defends', 'excellent', 'firstfrag',
  'headshot', 'humiliation', 'impressive', 'midair', 'revenge'];
const NO_SCORE = -999;

// The archive stores counters the HoQ scoreboard left blank (zero) as null.
const nz = v => (v == null || v === 0 ? null : v);
const num = v => (v == null ? null : v);
const round2 = n => Math.round(n * 100) / 100;

function parseDuration(d) {
  if (Number.isFinite(d)) return d;
  const parts = String(d).split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) {
    throw new Error(`Unparseable duration: ${JSON.stringify(d)}`);
  }
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

function normalizeWeapon(w) {
  if (!w) return { kills: null, hits: null, shots: null, acc: null };
  return { kills: nz(w.frags), hits: nz(w.hits), shots: nz(w.shots), acc: nz(w.acc) };
}

function normalizePlayer(p, gt, weaponKeys, medalKeys) {
  const s = p.summary || {};
  if (!p.steamId) throw new Error('player without steamId');
  if (p.team !== 'red' && p.team !== 'blue') throw new Error(`player ${p.steamId} has team ${JSON.stringify(p.team)}`);
  const weapons = {};
  for (const wk of weaponKeys) weapons[wk] = normalizeWeapon(p.weapons && p.weapons[wk]);
  const src = p.medals || {};
  const medals = {};
  for (const mk of medalKeys) medals[mk] = nz(src[mk]);
  // diff 0 is upstream's "no rating update recorded" row, carrying a placeholder rating (often
  // 0.04 or 0.13). Of the 97 such rows in matches also in the 88.x archive, 94 were null there
  // or had a different real rating, so they are stored as unrated, like the archive did.
  const rated = s.new_rating != null && s.diff != null && s.diff !== 0;
  const newRating = rated ? s.new_rating : null;
  const diff = rated ? s.diff : null;
  const isCtf = gt === 'ctf';
  return {
    sid: String(p.steamId),
    nick: p.nick == null ? null : String(p.nick),
    team: p.team,
    score: num(s.score),
    frags: num(s.frags),
    deaths: num(s.deaths),
    // TDM scoreboards never carried flag columns; the archive keeps them null there.
    caps: isCtf ? nz(s.captures) : null,
    assists: isCtf ? nz(s.assists) : null,
    defends: isCtf ? nz(s.defends) : null,
    dmg_dealt: num(s.damage_dealt),
    dmg_taken: num(s.damage_taken),
    // Upstream has no per-player play time unless summary.time is present; consumers fall back
    // to the match duration.
    time_sec: s.time == null ? null : parseDuration(s.time),
    old_rating: rated ? round2(newRating - diff) : null,
    new_rating: newRating,
    rating_diff: diff,
    weapons,
    medals,
  };
}

/** Convert a hoqstats detail record into a public/data/archive/<gt>.jsonl record. */
function normalizeDetail(d) {
  if (!d || typeof d.matchId !== 'string') throw new Error('detail record without matchId');
  const gt = String(d.gametype || '').toLowerCase();
  if (gt !== 'ctf' && gt !== 'tdm') throw new Error(`${d.matchId}: unsupported gametype ${d.gametype}`);
  if (!Number.isFinite(d.playedAt)) throw new Error(`${d.matchId}: bad playedAt`);
  if (!Array.isArray(d.players) || d.players.length === 0) throw new Error(`${d.matchId}: no players`);
  for (const p of d.players) {
    for (const wk of Object.keys(p.weapons || {})) {
      if (!KNOWN_WEAPONS.has(wk)) throw new Error(`${d.matchId}: unknown weapon code ${wk}`);
    }
  }
  const weaponKeys = [...BASE_WEAPONS];
  for (const wk of OPTIONAL_WEAPONS) {
    if (d.players.some(p => p.weapons && p.weapons[wk])) weaponKeys.push(wk);
  }
  const extraMedals = new Set();
  for (const p of d.players) {
    for (const [mk, v] of Object.entries(p.medals || {})) if (!BASE_MEDALS.includes(mk) && nz(v) != null) extraMedals.add(mk);
  }
  const medalKeys = [...BASE_MEDALS, ...[...extraMedals].sort()];
  const players = d.players.map(p => {
    try { return normalizePlayer(p, gt, weaponKeys, medalKeys); } catch (e) { throw new Error(`${d.matchId}: ${e.message}`); }
  });
  // Upstream marks matches without a final score as -999 : -999 with winner "draw".
  const teamScore = v => (v == null || v === NO_SCORE ? null : v);
  const red = d.scores ? teamScore(d.scores.red) : null;
  const blue = d.scores ? teamScore(d.scores.blue) : null;
  // Draws (and anything without a red/blue winner) keep winner null: derives count neither W nor L.
  const winner = red != null && red === blue ? null
    : (d.winner === 'red' || d.winner === 'blue' ? d.winner : null);
  // Archive rating_diff = mean pre-match rating of red minus blue, 2 dp (matches 99.9% of the
  // 88.x-scraped records).
  const avgOld = team => {
    const xs = players.filter(p => p.team === team && p.old_rating != null).map(p => p.old_rating);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const ar = avgOld('red');
  const ab = avgOld('blue');
  return {
    uuid: d.matchId,
    ts: d.playedAt,
    gt,
    map: String(d.arena || '').toLowerCase() || null,
    duration_sec: d.duration == null ? null : parseDuration(d.duration),
    rating_diff: ar != null && ab != null ? round2(ar - ab) : null,
    scores: { blue, red },
    winner,
    players,
  };
}

// ---------- seasons ----------

/** [startSec, endSec) for a HOQ_MATCH_SEASONS entry (ms timestamps, endTs may be "Infinity"). */
function seasonWindowSec(season) {
  const end = season.endTs === 'Infinity' || season.endTs == null ? Infinity : Number(season.endTs) / 1000;
  return [Number(season.startTs) / 1000, end];
}

module.exports = {
  BASE_URL,
  USER_AGENT,
  CACHE_DIR,
  fetchText,
  extractAssignment,
  parseIndexRow,
  parseDuration,
  normalizeDetail,
  seasonWindowSec,
};
