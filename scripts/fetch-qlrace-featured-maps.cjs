#!/usr/bin/env node
/**
 * Fetch specific "featured map" records from qlrace.com and merge them into
 * each player's YAML under qlrace.featured_maps.
 *
 * Unlike fetch-qlrace.cjs (which tries mode 2 and falls back to mode 3), this
 * script ALWAYS checks both VQL modes so we capture hangtime-df / hangtime2-df
 * times even for players whose primary record set is in the other mode.
 *
 * Only modifies players who already have a non-null qlrace block — players
 * with qlrace: null genuinely have no QL race records, so they won't have
 * hangtime times either. Run fetch-qlrace.cjs first if the registry is stale.
 *
 * Usage:
 *   node scripts/fetch-qlrace-featured-maps.cjs
 *   node scripts/fetch-qlrace-featured-maps.cjs --dry-run
 *   node scripts/fetch-qlrace-featured-maps.cjs --player <steamId>
 *   node scripts/fetch-qlrace-featured-maps.cjs --maps hangtime-df,hangtime2-df
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const API_BASE = 'https://qlrace.com/api';
const DEFAULT_FEATURED_MAPS = ['hangtime-df', 'hangtime2-df'];
const MODES = [2, 3]; // 2 = VQL Weapons, 3 = VQL Strafe
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 1000;

const DRY_RUN = process.argv.includes('--dry-run');
const SINGLE_PLAYER = (() => {
  const idx = process.argv.indexOf('--player');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();
const FEATURED_MAPS = (() => {
  const idx = process.argv.indexOf('--maps');
  return idx !== -1 && process.argv[idx + 1]
    ? process.argv[idx + 1].split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_FEATURED_MAPS;
})();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function modeLabel(mode) {
  if (mode === 2) return 'VQL Weapons';
  if (mode === 3) return 'VQL Strafe';
  return `mode ${mode}`;
}

function formatTime(ms) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const secStr = seconds < 10 ? '0' + seconds.toFixed(3) : seconds.toFixed(3);
  return `${minutes}:${secStr}`;
}

/**
 * Extract featured-map entries from a player's mode-specific API response.
 * Returns array of { map, mode, time, rank, total, speed_top?, date? }.
 */
function extractFeatured(apiData, mode) {
  if (!apiData || !Array.isArray(apiData.records)) return [];
  const hits = [];
  for (const r of apiData.records) {
    // Include explicit --maps / DEFAULT_FEATURED_MAPS entries, PLUS any
    // map whose name starts with 'hangtime' so the full family gets picked
    // up automatically without hardcoding every variant.
    const isHangtime = typeof r.map === 'string' && /^hangtime/i.test(r.map);
    if (!FEATURED_MAPS.includes(r.map) && !isHangtime) continue;
    if (!r.time || !r.rank || !r.total_records) continue;
    const entry = {
      map: r.map,
      mode,
      time: r.time,
      rank: r.rank,
      total: r.total_records,
    };
    if (r.speed_top != null && r.speed_top > 0) {
      entry.speed_top = Math.round(r.speed_top * 10) / 10;
    }
    if (r.date) entry.date = r.date;
    hits.push(entry);
  }
  return hits;
}

/**
 * Extract the set of unique map slugs from a mode-specific API response.
 * Used to compute the total unique-maps-completed across both VQL modes,
 * since `qlrace.records` only reflects one mode (whichever was fetched first).
 */
function extractMapSet(apiData) {
  const set = new Set();
  if (!apiData || !Array.isArray(apiData.records)) return set;
  for (const r of apiData.records) {
    if (r.map) set.add(r.map);
  }
  return set;
}

/**
 * Build a fresh qlrace block from a mode-specific API response.
 * Mirrors the shape produced by scripts/fetch-qlrace.cjs so downstream
 * consumers (stats page, player page) see consistent data.
 * Used when a player has no existing qlrace block yet.
 */
