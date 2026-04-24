#!/usr/bin/env node
/**
 * Enrich existing vault match notes with rich data from the HoQ mirror
 * at http://77.90.2.137. Per-match only (not the aggregate dashboard).
 *
 * For every .md file in <vault>/matches/ that has a `uuid` in frontmatter:
 *   1. GET /matches/<uuid>.html
 *   2. Parse scoreboard, kill matrix, zones, per-player weapon rows
 *   3. Merge into the note:
 *      - frontmatter  →  adds/updates `hoq77:` nested object
 *      - body         →  adds/replaces `## Advanced Stats (HoQ 77)` section,
 *                        wrapped in HOQ77-AUTO-BEGIN / HOQ77-AUTO-END markers
 *
 * Idempotent. Resumable. Rate-limited. Does NOT touch the existing
 * `## Game Data` section or HoQ-AUTO markers from enrich-my-games.cjs.
 *
 * Usage:
 *   node scripts/enrich-my-games-hoq77.cjs --vault="<path>" --dry-run
 *   node scripts/enrich-my-games-hoq77.cjs --vault="<path>"
 *   node scripts/enrich-my-games-hoq77.cjs --only=<uuid>        # just one match
 *   node scripts/enrich-my-games-hoq77.cjs --limit=5            # cap to N
 *   node scripts/enrich-my-games-hoq77.cjs --skip-fresh=24      # skip if hoq77.fetched_at < N hours ago
 *   node scripts/enrich-my-games-hoq77.cjs --delay=250          # ms between fetches (default 200)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const yaml = require('js-yaml');
const parse = require('./lib/hoq77-parse.cjs');

// ---------- Args ----------

const DEFAULT_VAULT = 'C:\\Users\\marin\\Documents\\Obsidian Vault\\Quake';
const args = process.argv.slice(2);
const getArg = (k, d) => {
  const a = args.find(x => x.startsWith(k + '='));
  return a ? a.slice(k.length + 1).replace(/^"|"$/g, '') : d;
};
const VAULT      = getArg('--vault', DEFAULT_VAULT);
const ONLY       = getArg('--only', '');
const LIMIT      = parseInt(getArg('--limit', '0'), 10) || 0;
const SKIP_FRESH = parseInt(getArg('--skip-fresh', '0'), 10) || 0;     // hours
const DELAY_MS   = parseInt(getArg('--delay', '200'), 10) || 200;
const DRY_RUN    = args.includes('--dry-run');
const VERBOSE    = args.includes('--verbose');

const MATCHES_DIR = path.join(VAULT, 'matches');
const BASE = 'http://77.90.2.137';

const AUTO_BEGIN = '<!-- HOQ77-AUTO-BEGIN — do not edit; re-enrichment overwrites this section -->';
const AUTO_END   = '<!-- HOQ77-AUTO-END -->';

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
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- Frontmatter ----------

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: md };
  let fm = {};
  try { fm = yaml.load(m[1]) || {}; } catch (e) { fm = { __parse_error: e.message }; }
  return { fm, body: md.slice(m[0].length) };
}

function buildFrontmatter(fm) {
  // Preserve the key order used by enrich-my-games.cjs, then append hoq77/others.
  const preferredOrder = [
    'uuid', 'map', 'map_input', 'date', 'duration', 'result',
    'score_team', 'score_opp',
    'my_role', 'my_caps', 'my_frags', 'my_deaths', 'my_dmg', 'my_rating_diff',
    'status', 'tags', 'hoq77',
  ];
  const ordered = {};
  for (const k of preferredOrder) if (k in fm) ordered[k] = fm[k];
  for (const k of Object.keys(fm)) if (!(k in ordered)) ordered[k] = fm[k];
  const yamlStr = yaml.dump(ordered, { lineWidth: -1, noRefs: true });
  return `---\n${yamlStr}---\n`;
}

// ---------- Markdown rendering ----------

function mdTable(headers, rows) {
  if (!headers || !headers.length || !rows || !rows.length) return '_(no data)_\n';
  const sep = headers.map(() => '---').join(' | ');
  const head = '| ' + headers.join(' | ') + ' |';
  const sepLine = '| ' + sep + ' |';
  const body = rows.map(r => '| ' + headers.map((_, i) => (r[i] ?? '')).join(' | ') + ' |').join('\n');
  return `${head}\n${sepLine}\n${body}\n`;
}

function renderMatch(parsed, uuid) {
  const nowIso = new Date().toISOString();
  let md = `## Advanced Stats (HoQ 77)\n\n`;
  md += AUTO_BEGIN + '\n\n';
  md += `_Source: [${BASE}/matches/${uuid}.html](${BASE}/matches/${uuid}.html) · fetched ${nowIso}_\n\n`;

  // ----- Scoreboard (summary boards: roster + ML chips) -----
  if (parsed.scoreboard?.length) {
    md += `### Rosters & ML Roles\n\n`;
    for (const b of parsed.scoreboard) {
      const title = (b.colour || 'team').toUpperCase();
      md += `**${title}** — ${b.head || ''}\n\n`;
      if (!b.players?.length) { md += '_(no players parsed)_\n\n'; continue; }
      md += '| Player | ML Role | Tier | Delta |\n| --- | --- | --- | --- |\n';
      for (const p of b.players) {
        const role  = p.ml.find(c => /\bml-role\b/i.test(c.title) || /role/i.test(c.title))?.label || '';
        const tier  = p.ml.find(c => /tier/i.test(c.title))?.label || '';
        const delta = p.ml.find(c => /delta|baseline/i.test(c.title))?.label || '';
        md += `| ${p.name || '—'} | ${role} | ${tier} | ${delta} |\n`;
      }
      md += '\n';
    }
  }

  // ----- Per-Weapon Accuracy (the gem) -----
  if (parsed.perWeaponTables?.length) {
    md += `### Per-Weapon Accuracy by Player\n\n`;
    for (const pw of parsed.perWeaponTables) {
      if (!pw.table) continue;
      const title = (pw.colour || 'team').toUpperCase();
      md += `**${title}**\n\n`;
      const weaponCols = pw.table.headers.slice(1); // drop "Name"
      md += '| Player | ' + weaponCols.join(' | ') + ' |\n';
      md += '| --- | ' + weaponCols.map(() => '---').join(' | ') + ' |\n';
      for (const row of pw.table.rows) {
        const cells = [row.name];
        for (const h of weaponCols) {
          const w = row.weapons[h];
          if (!w) { cells.push('—'); continue; }
          cells.push(`${w.accuracy || ''} · ${w.hits ?? '—'}/${w.shots ?? '—'} · ${w.kills ?? '—'}K · ${w.damage ?? '—'}D`);
        }
        md += '| ' + cells.join(' | ') + ' |\n';
      }
      md += '\n';
    }
  }

  // ----- Kill Matrix -----
  if (parsed.killMatrix) {
    md += `### Kill Matrix\n\n`;
    md += mdTable(parsed.killMatrix.headers, parsed.killMatrix.rows) + '\n';
  }

  // ----- Zones (CTF) -----
  if (parsed.zones?.length) {
    md += `### Zones (CTF)\n\n`;
    md += '| Player | Team | Home | Mid | Enemy |\n| --- | --- | --- | --- | --- |\n';
    for (const z of parsed.zones) {
      const seg = {};
      for (const s of z.segs || []) {
        const key = s.zone === 'opp' ? 'enemy' : s.zone;
        seg[key] = `${s.width_pct}% (${s.tooltip})`;
      }
      md += `| ${z.name} | ${z.team || ''} | ${seg.home || '—'} | ${seg.mid || '—'} | ${seg.enemy || '—'} |\n`;
    }
    md += '\n';
  }

  // ----- Team-level Weapons (aggregated) -----
  if (parsed.weapons?.length) {
    md += `### Team Weapons (aggregated)\n\n`;
    for (const w of parsed.weapons) {
      const title = (w.team || 'team').toUpperCase();
      md += `**${title}**\n\n`;
      md += '| Weapon | Acc | Hits/Shots | Kills | Damage |\n';
      md += '| --- | --- | --- | ---: | ---: |\n';
      for (const ww of w.weapons || []) {
        md += `| ${ww.name} | ${ww.accuracy || '—'} | ${ww.hits ?? '—'}/${ww.shots ?? '—'} | ${ww.kills ?? '—'} | ${ww.damage ?? '—'} |\n`;
      }
      md += '\n';
    }
  }

  md += AUTO_END + '\n';
  return md;
}

function replaceOrInsertHoq77(body, section) {
  const re = new RegExp(
    '##\\s*Advanced Stats \\(HoQ 77\\)\\s*\\n\\s*' +
    AUTO_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\\s\\S]*?' +
    AUTO_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '\\s*'
  );
  if (re.test(body)) return body.replace(re, section);

  // Insert after existing `## Game Data` block if present, else before ## Notes, else append.
  const gameDataRe = /\n##\s*Game Data[\s\S]*?<!--\s*HoQ-AUTO-END\s*-->\s*/;
  const gameDataMatch = body.match(gameDataRe);
  if (gameDataMatch) {
    const idx = body.indexOf(gameDataMatch[0]) + gameDataMatch[0].length;
    return body.slice(0, idx) + '\n' + section + body.slice(idx);
  }
  const notesIdx = body.search(/\n##\s*Notes\b/);
  if (notesIdx >= 0) return body.slice(0, notesIdx) + '\n' + section + body.slice(notesIdx);
  return body.trimEnd() + '\n\n' + section;
}

