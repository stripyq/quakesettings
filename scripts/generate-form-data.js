/**
 * Generate JSON data files for the submission form
 *
 * This script reads YAML content collections and generates:
 * - collected-players.json: All existing players' settings for pre-fill
 * - hardware-options.json: All hardware with slugs for dropdowns
 * - player-registry.json: All players from HoQ + YAML (rebuilt from source)
 *
 * Run: node scripts/generate-form-data.js
 * Called automatically during build via package.json prebuild script
 *
 * IMPORTANT: Steam IDs must ALWAYS be strings, never numbers.
 * This script validates all Steam IDs and fails the build if any are invalid.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { parse as csvParse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const contentDir = path.join(rootDir, 'src', 'content');
const dataDir = path.join(rootDir, 'src', 'data');
const outputDir = path.join(rootDir, 'public', 'data');

// Ensure output directories exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Validate a Steam ID - MUST be string of exactly 17 digits starting with 7656119
 * @throws Error if invalid
 */
function validateSteamId(id, playerName) {
  if (id === null || id === undefined || id === '') {
    return; // Empty is allowed, just means no Steam ID
  }

  if (typeof id !== 'string') {
    throw new Error(`${playerName}: steamId must be string, got ${typeof id} (value: ${id})`);
  }

  if (!/^\d{17}$/.test(id)) {
    throw new Error(`${playerName}: steamId must be exactly 17 digits, got "${id}" (${id.length} chars)`);
  }

  if (!id.startsWith('7656119')) {
    console.warn(`  ⚠️  ${playerName}: steamId doesn't start with 7656119 - verify: ${id}`);
  }

  // Heuristic warning: IDs ending in 00 are highly suspect (common float rounding)
  // Only warn on YAML files, not HoQ (which is source of truth)
  const knownGoodIds = ['76561198129795100']; // FizzY
  if (!playerName.startsWith('HoQ:') && id.endsWith('00') && !knownGoodIds.includes(id)) {
    console.warn(`  ⚠️  ${playerName}: steamId ends in 00 - verify not float-corrupted: ${id}`);
  }
}

/**
 * Read all YAML files from a directory and return parsed data with slugs
 * Validates Steam IDs if present
 */
function readYamlDirectory(dirPath, validateSteamIds = false) {
  const items = [];

  if (!fs.existsSync(dirPath)) {
    console.warn(`Directory not found: ${dirPath}`);
    return items;
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.yaml'));

  for (const file of files) {
    const slug = file.replace('.yaml', '');
    const filePath = path.join(dirPath, file);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = yaml.load(content);

      // Validate Steam ID if this is a player file
      if (validateSteamIds && data.steamId !== undefined) {
        validateSteamId(data.steamId, data.name || slug);
      }

      items.push({ slug, ...data });
    } catch (err) {
      console.error(`Error reading ${file}:`, err.message);
      throw err; // Fail the build
    }
  }

  return items;
}

/**
 * Read HoQ CSV files and build player data
 * Steam IDs in CSVs are the source of truth
 */
function readHoqCsvs() {
  const hoqPlayers = new Map(); // steamId -> player data

  const csvFiles = [
    { path: path.join(outputDir, 'hoq_ctf.csv'), mode: 'ctf' },
    { path: path.join(outputDir, 'hoq_tdm.csv'), mode: 'tdm' },
    { path: path.join(outputDir, 'hoq_tdm2v2.csv'), mode: '2v2' }
  ];

  for (const { path: csvPath, mode } of csvFiles) {
    if (!fs.existsSync(csvPath)) {
      console.warn(`  HoQ CSV not found: ${csvPath}`);
      continue;
    }

    const content = fs.readFileSync(csvPath, 'utf8');
    const records = csvParse(content, { columns: true, skip_empty_lines: true });

    for (const row of records) {
      const steamId = String(row._id || '').trim();
      const name = String(row.name || '').trim();
      const rating = parseFloat(row.rating) || null;
      const games = parseInt(row.n) || null;

      if (!steamId || !name) continue;

      // Validate Steam ID from CSV - skip invalid entries
      try {
        validateSteamId(steamId, `HoQ:${name}`);
      } catch (err) {
        console.warn(`  Skipping invalid HoQ entry: ${err.message}`);
        continue;
      }

      if (!hoqPlayers.has(steamId)) {
        hoqPlayers.set(steamId, {
          steamId: steamId, // Always string
          name: name,
          ratings: { ctf: null, tdm: null, '2v2': null },
          gamesPlayed: { ctf: null, tdm: null, '2v2': null }
        });
      }

      const player = hoqPlayers.get(steamId);

      // Update name if this mode has more games (more authoritative)
      // Must compare BEFORE setting gamesPlayed, otherwise we compare games to itself
      if (games && (!player.gamesPlayed[mode] || games > player.gamesPlayed[mode])) {
        player.name = name;
      }

      player.ratings[mode] = rating;
      player.gamesPlayed[mode] = games;
    }
  }

  console.log(`  Loaded ${hoqPlayers.size} players from HoQ CSVs`);
  return hoqPlayers;
}