function buildQlraceBlock(apiData, mode) {
  const records = apiData.records || [];
  const apiMedals = Array.isArray(apiData.medals) ? apiData.medals : [0, 0, 0];
  const gold = apiMedals[0] || 0;
  const silver = apiMedals[1] || 0;
  const bronze = apiMedals[2] || 0;

  const speeds = records.map(r => r.speed_top).filter(s => s != null && s > 0);
  const speedTop = speeds.length > 0 ? Math.max(...speeds) : null;

  const rankPcts = records
    .map(r => (r.rank && r.total_records ? (r.rank / r.total_records) * 100 : null))
    .filter(v => v != null);
  const averageRankPct = rankPcts.length > 0
    ? Math.round((rankPcts.reduce((a, b) => a + b, 0) / rankPcts.length) * 10) / 10
    : null;

  const sorted = records
    .filter(r => r.rank && r.total_records && r.total_records > 0)
    .map(r => ({
      map: r.map,
      rank: r.rank,
      total: r.total_records,
      time: r.time,
      rank_pct: Math.round((r.rank / r.total_records) * 1000) / 10,
    }))
    .sort((a, b) => a.rank_pct - b.rank_pct);

  const block = {
    mode,
    records: records.length,
    wrs: gold,
    medals: { gold, silver, bronze },
  };
  if (speedTop != null) block.speed_top = Math.round(speedTop * 10) / 10;
  if (averageRankPct != null) block.average_rank_pct = averageRankPct;
  if (sorted.length > 0) block.best_record = sorted[0];
  if (sorted.length > 0) block.top_maps = sorted.slice(0, 5);
  block.fetched_at = new Date().toISOString().split('T')[0];
  return block;
}

/**
 * Merge featured_maps into an existing qlrace block inside a YAML file.
 * Preserves all other fields in the block. Returns { changed, reason?, hits }.
 */
function updateYamlFile(filePath, featured, uniqueMapCount, freshBlock) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Match from `qlrace:` at column 0 through the end of its indented block.
  // End at the next top-level YAML key (line starting with a letter or
  // underscore at column 0), or at end of string.
  // NOTE: `\z` is NOT end-of-string in JavaScript regex — it's literal `z`.
  //       Use `(?![\s\S])` instead.
  const qlraceRegex = /^qlrace:[\s\S]*?(?=\n[a-zA-Z_]|(?![\s\S]))/m;
  const match = content.match(qlraceRegex);

  let qlraceObj;
  let blockWasMissing = false;
  let blockWasNull = false;

  if (!match) {
    // No qlrace line at all. If we have a fresh block (player has VQL data),
    // we'll create one. Otherwise leave the file untouched.
    if (!freshBlock) return { changed: false, reason: 'no qlrace line, no API data', hits: 0 };
    qlraceObj = freshBlock;
    blockWasMissing = true;
  } else {
    let parsed;
    try {
      parsed = yaml.load(match[0]);
    } catch (e) {
      return { changed: false, reason: 'yaml parse error: ' + e.message, hits: 0 };
    }

    if (!parsed || parsed.qlrace == null) {
      // qlrace: null — player had no data when fetch-qlrace.cjs ran.
      // If we now see VQL records, replace null with a full block.
      if (!freshBlock) return { changed: false, reason: 'qlrace is null (still no data)', hits: 0 };
      qlraceObj = freshBlock;
      blockWasNull = true;
    } else {
      qlraceObj = parsed.qlrace;
    }
  }

  // Deterministic order: by map name, then by mode number.
  const sorted = [...featured].sort((a, b) => {
    if (a.map !== b.map) return a.map.localeCompare(b.map);
    return a.mode - b.mode;
  });

  // featured_maps: add/remove based on hits
  if (sorted.length === 0) {
    delete qlraceObj.featured_maps;
  } else {
    qlraceObj.featured_maps = sorted;
  }

  // unique_maps_vql: total distinct maps across mode 2 + mode 3.
  // 0 means we checked both modes but the player has no VQL records at all,
  // which shouldn't happen since we only run this for players with an
  // existing qlrace block — but belt & suspenders.
  if (typeof uniqueMapCount === 'number' && uniqueMapCount > 0) {
    qlraceObj.unique_maps_vql = uniqueMapCount;
  }

  const newYaml = yaml.dump({ qlrace: qlraceObj }, {
    flowLevel: 3,
    lineWidth: 120,
    noRefs: true,
  }).trimEnd();

  let newContent;
  if (blockWasMissing) {
    // No qlrace line existed — append the new block at end of file.
    // Ensure exactly one trailing newline before we add.
    newContent = content.replace(/\s*$/, '') + '\n' + newYaml + '\n';
  } else {
    // Existing qlrace block (populated or null) — replace it in place.
    // Use a function replacement so `$` characters in newYaml (if any)
    // aren't interpreted as regex back-references.
    newContent = content.replace(qlraceRegex, () => newYaml);
  }

  if (newContent === content) return { changed: false, reason: 'no diff', hits: sorted.length };

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, newContent, 'utf8');
  }
  return {
    changed: true,
    hits: sorted.length,
    created: blockWasMissing || blockWasNull,
  };
}

