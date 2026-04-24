#!/usr/bin/env node
/**
 * Snapshot the HoQ 77.90.2.137 player dashboard into the Obsidian vault.
 *
 * Fetches http://77.90.2.137/matches/players/<sid>-cbd0a2e9.html (~1.4MB),
 * parses the sections visible on that page (Performance Summary, ML Match
 * Layer, Weapon Statistics, Kill Feed, Head-to-Head, Flag Statistics, etc.),
 * and writes a new dated note:
 *
 *     <vault>/matches/YYYY-MM-DD-player-dashboard-hoq77.md
 *
 * A new file is created each run (date-stamped). The upstream page is itself
 * a rolling window, so dated snapshots build your own history over time.
 *
 * Usage:
 *   node scripts/snapshot-my-dashboard-hoq77.cjs --vault="<path>" --dry-run
 *   node scripts/snapshot-my-dashboard-hoq77.cjs --vault="<path>"
 *   node scripts/snapshot-my-dashboard-hoq77.cjs --sid=<steamid>
 *   node scripts/snapshot-my-dashboard-hoq77.cjs --force     # overwrite today's file if it exists
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const yaml = require('js-yaml');
const parse = require('./lib/hoq77-parse.cjs');

// ---------- Args ----------

const DEFAULT_VAULT = 'C:\\Users\\marin\\Documents\\Obsidian Vault\\Quake';
const DEFAULT_SID = '76561197992882111';
const SLUG = 'cbd0a2e9';

const args = process.argv.slice(2);
const getArg = (k, d) => {
  const a = args.find(x => x.startsWith(k + '='));
  return a ? a.slice(k.length + 1).replace(/^"|"$/g, '') : d;
};
const VAULT = getArg('--vault', DEFAULT_VAULT);
const SID   = getArg('--sid', DEFAULT_SID);
const DRY_RUN = args.includes('--dry-run');
const FORCE   = args.includes('--force');

const MATCHES_DIR = path.join(VAULT, 'matches');
const BASE = 'http://77.90.2.137';
const URL = `${BASE}/matches/players/${SID}-${SLUG}.html`;

// ---------- HTTP ----------

function fetchPage(url) {
  return new Promise((resolve) => {
    const req = http.get(url, {
      headers: { 'User-Agent': 'quakesettings-hoq77/1.0', 'Accept': 'text/html' },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (err) => resolve({ status: 'ERR', body: '', err: err.message }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
  });
}

// ---------- Markdown rendering ----------

function mdTable(headers, rows) {
  if (!headers || !headers.length || !rows || !rows.length) return '_(no data)_\n';
  const sep = headers.map(() => '---').join(' | ');
  const head = '| ' + headers.join(' | ') + ' |';
  const sepLine = '| ' + sep + ' |';
  const body = rows.map(r => '| ' + headers.map((_, i) => String(r[i] ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |').join('\n');
  return `${head}\n${sepLine}\n${body}\n`;
}

function renderDashboard(parsed, url, nowIso) {
  let md = `# Player Dashboard (HoQ 77) — snapshot ${nowIso.slice(0, 10)}\n\n`;
  md += `_Source: [${url}](${url}) · fetched ${nowIso}_\n\n`;

  if (parsed.allSectionTitles?.length) {
    md += `_Sections present upstream (${parsed.allSectionTitles.length}):_ ${parsed.allSectionTitles.join(' · ')}\n\n`;
  }

  // Performance Summary
  if (parsed.performance?.raw && Object.keys(parsed.performance.raw).length) {
    md += `## Performance Summary\n\n| Metric | Value |\n| --- | ---: |\n`;
    for (const [k, v] of Object.entries(parsed.performance.raw)) md += `| ${k} | ${v} |\n`;
    md += '\n';
  }

  // ML Match Layer
  if (parsed.ml?.raw && Object.keys(parsed.ml.raw).length) {
    md += `## ML Match Layer\n\n| Metric | Value |\n| --- | ---: |\n`;
    for (const [k, v] of Object.entries(parsed.ml.raw)) md += `| ${k} | ${v} |\n`;
    md += '\n';
  }

  // Weapon Statistics (aggregate)
  if (parsed.weapons?.length) {
    md += `## Weapon Statistics (recent-window aggregate)\n\n`;
    const headers = ['Weapon', 'Kills', 'Deaths', 'Damage', 'Hit/Shot', 'Accuracy', 'Use', 'Share'];
    const rows = parsed.weapons.map(w => [w.weapon, w.kills, w.deaths, w.damage, w.hit_shot, w.accuracy, w.use, w.share]);
    md += mdTable(headers, rows) + '\n';
  }

  // Head-to-Head
  if (parsed.h2h?.rows?.length) {
    md += `## Head-to-Head Matchups\n\n`;
    md += '| Opponent | Side | H | M | E | Dmg → | ← Dmg |\n';
    md += '| --- | --- | --- | --- | --- | --- | --- |\n';
    for (const r of parsed.h2h.rows) {
      const z = r.zones || {};
      md += `| ${r.name || '—'} | ${r.color || ''} | ${z.H || ''} | ${z.M || ''} | ${z.E || ''} | ${r.dmg_to || '—'} | ${r.dmg_from || '—'} |\n`;
    }
    md += '\n';
  }

  // Flag Statistics
  if (parsed.flagStats?.stats && Object.keys(parsed.flagStats.stats).length) {
    md += `## Flag Statistics\n\n| Metric | Value |\n| --- | ---: |\n`;
    for (const [k, v] of Object.entries(parsed.flagStats.stats)) md += `| ${k} | ${v} |\n`;
    md += '\n';
  }

  // Heatmap modes (meta only)
  if (parsed.heatmap?.modes?.length) {
    md += `## Position Heatmap (meta)\n\n| Mode | Samples | Active |\n| --- | ---: | :---: |\n`;
    for (const m of parsed.heatmap.modes) {
      md += `| ${m.label} | ${m.count ?? ''} | ${m.active ? '✓' : ''} |\n`;
    }
    md += '\n';
  }

  // Kill Feed (latest 30)
  if (parsed.killFeed?.length) {
    md += `## Kill Feed (latest ${Math.min(30, parsed.killFeed.length)})\n\n`;
    for (const k of parsed.killFeed.slice(-30)) {
      // Strip the time and weapon tokens (already rendered as prefix) and
      // pull the action out so it can stand on its own.
      const action = k.spans.find(s => /^(KILLED|DIED|SUICIDE)$/i.test(s)) || '';
      const rest = k.spans.filter(s =>
        s && s !== k.time && s !== k.weapon && !/^(KILLED|DIED|SUICIDE)$/i.test(s)
      ).join(' · ');
      const actionPart = action ? ` ${action}` : '';
      const restPart = rest ? ` ${rest}` : '';
      md += `- \`${k.time || '—'}\` [${k.weapon || '—'}]${actionPart}${restPart}\n`;
    }
    md += '\n';
  }

  return md;
}

// ---------- Main ----------

async function main() {
  console.log(`Vault:    ${VAULT}`);
  console.log(`Matches:  ${MATCHES_DIR}`);
  console.log(`SteamID:  ${SID}`);
  console.log(`URL:      ${URL}`);
  console.log(`Mode:     ${DRY_RUN ? 'DRY-RUN (no writes)' : 'WRITE'}\n`);

  if (!fs.existsSync(MATCHES_DIR)) {
    console.error(`matches/ folder not found: ${MATCHES_DIR}`);
    process.exit(1);
  }

  console.log(`Fetching dashboard...`);
  const res = await fetchPage(URL);
  if (res.status !== 200) {
    console.error(`Fetch failed: status=${res.status} size=${res.body.length}`);
    if (res.err) console.error(`  ${res.err}`);
    process.exit(1);
  }
  console.log(`  fetched ${res.body.length.toLocaleString()} bytes`);

  const parsed = parse.parseDashboard(res.body);

  const nowIso = new Date().toISOString();
  const date = nowIso.slice(0, 10);
  const filename = `${date}-player-dashboard-hoq77.md`;
  const full = path.join(MATCHES_DIR, filename);

  const fm = {
    uuid: null,
    date,
    kind: 'player-dashboard-snapshot',
    source: 'hoq77',
    source_url: URL,
    fetched_at: nowIso,
    steamid: SID,
    hoq77: parsed.summary,
    status: 'snapshot',
    tags: ['hoq77', 'dashboard-snapshot'],
  };

  const yamlStr = yaml.dump(fm, { lineWidth: -1, noRefs: true });
  const content = `---\n${yamlStr}---\n\n` + renderDashboard(parsed, URL, nowIso);

  const exists = fs.existsSync(full);
  if (exists && !FORCE) {
    console.log(`\n  [exists] ${filename} — pass --force to overwrite (or wait until tomorrow)`);
    console.log(`  would-be size: ${content.length} bytes`);
    if (DRY_RUN) console.log(`  (DRY-RUN anyway — no write attempted)`);
    return;
  }

  console.log(`\nSummary:`);
  console.log(`  sections seen:   ${parsed.allSectionTitles.length}`);
  console.log(`  section titles:  ${parsed.allSectionTitles.join(' · ')}`);
  console.log(`  performance:     ${parsed.performance?.raw ? Object.keys(parsed.performance.raw).length + ' keys' : 'none'}`);
  console.log(`  ml layer:        ${parsed.ml?.raw ? Object.keys(parsed.ml.raw).length + ' keys' : 'none'}`);
  console.log(`  weapon stats:    ${parsed.weapons?.length ?? 0} rows`);
  console.log(`  head-to-head:    ${parsed.h2h?.rows?.length ?? 0} rows`);
  console.log(`  flag stats:      ${parsed.flagStats?.stats ? Object.keys(parsed.flagStats.stats).length + ' keys' : 'none'}`);
  console.log(`  heatmap modes:   ${parsed.heatmap?.modes?.length ?? 0}`);
  console.log(`  kill-feed:       ${parsed.killFeed?.length ?? 0}`);
  console.log(`  output size:     ${content.length} bytes`);
  console.log(`  target:          ${full}`);

  if (DRY_RUN) {
    console.log(`\n(DRY-RUN — file not written)`);
    return;
  }

  fs.writeFileSync(full, content, 'utf8');
  console.log(`\n  [wrote] ${filename}${exists ? ' (overwritten)' : ''}`);
}

main().catch(err => { console.error('Snapshot failed:', err); process.exit(1); });
