/**
 * Generate JSON data files for the submission form
 *
 * This script reads YAML content collections and generates:
 * - collected-players.json: All existing players' settings for pre-fill
 * - hardware-options.json: All hardware with slugs for dropdowns
 *
 * Run: node scripts/generate-form-data.js
 * Called automatically during build via package.json prebuild script
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const contentDir = path.join(rootDir, 'src', 'content');
const outputDir = path.join(rootDir, 'public', 'data');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Read all YAML files from a directory and return parsed data with slugs
 */
function readYamlDirectory(dirPath) {
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
      items.push({ slug, ...data });
    } catch (err) {
      console.error(`Error reading ${file}:`, err.message);
    }
  }

  return items;
}

/**
 * Generate collected-players.json
 * Contains all existing players' settings for form pre-fill
 */
function generateCollectedPlayers() {
  console.log('Generating collected-players.json...');

  const players = readYamlDirectory(path.join(contentDir, 'players'));

  // Map to form-friendly format
  const collectedPlayers = players.map(p => ({
    slug: p.slug,
    name: p.name,
    steamId: p.steamId || '',
    realName: p.realName || '',
    country: p.country || '',
    // Mouse settings
    dpi: p.dpi || '',
    sensitivity: p.sensitivity || '',
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
      .map(item => ({
        slug: item.slug,
        name: item.name,
        brand: item.brand || ''
      }))
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
 * Copy player registry to public folder for client access
 * Sanitize any NaN values that might exist in the registry
 */
function copyPlayerRegistry() {
  console.log('Copying player-registry.json...');

  const sourcePath = path.join(rootDir, 'src', 'data', 'player-registry.json');
  const destPath = path.join(outputDir, 'player-registry.json');

  if (fs.existsSync(sourcePath)) {
    // Read as text and replace NaN with null before parsing
    let content = fs.readFileSync(sourcePath, 'utf8');
    content = content.replace(/:\s*NaN\b/g, ': null');

    const data = JSON.parse(content);
    // Write sanitized, minified version
    fs.writeFileSync(destPath, JSON.stringify(data));
    console.log(`  Copied ${data.totalPlayers} players to ${destPath}`);
  } else {
    console.warn(`  Registry not found at ${sourcePath}`);
  }
}

// Main execution
console.log('=== Generating Form Data ===\n');
generateCollectedPlayers();
generateHardwareOptions();
copyPlayerRegistry();
console.log('\n=== Done ===');
