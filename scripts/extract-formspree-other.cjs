#!/usr/bin/env node
/**
 * Build hardware backlogs from the "Other" free-text fields of the Formspree export.
 *
 * Input:  data-archive/formspree-export.csv (gitignored: it contains submitter data)
 * Output: data-archive/mice-backlog.csv, and mousepads-/keyboards-/monitors-/headsets-backlog.csv
 *         for each *Other column present. Columns: rawValue,count,normalised,matchedSlug,status
 *
 * status:
 *   matched  — normalised value equals an existing name or slug
 *   probable — close match (name without brand, small typo, or extra model words); candidate in matchedSlug
 *   missing  — no match
 *
 * The backlogs hold only the hardware strings and their counts, never names or emails,
 * so they can be committed. Values containing "@" are skipped in case someone typed an email.
 *
 * Usage: node scripts/extract-formspree-other.cjs [input.csv] [outDir]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');
const { parse: csvParse } = require('csv-parse/sync');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'src/content');
const INPUT = path.resolve(process.argv[2] || path.join(ROOT, 'data-archive/formspree-export.csv'));
const OUT_DIR = path.resolve(process.argv[3] || path.join(ROOT, 'data-archive'));

// Form field → content collection; mice first, they are the priority
const TYPES = [
  { column: 'mouseOther', dir: 'mice' },
  { column: 'mousepadOther', dir: 'mousepads' },
  { column: 'keyboardOther', dir: 'keyboards' },
  { column: 'monitorOther', dir: 'monitors' },
  { column: 'headsetOther', dir: 'headsets' },
];

// Whole-word abbreviations, mice only
const MOUSE_ABBREVIATIONS = {
  gpx: 'g pro x superlight',
  gpx2: 'g pro x superlight 2',
  da: 'deathadder',
  sl2: 'superlight 2',
};

const PROBABLE_THRESHOLD = 0.8;

function normalise(s, abbreviations = {}) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => abbreviations[t] || t)
    .join(' ');
}

const compact = s => s.replace(/\s+/g, '');
const headerKey = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const similarity = (a, b) => 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

function loadIndex(dir) {
  const full = path.join(CONTENT_DIR, dir);
  return fs.readdirSync(full).filter(f => f.endsWith('.yaml')).map(file => {
    const slug = file.replace(/\.yaml$/, '');
    const data = yaml.load(fs.readFileSync(path.join(full, file), 'utf8')) || {};
    const name = normalise(data.name || '');
    const brand = normalise(data.brand || '');
    const slugWords = normalise(slug);
    const stripBrand = s => (brand && s.startsWith(brand + ' ') ? s.slice(brand.length + 1) : null);
    const brandless = [stripBrand(name), stripBrand(slugWords)].filter(Boolean);
    return {
      slug,
      exact: [name, slugWords].map(compact),
      loose: [...new Set([name, slugWords, ...brandless])].map(compact),
      brandTokens: new Set(brand.split(' ').filter(Boolean)),
      tokens: new Set(`${name} ${slugWords}`.split(' ').filter(Boolean)),
    };
  });
}

function classify(normalised, index) {
  const key = compact(normalised);
  const exact = index.filter(e => e.exact.includes(key)).map(e => e.slug);
  if (exact.length) return { status: 'matched', slugs: exact };

  const inputTokens = normalised.split(' ');
  let best = 0;
  let bestSlugs = [];
  for (const e of index) {
    let score = Math.max(...e.loose.map(k => similarity(key, k)));
    // Every model word typed appears in the entry, which has at most two words more
    const modelTokens = inputTokens.filter(t => !e.brandTokens.has(t));
    if (modelTokens.length && inputTokens.every(t => e.tokens.has(t))) {
      const extra = [...e.tokens].filter(t => !e.brandTokens.has(t) && !inputTokens.includes(t)).length;
      if (extra <= 2) score = Math.max(score, PROBABLE_THRESHOLD);
    }
    if (score > best) [best, bestSlugs] = [score, [e.slug]];
    else if (score === best) bestSlugs.push(e.slug);
  }
  if (best >= PROBABLE_THRESHOLD) return { status: 'probable', slugs: bestSlugs };
  return { status: 'missing', slugs: [] };
}

const csvCell = v => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function ensureIgnored(file) {
  try {
    execFileSync('git', ['check-ignore', '-q', file], { cwd: ROOT, stdio: 'ignore' });
  } catch (e) {
    // status 1 = inside the repo and not ignored; anything else (no git, outside repo) is fine
    if (e.status === 1) {
      console.error(`${path.relative(ROOT, file)} is not gitignored. Add it to .gitignore before running this.`);
      process.exit(1);
    }
  }
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.log(`No Formspree export at ${path.relative(ROOT, INPUT).replace(/\\/g, '/')}; nothing to do.`);
    return;
  }
  ensureIgnored(INPUT);

  const rows = csvParse(fs.readFileSync(INPUT, 'utf8'), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  console.log(`=== Formspree "Other" backlog: ${rows.length} submissions ===\n`);

  for (const { column, dir } of TYPES) {
    const header = headers.find(h => headerKey(h) === headerKey(column));
    if (!header) {
      console.log(`${column}: column not in export, skipped`);
      continue;
    }

    // Group case-insensitively; rawValue is the most common spelling in the group
    const groups = new Map();
    let skipped = 0;
    for (const row of rows) {
      const raw = String(row[header] || '').trim().replace(/\s+/g, ' ');
      if (!raw) continue;
      if (raw.includes('@')) { skipped++; continue; }
      const key = raw.toLowerCase();
      if (!groups.has(key)) groups.set(key, { count: 0, spellings: new Map() });
      const g = groups.get(key);
      g.count++;
      g.spellings.set(raw, (g.spellings.get(raw) || 0) + 1);
    }
    const counts = [...groups.values()].map(g => [
      [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      g.count,
    ]);

    const index = loadIndex(dir);
    const abbreviations = dir === 'mice' ? MOUSE_ABBREVIATIONS : {};
    const result = counts
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([rawValue, count]) => {
        const normalised = normalise(rawValue, abbreviations);
        const { status, slugs } = classify(normalised, index);
        return { rawValue, count, normalised, matchedSlug: slugs.slice(0, 3).join('|'), status };
      });

    const outFile = path.join(OUT_DIR, `${dir}-backlog.csv`);
    const lines = ['rawValue,count,normalised,matchedSlug,status'];
    for (const r of result) lines.push([r.rawValue, r.count, r.normalised, r.matchedSlug, r.status].map(csvCell).join(','));
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(outFile, lines.join('\n') + '\n');

    const by = s => result.filter(r => r.status === s).length;
    console.log(`${column}: ${result.length} distinct values -> ${path.relative(ROOT, outFile).replace(/\\/g, '/')}`);
    console.log(`  matched ${by('matched')}, probable ${by('probable')}, missing ${by('missing')}${skipped ? `, skipped ${skipped} containing "@"` : ''}`);
    if (dir === 'mice') {
      for (const r of result.filter(r => r.status === 'missing')) console.log(`  missing: ${r.rawValue} (${r.count})`);
    }
  }
}

main();
