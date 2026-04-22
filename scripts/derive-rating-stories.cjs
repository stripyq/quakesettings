#!/usr/bin/env node
/**
 * Derive "rating stories" from public/data/archive/<gt>.jsonl — the raw
 * material for the /stats/ ALL-TIME ARCHIVE section:
 *
 *   - Volatility leaderboard: players whose rating bounces most
 *     (stddev of per-match rating_diff, min 200 games).
 *   - Comeback stories: players who dropped ≥ MIN_DROP points from a
 *     peak, then later exceeded that peak. Sorted by drop magnitude.
 *
 * Walks archive chronologically per player, building a rating timeline
 * (old_rating, new_rating are present on every player entry per match).
 *
 * Output: public/data/<gt>/rating-stories.json
 *   {
 *     volatility: [ { sid, nick, games, stddev, range, peak, trough } ...10 ],
 *     comebacks:  [ { sid, nick, fromPeak, toTrough, drop, newPeak,
 *                     peakAt, troughAt, newPeakAt } ... ]
 *   }
 *
 * Usage:
 *   node scripts/derive-rating-stories.cjs --gt=ctf
 *   node scripts/derive-rating-stories.cjs --gt=ctf,tdm
 *   node scripts/derive-rating-stories.cjs --gt=ctf --min-games=300 --min-drop=10
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SUPPORTED_GT = new Set(['ctf', 'tdm']);

// ---------- CLI ----------
const args = process.argv.slice(2);
const getArg = (k, d) => {
  const a = args.find(x => x.startsWith(k + '='));
  return a ? a.slice(k.length + 1) : d;
};
const gtArg = getArg('--gt', '');
if (!gtArg) {
  console.error('Missing --gt=<gametype>[,<gametype>...]');
  process.exit(1);
}
const GTS = gtArg.split(',').map(s => s.trim()).filter(Boolean);
for (const gt of GTS) {
  if (!SUPPORTED_GT.has(gt)) {
    console.error(`Unknown gametype: ${gt}`);
    process.exit(1);
  }
}
const MIN_GAMES = parseInt(getArg('--min-games', '200'), 10);
const MIN_DROP = parseFloat(getArg('--min-drop', '8'));
const TOP_N_VOLATILITY = parseInt(getArg('--top-volatility', '10'), 10);
const TOP_N_COMEBACKS = parseInt(getArg('--top-comebacks', '10'), 10);

// ---------- helpers ----------
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
const round2 = n => Math.round(n * 100) / 100;
function stddev(arr) {
  if (arr.length < 2) return 0;
  const mu = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((a, b) => a + (b - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

// Pick a stable display nick per sid. Prefer the most-used nick across
// that player's match entries, falling back to the first one seen.
function pickNick(nickCounts) {
  let best = null, bestCount = -1;
  for (const [n, c] of nickCounts.entries()) {
    if (c > bestCount) { best = n; bestCount = c; }
  }
  return best;
}

// ---------- per-gametype ----------
async function deriveOne(gt) {
  const ARCHIVE = path.join(ROOT, 'public/data/archive', `${gt}.jsonl`);
  const OUT_DIR = path.join(ROOT, 'public/data', gt);
  if (!fs.existsSync(ARCHIVE)) {
    console.error(`[${gt}] archive not found: ${ARCHIVE}`);
    return false;
  }
  ensureDir(OUT_DIR);

  // Per-sid: timeline = [{ts, old, new, diff}]; nickCounts = Map<nick,count>
  const agg = new Map();
  const getP = sid => {
    let p = agg.get(sid);
    if (!p) {
      p = { timeline: [], nicks: new Map() };
      agg.set(sid, p);
    }
    return p;
  };

  const stream = fs.createReadStream(ARCHIVE);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let matches = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let g;
    try { g = JSON.parse(line); } catch { continue; }
    if (!g.players || g.ts == null) continue;
    matches++;
    for (const pl of g.players) {
      if (!pl.sid) continue;
      // old_rating / new_rating can be null early in a player's career
      // when HoQ hadn't computed one yet. Skip those entries — they'd
      // inject spurious volatility spikes.
      if (pl.old_rating == null || pl.new_rating == null) continue;
      const p = getP(pl.sid);
      p.timeline.push({
        ts: g.ts,
        old: pl.old_rating,
        new: pl.new_rating,
        diff: pl.new_rating - pl.old_rating,
      });
      if (pl.nick) p.nicks.set(pl.nick, (p.nicks.get(pl.nick) || 0) + 1);
    }
  }
  console.log(`[${gt}] matches parsed: ${matches}, unique sids: ${agg.size}`);

  // Sort each timeline by ts (archive order isn't guaranteed chronological).
  for (const p of agg.values()) p.timeline.sort((a, b) => a.ts - b.ts);

  // ---------- volatility ----------
  const volatilityRows = [];
  for (const [sid, p] of agg.entries()) {
    if (p.timeline.length < MIN_GAMES) continue;
    const diffs = p.timeline.map(t => t.diff);
    const sd = stddev(diffs);
    const newRatings = p.timeline.map(t => t.new);
    const peak = Math.max(...newRatings);
    const trough = Math.min(...newRatings);
    volatilityRows.push({
      sid,
      nick: pickNick(p.nicks),
      games: p.timeline.length,
      stddev: round2(sd),
      range: round2(peak - trough),
      peak: round2(peak),
      trough: round2(trough),
    });
  }
  // Sort by range (peak − trough) for a readable "biggest rating swing"
  // story. stddev is kept in the row as a secondary column for readers
  // who care about per-match bounciness vs pure career span.
  volatilityRows.sort((a, b) => b.range - a.range);
  const volatility = volatilityRows.slice(0, TOP_N_VOLATILITY);

  // ---------- comebacks ----------
  // Walk chronologically. Track running peak and the trough since that
  // peak. Record the MAX drawdown event per player, then check whether
  // the player later exceeded the pre-drawdown peak → comeback.
  const comebackRows = [];
  for (const [sid, p] of agg.entries()) {
    if (p.timeline.length < MIN_GAMES) continue;
    let peakSoFar = -Infinity, peakAt = null;
    let troughAfterPeak = Infinity, troughAt = null;
    // Max drawdown seen so far for this player.
    let dd = { drop: 0, peak: null, peakAt: null, trough: null, troughAt: null, troughIdx: -1 };
    p.timeline.forEach((t, i) => {
      if (t.new > peakSoFar) {
        peakSoFar = t.new;
        peakAt = t.ts;
        troughAfterPeak = t.new;
        troughAt = t.ts;
      } else if (t.new < troughAfterPeak) {
        troughAfterPeak = t.new;
        troughAt = t.ts;
        const drop = peakSoFar - troughAfterPeak;
        if (drop > dd.drop) {
          dd = { drop, peak: peakSoFar, peakAt, trough: troughAfterPeak, troughAt, troughIdx: i };
        }
      }
    });
    if (dd.drop < MIN_DROP || dd.troughIdx < 0) continue;
    // Did they later exceed the pre-drawdown peak?
    let newPeak = -Infinity, newPeakAt = null;
    for (let i = dd.troughIdx + 1; i < p.timeline.length; i++) {
      if (p.timeline[i].new > newPeak) {
        newPeak = p.timeline[i].new;
        newPeakAt = p.timeline[i].ts;
      }
    }
    if (newPeak <= dd.peak) continue;
    comebackRows.push({
      sid,
      nick: pickNick(p.nicks),
      games: p.timeline.length,
      fromPeak: round2(dd.peak),
      toTrough: round2(dd.trough),
      drop: round2(dd.drop),
      newPeak: round2(newPeak),
      peakAt: dd.peakAt,
      troughAt: dd.troughAt,
      newPeakAt,
    });
  }
  // Sort by drop magnitude desc — biggest comeback narrative first.
  comebackRows.sort((a, b) => b.drop - a.drop);
  const comebacks = comebackRows.slice(0, TOP_N_COMEBACKS);

  const out = { volatility, comebacks };
  const outPath = path.join(OUT_DIR, 'rating-stories.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[${gt}] wrote ${outPath}`);
  console.log(`[${gt}] volatility: ${volatility.length}, comebacks: ${comebacks.length} (of ${comebackRows.length} candidates)`);
  return true;
}

// ---------- main ----------
(async () => {
  const results = [];
  for (const gt of GTS) {
    const ok = await deriveOne(gt);
    results.push({ gt, ok });
  }
  console.log(`\n========== Summary ==========`);
  for (const r of results) console.log(`  ${r.gt}: ${r.ok ? 'done' : 'FAILED'}`);
})().catch(e => { console.error(e); process.exit(1); });
