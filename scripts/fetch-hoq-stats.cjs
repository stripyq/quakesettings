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
 *
 * To create hoq-stats-data.json manually, format it as:
 * {
 *   "76561198077163281": {
 *     "favorite_map": "Campgrounds",
 *     "favorite_gametype": "CTF",
 *     "favorite_weapon": "Rocket Launcher",
 *     "accuracy_rl": 42,
 *     "accuracy_rg": 38,
 *     "accuracy_lg": 45
 *   }
 * }
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
const DELAY_MS = 1500; // Delay between requests to be respectful

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get all players with steam IDs from YAML files
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

// Parse HoQ player page HTML to extract favorites and weapon accuracies
function parseHoqPage(html) {
  const result = {};

  // ---- FAVORITES ----
  // Look for the Favorites section and extract Arena, Gametype, Weapon
  // Common HoQ page patterns:
  //   <h3>Favorites</h3>
  //   <table>
  //     <tr><td>Arena</td><td>Campgrounds</td></tr>
  //     <tr><td>Gametype</td><td>CTF</td></tr>
  //     <tr><td>Weapon</td><td>Rocket Launcher</td></tr>
  //   </table>
  //
  // Or list/definition format:
  //   <dt>Arena</dt><dd>Campgrounds</dd>

  const favoriteFields = [
    { field: 'favorite_map', label: 'Arena' },
    { field: 'favorite_gametype', label: 'Gametype' },
    { field: 'favorite_weapon', label: 'Weapon' },
  ];

  for (const { field, label } of favoriteFields) {
    // Try table cell pattern: <td>Label</td><td>Value</td>
    const tdPattern = new RegExp(
      `<td[^>]*>\\s*${label}\\s*<\\/td>\\s*<td[^>]*>\\s*([^<]+)`,
      'i'
    );
    // Try definition list: <dt>Label</dt><dd>Value</dd>
    const dlPattern = new RegExp(
      `<dt[^>]*>\\s*${label}\\s*<\\/dt>\\s*<dd[^>]*>\\s*([^<]+)`,
      'i'
    );
    // Try label/span pair: <span class="label">Arena</span><span class="value">Campgrounds</span>
    const spanPattern = new RegExp(
      `${label}[^<]*<\\/[^>]+>\\s*<[^>]+>\\s*([^<]+)`,
      'i'
    );
    // Try generic key-value: Arena: Campgrounds or Arena = Campgrounds
    const kvPattern = new RegExp(
      `${label}\\s*[:=]\\s*([^\\n<]+)`,
      'i'
    );

    for (const pattern of [tdPattern, dlPattern, spanPattern, kvPattern]) {
      const match = html.match(pattern);
      if (match) {
        const value = match[1].trim();
        if (value && value !== '-' && value !== 'N/A' && value.length < 100) {
          result[field] = value;
          break;
        }
      }
    }
  }

  // ---- WEAPON ACCURACIES ----
  // Look for a weapons table with accuracy column
  // Typical format:
  //   <tr><td>Rocket Launcher</td><td>1234</td><td>567</td><td>42%</td>...</tr>
  //   <tr><td>Railgun</td><td>...</td><td>38%</td>...</tr>

  const weapons = [
    { name: 'Rocket Launcher', key: 'accuracy_rl' },
    { name: 'Railgun', key: 'accuracy_rg' },
    { name: 'Lightning Gun', key: 'accuracy_lg' },
  ];

  // First, try to find the weapons table and detect the accuracy column by header
  let accuracyColIndex = -1;
  const headerRowMatch = html.match(/<thead[^>]*>[\s\S]*?<\/thead>/i)
    || html.match(/<tr[^>]*>[\s\S]*?<th[\s\S]*?<\/tr>/i);
  if (headerRowMatch) {
    const thCells = [...headerRowMatch[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
    for (let i = 0; i < thCells.length; i++) {
      const text = thCells[i][1].replace(/<[^>]*>/g, '').trim().toLowerCase();
      if (text === 'accuracy' || text === 'acc' || text === 'acc%') {
        accuracyColIndex = i;
        break;
      }
    }
  }

  // Extract all table rows first to avoid cross-row regex matching
  const allRows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const { name, key } of weapons) {
    // Find a data row (3+ cells) whose text contains this weapon name.
    // The cell count check avoids matching favorites rows like
    // <tr><td>Weapon</td><td>Rocket Launcher</td></tr>.
    const weaponRow = allRows.find(m => {
      const text = m[1].replace(/<[^>]*>/g, '');
      if (!text.includes(name)) return false;
      const cellCount = [...m[1].matchAll(/<td[^>]*>/gi)].length;
      return cellCount >= 3;
    });

    if (weaponRow) {
      // Extract all <td> cells from this single row
      const cells = [...weaponRow[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(m => m[1].replace(/<[^>]*>/g, '').trim());

      let accuracy = NaN;

      // If we identified the accuracy column by header, use that index
      if (accuracyColIndex >= 0 && accuracyColIndex < cells.length) {
        accuracy = parseFloat(cells[accuracyColIndex].replace('%', ''));
      }

      // Fallback: find the cell that looks like a percentage value
      if (isNaN(accuracy) || accuracy < 0 || accuracy > 100) {
        for (const cell of cells) {
          const pctMatch = cell.match(/^([\d.]+)\s*%?$/);
          if (pctMatch) {
            const val = parseFloat(pctMatch[1]);
            if (!isNaN(val) && val >= 0 && val <= 100) {
              accuracy = val;
              break;
            }
          }
        }
      }

      if (!isNaN(accuracy) && accuracy >= 0 && accuracy <= 100) {
        result[key] = accuracy;
      }
      continue;
    }

    // Fallback: weapon name directly followed by accuracy
    const directPattern = new RegExp(
      `${name}[\\s\\S]*?(\\d{1,3}(?:\\.\\d+)?)\\s*%`,
      'i'
    );
    const directMatch = html.match(directPattern);
    if (directMatch) {
      const accuracy = parseFloat(directMatch[1]);
      if (!isNaN(accuracy) && accuracy >= 0 && accuracy <= 100) {
        result[key] = accuracy;
      }
    }
  }

  return result;
}

// Fetch a single player's HoQ page
async function fetchPlayerStats(steamId) {
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

  // Check if it's actually a player page (not an error page)
  if (html.includes('Player not found') || html.includes('No data') || html.length < 500) {
    return { html, stats: null };
  }

  return { html, stats: parseHoqPage(html) };
}

// Load pre-fetched stats from JSON file
function loadStatsFromJson() {
  if (!fs.existsSync(STATS_JSON)) {
    console.error(`Error: ${STATS_JSON} not found`);
    console.log('\nCreate this file with format:');
    console.log(JSON.stringify({
      '76561198077163281': {
        favorite_map: 'Campgrounds',
        favorite_gametype: 'CTF',
        favorite_weapon: 'Rocket Launcher',
        accuracy_rl: 42,
        accuracy_rg: 38,
        accuracy_lg: 45,
      }
    }, null, 2));
    console.log('\nOr run without --from-json to fetch live data.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(STATS_JSON, 'utf8'));
  console.log(`Loaded ${Object.keys(data).length} players from JSON`);
  return data;
}

// Update a player's YAML file with HoQ stats
function updatePlayerYaml(playerPath, stats) {
  let content = fs.readFileSync(playerPath, 'utf8');

  const fields = [
    'favorite_map', 'favorite_gametype', 'favorite_weapon',
    'accuracy_rl', 'accuracy_rg', 'accuracy_lg',
  ];

  // Remove existing HoQ fields
  for (const field of fields) {
    content = content.replace(new RegExp(`^${field}:.*\\n?`, 'gm'), '');
  }

  // Build new lines
  const newLines = [];

  if (stats.favorite_map) newLines.push(`favorite_map: ${yamlValue(stats.favorite_map)}`);
  if (stats.favorite_gametype) newLines.push(`favorite_gametype: ${yamlValue(stats.favorite_gametype)}`);
  if (stats.favorite_weapon) newLines.push(`favorite_weapon: ${yamlValue(stats.favorite_weapon)}`);
  if (stats.accuracy_rl != null) newLines.push(`accuracy_rl: ${stats.accuracy_rl}`);
  if (stats.accuracy_rg != null) newLines.push(`accuracy_rg: ${stats.accuracy_rg}`);
  if (stats.accuracy_lg != null) newLines.push(`accuracy_lg: ${stats.accuracy_lg}`);

  if (newLines.length === 0) return false;

  // Append at the end of file (before trailing newline)
  content = content.trimEnd() + '\n' + newLines.join('\n') + '\n';

  if (!DRY_RUN) {
    fs.writeFileSync(playerPath, content);
  }
  return true;
}

// Format a YAML string value (quote if needed)
function yamlValue(str) {
  if (/[:#{}[\],&*?|>!%@`'"]/.test(str) || str.includes('\n')) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

// Main function
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

  for (const player of players) {
    let stats;

    if (USE_JSON) {
      stats = statsMap[player.steamId];
      if (!stats) {
        skipped++;
        continue;
      }
    } else {
      try {
        process.stdout.write(`  Fetching ${player.name} (${player.steamId})...`);
        const result = await fetchPlayerStats(player.steamId);

        if (SAVE_HTML && result.html) {
          fs.writeFileSync(
            path.join(HTML_DIR, `${player.steamId}.html`),
            result.html
          );
        }

        if (!result.stats) {
          console.log(' not found');
          notFound++;
          await sleep(DELAY_MS);
          continue;
        }

        stats = result.stats;

        if (Object.keys(stats).length === 0) {
          console.log(' no data');
          skipped++;
          await sleep(DELAY_MS);
          continue;
        }

        console.log(' OK');
        statsMap[player.steamId] = stats;
        await sleep(DELAY_MS);
      } catch (err) {
        console.log(` error: ${err.message}`);
        errors++;
        await sleep(DELAY_MS);
        continue;
      }
    }

    if (FETCH_ONLY) continue;

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
  }

  // Save fetched data as JSON for future --from-json use
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
