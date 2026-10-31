#!/usr/bin/env node
/**
 * Mice audit — read-only report on src/content/mice and player mouse references.
 *
 * Prints:
 *   a) blank counts per spec field, and the files missing `dimensions`
 *   b) player files whose `mouse:` has no matching mice/<slug>.yaml
 *   c) mice referenced by zero players (list written to data-archive/mice-unused.txt)
 *   d) possible duplicates: same normalised name, or slug that looks like an alias
 *   e) usage ranking: slug + player count, descending
 *
 * Writes nothing except data-archive/mice-unused.txt.
 *
 * Usage: node scripts/mice-audit.cjs   (or: npm run audit:mice)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const MICE_DIR = path.join(ROOT, 'src/content/mice');
const PLAYERS_DIR = path.join(ROOT, 'src/content/players');
const UNUSED_OUT = path.join(ROOT, 'data-archive/mice-unused.txt');

const SPEC_FIELDS = ['weight', 'shape', 'dimensions', 'sensor', 'dpiRange', 'pollingRate', 'buttons', 'connection'];

const normalise = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Missing, null, empty, or a placeholder value all count as blank
function isBlank(v) {
  if (v == null) return true;
  const s = String(v).trim();
  return s === '' || /^(unknown|n\/a|-|\?)$/i.test(s);
}

function loadDir(dir) {
  const out = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort()) {
    const slug = file.replace(/\.yaml$/, '');
    try {
      out.push({ slug, file, data: yaml.load(fs.readFileSync(path.join(dir, file), 'utf8')) || {} });
    } catch (e) {
      console.warn(`  ! could not parse ${path.relative(ROOT, path.join(dir, file))}: ${e.message}`);
    }
  }
  return out;
}

function main() {
  const mice = loadDir(MICE_DIR);
  const players = loadDir(PLAYERS_DIR);
  const miceBySlug = new Map(mice.map(m => [m.slug, m]));

  console.log(`=== Mice audit: ${mice.length} mice, ${players.length} players ===\n`);

  // a) blank counts
  console.log('a) Blank fields across mice (missing, empty or "Unknown")');
  for (const field of SPEC_FIELDS) {
    const n = mice.filter(m => isBlank(m.data[field])).length;
    console.log(`   ${field.padEnd(12)} ${String(n).padStart(4)} / ${mice.length}`);
  }
  const noDims = mice.filter(m => isBlank(m.data.dimensions));
  console.log(`   Missing dimensions (${noDims.length}):`);
  for (const m of noDims) console.log(`     ${m.slug}`);
  console.log('');

  // b) broken player references
  const usage = new Map();
  const broken = [];
  for (const p of players) {
    const ref = p.data.mouse;
    if (isBlank(ref)) continue;
    usage.set(ref, (usage.get(ref) || 0) + 1);
    if (!miceBySlug.has(ref)) broken.push({ player: p.file, ref });
  }
  console.log(`b) Player mouse values with no mice/<slug>.yaml (${broken.length})`);
  for (const { player, ref } of broken) {
    const key = normalise(ref);
    const candidates = mice
      .filter(m => normalise(m.slug) === key || normalise(m.data.name || '') === key || m.slug.endsWith('-' + slugify(ref)))
      .map(m => m.slug);
    const hint = candidates.length ? `  -> candidate: ${candidates.join(', ')}` : '';
    console.log(`   ${player.padEnd(32)} mouse: ${JSON.stringify(ref)}${hint}`);
  }
  console.log('');

  // c) unused mice
  const unused = mice.filter(m => !usage.has(m.slug)).map(m => m.slug);
  fs.mkdirSync(path.dirname(UNUSED_OUT), { recursive: true });
  fs.writeFileSync(UNUSED_OUT, unused.join('\n') + '\n');
  console.log(`c) Mice referenced by zero players: ${unused.length} / ${mice.length}`);
  console.log(`   list written to ${path.relative(ROOT, UNUSED_OUT).replace(/\\/g, '/')}\n`);

  // d) possible duplicates
  console.log('d) Possible duplicates');
  const byName = new Map();
  for (const m of mice) {
    const key = normalise(m.data.name || '');
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(m);
  }
  const nameDupes = [...byName.values()].filter(g => g.length > 1);
  console.log(`   Same normalised name (${nameDupes.length} groups):`);
  for (const g of nameDupes) console.log(`     ${JSON.stringify(g[0].data.name)}: ${g.map(m => m.slug).join(', ')}`);

  // A slug that differs from slugify(name) is an alias candidate; it is a likely duplicate
  // when slugify(name) is itself another file
  const mismatches = mice.filter(m => m.data.name && slugify(m.data.name) !== m.slug);
  console.log(`   Slug differs from slugify(name) (${mismatches.length}):`);
  for (const m of mismatches) {
    const expected = slugify(m.data.name);
    const flag = miceBySlug.has(expected) ? `  DUPLICATE of ${expected}.yaml` : '';
    console.log(`     ${m.slug.padEnd(36)} name ${JSON.stringify(m.data.name)}${flag}`);
  }
  console.log('');

  // e) usage ranking
  const ranking = [...usage.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  console.log(`e) Usage ranking (${ranking.length} distinct values, ${[...usage.values()].reduce((s, n) => s + n, 0)} players)`);
  for (const [slug, count] of ranking) {
    console.log(`   ${String(count).padStart(3)}  ${slug}${miceBySlug.has(slug) ? '' : '  (no file)'}`);
  }
}

main();
