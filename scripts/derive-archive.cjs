#!/usr/bin/env node
/**
 * Derive focused JSON files from public/data/archive/<gt>.jsonl
 *
 * Reads an archive once and produces five files in public/data/<gt>/:
 *   players.json        per-sid aggregates (sids with >= MIN_PLAYER_GAMES)
 *   maps.json           per-map aggregates with top performers
 *   h2h-full.json       every pair of players that shared a match (compact)
 *   h2h-featured.json   pairs with >= MIN_H2H_GAMES games together
 *   activity.json       match counts by day and by month
 *
 * Usage:
 *   node scripts/derive-archive.cjs --gt=ctf
 *   node scripts/derive-archive.cjs --gt=tdm
 *   node scripts/derive-archive.cjs --gt=ctf,tdm    (run multiple)
 *   node scripts/derive-archive.cjs --gt=tdm --min-player-games=5 --min-h2h-games=3
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SUPPORTED_GT = new Set(['ctf', 'tdm', 'tdm2v2', 'ft', 'ca', 'ad']);
const WEAPON_KEYS = ['gt', 'mg', 'sg', 'gl', 'rl', 'rg', 'pg'];
const MIN_MAP_TOP_GAMES = 3;
// Top-performer ranking metric per gametype.
// CTF: score (weights caps/defends/frags/returns)
// TDM: frags
const TOP_METRIC_BY_GT = { ctf: 'score', tdm: 'frags', tdm2v2: 'frags', ft: 'score', ca: 'frags', ad: 'score' };

// ---------- CLI ----------
const args = process.argv.slice(2);
const getArg = (k, d) => {
  const a = args.find(x => x.startsWith(k + '='));
  return a ? a.slice(k.length + 1) : d;
};
const gtArg = getArg('--gt', '');
if (!gtArg) {
  console.error('Missing --gt=<gametype>[,<gametype>...]');
  console.error(`Supported: ${[...SUPPORTED_GT].join(', ')}`);
  process.exit(1);
}
const GTS = gtArg.split(',').map(s => s.trim()).filter(Boolean);
for (const gt of GTS) {
  if (!SUPPORTED_GT.has(gt)) {
    console.error(`Unknown gametype: ${gt}. Supported: ${[...SUPPORTED_GT].join(', ')}`);
    process.exit(1);
  }
}
const MIN_PLAYER_GAMES = parseInt(getArg('--min-player-games', '10'), 10);
const MIN_H2H_GAMES = parseInt(getArg('--min-h2h-games', '5'), 10);
const MIN_MAP_GAMES = parseInt(getArg('--min-map-games', '150'), 10);

// ---------- helpers ----------
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
const round1 = n => Math.round(n * 10) / 10;
const roundPct = n => Math.round(n * 1000) / 10;

// ---------- per-gametype aggregation ----------
async function deriveOne(gt) {
  const ARCHIVE = path.join(ROOT, 'public/data/archive', `${gt}.jsonl`);
  const OUT_DIR = path.join(ROOT, 'public/data', gt);

  if (!fs.existsSync(ARCHIVE)) {
    console.error(`[${gt}] Archive not found: ${ARCHIVE}`);
    console.error(`  Run scripts/build-hoq-archive.cjs --gt=${gt} first.`);
    return false;
  }
  ensureDir(OUT_DIR);

  const players = new Map();
  const maps = new Map();
  const h2h = new Map();
  const activity = { byDay: {}, byMonth: {} };
  let totalMatches = 0;
  let parseErrors = 0;

  function getPlayer(sid) {
    let p = players.get(sid);
    if (p) return p;
    p = {
      sid,
      nicks: new Set(),
      games: 0, wins: 0, losses: 0,
      frags: 0, deaths: 0, dmg_dealt: 0, dmg_taken: 0, time_sec: 0,
      weapons: {},
      first_ts: Infinity, last_ts: 0,
      last_rating: null, peak_rating: -Infinity,
    };
    for (const wk of WEAPON_KEYS) p.weapons[wk] = { hits: 0, shots: 0, kills: 0 };
    players.set(sid, p);
    return p;
  }

  function getMap(name) {
    let m = maps.get(name);
    if (m) return m;
    m = { name, games: 0, dur_sum: 0, total_score_sum: 0, blue_wins: 0, red_wins: 0, players: new Map() };
    maps.set(name, m);
    return m;
  }

  function getH2H(sidA, sidB) {
    const key = pairKey(sidA, sidB);
    let r = h2h.get(key);
    if (r) return r;
    const [lo, hi] = sidA < sidB ? [sidA, sidB] : [sidB, sidA];
    // `maps` is lazily initialized on first opponent encounter to keep memory
    // down for pairs that are only ever teammates.
    r = { a: lo, b: hi, together: 0, as_mates: 0, as_opp: 0, mates_wins: 0, a_wins_vs_b: 0, b_wins_vs_a: 0, maps: null };
    h2h.set(key, r);
    return r;
  }

  console.log(`\n========== ${gt} ==========`);
  console.log(`Reading ${ARCHIVE}...`);
  const t0 = Date.now();
  const rl = readline.createInterface({
    input: fs.createReadStream(ARCHIVE),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let m;
    try { m = JSON.parse(line); } catch { parseErrors++; continue; }
    if (!m || !Array.isArray(m.players)) continue;
    totalMatches++;

    // map stats
    const map = getMap(m.map || 'unknown');
    map.games++;
    if (Number.isFinite(m.duration_sec)) map.dur_sum += m.duration_sec;
    if (m.scores) map.total_score_sum += (m.scores.blue || 0) + (m.scores.red || 0);
    if (m.winner === 'blue') map.blue_wins++;
    else if (m.winner === 'red') map.red_wins++;

    // activity
    if (Number.isFinite(m.ts)) {
      const d = new Date(m.ts * 1000);
      const day = d.toISOString().slice(0, 10);
      const month = day.slice(0, 7);
      activity.byDay[day] = (activity.byDay[day] || 0) + 1;
      activity.byMonth[month] = (activity.byMonth[month] || 0) + 1;
    }

    // per-player
    const validPlayers = m.players.filter(p => p && p.sid);
    for (const pl of validPlayers) {
      const p = getPlayer(pl.sid);
      if (pl.nick) p.nicks.add(pl.nick);
      p.games++;
      if (m.winner && pl.team === m.winner) p.wins++;
      else if (m.winner && (pl.team === 'blue' || pl.team === 'red')) p.losses++;
      p.frags += pl.frags || 0;
      p.deaths += pl.deaths || 0;
      p.dmg_dealt += pl.dmg_dealt || 0;
      p.dmg_taken += pl.dmg_taken || 0;
      p.time_sec += pl.time_sec || 0;
      if (Number.isFinite(m.ts)) {
        if (m.ts < p.first_ts) p.first_ts = m.ts;
        if (m.ts > p.last_ts) {
          p.last_ts = m.ts;
          if (pl.new_rating != null) p.last_rating = pl.new_rating;
        }
      }
      if (pl.new_rating != null && pl.new_rating > p.peak_rating) {
        p.peak_rating = pl.new_rating;
      }
      if (pl.weapons) {
        for (const wk of WEAPON_KEYS) {
          const w = pl.weapons[wk];
          if (!w) continue;
          if (Number.isFinite(w.kills)) p.weapons[wk].kills += w.kills;
          if (Number.isFinite(w.hits)) p.weapons[wk].hits += w.hits;
          if (Number.isFinite(w.shots)) p.weapons[wk].shots += w.shots;
        }
      }
      // per-map player tally (track games, wins, frags, score)
      let mp = map.players.get(pl.sid);
      if (!mp) {
        mp = { sid: pl.sid, nick: pl.nick || null, games: 0, wins: 0, frags: 0, score: 0 };
        map.players.set(pl.sid, mp);
      }
      mp.games++;
      if (m.winner && pl.team === m.winner) mp.wins++;
      mp.frags += pl.frags || 0;
      mp.score += pl.score || 0;
      if (pl.nick) mp.nick = pl.nick;
    }

    // h2h
    for (let i = 0; i < validPlayers.length; i++) {
      for (let j = i + 1; j < validPlayers.length; j++) {
        const A = validPlayers[i];
        const B = validPlayers[j];
        if (A.sid === B.sid) continue;
        const rec = getH2H(A.sid, B.sid);
        rec.together++;
        if (A.team && A.team === B.team) {
          rec.as_mates++;
          if (A.team === m.winner) rec.mates_wins++;
        } else if (A.team && B.team) {
          rec.as_opp++;
          // per-map opponent record (lazy init)
          const mapName = m.map || 'unknown';
          if (!rec.maps) rec.maps = {};
          let mm = rec.maps[mapName];
          if (!mm) {
            mm = { opp: 0, a_wins: 0, b_wins: 0 };
            rec.maps[mapName] = mm;
          }
          mm.opp++;
          if (A.team === m.winner) {
            if (rec.a === A.sid) { rec.a_wins_vs_b++; mm.a_wins++; }
            else { rec.b_wins_vs_a++; mm.b_wins++; }
          } else if (B.team === m.winner) {
            if (rec.a === B.sid) { rec.a_wins_vs_b++; mm.a_wins++; }
            else { rec.b_wins_vs_a++; mm.b_wins++; }
          }
        }
      }
    }
  }

  const parseMs = Date.now() - t0;
  console.log(`Parsed ${totalMatches} matches in ${(parseMs / 1000).toFixed(1)}s` +
    (parseErrors ? ` (${parseErrors} parse errors skipped)` : ''));

  // --- players.json ---
  const playersOut = [];
  for (const p of players.values()) {
    if (p.games < MIN_PLAYER_GAMES) continue;
    const acc = {};
    for (const wk of WEAPON_KEYS) {
      const w = p.weapons[wk];
      acc[wk] = w.shots > 0 ? roundPct(w.hits / w.shots) : null;
    }
    playersOut.push({
      sid: p.sid,
      nicks: [...p.nicks],
      games: p.games,
      wins: p.wins,
      losses: p.losses,
      win_rate_pct: p.games ? roundPct(p.wins / p.games) : 0,
      avg_frags: round1(p.frags / p.games),
      avg_deaths: round1(p.deaths / p.games),
      avg_dmg_dealt: Math.round(p.dmg_dealt / p.games),
      avg_dmg_taken: Math.round(p.dmg_taken / p.games),
      weapon_acc_pct: acc,
      peak_rating: p.peak_rating === -Infinity ? null : Math.round(p.peak_rating * 100) / 100,
      last_rating: p.last_rating,
      first_ts: p.first_ts === Infinity ? null : p.first_ts,
      last_ts: p.last_ts || null,
    });
  }
  playersOut.sort((a, b) => b.games - a.games);
  fs.writeFileSync(path.join(OUT_DIR, 'players.json'), JSON.stringify(playersOut, null, 2));
  console.log(`  players.json       -> ${playersOut.length} players (>= ${MIN_PLAYER_GAMES} games; ${players.size} total sids)`);

  // --- maps.json ---
  const mapsOut = [];
  let droppedByMinGames = 0;
  const grandTotal = [...maps.values()].reduce((s, m) => s + m.games, 0);
  for (const m of maps.values()) {
    if (m.games < MIN_MAP_GAMES) { droppedByMinGames++; continue; }
    // Dynamic floor: at least 30 games on map, or 0.5% of the map's total games.
    const mapFloor = Math.max(30, Math.floor(m.games * 0.005));
    const top = [...m.players.values()]
      .filter(p => p.games >= mapFloor)
      .map(p => ({
        sid: p.sid,
        nick: p.nick,
        games: p.games,
        wins: p.wins,
        win_rate_pct: p.games ? roundPct(p.wins / p.games) : 0,
        avg_score: round1(p.score / p.games),
        avg_frags: round1(p.frags / p.games),
      }))
      .sort((a, b) => b.win_rate_pct - a.win_rate_pct || b.games - a.games)
      .slice(0, 5);
    mapsOut.push({
      map: m.name,
      games: m.games,
      pct_of_total: grandTotal ? roundPct(m.games / grandTotal) : 0,
      avg_duration_sec: m.games ? Math.round(m.dur_sum / m.games) : 0,
      avg_total_score: m.games ? Math.round(m.total_score_sum / m.games) : 0,
      blue_win_rate_pct: m.games ? roundPct(m.blue_wins / m.games) : 0,
      red_win_rate_pct: m.games ? roundPct(m.red_wins / m.games) : 0,
      top_performer_metric: 'win_rate',
      top_performer_min_games: mapFloor,
      top_performers: top,
    });
  }
  mapsOut.sort((a, b) => b.games - a.games);
  fs.writeFileSync(path.join(OUT_DIR, 'maps.json'), JSON.stringify(mapsOut, null, 2));
  console.log(`  maps.json          -> ${mapsOut.length} maps (>= ${MIN_MAP_GAMES} games; dropped ${droppedByMinGames})`);

  // --- h2h ---
  // h2h-full stays lean (no maps) — it has hundreds of thousands of pairs.
  // h2h-featured is the one the compare page uses; keep the `maps` field there.
  const h2hAll = [...h2h.values()].sort((x, y) => y.together - x.together);
  const h2hFeatured = h2hAll.filter(r => r.together >= MIN_H2H_GAMES);

  const h2hFullCompact = h2hAll.map(({ maps, ...rest }) => rest);
  fs.writeFileSync(path.join(OUT_DIR, 'h2h-full.json'), JSON.stringify(h2hFullCompact));
  fs.writeFileSync(path.join(OUT_DIR, 'h2h-featured.json'), JSON.stringify(h2hFeatured));
  // Count featured pair-map buckets so we can see how dense the new data is.
  let mapBuckets = 0;
  for (const r of h2hFeatured) if (r.maps) mapBuckets += Object.keys(r.maps).length;
  console.log(`  h2h-full.json      -> ${h2hAll.length} pairs (compact, no maps)`);
  console.log(`  h2h-featured.json  -> ${h2hFeatured.length} pairs (>= ${MIN_H2H_GAMES} together; ${mapBuckets} pair-map buckets)`);

  // --- activity.json ---
  const sortedDays = Object.fromEntries(
    Object.entries(activity.byDay).sort(([a], [b]) => a.localeCompare(b))
  );
  const sortedMonths = Object.fromEntries(
    Object.entries(activity.byMonth).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.writeFileSync(path.join(OUT_DIR, 'activity.json'), JSON.stringify({
    gametype: gt,
    total_matches: totalMatches,
    by_day: sortedDays,
    by_month: sortedMonths,
  }, null, 2));
  console.log(`  activity.json      -> ${Object.keys(sortedDays).length} days, ${Object.keys(sortedMonths).length} months`);

  return true;
}

// ---------- mai