#!/usr/bin/env node
/**
 * import-mice.cjs — create or fill mice YAML entries from a CSV.
 *
 * Usage:
 *   node scripts/import-mice.cjs [data-archive/mice-import.csv] [--dry-run]
 *
 * CSV columns: slug,name,brand,weight,dimensions,shape,source,checked
 *   - slug         required; becomes src/content/mice/<slug>.yaml
 *   - name         model name; brand is prepended if missing (site convention: "Brand Model")
 *   - other fields optional; blank cells are skipped
 *
 * Rules (see CLAUDE.md):
 *   - never overwrites a non-blank field; existing files only get blanks filled
 *   - new files get name, brand and whatever else the row provides, nothing invented
 *   - writes go through yaml-safe-write.cjs; the script owns only the fields it writes
 *   - idempotent: a second run changes nothing
 *   - run generate-form-data.js afterwards so the submit form sees new slugs
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { safeWriteYaml } = require('./yaml-safe-write.cjs');

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const csvPath = args.find(a => !a.startsWith('--')) || path.join('data-archive', 'mice-import.csv');
const miceDir = path.join(__dirname, '..', 'src', 'content', 'mice');

const FIELDS = ['name', 'brand', 'weight', 'dimensions', 'shape', 'sensor', 'dpiRange', 'pollingRate', 'buttons', 'connection', 'variantOf', 'source', 'checked'];
const ORDER = ['name', 'brand', 'dimensions', 'weight', 'shape', 'sensor', 'dpiRange', 'pollingRate', 'connection', 'buttons', 'image', 'variantOf', 'source', 'checked'];

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map(l => {
    const cells = splitCsvLine(l);
    const row = {};
    header.forEach((h, i) => { row[h.trim()] = (cells[i] || '').trim(); });
    return row;
  });
}
function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function isBlank(v) { return v === undefined || v === null || v === '' || v === 'Unknown'; }
function dump(obj) {
  const ordered = {};
  for (const k of ORDER) if (obj[k] !== undefined) ordered[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in ordered)) ordered[k] = obj[k];
  return yaml.dump(ordered, { lineWidth: -1, quotingType: '"', forceQuotes: true, noRefs: true })
    .replace(/^buttons: "(\d+)"$/m, 'buttons: $1');
}
function slugOk(s) { return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s); }

const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
let created = 0, filled = 0, unchanged = 0; const problems = [];

for (const row of rows) {
  const slug = row.slug;
  if (!slug || !slugOk(slug)) { problems.push(`bad slug: "${slug}"`); continue; }
  const file = path.join(miceDir, `${slug}.yaml`);
  const incoming = {};
  for (const f of FIELDS) if (!isBlank(row[f])) incoming[f] = row[f];
  if (incoming.buttons !== undefined) incoming.buttons = Number(incoming.buttons);
  if (incoming.name && incoming.brand && !incoming.name.toLowerCase().startsWith(incoming.brand.toLowerCase())) {
    incoming.name = `${incoming.brand} ${incoming.name}`;
  }

  if (fs.existsSync(file)) {
    const current = yaml.load(fs.readFileSync(file, 'utf8')) || {};
    const next = { ...current };
    const added = [];
    for (const [k, v] of Object.entries(incoming)) {
      if (k === 'name' || k === 'brand') continue; // never touch identity of an existing entry
      if (isBlank(current[k])) { next[k] = v; added.push(k); }
    }
    if (added.length === 0) { unchanged++; continue; }
    if (!dry) safeWriteYaml(file, dump(next), added);
    filled++;
    console.log(`fill   ${slug}: ${added.join(', ')}`);
  } else {
    if (!incoming.name || !incoming.brand) { problems.push(`${slug}: new file needs name and brand`); continue; }
    if (!dry) fs.writeFileSync(file, dump(incoming));
    created++;
    console.log(`create ${slug}`);
  }
}

console.log(`\n${dry ? '[dry run] ' : ''}created ${created}, filled ${filled}, unchanged ${unchanged}, problems ${problems.length}`);
for (const p of problems) console.log('  ! ' + p);
if (problems.length) process.exitCode = 1;
