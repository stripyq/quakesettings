#!/usr/bin/env node
/**
 * Derive focused JSON files from public/data/archive/tdm.jsonl
 *
 * Reads the TDM archive once and produces five files in public/data/tdm/:
 *   players.json        per-sid aggregates (sids with >= MIN_PLAYER_GAMES)
 *   maps.json           per-map aggregates with top performers
 *   h2h-full.json       every pair of players that shared a match
 *   h2h-featured.json   pairs with >= MIN_H2H_GAMES games together
 *   activity.json       match counts by day and by month
 *
 * Usage:
 *   node scripts/derive-tdm-all.cjs
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVE = path.join(ROOT, 'public/data/archive/tdm.jsonl');
const OUT_DIR = path.join(ROOT, 'public/data/tdm');

const MIN_PLAYER_GAMES = 10;
const MIN_H2H_GAMES = 5;
const MIN_MAP_TOP_GAMES = 3; // a player must have this many games on a map to be top performer
const WEAPON_KEYS = ['gt', 'mg', 'sg', 'gl', 'rl', 'rg', 'pg'];

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const round1 = n => Math.round(n * 10) / 10;
const roundPct = n => Math.round(n * 1000) / 10;

// ---------- aggregation state ----------
const players = new Map();     // sid -> stats
const maps = new Map();        // map name -> stats (with nested players Map)
const h2h = new Map();         // pairKey -> record
const activity = { byDay: {}, byMonth: {} };
let totalMatches = 0;
let parseErrors = 0;

function getPlayer(sid) {
  let p = players.get(sid);
  if (p) return p;
  p = {
    sid,
    nicks: new Set(),
    games: 0,
    wins: 0,
    losses: 0,
    frags: 0,
    deaths: 0,
    dmg_dealt: 0,
    dmg_taken: 0,
    time_sec: 0,
    weapons: {},
    first_ts: Infinity,
    last_ts: 0,
    last_rating: null,
    peak_rating: -Infinity,
  };
  for (const wk of WEAPON_KEYS) p.weapons[wk] = { hits: 0, shots: 0, kills: 0 };
  players.set(sid, p);
  return p;
}

function getMap(name) {
  let m = maps.get(name);
  if (m) return m;
  m = {
    name,
    games: 0,
    dur_sum: 0,
    total_score_sum: 0,
    blue_wins: 0,
    red_wins: 0,
    players: new Map(),
  };
  maps.set(name, m);
  return m;
}

function getH2H(sidA, sidB) {
  const key = pairKey(sidA, sidB);
  let r = h2h.get(key);
  if (r) return r;
  const [lo, hi] = sidA < sidB ? [sidA, sidB] : [sidB, sidA];
  r = {
    a: lo,
    b: hi,
    together: 0,
    as_mates: 0,
    as_opp: 0,
    mates_wins: 0,    // wins when they were teammates
    a_wins_vs_b: 0,   // opponent matches where a's team won
    b_wins_vs_a: 0,   // opponent matches where b's team won
  };
  h2h.set(key, r);
  return r;
}

// ---------- main ----------
async function main() {
  if (!fs.existsSync(ARCHIVE)) {
    console.error(`Archive not found: ${ARCHIVE}`);
    console.error(`Run scripts/build-hoq-archive.cjs --gt=tdm first.`);
    process.exit(1);
  }
  ensureDir(OUT_DIR);

  console.log(`Reading ${ARCHIVE}...`);
  const t0 = Date.now();
  const rl = readline.createInterface({
    input: fs.createReadStream(ARCHIVE),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      parseErrors++;
      continue;
    }
    if (!m || !Array.isArray(m.players)) continue;
    totalMatches++;

    // ---- map stats ----
    const map = getMap(m.map || 'unknown');
    map.games++;
    if (Number.isFinite(m.duration_sec)) map.dur_sum += m.duration_sec;
    if (m.scores) {
      map.total_score_sum += (m.scores.blue || 0) + (m.scores.red || 0);
    }
    if (m.winner === 'blue') map.blue_wins++;
    else if (m.winner === 'red') map.red_wins++;

    // ---- activity ----
    if (Number.isFinite(m.ts)) {
      const d = new Date(m.ts * 1000);
      const day = d.toISOString().slice(0, 10);
      const month = day.slice(0, 7);
      activity.byDay[day] = (activity.byDay[day] || 0) + 1;
      activity.byMonth[month] = (activity.byMonth[month] || 0) + 1;
    }

    // ---- per-player ----
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

      // per-map player tally
      let mp = map.players.get(pl.sid);
      if (!mp) {
        mp = { sid: pl.sid, nick: pl.nick || null, games: 0, frags: 0 };
        map.players.set(pl.sid, mp);
      }
      mp.games++;
      mp.frags += pl.frags || 0;
      if (pl.nick) mp.nick = pl.nick; // keep latest nick seen
    }

    // ---- h2h ----
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
          if (A.team === m.winner) {
            if (rec.a === A.sid) rec.a_wins_vs_b++;
            else rec.b_wins_vs_a++;
          } else if (B.team === m.winner) {
            if (rec.a === B.sid) rec.a_wins_vs_b++;
            else rec.b_wins_vs_a++;
          }
        }
      }
    }
  }

  const parseMs = Date.now() - t0;
  console.log(`Parsed ${totalMatches} matches in ${(parseMs / 1000).toFixed(1)}s` +
    (parseErrors ? ` (${parseErrors} parse errors skipped)` : ''));

  // ---------- players.json ----------
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

  // ---------- maps.json ----------
  const mapsOut = [];
  for (const m of maps.values()) {
    const top = [...m.players.values()]
      .filter(p => p.games >= MIN_MAP_TOP_GAMES)
      .sort((a, b) => (b.frags / b.games) - (a.frags / a.games))
      .slice(0, 5)
      .map(p => ({
        sid: p.sid,
        nick: p.nick,
        games: p.games,
        avg_frags: round1(p.frags / p.games),
      }));
    mapsOut.push({
      map: m.name,
      games: m.games,
      avg_duration_sec: m.games ? Math.round(m.dur_sum / m.games) : 0,
      avg_total_score: m.games ? Math.round(m.total_score_sum / m.games) : 0,
      blue_win_rate_pct: m.games ? roundPct(m.blue_wins / m.games) : 0,
      red_win_rate_pct: m.games ? roundPct(m.red_wins / m.games) : 0,
      top_performers: top,
    });
  }
  mapsOut.sort((a, b) => b.games - a.games);
  fs.writeFileSync(path.join(OUT_DIR, 'maps.json'), JSON.stringify(mapsOut, null, 2));
  console.log(`  maps.json          -> ${mapsOut.length} maps`);

  // ---------- h2h ----------
  const h2hAll = [...h2h.values()].sort((x, y) => y.together - x.together);
  const h2hFeatured = h2hAll.filter(r => r.together >= MIN_H2H_GAMES);
  // full h2h can be huge -> write compact (no indent)
  // featured is also compact to match derive-archive.cjs output format —
  // prevents pointless whitespace diffs when the two scripts run in mixed order.
  fs.writeFileSync(path.join(OUT_DIR, 'h2h-full.json'), JSON.stringify(h2hAll));
  fs.writeFileSync(path.join(OUT_DIR, 'h2h-featured.json'), JSON.stringify(h2hFeatured));
  console.log(`  h2h-full.json      -> ${h2hAll.length} pairs (compact)`);
  console.log(`  h2h-featured.json  -> ${h2hFeatured.length} pairs (>= ${MIN_H2H_GAMES} together)`);

  // ---------- activity.json ----------
  const sortedDays = Object.fromEntries(
    Object.entries(activity.byDay).sort(([a], [b]) => a.localeCompare(b))
  );
  const sortedMonths = Object.fromEntries(
    Object.entries(activity.byMonth).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.writeFileSync(path.join(OUT_DIR, 'activity.json'), JSON.stringify({
    gametype: 'tdm',
    total_matches: totalMatches,
    by_day: sortedDays,
    by_month: sortedMonths,
  }, null, 2));
  console.log(`  activity.json      -> ${Object.keys(sortedDays).length} days, ${Object.keys(sortedMonths).length} months`);

  console.log(`\nDone. Output dir: ${OUT_DIR}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
