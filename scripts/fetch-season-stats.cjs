const fs = require('fs');
const path = require('path');

const API_BASE = 'http://77.90.2.137:8004/api';

async function fetchPlayerStats(steamId) {
  try {
    // Fetch career stats
    const careerRes = await fetch(`${API_BASE}/ctf/players/${steamId}`);
    const career = careerRes.ok ? await careerRes.json() : null;

    // Fetch weapon stats
    const weaponRes = await fetch(`${API_BASE}/ctf/weapons/${steamId}`);
    const weapons = weaponRes.ok ? await weaponRes.json() : null;

    return { career, weapons };
  } catch (error) {
    console.error(`Error fetching ${steamId}:`, error.message);
    return null;
  }
}

async function main() {
  // Read all player YAML files
  const playersDir = path.join(__dirname, '../src/content/players');
  const files = fs.readdirSync(playersDir).filter(f => f.endsWith('.yaml'));

  const results = {};
  let fetchedCount = 0;
  let skippedCount = 0;

  console.log(`Found ${files.length} player files\n`);

  for (const file of files) {
    const content = fs.readFileSync(path.join(playersDir, file), 'utf-8');
    // YAML files use camelCase "steamId", not "steam_id"
    const steamIdMatch = content.match(/^steamId:\s*["']?(\d{17})["']?\s*$/m);
    const nameMatch = content.match(/^name:\s*["']?([^"'\n]+)["']?/m);

    if (steamIdMatch && steamIdMatch[1]) {
      const steamId = steamIdMatch[1];
      const name = nameMatch ? nameMatch[1].trim() : file.replace('.yaml', '');

      console.log(`Fetching ${name} (${steamId})...`);

      const stats = await fetchPlayerStats(steamId);
      if (stats && (stats.career || stats.weapons)) {
        results[steamId] = {
          name,
          ...stats,
          fetchedAt: new Date().toISOString()
        };
        fetchedCount++;
        console.log(`  ✓ Got data`);
      } else {
        console.log(`  ✗ No data found`);
        skippedCount++;
      }

      // Rate limit: wait 200ms between requests
      await new Promise(r => setTimeout(r, 200));
    } else {
      skippedCount++;
    }
  }

  // Save results
  const outputPath = path.join(__dirname, '../public/data/season-stats.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log(`\n========================================`);
  console.log(`Fetched: ${fetchedCount} players`);
  console.log(`Skipped: ${skippedCount} players`);
  console.log(`Saved to: ${outputPath}`);
}

main().catch(console.error);
