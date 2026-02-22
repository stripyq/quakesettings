#!/usr/bin/env node
/**
 * Fetch player ratings from external sources and update YAML files
 *
 * Sources:
 * - Duel: QLStats (https://qlstats.net/ranks/duel)
 * - CTF/TDM: Community tracker (http://88.214.20.58/ratings/)
 *
 * Usage:
 *   node scripts/fetch-ratings.cjs                    # Fetch from APIs
 *   node scripts/fetch-ratings.cjs --from-json       # Import from scripts/ratings-data.json
 *
 * To create ratings-data.json manually, format it as:
 * {
 *   "duel": { "playername": 1500, "anotherplayer": 1600 },
 *   "ctf": { "playername": 35.5 },
 *   "tdm": { "playername": 28.2 }
 * }
 */

const fs = require('fs');
const path = require('path');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const RATINGS_JSON = path.join(__dirname, 'ratings-data.json');
const USE_JSON = process.argv.includes('--from-json');

// Load ratings from JSON file
function loadRatingsFromJson() {
  if (!fs.existsSync(RATINGS_JSON)) {
    console.error(`Error: ${RATINGS_JSON} not found`);
    console.log('Create this file with format:');
    console.log(JSON.stringify({
      duel: { playername: 1500 },
      ctf: { playername: 35.5 },
      tdm: { playername: 28.2 }
    }, null, 2));
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(RATINGS_JSON, 'utf8'));

  const duelRatings = new Map();
  const ctfRatings = new Map();
  const tdmRatings = new Map();

  if (data.duel) {
    for (const [name, rating] of Object.entries(data.duel)) {
      duelRatings.set(name.toLowerCase(), { name, rating });
    }
  }

  if (data.ctf) {
    for (const [name, rating] of Object.entries(data.ctf)) {
      ctfRatings.set(name.toLowerCase(), { name, rating });
    }
  }

  if (data.tdm) {
    for (const [name, rating] of Object.entries(data.tdm)) {
      tdmRatings.set(name.toLowerCase(), { name, rating });
    }
  }

  console.log(`Loaded from JSON: ${duelRatings.size} duel, ${ctfRatings.size} ctf, ${tdmRatings.size} tdm ratings`);
  return { duelRatings, ctfRatings, tdmRatings };
}

// Get all player names from YAML files
function getPlayerNames() {
  const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
  const players = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(PLAYERS_DIR, file), 'utf8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    if (nameMatch) {
      players.push({
        file,
        name: nameMatch[1].trim().replace(/^["']|["']$/g, ''),
        path: path.join(PLAYERS_DIR, file)
      });
    }
  }

  return players;
}

// Fetch all pages from QLStats duel rankings
async function fetchQLStatsDuel() {
  const ratings = new Map();
  let page = 1;
  const maxPages = 50; // Safety limit

  console.log('Fetching QLStats Duel ratings...');

  while (page <= maxPages) {
    try {
      const url = `https://qlstats.net/ranks/duel/${page}`;
      console.log(`  Fetching page ${page}...`);

      const response = await fetch(url);
      if (!response.ok) {
        console.log(`  Page ${page} returned ${response.status}, stopping`);
        break;
      }

      const html = await response.text();

      // Parse player rows from HTML table
      // Format: <td>rank</td><td><a href="/player/...">name</a></td><td>rating</td>...
      const rowRegex = /<tr[^>]*>.*?<td[^>]*>\d+<\/td>.*?<td[^>]*>.*?<a[^>]*>([^<]+)<\/a>.*?<\/td>.*?<td[^>]*>(\d+)<\/td>/gs;

      let matches = [...html.matchAll(rowRegex)];

      if (matches.length === 0) {
        // Try alternative pattern
        const altRegex = /class="player-name"[^>]*>([^<]+)<.*?class="rating"[^>]*>(\d+)</gs;
        matches = [...html.matchAll(altRegex)];
      }

      if (matches.length === 0) {
        console.log(`  No players found on page ${page}, stopping`);
        break;
      }

      for (const match of matches) {
        const name = match[1].trim();
        const rating = parseInt(match[2], 10);
        if (name && rating) {
          ratings.set(name.toLowerCase(), { name, rating });
        }
      }

      console.log(`  Found ${matches.length} players on page ${page}`);
      page++;

      // Rate limiting
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`  Error fetching page ${page}:`, err.message);
      break;
    }
  }

  console.log(`Total duel ratings fetched: ${ratings.size}`);
  return ratings;
}

// Fetch CTF/TDM ratings from community tracker
async function fetchCommunityRatings() {
  const ctfRatings = new Map();
  const tdmRatings = new Map();

  console.log('Fetching community CTF/TDM ratings...');

  // Try to fetch CTF ratings
  try {
    const ctfUrl = 'http://88.214.20.58/ratings/ctf';
    console.log('  Fetching CTF ratings...');

    const response = await fetch(ctfUrl, { timeout: 10000 });
    if (response.ok) {
      const html = await response.text();

      // Parse ratings - adjust regex based on actual page format
      const ratingRegex = /<tr[^>]*>.*?<td[^>]*>([^<]+)<\/td>.*?<td[^>]*>([\d.]+)<\/td>/gs;
      const matches = [...html.matchAll(ratingRegex)];

      for (const match of matches) {
        const name = match[1].trim();
        const rating = parseFloat(match[2]);
        if (name && !isNaN(rating)) {
          ctfRatings.set(name.toLowerCase(), { name, rating });
        }
      }

      console.log(`  Found ${ctfRatings.size} CTF ratings`);
    }
  } catch (err) {
    console.error('  Error fetching CTF ratings:', err.message);
  }

  // Try to fetch TDM ratings
  try {
    const tdmUrl = 'http://88.214.20.58/ratings/tdm';
    console.log('  Fetching TDM ratings...');

    const response = await fetch(tdmUrl, { timeout: 10000 });
    if (response.ok) {
      const html = await response.text();

      const ratingRegex = /<tr[^>]*>.*?<td[^>]*>([^<]+)<\/td>.*?<td[^>]*>([\d.]+)<\/td>/gs;
      const matches = [...html.matchAll(ratingRegex)];

      for (const match of matches) {
        const name = match[1].trim();
        const rating = parseFloat(match[2]);
        if (name && !isNaN(rating)) {
          tdmRatings.set(name.toLowerCase(), { name, rating });
        }
      }

      console.log(`  Found ${tdmRatings.size} TDM ratings`);
    }
  } catch (err) {
    console.error('  Error fetching TDM ratings:', err.message);
  }

  return { ctfRatings, tdmRatings };
}

