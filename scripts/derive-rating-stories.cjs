#!/usr/bin/env node
/**
 * Derive "rating stories" from public/data/archive/<gt>.jsonl — the raw
 * material for the /stats/ ALL-TIME ARCHIVE section.
 *
 * Volatility leaderboard: players with the widest rating range (peak −
 * trough) after HoQ calibration. Skips each player's first MIN_WARMUP_GAMES
 * (~50) to exclude the calibration period where new players' ratings
 * swing wildly before converging. Requires MIN_GAMES (200) additional
 * games after the warmup for the sample to be meaningful. Also reports
 * swingGames — matches between peak and trough — for a cleaner narrative
 * ("X points over Y games") than raw career length.
 *
 * Walks archive chronologically per player, building a rating timeline
 * (old_rating, new_rating are present on every player entry per match).
 *
 * Output: public/data/<gt>/rating-stories.json
 *   {
 *     volatility: [ { sid, nick, games, swingGames, peakFirst,
 *                     stddev, range, peak, trough } ...10 ]
 *   }
 *
 * Usage:
 *   node scripts/derive-rating-stories.cjs --gt=ctf
 *   node scripts/derive-rating-stories.cjs --gt=ctf,tdm
 *   node scripts/derive-rating-stories.cjs --gt=ctf --min-games=300
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
const TOP_N_VOLATILITY = parseInt(getArg('--top-volatility', '10'), 10);
// HoQ's rating system takes ~50 games to converge on a new player's true
// skill. During that window ratings swing wildly (including into negatives)
// and the peak/trough both reflect calibration noise, not career arc. Skip
// it so "biggest swing" measures post-calibration reality.
const MIN_WARMUP_GAMES = parseInt(getArg('--min-warmup', '50'), 10);

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
  // Skip the first MIN_WARMUP_GAMES entries per player — they're HoQ
  // calibration noise, not career signal. Still require MIN_GAMES entries
  // AFTER the warmup so small-sample players ("beautiful far away" @ 221g)
  // don't sneak in with a 50-game effective career.
  //
  // Track peak/trough INDEXES (not just values) so we can report how many
  // matches the player took to travel between them — "36.6 points over
  // 847 games" is a much better narrative than "over 1132 total games".
  const volatilityRows = [];
  for (const [sid, p] of agg.entries()) {
    if (p.timeline.length < MIN_WARMUP_GAMES + MIN_GAMES) continue;
    const effective = p.timeline.slice(MIN_WARMUP_GAMES);
    const diffs = effective.map(t => t.diff);
    const sd = stddev(diffs);
    let peak = -Infinity, peakIdx = 0;
    let trough = Infinity, troughIdx = 0;
    effective.forEach((t, i) => {
      if (t.new > peak) { peak = t.new; peakIdx = i; }
      if (t.new < trough) { trough = t.new; troughIdx = i; }
    });
    volatilityRows.push({
      sid,
      nick: pickNick(p.nicks),
      games: p.timeline.length,
      swingGames: Math.abs(peakIdx - troughIdx),
      // peakFirst = true  → career arc is DECLINE (peak came first, then trough).
      //           = false → career arc is RISE   (trough came first, then peak).
      // Render the range chronologically so the narrative matches reality.
      peakFirst: peakIdx < troughIdx,
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

  const out = { volatility };
  const outPath = path.join(OUT_DIR, 'rating-stories.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[${gt}] wrote ${outPath}`);
  console.log(`[${gt}] volatility: ${volatility.length}`);
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
