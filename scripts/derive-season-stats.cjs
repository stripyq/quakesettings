#!/usr/bin/env node
/**
 * Derive the current HoQ season's per-player stats from the local match archive.
 * Replaces fetch-season-stats.cjs (the 77.90.2.137 season API it called is dead).
 *
 * The season list comes from hoqstats.vercel.app (window.HOQ_MATCH_SEASONS on /matches/);
 * the default season is the dated one still open (endTs "Infinity", not all-time).
 * Matches are read from public/data/archive/{ctf,tdm}.jsonl (kept current by
 * sync-hoqstats-archive.cjs) and filtered to [startTs, endTs).
 *
 * Writes:
 *   public/data/season-stats.json  { "<steamId>": { name, fetchedAt, ctf?: {...}, tdm?: {...} } }
 *     Same shape the old API file had (career, weapons[], mapStats[], flagStats.data,
 *     headToHeadMatchups, lastUpdated), plus `rating` (last new_rating in the season) and
 *     `medals` (season sums). A player only gets the modes they played this season.
 *     Not available from match records, so left out or null: nemesis, favoriteVictim,
 *     headToHead (per-opponent kills), max_streak, weapon damage/distances, flag
 *     pickups/returns/drops/capture_rate.
 *   public/data/season-meta.json   season id/title/label/window, source, counts
 *
 * Definitions: kills = frags; weapon kills = weapons[code].kills; accuracy = sum hits / sum
 * shots; DPM = damage / (time_sec || duration_sec) minutes; wins/losses from the team
 * result, draws (winner null) count in matches but in neither; win_rate = wins / (wins +
 * losses). Head-to-head counts every cross-team pair per match. Null values are skipped,
 * never counted as 0. Weapon and medal counters are stored null for zero by the archive
 * (and omitted upstream), so their sums treat absent as zero.
 *
 * Usage:
 *   node scripts/derive-season-stats.cjs                    # current season
 *   node scripts/derive-season-stats.cjs --season y2026-s3  # any HOQ_MATCH_SEASONS id
 *   --refresh-cache   re-download the season list
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const H = require('./lib/hoqstats.cjs');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'public/data/archive');
const REGISTRY_PATH = path.join(ROOT, 'src/data/player-registry.json');
const OUTPUT_PATH = path.join(ROOT, 'public/data/season-stats.json');
const META_PATH = path.join(ROOT, 'public/data/season-meta.json');
const GTS = ['ctf', 'tdm'];
// Display names used by the old season API (and read by the player page).
const WEAPON_NAMES = {
  rg: 'RAILGUN', lg: 'LIGHTNING_GUN', sg: 'SHOTGUN', rl: 'ROCKET_LAUNCHER',
  mg: 'MACHINEGUN', pg: 'PLASMA_GUN', gl: 'GRENADE_LAUNCHER',
};

const argv = process.argv.slice(2);
const seasonArg = (() => {
  const i = argv.findIndex(a => a === '--season' || a.startsWith('--season='));
  if (i < 0) return null;
  return argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
})();
const REFRESH = argv.includes('--refresh-cache');

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;
const ratio = (a, b, round) => (a != null && b ? round(a / b) : null);
const addNum = (cur, v) => (v == null ? cur : (cur == null ? 0 : cur) + v);

function seasonLabel(s) {
  let m = /^y(\d{4})-s(\d+)$/.exec(s.id);
  if (m) return `${m[1]} S${m[2]}`;
  m = /^y(\d{4})$/.exec(s.id);
  if (m) return m[1];
  return s.title;
}

function newAgg(sid) {
  return {
    sid, nick: null, nickTs: -Infinity,
    matches: 0, wins: 0, losses: 0,
    kills: null, deaths: null, dmgDealt: null, dmgTaken: null, dmgMinutes: 0,
    caps: 0, assists: 0, defends: 0,
    weapons: {}, maps: new Map(), opponents: new Map(), medals: {},
    rating: null, ratingTs: -Infinity,
  };
}

function result(team, winner) {
  if (winner == null) return null;
  return team === winner ? 'W' : 'L';
}

async function readSeason(gt, startSec, endSec, aggs) {
  const file = path.join(ARCHIVE_DIR, `${gt}.jsonl`);
  if (!fs.existsSync(file)) throw new Error(`Archive not found: ${file}`);
  const seen = new Set();
  let n = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (!(m.ts >= startSec && m.ts < endSec)) continue;
    if (seen.has(m.uuid)) continue; // the archive has a few duplicated lines
    seen.add(m.uuid);
    n++;
    const minutes = (m.duration_sec || 0) / 60;
    const players = m.players.filter(p => p && p.sid);
    for (const p of players) {
      let a = aggs.get(p.sid);
      if (!a) { a = newAgg(p.sid); aggs.set(p.sid, a); }
      if (p.nick && m.ts >= a.nickTs) { a.nick = p.nick; a.nickTs = m.ts; }
      const r = result(p.team, m.winner);
      a.matches++;
      if (r === 'W') a.wins++;
      if (r === 'L') a.losses++;
      a.kills = addNum(a.kills, p.frags);
      a.deaths = addNum(a.deaths, p.deaths);
      a.dmgTaken = addNum(a.dmgTaken, p.dmg_taken);
      const playMin = p.time_sec != null ? p.time_sec / 60 : minutes;
      if (p.dmg_dealt != null) {
        a.dmgDealt = addNum(a.dmgDealt, p.dmg_dealt);
        a.dmgMinutes += playMin;
      }
      a.caps += p.caps || 0;
      a.assists += p.assists || 0;
      a.defends += p.defends || 0;
      if (p.new_rating != null && m.ts >= a.ratingTs) { a.rating = p.new_rating; a.ratingTs = m.ts; }
      for (const [code, w] of Object.entries(p.weapons || {})) {
        if (!WEAPON_NAMES[code] || !w) continue;
        const aw = a.weapons[code] || (a.weapons[code] = { hits: 0, shots: 0, kills: 0 });
        if (w.hits != null && w.shots != null) { aw.hits += w.hits; aw.shots += w.shots; }
        aw.kills += w.kills || 0;
      }
      for (const [k, v] of Object.entries(p.medals || {})) if (v) a.medals[k] = (a.medals[k] || 0) + v;

      const mapName = m.map || 'unknown';
      let mp = a.maps.get(mapName);
      if (!mp) { mp = { matches: 0, wins: 0, losses: 0, kills: null, deaths: null, dmg: null, minutes: 0 }; a.maps.set(mapName, mp); }
      mp.matches++;
      if (r === 'W') mp.wins++;
      if (r === 'L') mp.losses++;
      mp.kills = addNum(mp.kills, p.frags);
      mp.deaths = addNum(mp.deaths, p.deaths);
      if (p.dmg_dealt != null) { mp.dmg = addNum(mp.dmg, p.dmg_dealt); mp.minutes += playMin; }

      for (const o of players) {
        if (o.sid === p.sid || o.team === p.team) continue;
        let h = a.opponents.get(o.sid);
        if (!h) { h = { played: 0, won: 0, lost: 0, maps: new Map() }; a.opponents.set(o.sid, h); }
        let hm = h.maps.get(mapName);
        if (!hm) { hm = { played: 0, won: 0, lost: 0 }; h.maps.set(mapName, hm); }
        h.played++; hm.played++;
        if (r === 'W') { h.won++; hm.won++; }
        if (r === 'L') { h.lost++; hm.lost++; }
      }
    }
  }
  return n;
}

function buildMode(gt, a, name, generatedAt) {
  const kd = ratio(a.kills, a.deaths, round2);
  const winRate = a.wins + a.losses ? round1((a.wins / (a.wins + a.losses)) * 100) : null;
  const career = {
    steam_id: a.sid,
    name,
    matches_played: a.matches,
    total_kills: a.kills,
    total_deaths: a.deaths,
    kd_ratio: kd,
    win_rate: winRate,
    wins: a.wins,
    losses: a.losses,
    damage_dealt: a.dmgDealt,
    damage_taken: a.dmgTaken,
    damage_efficiency: ratio(a.dmgDealt, a.dmgTaken, round2),
    damage_per_minute: ratio(a.dmgDealt, a.dmgMinutes, round1),
    max_streak: null,
  };
  const weapons = Object.entries(a.weapons)
    .filter(([, w]) => w.shots > 0)
    .map(([code, w]) => ({
      weapon: WEAPON_NAMES[code],
      shots: w.shots,
      hits: w.hits,
      accuracy: round1((w.hits / w.shots) * 100),
      damage: null,
      kills: w.kills,
      avg_distance: null,
      min_distance: null,
      max_distance: null,
    }))
    .sort((x, y) => y.accuracy - x.accuracy);
  const mapStats = [...a.maps.entries()]
    .map(([map, m]) => ({
      map,
      matches: m.matches,
      wins: m.wins,
      losses: m.losses,
      win_rate: m.wins + m.losses ? round1((m.wins / (m.wins + m.losses)) * 100) : null,
      total_kills: m.kills,
      total_deaths: m.deaths,
      // The player page prints kd_ratio.toFixed(2) and Math.round(dpm) unguarded: keep numbers.
      kd_ratio: m.deaths ? round2(m.kills / m.deaths) : (m.kills || 0),
      dpm: ratio(m.dmg, m.minutes, round1) ?? 0,
    }))
    .sort((x, y) => y.matches - x.matches || x.map.localeCompare(y.map));
  const headToHeadMatchups = {};
  for (const [opp, h] of [...a.opponents.entries()].sort((x, y) => y[1].played - x[1].played || (x[0] < y[0] ? -1 : 1))) {
    headToHeadMatchups[opp] = {
      overall: { matches_played: h.played, matches_won: h.won, matches_lost: h.lost },
      maps: [...h.maps.entries()]
        .sort((x, y) => y[1].played - x[1].played || x[0].localeCompare(y[0]))
        .map(([map, m]) => ({ map, matches_played: m.played, matches_won: m.won, matches_lost: m.lost })),
    };
  }
  const medals = Object.fromEntries(Object.entries(a.medals).sort(([x], [y]) => x.localeCompare(y)));
  const out = { career, weapons, mapStats };
  if (gt === 'ctf') {
    out.flagStats = {
      data: {
        ...career,
        captures: a.caps,
        pickups: null,
        capture_rate: null,
        returns: null,
        drops: null,
        defends: a.defends,
        assists: a.assists,
      },
    };
  }
  out.headToHeadMatchups = headToHeadMatchups;
  out.rating = a.rating;
  out.medals = medals;
  out.lastUpdated = generatedAt;
  return out;
}

async function main() {
  const page = (await H.fetchText('/matches/', { refresh: REFRESH, maxAgeMs: 60 * 60 * 1000 })).text;
  const seasons = H.extractAssignment(page, 'HOQ_MATCH_SEASONS');
  let season;
  if (seasonArg) {
    season = seasons.find(s => s.id === seasonArg);
    if (!season) throw new Error(`Unknown season ${seasonArg}; known: ${seasons.map(s => s.id).join(', ')}`);
  } else {
    const open = seasons.filter(s => s.id !== 'all-time' && s.endTs === 'Infinity');
    if (open.length !== 1) throw new Error(`Expected one open season, found ${open.map(s => s.id).join(', ') || 'none'}; pass --season`);
    season = open[0];
  }
  const [startSec, endSec] = H.seasonWindowSec(season);
  const label = seasonLabel(season);
  console.log(`Season ${season.id} (${label}, "${season.title}", ${season.desc}): ` +
    `${new Date(startSec * 1000).toISOString()} .. ${Number.isFinite(endSec) ? new Date(endSec * 1000).toISOString() : 'open'}`);

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const regName = new Map((registry.players || []).filter(p => p.steamId).map(p => [String(p.steamId), p.name]));

  const generatedAt = new Date().toISOString();
  const out = {};
  const counts = { matches: {}, players: {} };
  for (const gt of GTS) {
    const aggs = new Map();
    counts.matches[gt] = await readSeason(gt, startSec, endSec, aggs);
    counts.players[gt] = aggs.size;
    for (const a of aggs.values()) {
      const name = regName.get(a.sid) || a.nick || a.sid;
      const entry = out[a.sid] || (out[a.sid] = { name, fetchedAt: generatedAt });
      entry[gt] = buildMode(gt, a, name, generatedAt);
    }
    console.log(`  ${gt}: ${counts.matches[gt]} matches, ${aggs.size} players`);
  }
  if (counts.matches.ctf + counts.matches.tdm === 0) {
    throw new Error('No archived matches in this season window; run sync-hoqstats-archive.cjs first. Nothing written.');
  }

  const sorted = Object.fromEntries(Object.entries(out).sort(([x], [y]) => (x < y ? -1 : 1)));
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2) + '\n');
  const meta = {
    id: season.id,
    title: season.title,
    desc: season.desc,
    label,
    startTs: season.startTs,
    endTs: season.endTs,
    source: 'hoqstats.vercel.app via public/data/archive (sync-hoqstats-archive.cjs)',
    generatedAt,
    matches: counts.matches,
    players: counts.players,
  };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + '\n');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} (${Object.keys(sorted).length} players, ` +
    `${(fs.statSync(OUTPUT_PATH).size / 1e6).toFixed(1)} MB) and ${path.relative(ROOT, META_PATH)}`);
}

main().catch(err => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