async function main() {
  console.log('=== QLRace featured-map fetch ===');
  console.log('Maps : ' + FEATURED_MAPS.join(', '));
  console.log('Modes: ' + MODES.map(m => `${m} (${modeLabel(m)})`).join(', '));
  if (DRY_RUN) console.log('(--dry-run: no files will be modified)');
  console.log('');

  const yamlFiles = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const players = [];

  for (const file of yamlFiles) {
    const filePath = path.join(PLAYERS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const steamIdMatch = content.match(/^steamId:\s*["']?(\d{17})["']?/m);
    if (!steamIdMatch) continue;
    const steamId = steamIdMatch[1];
    if (SINGLE_PLAYER && steamId !== SINGLE_PLAYER) continue;
    // NOTE: we intentionally do NOT filter on the presence of a qlrace
    // block. If a player has VQL data but no block yet, this script
    // creates one. If they have no data, updateYamlFile is a no-op.
    const nameMatch = content.match(/^name:\s*["']?([^"'\n]+)["']?/m);
    const name = nameMatch ? nameMatch[1].trim() : file.replace('.yaml', '');
    players.push({ steamId, name, file, filePath });
  }

  console.log(`Scanning ${players.length} players with steamId\n`);
  if (players.length === 0) return;

  let playersWithHits = 0;
  let totalHits = 0;
  let filesChanged = 0;
  let blocksCreated = 0;

  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(players.length / BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async ({ steamId, name, file, filePath }) => {
        const featured = [];
        const allMaps = new Set();
        const modeData = {};
        for (const mode of MODES) {
          const data = await fetchJson(`${API_BASE}/player/${steamId}?mode=${mode}`);
          modeData[mode] = data;
          featured.push(...extractFeatured(data, mode));
          for (const m of extractMapSet(data)) allMaps.add(m);
        }
        let freshBlock = null;
        const m2 = modeData[2] && Array.isArray(modeData[2].records) ? modeData[2].records.length : 0;
        const m3 = modeData[3] && Array.isArray(modeData[3].records) ? modeData[3].records.length : 0;
        if (m2 > 0) freshBlock = buildQlraceBlock(modeData[2], 2);
        else if (m3 > 0) freshBlock = buildQlraceBlock(modeData[3], 3);
        return { name, file, filePath, featured, uniqueMapCount: allMaps.size, freshBlock };
      })
    );

    for (const { name, file, filePath, featured, uniqueMapCount, freshBlock } of results) {
      const updateResult = updateYamlFile(filePath, featured, uniqueMapCount, freshBlock);
      const hitList = featured.length > 0
        ? featured.map(f => `${f.map} m${f.mode}=${formatTime(f.time)} #${f.rank}/${f.total}`).join('  ')
        : 'none';
      let tag = '';
      if (updateResult.changed) {
        const created = updateResult.created ? ' NEW' : '';
        tag = ` [updated${created}, ${uniqueMapCount} unique maps]`;
      } else if ((featured.length > 0 || freshBlock) && updateResult.reason) {
        tag = ` [SKIP: ${updateResult.reason}]`;
      }
      console.log(`  [${batchNum}/${totalBatches}] ${name}: ${hitList}${tag}`);
      if (featured.length > 0) {
        playersWithHits++;
        totalHits += featured.length;
      }
      if (updateResult.changed) filesChanged++;
      if (updateResult.created) blocksCreated++;
    }

    if (i + BATCH_SIZE < players.length) await sleep(BATCH_DELAY_MS);
  }

  console.log('\n========================================');
  console.log(`Players with featured-map records: ${playersWithHits}`);
  console.log(`Total featured-map records:        ${totalHits}`);
  console.log(`New qlrace blocks created:         ${blocksCreated}`);
  console.log(`Files ${DRY_RUN ? 'that would be ' : ''}modified:        ${filesChanged}`);
  if (DRY_RUN) console.log('(dry-run: no files were modified)');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