function hoursSince(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 36e5;
}

// ---------- Main ----------

async function main() {
  console.log(`Vault:      ${VAULT}`);
  console.log(`Matches:    ${MATCHES_DIR}`);
  console.log(`Mode:       ${DRY_RUN ? 'DRY-RUN (no writes)' : 'WRITE'}`);
  if (ONLY) console.log(`Only:       ${ONLY}`);
  if (LIMIT) console.log(`Limit:      ${LIMIT}`);
  if (SKIP_FRESH) console.log(`Skip fresh: < ${SKIP_FRESH}h old`);
  console.log(`Delay:      ${DELAY_MS}ms\n`);

  if (!fs.existsSync(MATCHES_DIR)) {
    console.error(`matches/ folder not found: ${MATCHES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MATCHES_DIR).filter(f => f.toLowerCase().endsWith('.md'));
  console.log(`Vault notes found: ${files.length}\n`);

  let processed = 0, enriched = 0, skipped = 0, unavailable = 0, errored = 0;

  for (const file of files) {
    if (LIMIT && processed >= LIMIT) { console.log(`[limit] reached ${LIMIT}, stopping`); break; }

    const full = path.join(MATCHES_DIR, file);
    let raw;
    try { raw = fs.readFileSync(full, 'utf8'); }
    catch (e) { console.warn(`  [read-error] ${file}: ${e.message}`); errored++; continue; }

    const { fm, body } = parseFrontmatter(raw);
    if (fm.__parse_error) { console.warn(`  [yaml-error] ${file}: ${fm.__parse_error}`); errored++; continue; }
    if (!fm.uuid) { VERBOSE && console.log(`  [no-uuid] ${file}`); skipped++; continue; }
    if (ONLY && fm.uuid !== ONLY) { skipped++; continue; }

    if (SKIP_FRESH && fm.hoq77?.fetched_at && hoursSince(fm.hoq77.fetched_at) < SKIP_FRESH) {
      VERBOSE && console.log(`  [fresh] ${file} (${fm.hoq77.fetched_at})`);
      skipped++; continue;
    }

    processed++;
    const url = `${BASE}/matches/${fm.uuid}.html`;
    const res = await fetchPage(url);
    await sleep(DELAY_MS);

    if (res.status !== 200 || res.body.length < 500) {
      console.log(`  [unavailable] ${file} → ${res.status} (size=${res.body.length})`);
      // Record the attempt so we don't retry every run.
      fm.hoq77 = Object.assign({}, fm.hoq77, {
        fetched_at: new Date().toISOString(),
        source_url: url,
        status: res.status,
        available: false,
      });
      if (!DRY_RUN) {
        fs.writeFileSync(full, buildFrontmatter(fm) + '\n' + body.trimStart(), 'utf8');
      }
      unavailable++;
      continue;
    }

    let parsed;
    try { parsed = parse.parseMatch(res.body); }
    catch (e) { console.warn(`  [parse-error] ${file}: ${e.message}`); errored++; continue; }

    fm.hoq77 = {
      fetched_at: new Date().toISOString(),
      source_url: url,
      status: 200,
      available: true,
      ...parsed.summary,
    };

    const section = renderMatch(parsed, fm.uuid);
    const newBody = replaceOrInsertHoq77(body, section);
    const newContent = buildFrontmatter(fm) + '\n' + newBody.trimStart();

    const tag = `roster=${parsed.summary.scoreboard_boards} pw=${parsed.summary.per_weapon_tables}(${parsed.summary.per_weapon_player_count}p) matrix=${parsed.summary.has_kill_matrix ? parsed.summary.kill_matrix_rows : 'N'} zones=${parsed.summary.zones_with_segs}/${parsed.summary.zone_count} wpn=${parsed.summary.team_weapons_parsed}(${parsed.summary.team_weapon_rows}t)`;
    if (DRY_RUN) {
      console.log(`  [would enrich] ${file}  ${tag}`);
    } else {
      fs.writeFileSync(full, newContent, 'utf8');
      console.log(`  [enriched] ${file}  ${tag}`);
    }
    enriched++;
  }

  console.log(`\n--- Summary ---`);
  console.log(`processed:   ${processed}`);
  console.log(`enriched:    ${enriched}`);
  console.log(`unavailable: ${unavailable}  (recent-only mirror — older UUIDs expected to miss)`);
  console.log(`skipped:     ${skipped}`);
  console.log(`errored:     ${errored}`);
  console.log(DRY_RUN ? `\n(DRY-RUN — no vault files were modified)` : '');
}

main().catch(err => { console.error('Enricher failed:', err); process.exit(1); });