/**
 * Generate collected-players.json
 * Contains all existing players' settings for form pre-fill
 */
function generateCollectedPlayers() {
  console.log('Generating collected-players.json...');

  const players = readYamlDirectory(path.join(contentDir, 'players'), true);

  // Map to form-friendly format
  const collectedPlayers = players.map(p => ({
    slug: p.slug,
    name: p.name,
    steamId: String(p.steamId || ''), // Ensure string
    country: p.country || '',
    // Mouse settings
    dpi: p.dpi ?? '',
    sensitivity: p.sensitivity ?? '',
    acceleration: p.acceleration || false,
    accelValue: p.accelValue || '',
    rawInput: p.rawInput !== false,
    invertedMouse: p.invertedMouse || false,
    grip: p.grip || '',
    skates: p.skates || '',
    // Game settings
    fov: p.fov || '',
    crosshair: p.crosshair || '',
    crosshairColor: p.crosshairColor || '',
    enemyModel: p.enemyModel || '',
    // Binds
    forward: p.forward || '',
    back: p.back || '',
    left: p.left || '',
    right: p.right || '',
    jump: p.jump || '',
    crouch: p.crouch || '',
    attack: p.attack || '',
    zoom: p.zoom || '',
    // Hardware (slugs)
    mouse: p.mouse || '',
    mousepad: p.mousepad || '',
    mousepadBase: p.mousepadBase || '',
    mousepadSize: p.mousepadSize || '',
    keyboard: p.keyboard || '',
    monitor: p.monitor || '',
    headset: p.headset || '',
    // System
    gpu: p.gpu || '',
    cpu: p.cpu || ''
  }));

  const outputPath = path.join(outputDir, 'collected-players.json');
  fs.writeFileSync(outputPath, JSON.stringify(collectedPlayers, null, 2));
  console.log(`  Written ${collectedPlayers.length} players to ${outputPath}`);
}

/**
 * Generate hardware-options.json
 * Contains all hardware items organized by category for dropdowns
 */
function generateHardwareOptions() {
  console.log('Generating hardware-options.json...');

  const categories = {
    mice: readYamlDirectory(path.join(contentDir, 'mice')),
    mousepads: readYamlDirectory(path.join(contentDir, 'mousepads')),
    keyboards: readYamlDirectory(path.join(contentDir, 'keyboards')),
    monitors: readYamlDirectory(path.join(contentDir, 'monitors')),
    headsets: readYamlDirectory(path.join(contentDir, 'headsets'))
  };

  // Simplify to just slug and name for dropdowns
  const hardware = {};
  for (const [category, items] of Object.entries(categories)) {
    hardware[category] = items
      .map(item => {
        const entry = {
          slug: item.slug,
          name: item.name,
          brand: item.brand || ''
        };
        // Include variant data for mousepads that have it (Artisan-style)
        if (category === 'mousepads' && item.variants && item.variants.length > 0) {
          entry.variants = item.variants;
        }
        return entry;
      })
      .sort((a, b) => {
        // Sort by brand, then name
        if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
        return a.name.localeCompare(b.name);
      });
  }

  const outputPath = path.join(outputDir, 'hardware-options.json');
  fs.writeFileSync(outputPath, JSON.stringify(hardware, null, 2));

  const totalItems = Object.values(hardware).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`  Written ${totalItems} hardware items to ${outputPath}`);
  for (const [cat, items] of Object.entries(hardware)) {
    console.log(`    ${cat}: ${items.length}`);
  }
}

