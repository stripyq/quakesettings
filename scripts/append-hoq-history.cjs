#!/usr/bin/env node
/**
 * Append current HoQ ratings as new points in the per-player history files
 * that feed the "HoQ Rating History" chart.
 *
 * Why this exists: the old HoQ server (88.214.20.58) exposed per-game
 * history.json per player; it went offline in July 2026 and its replacement
 * (stats.houseofquake.com, QLLR software) has no history endpoint. This script
 * keeps public/data/hoq/<steamId>/history.json alive by appending one point
 * per gametype per refresh, sourced from the hoq* fields in the player YAMLs.
 *
 * Run order: AFTER fetch-hoq-ratings.cjs (it reads what that script wrote).
 *
 * File format (unchanged; what the player/compare pages already read):
 *   [{ timestamp, gametype_short, rating, game_num }, ...]
 *
 * Rules:
 *   - Append-only: existing points are never modified or removed.
 *   - A point is appended only when game_num (games played) moved since the
 *     last recorded point for that gametype.
 *   - Never appends a games regression (guard against stale YAML input).
 *   - Null-safe: rating 0 is valid; missing hoq* fields are skipped.
 *
 * Usage:
 *   node scripts/append-hoq-history.cjs            # append points
 *   node scripts/append-hoq-history.cjs --dry-run  # print without writing
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const HOQ_DIR = path.join(__dirname, '../public/data/hoq');
const DRY_RUN = process.argv.includes('--dry-run');

function loadYaml(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return yaml.load(raw);
  } catch {
    // Fallback for frontmatter-fenced files
    const body = raw.replace(/^---\r?\n/, '').split(/\r?\n---/)[0];
    return yaml.load(body);
  }
}

function main() {
  const files = fs.readdirSync(PLAYERS_DIR).filter((f) => f.endsWith('.yaml'));
  const now = Math.floor(Date.now() / 1000);

  let appended = 0;
  let playersTouched = 0;
  let unchanged = 0;
  let noData = 0;

  console.log(`=== Append HoQ history points (${DRY_RUN ? 'dry-run' : 'write'}) ===`);
  console.log(`Players dir: ${files.length} YAML files`);

  for (const file of files) {
    let data;
    try {
      data = loadYaml(path.join(PLAYERS_DIR, file));
    } catch (e) {
      console.error(`  SKIP ${file}: YAML parse error (${e.message})`);
      continue;
    }
    if (!data || data.steamId == null) continue;
    const steamId = String(data.steamId);

    const modes = [
      ['ctf', data.hoqCtfRating, data.hoqCtfGames],
      ['tdm', data.hoqTdmRating, data.hoqTdmGames],
    ];

    const dir = path.join(HOQ_DIR, steamId);
    const histPath = path.join(dir, 'history.json');
    let hist = [];
    if (fs.existsSync(histPath)) {
      try {
        hist = JSON.parse(fs.readFileSync(histPath, 'utf8'));
      } catch (e) {
        console.error(`  SKIP ${file}: unreadable history.json (${e.message})`);
        continue;
      }
      if (!Array.isArray(hist)) {
        console.error(`  SKIP ${file}: history.json is not an array`);
        continue;
      }
    }

    let touched = false;
    for (const [gt, rating, games] of modes) {
      if (rating == null || games == null) {
        noData++;
        continue;
      }
      // Never seed a history with a zero-games point (player has not played this mode)
      if (games === 0) {
        noData++;
        continue;
      }
      let last = null;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].gametype_short === gt) {
          last = hist[i];
          break;
        }
      }
      if (last && last.game_num === games) {
        unchanged++;
        continue;
      }
      if (last && games < last.game_num) {
        console.warn(`  WARN ${file} ${gt}: games ${games} < last recorded ${last.game_num}; not appending (stale input?)`);
        continue;
      }
      hist.push({ timestamp: now, gametype_short: gt, rating, game_num: games });
      appended++;
      touched = true;
      console.log(
        `  ${data.name || file} ${gt}: +point rating=${rating} games=${games}${last ? ` (last recorded ${last.game_num})` : ' (first point)'}`
      );
    }

    if (touched) {
      playersTouched++;
      if (!DRY_RUN) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(histPath, JSON.stringify(hist));
      }
    }
  }

  console.log('--- Summary ---');
  console.log(`Points appended: ${appended} across ${playersTouched} players${DRY_RUN ? ' (dry-run, nothing written)' : ''}`);
  console.log(`Unchanged (no new games): ${unchanged}`);
  console.log(`Skipped (no hoq* data): ${noData}`);
}

main();
