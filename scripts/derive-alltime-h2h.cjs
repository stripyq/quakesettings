#!/usr/bin/env node
/**
 * Derive the all-time CTF head-to-head dataset for registered players from the local match
 * archive. Replaces build-alltime-h2h.cjs + filter-h2h-to-featured.cjs (which scraped the dead
 * 88.x HoQ server).
 *
 * For every archived CTF match, every pair of players who are both in
 * src/data/player-registry.json is counted as teammates or opponents, with per-map opponent
 * records, in the same record shape derive-archive.cjs uses for <gt>/h2h-featured.json
 * (read by getAllTimeH2H / getAllTimeH2HMaps on the compare page):
 *   "<a>|<b>": { a, b, as_opp, a_wins_vs_b, b_wins_vs_a, as_mates, mates_wins,
 *                maps: { <map>: { a_wins, b_wins, opp } } | null }    (a < b; maps null if never opponents)
 * Matches without a winner count in as_opp / as_mates but as nobody's win.
 *
 * Writes:
 *   public/data/alltime-h2h.json           all registered pairs (gitignored, large)
 *   public/data/alltime-h2h-featured.json  pairs where both players have a published profile
 *
 * Then cross-checks random pairs against hoqstats.vercel.app's all-time pairwise team-result
 * file (ctf|__all__) and reports mismatches.
 *
 * Usage:
 *   node scripts/derive-alltime-h2h.cjs                # derive + check 20 pairs
 *   node scripts/derive-alltime-h2h.cjs --check 50 --seed 7
 *   node scripts/derive-alltime-h2h.cjs --check 0      # no network
 *   --refresh-cache   re-download the pairwise file
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const H = require('./lib/hoqstats.cjs');

const ROOT = path.resolve(__dirname, '..');
const GT = 'ctf';
const ARCHIVE = path.join(ROOT, 'public/data/archive', `${GT}.jsonl`);
const REGISTRY_PATH = path.join(ROOT, 'src/data/player-registry.json');
const PLAYERS_DIR = path.join(ROOT, 'src/content/players');
const OUTPUT_PATH = path.join(ROOT, 'public/data/alltime-h2h.json');
const FEATURED_PATH = path.join(ROOT, 'public/data/alltime-h2h-featured.json');

const argv = process.argv.slice(2);
function opt(name, dflt) {
  const i = argv.findIndex(a => a === name || a.startsWith(name + '='));
  if (i < 0) return dflt;
  return argv[i].includes('=') ? argv[i].slice(name.length + 1) : argv[i + 1];
}
const CHECK_N = parseInt(opt('--check', '20'), 10);
const SEED = Number(opt('--seed', Date.now() % 1e9));
const REFRESH = argv.includes('--refresh-cache');

// Same rule as filter-h2h-to-featured.cjs: published unless `published: false`.
function publishedSteamIds() {
  const ids = new Set();
  for (const file of fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'))) {
    const content = fs.readFileSync(path.join(PLAYERS_DIR, file), 'utf8');
    const sid = content.match(/^steamId:\s*["']?(\d{17})["']?\s*$/m);
    if (!sid) continue;
    const pub = content.match(/^published:\s*(\S+)/m);
    if (pub && pub[1].trim().toLowerCase() === 'false') continue;
    ids.add(sid[1]);
  }
  return ids;
}

async function derive(registry) {
  const pairs = new Map();
  const seen = new Set();
  let matches = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(ARCHIVE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (seen.has(m.uuid)) continue;
    seen.add(m.uuid);
    matches++;
    const ps = m.players.filter(p => p && p.sid && registry.has(p.sid));
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const A = ps[i];
        const B = ps[j];
        if (A.sid === B.sid) continue;
        const [lo, hi] = A.sid < B.sid ? [A, B] : [B, A];
        const key = `${lo.sid}|${hi.sid}`;
        let r = pairs.get(key);
        if (!r) {
          r = { a: lo.sid, b: hi.sid, as_opp: 0, a_wins_vs_b: 0, b_wins_vs_a: 0, as_mates: 0, mates_wins: 0, maps: null };
          pairs.set(key, r);
        }
        if (lo.team === hi.team) {
          r.as_mates++;
          if (m.winner && lo.team === m.winner) r.mates_wins++;
          continue;
        }
        r.as_opp++;
        const mapName = m.map || 'unknown';
        if (!r.maps) r.maps = {};
        const mm = r.maps[mapName] || (r.maps[mapName] = { a_wins: 0, b_wins: 0, opp: 0 });
        mm.opp++;
        if (m.winner === lo.team) { r.a_wins_vs_b++; mm.a_wins++; }
        else if (m.winner === hi.team) { r.b_wins_vs_a++; mm.b_wins++; }
      }
    }
  }
  return { pairs, matches };
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Upstream rows: [iA, iB, sameW, sameL, sameD, vsW, vsL, vsD], results from A's side.
async function crossCheck(pairs, n) {
  const page = (await H.fetchText('/matches/', { refresh: REFRESH, maxAgeMs: 60 * 60 * 1000 })).text;
  const scope = `${GT}|__all__`;
  const file = H.extractAssignment(page, 'HOQ_MATCH_PAIRWISE_FILES')[scope];
  if (!file) throw new Error(`No pairwise file for ${scope}`);
  const text = (await H.fetchText(`/matches/${file}`, { refresh: REFRESH, maxAgeMs: 60 * 60 * 1000 })).text;
  const raw = H.extractAssignment(text, `HOQ_MATCH_PAIRWISE_RAW[${JSON.stringify(scope)}]`);
  const upstream = new Map();
  for (const row of raw.r) {
    const A = String(raw.p[row[0]]);
    const B = String(raw.p[row[1]]);
    const [sameW, sameL, sameD, vsW, vsL, vsD] = row.slice(2);
    // Re-orient to sorted (a, b) like our records.
    const flip = A > B;
    upstream.set(flip ? `${B}|${A}` : `${A}|${B}`, {
      as_mates: sameW + sameL + sameD, mates_wins: sameW,
      as_opp: vsW + vsL + vsD, a_wins_vs_b: flip ? vsL : vsW, b_wins_vs_a: flip ? vsW : vsL,
    });
  }
  const candidates = [...pairs.keys()].filter(k => upstream.has(k)).sort();
  const rand = mulberry32(SEED);
  const sample = [];
  while (sample.length < n && candidates.length) sample.push(candidates.splice(Math.floor(rand() * candidates.length), 1)[0]);
  console.log(`\nCross-check vs ${file} (${raw.r.length} upstream pairs, seed ${SEED}):`);
  let mismatched = 0;
  for (const key of sample) {
    const ours = pairs.get(key);
    const up = upstream.get(key);
    const fields = ['as_opp', 'a_wins_vs_b', 'b_wins_vs_a', 'as_mates', 'mates_wins'];
    const diffs = fields.filter(f => ours[f] !== up[f]);
    if (diffs.length) mismatched++;
    console.log(`  ${diffs.length ? 'MISMATCH' : 'ok      '} ${key}  ` +
      fields.map(f => (ours[f] === up[f] ? `${f}=${ours[f]}` : `${f}=${ours[f]}/${up[f]}`)).join(' '));
  }
  console.log(`  ${sample.length - mismatched}/${sample.length} pairs identical` + (mismatched ? ` (ours/upstream shown for differing fields)` : ''));
  return mismatched;
}

(async () => {
  const reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const registry = new Set((reg.players || []).map(p => String(p.steamId || '')).filter(Boolean));
  const { pairs, matches } = await derive(registry);
  const sortedKeys = [...pairs.keys()].sort();
  const all = Object.fromEntries(sortedKeys.map(k => [k, pairs.get(k)]));
  const published = publishedSteamIds();
  const featured = Object.fromEntries(sortedKeys
    .filter(k => { const r = pairs.get(k); return published.has(r.a) && published.has(r.b); })
    .map(k => [k, pairs.get(k)]));
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(all));
  fs.writeFileSync(FEATURED_PATH, JSON.stringify(featured));
  console.log(`${matches} ${GT} matches, ${registry.size} registered players, ${published.size} published profiles`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} (${sortedKeys.length} pairs) and ` +
    `${path.relative(ROOT, FEATURED_PATH)} (${Object.keys(featured).length} pairs)`);
  if (CHECK_N > 0) await crossCheck(pairs, CHECK_N);
})().catch(err => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
