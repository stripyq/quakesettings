#!/usr/bin/env node
/**
 * fetch-qlrace.js
 * Fetches VQL race data from qlrace.com for all players in the database
 * and merges it into their YAML files.
 *
 * Usage:
 *   node scripts/fetch-qlrace.js
 *   node scripts/fetch-qlrace.js --dry-run        # preview without writing
 *   node scripts/fetch-qlrace.js --player 76561198042268423  # single player
 *   node scripts/fetch-qlrace.js --force           # overwrite existing qlrace data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const QLRACE_API  = 'https://qlrace.com/api/player';
const DELAY_MS    = 400;
const MIN_RECORDS = 1;

const FLAGS = {
  dryRun:  process.argv.includes('--dry-run'),
  force:   process.argv.includes('--force'),
  player:  process.argv.includes('--player')
             ? process.argv[process.argv.indexOf('--player') + 1]
             : null,
  verbose: process.argv.includes('--verbose'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = {
  info:  (...a) => console.log('  ', ...a),
  ok:    (...a) => console.log('✓ ', ...a),
  skip:  (...a) => console.log('–  ', ...a),
  warn:  (...a) => console.warn('⚠  ', ...a),
  error: (...a) => console.error('✗ ', ...a),
};

async function fetchJson(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
}

async function fetchMode(steamId, mode) {
  const url = `${QLRACE_API}/${steamId}?mode=${mode}`;
  if (FLAGS.verbose) log.info(`GET ${url}`);
  return fetchJson(url);
}

function buildSummary(data, mode) {
  if (!data || !data.records || data.records.length < MIN_RECORDS) return null;

  const records = data.records;

  const best = records.reduce((acc, r) => {
    const pct = r.rank / r.total_records;
    return pct < acc.pct ? { pct, r } : acc;
  }, { pct: Infinity, r: null }).r;

  const speedTop = Math.max(...records.map((r) => r.speed_top ?? 0));

  const avgRankPct = +(
    records.reduce((sum, r) => sum + r.rank / r.total_records, 0) /
    records.length * 100
  ).toFixed(1);

  return {
    mode,
    records: records.length,
    wrs:     data.medals?.[0] ?? 0,
    medals: {
      gold:   data.medals?.[0] ?? 0,
      silver: data.medals?.[1] ?? 0,
      bronze: data.medals?.[2] ?? 0,
    },
    speed_top:        +speedTop.toFixed(1),
    average_rank_pct: avgRankPct,
    best_record: best ? {
      map:      best.map,
      rank:     best.rank,
      total:    best.total_records,
      time:     best.time,
      rank_pct: +(best.rank / best.total_records * 100).toFixed(1),
    } : null,
    top_maps: records
      .sort((a, b) => (a.rank / a.total_records) - (b.rank / b.total_records))
      .slice(0, 10)
      .map((r) => ({
        map:   r.map,
        rank:  r.rank,
        total: r.total_records,
        time:  r.time,
      })),
    fetched_at: new Date().toISOString().split('T')[0],
  };
}

function updatePlayerYaml(filePath, summary) {
  const raw     = fs.readFileSync(filePath, 'utf8');
  const data    = yaml.load(raw);
  data.qlrace   = summary;
  const updated = yaml.dump(data, { lineWidth: 120, quotingType: '"' });
  if (!FLAGS.dryRun) {
    fs.writeFileSync(filePath, updated, 'utf8');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function processPlayer(filePath) {
  const raw  = fs.readFileSync(filePath, 'utf8');
  const data = yaml.load(raw);

  const steamId = data.steamId;
  const name    = data.name ?? steamId;

  if (!steamId) {
    log.warn(`${path.basename(filePath)}: no steam_id, skipping`);
    return { status: 'skip' };
  }

  if (!FLAGS.force && data.qlrace?.fetched_at) {
    log.skip(`${name}: already has qlrace data (${data.qlrace.fetched_at}), use --force to refresh`);
    return { status: 'skip' };
  }

  let summary  = null;
  let usedMode = null;

  for (const mode of [2, 3]) {
    const raw = await fetchMode(steamId, mode);
    await sleep(DELAY_MS);
    summary = buildSummary(raw, mode);
    if (summary) { usedMode = mode; break; }
  }

  const modeLabel = usedMode === 2 ? 'VQL Weapons' : usedMode === 3 ? 'VQL Strafe' : 'none';

  if (!summary) {
    log.skip(`${name}: no VQL records found`);
    updatePlayerYaml(filePath, null);
    return { status: 'none', name };
  }

  updatePlayerYaml(filePath, summary);

  log.ok(
    `${name}: ${summary.records} records (${modeLabel}), ` +
    `${summary.wrs} WRs, best: rank ${summary.best_record?.rank}/${summary.best_record?.total} on ${summary.best_record?.map}, ` +
    `top speed: ${summary.speed_top}`
  );

  return { status: 'ok', name, summary };
}

async function main() {
  console.log('\n🏁  QLRace VQL data fetch\n');
  if (FLAGS.dryRun) console.log('  [DRY RUN — no files will be written]\n');

  let files = fs
    .readdirSync(PLAYERS_DIR)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => path.join(PLAYERS_DIR, f));

  if (FLAGS.player) {
    files = files.filter((f) => f.includes(FLAGS.player));
    if (!files.length) {
      log.error(`No player file found matching steam_id: ${FLAGS.player}`);
      process.exit(1);
    }
  }

  console.log(`  Found ${files.length} player file(s)\n`);

  const results = { ok: 0, none: 0, skip: 0, error: 0 };

  for (const file of files) {
    try {
      const r = await processPlayer(file);
      results[r.status]++;
    } catch (err) {
      log.error(`${path.basename(file)}: ${err.message}`);
      results.error++;
    }
  }

  console.log(`
  ── Summary ──────────────────────────
  Updated : ${results.ok}
  No data : ${results.none}
  Skipped : ${results.skip}
  Errors  : ${results.error}
  `);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