/**
 * Generate player-registry.json from YAML profiles + HoQ CSVs
 * This REBUILDS the registry from source data (not just copying)
 *
 * Steam IDs are ALWAYS stored as strings, never numbers.
 */
function generatePlayerRegistry() {
  console.log('Generating player-registry.json (from YAML + HoQ)...');

  // Load HoQ data (source of truth for ratings)
  const hoqPlayers = readHoqCsvs();

  // Load YAML profiles (source of truth for site display)
  const yamlPlayers = readYamlDirectory(path.join(contentDir, 'players'), true);
  const yamlBySteamId = new Map();
  const yamlSlugs = new Set();

  for (const p of yamlPlayers) {
    if (p.steamId) {
      yamlBySteamId.set(p.steamId, p);
    }
    yamlSlugs.add(p.slug);
  }

  console.log(`  Loaded ${yamlPlayers.length} YAML profiles`);

  // Build registry: merge HoQ + YAML data
  const registry = [];
  const processedSteamIds = new Set();

  // First, add all HoQ players (with YAML profile data if available)
  for (const [steamId, hoqData] of hoqPlayers) {
    const yamlData = yamlBySteamId.get(steamId);

    registry.push({
      steamId: String(steamId), // ALWAYS string
      name: yamlData?.name || hoqData.name,
      slug: yamlData?.slug || null,
      hasProfile: !!yamlData,
      ratings: {
        ctf: hoqData.ratings.ctf,
        tdm: hoqData.ratings.tdm,
        '2v2': hoqData.ratings['2v2']
      },
      gamesPlayed: {
        ctf: hoqData.gamesPlayed.ctf,
        tdm: hoqData.gamesPlayed.tdm,
        '2v2': hoqData.gamesPlayed['2v2']
      }
    });

    processedSteamIds.add(steamId);
  }

  // Add YAML players not in HoQ (have profiles but no HoQ ratings)
  for (const p of yamlPlayers) {
    if (p.steamId && !processedSteamIds.has(p.steamId)) {
      registry.push({
        steamId: String(p.steamId), // ALWAYS string
        name: p.name,
        slug: p.slug,
        hasProfile: true,
        ratings: {
          ctf: p.ctfRating || null,
          tdm: p.tdmRating || null,
          '2v2': p['2v2Rating'] || null
        },
        gamesPlayed: {
          ctf: p.ctfGames || null,
          tdm: p.tdmGames || null,
          '2v2': p['2v2Games'] || null
        }
      });
    }
  }

  // Sort by name
  registry.sort((a, b) => a.name.localeCompare(b.name));

  // Final validation: ensure ALL Steam IDs are strings
  for (const player of registry) {
    if (typeof player.steamId !== 'string') {
      throw new Error(`Registry corruption: ${player.name} has non-string steamId: ${typeof player.steamId}`);
    }
  }

  const profileCount = registry.filter(p => p.hasProfile).length;

  const registryData = {
    version: '2.0',
    generatedAt: new Date().toISOString().split('T')[0],
    totalPlayers: registry.length,
    playersWithProfiles: profileCount,
    players: registry
  };

  // Write to src/data (source)
  const srcPath = path.join(dataDir, 'player-registry.json');
  fs.writeFileSync(srcPath, JSON.stringify(registryData, null, 2));

  // Write to public/data (for client)
  const pubPath = path.join(outputDir, 'player-registry.json');
  fs.writeFileSync(pubPath, JSON.stringify(registryData));

  console.log(`  Generated registry with ${registry.length} players (${profileCount} with profiles)`);
  console.log(`  Written to ${srcPath} and ${pubPath}`);
}

// Main execution
console.log('=== Generating Form Data ===\n');

try {
  generateCollectedPlayers();
  generateHardwareOptions();
  generatePlayerRegistry();
  console.log('\n=== Done ===');
} catch (err) {
  console.error('\n❌ BUILD FAILED:', err.message);
  process.exit(1);
}
