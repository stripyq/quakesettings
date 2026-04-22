#!/usr/bin/env node
/**
 * Derive per-player "signature" labels from public/data/archive/<gt>.jsonl.
 *
 * Signatures = identity, not achievement. Z-scores tell us what a player
 * over-indexes on vs the field. Primary = highest z >= 1.0, secondary = next
 * z >= 0.8. A weak player whose best stat is average gets no signature.
 *
 * Output: public/data/<gt>/signatures.json
 *   { [sid]: { primary: {key,label,z,value}, secondary?: {...} } }
 *
 * Usage:
 *   node scripts/derive-signatures.cjs --gt=ctf
 *   node scripts/derive-signatures.cjs --gt=ctf,tdm
 *   node scripts/derive-signatures.cjs --gt=ctf --min-games=50
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SUPPORTED_GT = new Set(['ctf', 'tdm', 'tdm2v2', 'ft', 'ca', 'ad']);

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
const MIN_GAMES = parseInt(getArg('--min-games', '50'), 10);
const PRIMARY_Z = parseFloat(getArg('--primary-z', '1.0'));
const SECONDARY_Z = parseFloat(getArg('--secondary-z', '0.8'));
// A stat is only scored if at least this fraction of qualifying players have data.
const MIN_COVERAGE = 0.3;
// For weapon accuracy, require at least this many shots across all the
// player's games with that weapon before we'll compute their accuracy.
const MIN_WEAPON_SHOTS = 200;

// ---------- label dictionary ----------
const LABELS = {
  kd: 'Fragger',
  dmg_per_game: 'DPS Machine',
  caps_per_game: 'Flag Runner',
  defends_per_game: 'Defensive Anchor',
  impressives_per_game: 'Turret',
  excellents_per_game: 'Multi-Frag Specialist',
  acc_rg: 'Rail Sniper',
  acc_lg: 'Shafter',
  acc_rl: 'Rocket Jockey',
};

// Stat set per gametype — CTF has flag mechanics, TDM doesn't.
const STATS_BY_GT = {
  ctf: ['kd', 'dmg_per_game', 'caps_per_game', 'defends_per_game',
        'impressives_per_game', 'excellents_per_game',
        'acc_rg', 'acc_lg', 'acc_rl'],
  tdm: ['kd', 'dmg_per_game', 'impressives_per_game', 'excellents_per_game',
        'acc_rg', 'acc_lg', 'acc_rl'],
  tdm2v2: ['kd', 'dmg_per_game', 'impressives_per_game', 'excellents_per_game',
           'acc_rg', 'acc_lg', 'acc_rl'],
  ft: ['kd', 'dmg_per_game', 'acc_rg', 'acc_lg', 'acc_rl'],
  ca: ['kd', 'dmg_per_game', 'acc_rg', 'acc_lg', 'acc_rl'],
  ad: ['kd', 'dmg_per_game', 'acc_rg', 'acc_lg', 'acc_rl'],
};

// ---------- helpers ----------
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
const round2 = n => Math.round(n * 100) / 100;
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stddev(arr, mu) {
  if (arr.length < 2) return 0;
  const v = arr.reduce((a, b) => a + (b - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
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

  const STATS = STATS_BY_GT[gt] || STATS_BY_GT.ctf;
  // Accumulators per sid
  const agg = new Map();
  const getP = sid => {
    let p = agg.get(sid);
    if (!p) {
      p = {
        games: 0, frags: 0, deaths: 0, dmg: 0, caps: 0, defends: 0,
        excellent: 0, impressive: 0,
        w: { rg: { h: 0, s: 0 }, lg: { h: 0, s: 0 }, rl: { h: 0, s: 0 } },
      };
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
    if (!g.players) continue;
    matches++;
    for (const pl of g.players) {
      if (!pl.sid) continue;
      const p = getP(pl.sid);
      p.games++;
      p.frags += pl.frags || 0;
      p.deaths += pl.deaths || 0;
      p.dmg += pl.dmg_dealt || 0;
      p.caps += pl.caps || 0;
      p.defends += pl.defends || 0;
      if (pl.medals) {
        p.excellent += pl.medals.excellent || 0;
        p.impressive += pl.medals.impressive || 0;
      }
      if (pl.weapons) {
        for (const wk of ['rg', 'lg', 'rl']) {
          const w = pl.weapons[wk];
          if (w && w.hits != null && w.shots != null && w.shots > 0) {
            p.w[wk].h += w.hits;
            p.w[wk].s += w.shots;
          }
        }
      }
    }
  }
  console.log(`[${gt}] matches parsed: ${matches}, unique sids: ${agg.size}`);

  // Compute per-player stat values
  function valueFor(p, stat) {
    switch (stat) {
      case 'kd': return p.deaths > 0 ? p.frags / p.deaths : null;
      case 'dmg_per_game': return p.games > 0 ? p.dmg / p.games : null;
      case 'caps_per_game': return p.games > 0 ? p.caps / p.games : null;
      case 'defends_per_game': return p.games > 0 ? p.defends / p.games : null;
      case 'impressives_per_game': return p.games > 0 ? p.impressive / p.games : null;
      case 'excellents_per_game': return p.games > 0 ? p.excellent / p.games : null;
      case 'acc_rg': return p.w.rg.s >= MIN_WEAPON_SHOTS ? (p.w.rg.h / p.w.rg.s) * 100 : null;
      case 'acc_lg': return p.w.lg.s >= MIN_WEAPON_SHOTS ? (p.w.lg.h / p.w.lg.s) * 100 : null;
      case 'acc_rl': return p.w.rl.s >= MIN_WEAPON_SHOTS ? (p.w.rl.h / p.w.rl.s) * 100 : null;
      default: return null;
    }
  }

  // Qualifying players (>= MIN_GAMES)
  const qualifying = [...agg.entries()].filter(([, p]) => p.games >= MIN_GAMES);
  console.log(`[${gt}] players with >= ${MIN_GAMES} games: ${qualifying.length}`);

  // Build per-stat distributions + z-score scaffolding
  const statStats = {}; // { stat: { mean, sd, coverage } }
  for (const stat of STATS) {
    const vals = [];
    for (const [, p] of qualifying) {
      const v = valueFor(p, stat);
      if (v != null && !Number.isNaN(v) && Number.isFinite(v)) vals.push(v);
    }
    const coverage = vals.length / Math.max(1, qualifying.length);
    if (coverage < MIN_COVERAGE || vals.length < 10) {
      console.log(`  [${gt}] skip stat ${stat} (coverage ${(coverage*100).toFixed(0)}%, n=${vals.length})`);
      continue;
    }
    const mu = mean(vals);
    const sd = stddev(vals, mu);
    if (sd === 0) continue;
    statStats[stat] = { mean: mu, sd, coverage, n: vals.length };
  }

  // Compute signatures per player
  const out = {};
  let withPrimary = 0;
  let withSecondary = 0;
  for (const [sid, p] of qualifying) {
    const scored = [];
    for (const stat of STATS) {
      const ss = statStats[stat];
      if (!ss) continue;
      const v = valueFor(p, stat);
      if (v == null || Number.isNaN(v) || !Number.isFinite(v)) continue;
      const z = (v - ss.mean) / ss.sd;
      scored.push({ key: stat, label: LABELS[stat], z, value: v });
    }
    scored.sort((a, b) => b.z - a.z);
    const primary = scored[0];
    const secondary = scored[1];
    if (!primary || primary.z < PRIMARY_Z) continue;
    const entry = {
      primary: {
        key: primary.key, label: primary.label,
        z: round2(primary.z), value: round2(primary.value),
      },
    };
    if (secondary && secondary.z >= SECONDARY_Z) {
      entry.secondary = {
        key: secondary.key, label: secondary.label,
        z: round2(secondary.z), value: round2(secondary.value),
      };
      withSecondary++;
    }
    out[sid] = entry;
    withPrimary++;
  }

  const outPath = path.join(OUT_DIR, 'signatures.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[${gt}] wrote ${outPath}`);
  console.log(`[${gt}] signatures: ${withPrimary} primary, ${withSecondary} w/ secondary`);
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
