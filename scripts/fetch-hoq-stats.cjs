#!/usr/bin/env node
/**
 * Fetch player favorites and weapon accuracies from HoQ player pages
 *
 * Source: http://88.214.20.58/player/{steamId}
 *
 * Usage:
 *   node scripts/fetch-hoq-stats.cjs                  # Fetch from HoQ and update YAMLs
 *   node scripts/fetch-hoq-stats.cjs --from-json      # Import from scripts/hoq-stats-data.json
 *   node scripts/fetch-hoq-stats.cjs --fetch-only     # Fetch from HoQ, save JSON, don't update YAMLs
 *   node scripts/fetch-hoq-stats.cjs --dry-run        # Show what would be updated without writing
 *   node scripts/fetch-hoq-stats.cjs --save-html      # Save raw HTML pages to scripts/hoq-html/ for debugging
 */

const fs = require('fs');
const path = require('path');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const STATS_JSON = path.join(__dirname, 'hoq-stats-data.json');
const HTML_DIR = path.join(__dirname, 'hoq-html');
const USE_JSON = process.argv.includes('--from-json');
const FETCH_ONLY = process.argv.includes('--fetch-only');
const DRY_RUN = process.argv.includes('--dry-run');
const SAVE_HTML = process.argv.includes('--save-html');
const HOQ_BASE = 'http://88.214.20.58/player';
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getPlayersWithSteamIds() {
  const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const players = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(PLAYERS_DIR, file), 'utf8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const steamIdMatch = content.match(/^steamId:\s*["']?(\d{17})["']?\s*$/m);

    if (nameMatch && steamIdMatch) {
      players.push({
        file,
        name: nameMatch[1].trim().replace(/^["']|["']$/g, ''),
        steamId: steamIdMatch[1],
        path: path.join(PLAYERS_DIR, file),
      });
    }
  }

  return players;
}

function parseHoqPage(html, playerName) {
  const result = {};

  const favoriteFields = [
    { field: 'favorite_map', label: 'Arena' },
    { field: 'favorite_gametype', label: 'Gametype' },
    { field: 'favorite_weapon', label: 'Weapon' },
  ];

  for (const { field, label } of favoriteFields) {
    const liPattern = new RegExp(`<li[^>]*>\\s*${label}\\s*:\\s*([^<]+)`, 'i');
    const tdPattern = new RegExp(`<td[^>]*>\\s*${label}\\s*<\\/td>\\s*<td[^>]*>\\s*([^<]+)`, 'i');
    const dlPattern = new RegExp(`<dt[^>]*>\\s*${label}\\s*<\\/dt>\\s*<dd[^>]*>\\s*([^<]+)`, 'i');
    const kvPattern = new RegExp(`${label}\\s*[:=]\\s*([^\\n<]+)`, 'i');

    for (const pattern of [liPattern, tdPattern, dlPattern, kvPattern]) {
      const match = html.match(pattern);
      if (match) {
        const value = match[1].trim();
        if (value && value !== '-' && value !== 'N/A' && value !== 'None' && value.length < 100) {
          result[field] = value;
          break;
        }
      }
    }
  }

  const weapons = [
    { name: 'Rocket Launcher', key: 'accuracy_rl' },
    { name: 'Railgun', key: 'accuracy_rg' },
    { name: 'Lightning Gun', key: 'accuracy_lg' },
  ];

  let accuracyColIndex = -1;
  const allTheads = [...html.matchAll(/<thead[^>]*>[\s\S]*?<\/thead>/gi)];
  for (const theadMatch of allTheads) {
    const thCells = [...theadMatch[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
    for (let i = 0; i < thCells.length; i++) {
      const text = thCells[i][1].replace(/<[^>]*>/g, '').trim().toLowerCase();
      if (text === 'accuracy' || text === 'acc' || text === 'acc%') {
        accuracyColIndex = i;
        break;
      }
    }
    if (accuracyColIndex >= 0) break;
  }

  const allRows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const { name, key } of weapons) {
    const weaponRow = allRows.find(m => {
      const text = m[1].replace(/<[^>]*>/g, '');
      if (!text.includes(name)) return false;
      const cellCount = [...m[1].matchAll(/<td[^>]*>/gi)].length;
      return cellCount >= 3;
    });

    if (weaponRow) {
      const cells = [...weaponRow[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(m => m[1].replace(/<[^>]*>/g, '').trim());

      if (accuracyColIndex >= 0 && accuracyColIndex < cells.length) {
        const accuracy = parseFloat(cells[accuracyColIndex].replace('%', ''));
        if (!isNaN(accuracy) && accuracy >= 0 && accuracy <= 100) {
          result[key] = accuracy;
        }
      } else {
        console.warn(`  Warning: no accuracy column header found for ${name} (player: ${playerName || 'unknown'}) — skipping`);
      }
    }
  }

  return result;
}

async function fetchPlayerStats(steamId, playerName) {
  const url = `${HOQ_BASE}/${steamId}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'http://88.214.20.58/',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return { html: null, stats: null };
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  if (html.length < 500) {
    return { html, stats: null };
  }

  return { html, stats: parseHoqPage(html, playerName) };
}

function loadStatsFromJson() {
  if (!fs.existsSync(STATS_JSON)) {
    console.error(`Error: ${STATS_JSON} not found`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(STATS_JSON, 'utf8'));
  console.log(`Loaded ${Object.keys(data).length} players from JSON`);
  return data;
}

function updatePlayerYaml(playerPath, stats) {
  let content = fs.readFileSync(playerPath, 'utf8');

  const fields = [
    'favorite_map', 'favorite_gametype', 'favorite_weapon',
    'accuracy_rl', 'accuracy_rg', 'accuracy_lg',
  ];

  for (const field of fields) {
    content = content.replace(new RegExp(`^${field}:.*\\n?`, 'gm'), '');
  }

  const newLines = [];
  if (stats.favorite_map) newLines.push(`favorite_map: ${yamlValue(stats.favorite_map)}`);
  if (stats.favorite_gametype) newLines.push(`favorite_gametype: ${yamlValue(stats.favorite_gametype)}`);
  if (stats.favorite_weapon) newLines.push(`favorite_weapon: ${yamlValue(stats.favorite_weapon)}`);
  if (stats.accuracy_rl != null) newLines.push(`accuracy_rl: ${stats.accuracy_rl}`);
  if (stats.accuracy_rg != null) newLines.push(`accuracy_rg: ${stats.accuracy_rg}`);
  if (stats.accuracy_lg != null) newLines.push(`accuracy_lg: ${stats.accuracy_lg}`);

  if (newLines.length === 0) return false;

  content = content.trimEnd() + '\n' + newLines.join('\n') + '\n';

  if (!DRY_RUN) {
    fs.writeFileSync(playerPath, content);
  }
  return true;
}

function yamlValue(str) {
  if (/[:#{}[\],&*?|>!%@`'"]/.test(str) || str.includes('\n')) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

async function main() {
  console.log('=== Fetching HoQ Player Stats ===\n');
  if (DRY_RUN) console.log('(DRY RUN - no files will be modified)\n');
  if (FETCH_ONLY) console.log('(FETCH ONLY - will save JSON but not update YAMLs)\n');

  const players = getPlayersWithSteamIds();
  console.log(`Found ${players.length} players with Steam IDs\n`);

  let statsMap;

  if (USE_JSON) {
    statsMap = loadStatsFromJson();
  } else {
    statsMap = {};
    if (SAVE_HTML) {
      fs.mkdirSync(HTML_DIR, { recursive: true });
    }
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let notFound = 0;

  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (player) => {
      let stats;

      if (USE_JSON) {
        stats = statsMap[player.steamId];
        if (!stats) { skipped++; return; }
      } else {
        try {
          process.stdout.write(`  Fetching ${player.name} (${player.steamId})...`);
          const result = await fetchPlayerStats(player.steamId, player.name);

          if (SAVE_HTML && result.html) {
            fs.writeFileSync(path.join(HTML_DIR, `${player.steamId}.html`), result.html);
          }

          if (!result.stats) { console.log(' not found'); notFound++; return; }
          stats = result.stats;
          if (Object.keys(stats).length === 0) { console.log(' no data'); skipped++; return; }
          console.log(' OK');
          statsMap[player.steamId] = stats;
        } catch (err) {
          console.log(` error: ${err.message}`);
          errors++;
          return;
        }
      }

      if (FETCH_ONLY) return;

      const success = updatePlayerYaml(player.path, stats);
      if (success) {
        const parts = [];
        if (stats.favorite_map) parts.push(`Map=${stats.favorite_map}`);
        if (stats.favorite_gametype) parts.push(`GT=${stats.favorite_gametype}`);
        if (stats.favorite_weapon) parts.push(`Wep=${stats.favorite_weapon}`);
        if (stats.accuracy_rl != null) parts.push(`RL=${stats.accuracy_rl}%`);
        if (stats.accuracy_rg != null) parts.push(`RG=${stats.accuracy_rg}%`);
        if (stats.accuracy_lg != null) parts.push(`LG=${stats.accuracy_lg}%`);
        console.log(`  ${DRY_RUN ? '[DRY]' : '✓'} ${player.name}: ${parts.join(', ')}`);
        updated++;
      }
    }));

    await sleep(BATCH_DELAY_MS);
  }

  if (!USE_JSON && Object.keys(statsMap).length > 0) {
    fs.writeFileSync(STATS_JSON, JSON.stringify(statsMap, null, 2));
    console.log(`\nSaved fetched data to ${path.relative(process.cwd(), STATS_JSON)}`);
  }

  console.log(`\n=== Complete ===`);
  if (!FETCH_ONLY) console.log(`Players updated: ${updated}`);
  console.log(`Players skipped (no data in JSON): ${skipped}`);
  console.log(`Players not found on HoQ: ${notFound}`);
  if (errors > 0) console.log(`Errors: ${errors}`);
}

main().catch(console.error);