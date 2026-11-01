#!/usr/bin/env node
/**
 * Derive per-player monthly CTF activity for profiled players from the local match archive.
 * Replaces scripts/_legacy/fetch-player-activity.cjs (the 77.90.2.137 season tracker API it called
 * is dead; its files only ever covered 2025-12 .. 2026-02).
 *
 * Reads public/data/archive/ctf.jsonl (kept current by sync-hoqstats-archive.cjs) and
 * src/data/player-registry.json. Writes, for every registry player with a profile YAML
 * (hasProfile, published or not), public/data/player-activity/<steamId>.json:
 *   [{ month: "YYYY-MM", games }, ...]
 * the activity bars behind the CTF rating history on src/pages/players/[id].astro. Months run from
 * the player's first to last archived CTF match, gaps filled with 0; a player with no CTF match
 * gets []. games counts each match once (also when a player is listed on both teams); months are
 * UTC, like activity.json from derive-archive.cjs. The current month is written as it stands: the
 * page leaves out incomplete months (src/utils/completePeriods.ts).
 *
 * Usage:
 *   node scripts/derive-player-activity.cjs            # write the files
 *   node scripts/derive-player-activity.cjs --dry-run  # report only
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVE_FILE = path.join(ROOT, 'public/data/archive/ctf.jsonl');
const REGISTRY_PATH = path.join(ROOT, 'src/data/player-registry.json');
const OUT_DIR = path.join(ROOT, 'public/data/player-activity');

const DRY_RUN = process.argv.slice(2).includes('--dry-run');

// Every YYYY-MM from first to last, inclusive.
function monthRange(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function serialize(rows) {
  return rows.length ? `[\n${rows.map(r => JSON.stringify(r)).join(',\n')}\n]\n` : '[]\n';
}

async function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const profiled = (registry.players || []).filter(p => p.hasProfile && p.steamId).map(p => String(p.steamId));
  if (!profiled.length) throw new Error(`No hasProfile players with a steamId in ${REGISTRY_PATH}`);
  if (!fs.existsSync(ARCHIVE_FILE)) throw new Error(`Archive not found: ${ARCHIVE_FILE}`);
  const wanted = new Set(profiled);

  // sid -> month -> games
  const bySid = new Map();
  const seen = new Set();
  let matches = 0;
  let newestMonth = '';
  const rl = readline.createInterface({ input: fs.createReadStream(ARCHIVE_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (seen.has(m.uuid)) continue; // the archive has a few duplicated lines
    seen.add(m.uuid);
    matches++;
    const month = new Date(m.ts * 1000).toISOString().slice(0, 7);
    if (month > newestMonth) newestMonth = month;
    for (const sid of new Set(m.players.filter(p => p && p.sid).map(p => p.sid))) {
      if (!wanted.has(sid)) continue;
      let months = bySid.get(sid);
      if (!months) { months = new Map(); bySid.set(sid, months); }
      months.set(month, (months.get(month) || 0) + 1);
    }
  }
  console.log(`Registry: ${profiled.length} profiled players; archive: ${matches} CTF matches, newest month ${newestMonth}`);

  const stats = { written: 0, unchanged: 0, empty: 0, months: 0 };
  for (const sid of profiled) {
    const months = bySid.get(sid);
    let rows = [];
    if (months) {
      const keys = [...months.keys()].sort();
      rows = monthRange(keys[0], keys[keys.length - 1]).map(month => ({ month, games: months.get(month) || 0 }));
    } else {
      stats.empty++;
    }
    stats.months += rows.length;
    const file = path.join(OUT_DIR, `${sid}.json`);
    const text = serialize(rows);
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) { stats.unchanged++; continue; }
    stats.written++;
    if (DRY_RUN) continue;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(file, text);
  }

  const profiledSet = new Set(profiled);
  const stale = fs.existsSync(OUT_DIR)
    ? fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json') && !profiledSet.has(f.slice(0, -5)))
    : [];
  console.log(`${profiled.length} profiled player(s): ${stats.months} month row(s); ${stats.empty} with no CTF match ([])`);
  if (stale.length) console.log(`Not touched, no profile for: ${stale.join(', ')}`);
  console.log(DRY_RUN
    ? `--dry-run: ${stats.written} file(s) would change, ${stats.unchanged} unchanged; nothing written.`
    : `Wrote ${stats.written} file(s) under ${path.relative(ROOT, OUT_DIR)}, ${stats.unchanged} unchanged.`);
}

main().catch(err => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