// Update a player's YAML file with ratings
function updatePlayerYaml(playerPath, updates) {
  let content = fs.readFileSync(playerPath, 'utf8');
  const today = new Date().toISOString().split('T')[0];

  // Remove existing rating fields
  content = content.replace(/^duelRating:.*\n?/gm, '');
  content = content.replace(/^duelRatingUpdated:.*\n?/gm, '');
  content = content.replace(/^ctfRating:.*\n?/gm, '');
  content = content.replace(/^ctfRatingUpdated:.*\n?/gm, '');
  content = content.replace(/^tdmRating:.*\n?/gm, '');
  content = content.replace(/^tdmRatingUpdated:.*\n?/gm, '');

  // Build new rating lines
  const newLines = [];

  if (updates.duelRating != null) {
    newLines.push(`duelRating: ${updates.duelRating}`);
    newLines.push(`duelRatingUpdated: "${today}"`);
  }

  if (updates.ctfRating != null) {
    newLines.push(`ctfRating: ${updates.ctfRating}`);
    newLines.push(`ctfRatingUpdated: "${today}"`);
  }

  if (updates.tdmRating != null) {
    newLines.push(`tdmRating: ${updates.tdmRating}`);
    newLines.push(`tdmRatingUpdated: "${today}"`);
  }

  if (newLines.length > 0) {
    // Insert after dataSource line or after category line
    const insertAfter = /^(dataSource:.*|category:.*)$/m;
    const match = content.match(insertAfter);

    if (match) {
      const insertPos = match.index + match[0].length;
      content = content.slice(0, insertPos) + '\n' + newLines.join('\n') + content.slice(insertPos);
    } else {
      // Append at end
      content = content.trim() + '\n' + newLines.join('\n') + '\n';
    }

    fs.writeFileSync(playerPath, content);
    return true;
  }

  return false;
}

// Normalize player name for matching
function normalizeName(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Main function
async function main() {
  console.log('=== Fetching Player Ratings ===\n');

  // Get our players
  const players = getPlayerNames();
  console.log(`Found ${players.length} players in database\n`);

  let duelRatings, ctfRatings, tdmRatings;

  if (USE_JSON) {
    // Load from JSON file
    const data = loadRatingsFromJson();
    duelRatings = data.duelRatings;
    ctfRatings = data.ctfRatings;
    tdmRatings = data.tdmRatings;
  } else {
    // Fetch ratings from external sources
    duelRatings = await fetchQLStatsDuel();
    const communityData = await fetchCommunityRatings();
    ctfRatings = communityData.ctfRatings;
    tdmRatings = communityData.tdmRatings;
  }

  console.log('\n=== Matching and updating players ===\n');

  let updated = 0;
  let matched = 0;

  // Build O(1) lookup maps keyed by normalized name and lowercase name
  function buildLookup(ratingsMap) {
    const byNormalized = new Map();
    const byLower = new Map();
    for (const [key, data] of ratingsMap) {
      byNormalized.set(normalizeName(key), data);
      byLower.set(key.toLowerCase(), data);
    }
    return { byNormalized, byLower };
  }

  const duelLookup = buildLookup(duelRatings);
  const ctfLookup = buildLookup(ctfRatings);
  const tdmLookup = buildLookup(tdmRatings);

  function findRating(lookup, playerName) {
    const normalized = normalizeName(playerName);
    const lower = playerName.toLowerCase();
    return lookup.byNormalized.get(normalized) || lookup.byLower.get(lower) || null;
  }

  for (const player of players) {
    const updates = {};

    // Try to find duel rating
    const duelMatch = findRating(duelLookup, player.name);
    if (duelMatch) {
      updates.duelRating = duelMatch.rating;
      matched++;
    }

    // Try to find CTF rating
    const ctfMatch = findRating(ctfLookup, player.name);
    if (ctfMatch) {
      updates.ctfRating = ctfMatch.rating;
    }

    // Try to find TDM rating
    const tdmMatch = findRating(tdmLookup, player.name);
    if (tdmMatch) {
      updates.tdmRating = tdmMatch.rating;
    }

    // Update YAML if we have any ratings
    if (Object.keys(updates).length > 0) {
      const success = updatePlayerYaml(player.path, updates);
      if (success) {
        console.log(`✓ Updated ${player.name}: Duel=${updates.duelRating != null ? updates.duelRating : '-'}, CTF=${updates.ctfRating != null ? updates.ctfRating : '-'}, TDM=${updates.tdmRating != null ? updates.tdmRating : '-'}`);
        updated++;
      }
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Players matched: ${matched}`);
  console.log(`Players updated: ${updated}`);
}

main().catch(console.error);
