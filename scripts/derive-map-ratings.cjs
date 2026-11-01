#!/usr/bin/env node
/**
 * Derive per-map ratings for profiled players from the local match archive.
 * Replaces scripts/_legacy/fetch-hoq-maps.cjs (the 88.214.20.58 HoQ API it called is dead).
 *
 * Reads public/data/archive/{ctf,tdm}.jsonl (all time, kept current by sync-hoqstats-archive.cjs)
 * and src/data/player-registry.json. Writes, for every registry player with a profile YAML
 * (hasProfile, published or not), public/data/hoq/<steamId>/map_ratings.json:
 *   [{ gametype_short, map_name, rating, games, win_pct, percentile }, ...]
 * the shape the old HoQ API file had, read by src/pages/stats/index.astro (per-map
 * leaderboards), src/pages/players/[id].astro (Map Performance) and src/pages/compare/index.astro.
 * One row per gametype and map the player has >= MIN_GAMES games on (the old files' floor; every
 * consumer filters at 10 or more), ctf before tdm, by rating desc (null last), then games desc.
 * A profiled player with no such map gets []. The old files' tdm2v2 rows have no source here.
 *
 * Definitions:
 *   map_name    the archive map through normalizeMapKey (scripts/lib/hoqstats.cjs)
 *   games       archived matches on the map, all time, any result (draws / no score included)
 *   win_pct     wins / (wins + losses) * 100, 1 dp, from the team result. Matches without a
 *               winner, and the few where the player is listed on both teams, count in games
 *               but not here. null if no match had a result.
 *   rating      mr[0] (per-map TrueSkill mu) from the player's latest match on the map, by match
 *               time, whose archive line carries mr; null if none does. Upstream publishes mr on
 *               every match; new archive lines get it from the sync, older ones were given it with
 *               sync-hoqstats-archive.cjs --route <ctf|tdm> --update-existing --fields mr.
 *   percentile  among all archived players (registry or not) with >= MIN_GAMES games and a rating
 *               on that gametype and map, the share of the others rated strictly lower, 0-100,
 *               rounded. null without a rating or when no one else qualifies.
 *
 * Usage:
 *   node scripts/derive-map-ratings.cjs            # write the files
 *   node scripts/derive-map-ratings.cjs --dry-run  # report only
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { normalizeMapKey } = require('./lib/hoqstats.cjs');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'public/data/archive');
const REGISTRY_PATH = path.join(ROOT, 'src/data/player-registry.json');
const HOQ_DIR = path.join(ROOT, 'public/data/hoq');
const GTS = ['ctf', 'tdm'];
const MIN_GAMES = 10;

const DRY_RUN = process.argv.slice(2).includes('--dry-run');

const round1 = n => Math.round(n * 10) / 10;

// Count of sorted[] strictly below x.
function countBelow(sorted, x) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// gt -> map -> sid -> { games, wins, losses, rating, ratingTs, mrGames }
async function readArchive(gt, byMap) {
  const file = path.join(ARCHIVE_DIR, `${gt}.jsonl`);
  if (!fs.existsSync(file)) throw new Error(`Archive not found: ${file}`);
  const seen = new Set();
  const counts = { matches: 0, withMr: 0, noMap: 0, noWinner: 0 };
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (seen.has(m.uuid)) continue; // the archive has a few duplicated lines
    seen.add(m.uuid);
    const mapName = normalizeMapKey(m.map);
    if (!mapName) { counts.noMap++; continue; }
    counts.matches++;
    if (m.winner == null) counts.noWinner++;
    if (m.players.some(p => p && p.mr)) counts.withMr++;
    let bySid = byMap.get(mapName);
    if (!bySid) { bySid = new Map(); byMap.set(mapName, bySid); }
    // A sid can be listed twice in one match (rejoined on the other team): one game, and no
    // result when the rows disagree on the team.
    const rows = new Map();
    for (const p of m.players) {
      if (!p || !p.sid) continue;
      if (!rows.has(p.sid)) rows.set(p.sid, []);
      rows.get(p.sid).push(p);
    }
    for (const [sid, ps] of rows) {
      let a = bySid.get(sid);
      if (!a) { a = { games: 0, wins: 0, losses: 0, rating: null, ratingTs: -Infinity, mrGames: null }; bySid.set(sid, a); }
      a.games++;
      const teams = new Set(ps.map(p => p.team));
      if (m.winner != null && teams.size === 1) {
        if (ps[0].team === m.winner) a.wins++;
        else a.losses++;
      }
      const withMr = ps.find(p => p.mr);
      if (withMr && m.ts >= a.ratingTs) {
        a.rating = withMr.mr[0];
        a.mrGames = withMr.mr[3];
        a.ratingTs = m.ts;
      }
    }
  }
  return counts;
}

function serialize(rows) {
  return rows.length ? `[\n${rows.map(r => JSON.stringify(r)).join(',\n')}\n]\n` : '[]\n';
}

async function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const profiled = (registry.players || []).filter(p => p.hasProfile && p.steamId).map(p => String(p.steamId));
  if (!profiled.length) throw new Error(`No hasProfile players with a steamId in ${REGISTRY_PATH}`);
  console.log(`Registry: ${(registry.players || []).length} players, ${profiled.length} with a profile and steamId`);

  const data = {};
  const percentiles = {};
  for (const gt of GTS) {
    const byMap = new Map();
    const c = await readArchive(gt, byMap);
    data[gt] = byMap;
    percentiles[gt] = new Map();
    for (const [mapName, bySid] of byMap) {
      const sorted = [...bySid.values()]
        .filter(a => a.games >= MIN_GAMES && a.rating != null)
        .map(a => a.rating)
        .sort((x, y) => x - y);
      percentiles[gt].set(mapName, sorted);
    }
    const pooled = [...percentiles[gt].values()].filter(s => s.length).length;
    console.log(`  ${gt}: ${c.matches} matches on ${byMap.size} maps, ${c.withMr} with mr, ` +
      `${c.noWinner} without a winner${c.noMap ? `, ${c.noMap} skipped (no map)` : ''}; ` +
      `${pooled} map(s) with rated players at >= ${MIN_GAMES} games`);
  }

  const stats = { files: 0, written: 0, unchanged: 0, empty: 0, rows: 0, rated: 0, mrGamesMismatch: [] };
  for (const sid of profiled) {
    const rows = [];
    for (const gt of GTS) {
      const gtRows = [];
      for (const [mapName, bySid] of data[gt]) {
        const a = bySid.get(sid);
        if (!a || a.games < MIN_GAMES) continue;
        let percentile = null;
        if (a.rating != null) {
          const sorted = percentiles[gt].get(mapName);
          const others = sorted.length - 1;
          if (others > 0) percentile = Math.round((countBelow(sorted, a.rating) / others) * 100);
          // mr[3] is upstream's count of the player's games on the map up to that match; while the
          // latest archived match on the map carries mr it should equal our all-time count.
          if (a.mrGames !== a.games) stats.mrGamesMismatch.push(`${sid} ${gt}/${mapName}: archive ${a.games}, mr ${a.mrGames}`);
        }
        const decided = a.wins + a.losses;
        gtRows.push({
          gametype_short: gt,
          map_name: mapName,
          rating: a.rating,
          games: a.games,
          win_pct: decided ? round1((a.wins / decided) * 100) : null,
          percentile,
        });
      }
      gtRows.sort((x, y) => (x.rating == null) - (y.rating == null) || (y.rating - x.rating) ||
        y.games - x.games || x.map_name.localeCompare(y.map_name));
      rows.push(...gtRows);
    }
    stats.files++;
    stats.rows += rows.length;
    stats.rated += rows.filter(r => r.rating != null).length;
    if (!rows.length) stats.empty++;
    const file = path.join(HOQ_DIR, sid, 'map_ratings.json');
    const text = serialize(rows);
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) { stats.unchanged++; continue; }
    stats.written++;
    if (DRY_RUN) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }

  const profiledSet = new Set(profiled);
  const stale = fs.readdirSync(HOQ_DIR)
    .filter(d => !profiledSet.has(d) && fs.existsSync(path.join(HOQ_DIR, d, 'map_ratings.json')));

  console.log(`\n${stats.files} profiled player(s): ${stats.rows} map row(s), ${stats.rated} with a rating, ` +
    `${stats.rows - stats.rated} without (no archived match on that map carries mr); ${stats.empty} with no map at >= ${MIN_GAMES} games`);
  console.log(`mr games vs archive games (rated rows): ${stats.mrGamesMismatch.length} mismatch(es)`);
  for (const s of stats.mrGamesMismatch.slice(0, 15)) console.log(`  ${s}`);
  if (stats.mrGamesMismatch.length > 15) console.log(`  ... ${stats.mrGamesMismatch.length - 15} more`);
  if (stale.length) console.log(`Not touched, no profile for: ${stale.join(', ')}`);
  console.log(DRY_RUN
    ? `--dry-run: ${stats.written} file(s) would change, ${stats.unchanged} unchanged; nothing written.`
    : `Wrote ${stats.written} file(s) under ${path.relative(ROOT, HOQ_DIR)}, ${stats.unchanged} unchanged.`);
}

main().catch(err => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
