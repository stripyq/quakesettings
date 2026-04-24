#!/usr/bin/env node
/**
 * HTML parsers for http://77.90.2.137 (House of Quake mirror).
 *
 * Pure regex, no deps. Defensive: missing section → null/empty, never throw.
 *
 * Dashboard (player aggregate page) convention:
 *   <div class="section">
 *     <div class="section-header">Title</div>
 *     <div class="section-content"> ... </div>
 *   </div>
 *
 * Per-match page convention (flat classes at top level):
 *   .team-board × 4 — two summary (player roster) + two .pw-table (per-weapon)
 *   .matrix-table  — kill matrix
 *   .zones > .zone-row.team-red|team-blue > .zone-seg.zs-home|zs-mid|zs-opp
 *   .weapons > .weapon-row > .wpn > .wpn-name + .wpn-acc + .wpn-tooltip
 */

'use strict';

// ---------- Text helpers ----------

function decodeEntities(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rarr;/gi, '→')
    .replace(/&larr;/gi, '←')
    .replace(/&bull;/gi, '•')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html) {
  if (html == null) return '';
  return decodeEntities(String(html).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/** Like stripTags but keeps only the text before the first <br> or nested block tag. */
function firstTextPart(html) {
  if (html == null) return '';
  const cut = String(html).split(/<br\s*\/?>|<span|<div/i)[0];
  return stripTags(cut);
}

function num(s) {
  if (s == null) return null;
  const t = String(s).replace(/[,\s\u2009\u202f]/g, '').replace(/^\+/, '').trim();
  if (t === '' || t === '—' || t === '-' || t === '–') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---------- Section iteration (dashboard) ----------

function findSections(html) {
  const headers = [];
  const re = /<div\s+class="section-header"[^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    headers.push({ title: stripTags(m[1]), end: m.index + m[0].length });
  }
  const sections = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].end;
    const next = i + 1 < headers.length
      ? html.indexOf('<div class="section-header"', start)
      : html.length;
    const content = html.slice(start, next >= 0 ? next : html.length);
    sections.push({ title: headers[i].title, content });
  }
  return sections;
}

function findSection(html, titlePattern) {
  const re = new RegExp(titlePattern, 'i');
  return findSections(html).find(s => re.test(s.title)) || null;
}

// ---------- Primitives ----------

/** .stat-value/.stat-label pairs → object. Label cleaned: text before <br>/<span>. */
function extractStatsGrid(content) {
  const out = {};
  const re = /<div\s+class="stat-value"[^>]*>([\s\S]*?)<\/div>\s*<div\s+class="stat-label"[^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    const value = stripTags(m[1]);
    const label = firstTextPart(m[2]);
    if (label) out[label] = value;
  }
  return out;
}

function extractTable(html) {
  const tm = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tm) return null;
  return parseTableInner(tm[1]);
}

function parseTableInner(tbl) {
  const headers = [...tbl.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(x => stripTags(x[1]));
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRe.exec(tbl)) !== null) {
    const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => stripTags(x[1]));
    if (tds.length) rows.push(tds);
  }
  return { headers, rows };
}

function extractAllTables(html) {
  const out = [];
  const re = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(parseTableInner(m[1]));
  return out;
}

// ---------- Dashboard-specific ----------

function parsePerformanceSummary(html) {
  const s = findSection(html, '^performance summary$');
  if (!s) return null;
  const raw = extractStatsGrid(s.content);
  return {
    kills:    num(raw.Kills),
    deaths:   num(raw.Deaths),
    kd_ratio: num(raw['K/D Ratio'] ?? raw['KD']),
    damage:   num(raw['Damage Dealt'] ?? raw.Damage),
    kpm:      num(raw.KPM),
    eff_acc:  num(String(raw['Eff (6.X)'] ?? raw['Eff'] ?? '').replace('%', '')),
    raw,
  };
}

function parseMlMatchLayer(html) {
  const s = findSection(html, '^ml match layer$');
  if (!s) return null;
  return { raw: extractStatsGrid(s.content) };
}

function parseWeaponStats(html) {
  const s = findSection(html, '^weapon statistics');
  if (!s) return null;
  const t = extractTable(s.content);
  if (!t) return null;
  return t.rows
    .map(r => {
      const hitShot = r[4] || null;
      let accuracy = r[5] || null;
      // Fallback: compute accuracy from hit/shot when the cell is empty
      // (upstream renders accuracy as a graphic bar in col 5, text absent).
      if (!accuracy && hitShot) {
        const m = hitShot.match(/^(\d[\d,]*)\s*\/\s*(\d[\d,]*)/);
        if (m) {
          const hits = num(m[1]);
          const shots = num(m[2]);
          if (shots && shots > 0) accuracy = Math.round((hits / shots) * 100) + '%';
        }
      }
      return {
        weapon:   r[0] || null,
        kills:    num(r[1]),
        deaths:   num(r[2]),
        damage:   num(r[3]),
        hit_shot: hitShot,
        accuracy,
        use:      r[r.length - 2] || null,
        share:    r[r.length - 1] || null,
      };
    })
    .filter(w => w.weapon && w.weapon.toLowerCase() !== 'weapon');
}

function parseKillFeed(html) {
  const s = findSection(html, '^kill feed$');
  if (!s) return [];
  const items = [];
  const parts = s.content.split(/<div\s+class="feed-item"[^>]*>/i).slice(1);
  for (const part of parts) {
    const time = (part.match(/<span\s+class="feed-time"[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
    const weapon = (part.match(/<span\s+class="feed-weapon"[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
    const spans = [...part.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map(x => stripTags(x[1]));
    items.push({
      time:   time ? stripTags(time) : null,
      weapon: weapon ? stripTags(weapon) : null,
      spans,
    });
  }
  return items;
}

function parseHeadToHead(html) {
  const s = findSection(html, '^head-to-head');
  if (!s) return null;
  const rows = [];
  const parts = s.content.split(/<div\s+class="matchup-row"[^>]*>/i).slice(1);
  for (const part of parts) {
    // Capture the entire <a> opening tag, then scan its attributes for color
    // separately — this avoids the "greedy [^>]* eats the style attribute" bug.
    const openTagMatch = part.match(/<a[^>]*class="[^"]*\bmatchup-name\b[^"]*"[^>]*>/i);
    let color = null, name = null;
    if (openTagMatch) {
      const openTag = openTagMatch[0];
      color = (openTag.match(/color:\s*var\(--(\w+)\)/i) || [])[1] || null;
      const startIdx = openTagMatch.index + openTag.length;
      const endIdx = part.indexOf('</a>', startIdx);
      if (endIdx >= 0) name = stripTags(part.slice(startIdx, endIdx));
    }
    const zones = {};
    const zoneRe = /<span\s+class="zone-stat"[^>]*>\s*<span\s+class="zone-label"[^>]*>([A-Z])<\/span>([\s\S]*?)<\/span>\s*<\/span>|<span\s+class="zone-stat"[^>]*>\s*<span\s+class="zone-label"[^>]*>([A-Z])<\/span>([\s\S]*?)<\/span>/gi;
    // simpler: grab each zone-stat block by finding label + remaining text inside the outer span
    const zsRe = /<span\s+class="zone-stat"[^>]*>([\s\S]*?)<\/span>(?=\s*<span\s+class="zone-stat"|\s*<\/div>)/gi;
    let zm;
    while ((zm = zsRe.exec(part)) !== null) {
      const body = zm[1];
      const label = stripTags((body.match(/<span\s+class="zone-label"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
      const rest = stripTags(body.replace(/<span\s+class="zone-label"[^>]*>[\s\S]*?<\/span>/i, ''));
      if (label) zones[label] = rest;
    }
    const dmgTo   = (part.match(/<span\s+class="dmg-to"[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
    const dmgFrom = (part.match(/<span\s+class="dmg-from"[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
    const breakdown = (part.match(/<div\s+class="matchup-dmg"[^>]*title="([^"]*)"/i) || [])[1];
    rows.push({
      name, color, zones,
      dmg_to:   dmgTo   ? stripTags(dmgTo)   : null,
      dmg_from: dmgFrom ? stripTags(dmgFrom) : null,
      breakdown: breakdown ? decodeEntities(breakdown).replace(/\s+/g, ' ').trim() : null,
    });
  }
  return { rows };
}

function parseFlagStats(html) {
  const s = findSection(html, 'flag statistics');
  if (!s) return null;
  const stats = {};
  const re = /<div\s+class="flag-stat"[^>]*>\s*<div\s+class="flag-value"[^>]*>([\s\S]*?)<\/div>\s*<div\s+class="flag-label"[^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = re.exec(s.content)) !== null) {
    const val = stripTags(m[1]);
    const label = stripTags(m[2]);
    if (label) stats[label] = val;
  }
  return { stats };
}

function parseHeatmapMeta(html) {
  const s = findSection(html, 'position heatmap');
  if (!s) return null;
  const modes = [...s.content.matchAll(/<button[^>]*class="heatmap-mode-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/gi)]
    .map(m => {
      const active = /\bactive\b/i.test(m[0]);
      const label = firstTextPart(m[1]);
      const count = num((m[1].match(/>(\d[\d,]*)\s*<\/span>/) || [])[1]);
      return { label, count, active };
    });
  return { modes };
}

/**
 * Master dashboard parser. Returns:
 *   summary: flat JSON for frontmatter
 *   sections: structured per-section data
 *   allSectionTitles: every <div class="section-header"> title on the page
 */
function parseDashboard(html) {
  const performance = parsePerformanceSummary(html);
  const ml = parseMlMatchLayer(html);
  const weapons = parseWeaponStats(html);
  const killFeed = parseKillFeed(html);
  const h2h = parseHeadToHead(html);
  const flagStats = parseFlagStats(html);
  const heatmap = parseHeatmapMeta(html);
  const allSectionTitles = findSections(html).map(s => s.title);

  const summary = {
    kills:        performance?.kills ?? null,
    deaths:       performance?.deaths ?? null,
    kd_ratio:     performance?.kd_ratio ?? null,
    damage:       performance?.damage ?? null,
    kpm:          performance?.kpm ?? null,
    weapon_count: Array.isArray(weapons) ? weapons.length : 0,
    h2h_count:    h2h?.rows?.length ?? 0,
    flag_stats_count: flagStats?.stats ? Object.keys(flagStats.stats).length : 0,
    ml_keys:      ml?.raw ? Object.keys(ml.raw).length : 0,
    kill_feed_count: killFeed.length,
    sections_seen: allSectionTitles.length,
  };

  return { summary, performance, ml, weapons, killFeed, h2h, flagStats, heatmap, allSectionTitles };
}

// ---------- Match page parsers ----------

/**
 * Scan for all <div class="team-board ..."> openings and split page into
 * per-board slices. Each board classified as kind='summary' (contains
 * .player-row) or kind='per-weapon' (contains .pw-table).
 */
function parseTeamBoards(html) {
  const starts = [];
  const re = /<div[^>]*class="([^"]*\bteam-board\b[^"]*)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) starts.push({ start: m.index, classAttr: m[1] });
  const boards = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].start : html.length;
    const body = html.slice(starts[i].start, end);
    const colour = /\bteam-red\b/.test(starts[i].classAttr) ? 'red'
                 : /\bteam-blue\b/.test(starts[i].classAttr) ? 'blue'
                 : null;
    const isPw = /class="[^"]*\bpw-table\b/.test(body);
    const isSummary = /class="[^"]*\bplayer-row\b/.test(body);
    boards.push({
      colour,
      kind: isPw ? 'per-weapon' : (isSummary ? 'summary' : 'unknown'),
      body,
    });
  }
  return boards;
}

/** Summary team-board: team head + player roster rows with ML chips. */
function parseSummaryBoard(body) {
  const head = (body.match(/<div\s+class="team-head"[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
  const players = [];
  const parts = body.split(/<div\s+class="player-row"[^>]*>/i).slice(1);
  for (const part of parts) {
    const nameEl = part.match(/<div\s+class="player-name"[^>]*>([\s\S]*?)<\/div>/i);
    const name = nameEl ? stripTags(nameEl[1]) : null;
    const profileHref = (part.match(/<a[^>]+href="(players\/[^"]+)"/i) || [])[1] || null;
    const mlChips = [...part.matchAll(/<span\s+class="ml-chip[^"]*"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi)]
      .map(x => ({ title: decodeEntities(x[1]), label: stripTags(x[2]) }));
    players.push({ name, profileHref, ml: mlChips });
  }
  return { head: head ? stripTags(head) : null, players };
}

/** Per-weapon board: a <table class="pw-table"> with accuracy%s and tooltips. */
function parsePerWeaponTable(body) {
  const m = body.match(/<table[^>]*class="[^"]*\bpw-table\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!m) return null;
  const tbl = m[1];
  const headers = [...tbl.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(x => stripTags(x[1]));
  const rows = [];
  const rowRe = /<tr[^>]*class="[^"]*\bpw-row\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRe.exec(tbl)) !== null) {
    const rowHtml = r[1];
    const tds = [...rowHtml.matchAll(/<td[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi)];
    if (!tds.length) continue;
    const name = stripTags(tds[0][2]);
    const weapons = {};
    for (let i = 1; i < tds.length; i++) {
      const classAttr = tds[i][1];
      const cell = tds[i][2];
      const header = headers[i] || `W${i}`;
      if (/\bpw-empty\b/.test(classAttr) || stripTags(cell) === '.') {
        weapons[header] = null;
        continue;
      }
      const pct = (cell.match(/^\s*([\d.]+\s*%)/) || [])[1] || null;
      const tip = (cell.match(/<div\s+class="pw-tooltip"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
      const hs = tip.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/);
      const k  = tip.match(/(\d[\d,]*)\s*K\b/);
      const d  = tip.match(/(\d[\d,]*)\s*Dmg/i);
      weapons[header] = {
        accuracy: pct,
        hits:   hs ? num(hs[1]) : null,
        shots:  hs ? num(hs[2]) : null,
        kills:  k  ? num(k[1])  : null,
        damage: d  ? num(d[1])  : null,
      };
    }
    rows.push({ name, weapons });
  }
  return { headers, rows };
}

function parseKillMatrix(html) {
  const m = html.match(/<table[^>]*class="[^"]*\bmatrix-table\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!m) return null;
  const tbl = m[1];
  const headers = [...tbl.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(x => stripTags(x[1]));
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRe.exec(tbl)) !== null) {
    const rowBody = r[1];
    // Skip pure header rows — only <th> cells, no <td>. Otherwise the header
    // gets emitted as a data row and Obsidian renders two identical headers.
    if (!/<td\b/i.test(rowBody)) continue;
    const cells = [...rowBody.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(x => stripTags(x[1]));
    if (cells.length) rows.push(cells);
  }
  return { headers, rows };
}

function parseZones(html) {
  // Find the <div class="zones"> region — take everything up to the next major
  // section marker (matrix, container, kill-feed, body close).
  const regionMatch = html.match(/<div[^>]*class="[^"]*\bzones\b[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*\b(?:matrix|container|section)\b|<\/body>|$)/i);
  if (!regionMatch) return [];
  const region = regionMatch[1];

  const zones = [];
  const parts = region.split(/<div\s+class="([^"]*\bzone-row\b[^"]*)"[^>]*>/i);
  // Split returns: [pre, class1, body1, class2, body2, ...] — pair them up.
  for (let i = 1; i < parts.length; i += 2) {
    const classAttr = parts[i];
    const body = parts[i + 1] || '';
    const team = /\bteam-red\b/.test(classAttr) ? 'red'
              : /\bteam-blue\b/.test(classAttr) ? 'blue'
              : null;
    const name = stripTags((body.match(/<span\s+class="zone-name"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
    const segs = [];
    const segRe = /<div\s+class="zone-seg\s+zs-([a-z]+)"[^>]*style="width:\s*([\d.]+)%"[^>]*>([\s\S]*?)<div\s+class="zs-tooltip"[^>]*>([\s\S]*?)<\/div>/gi;
    let sm;
    while ((sm = segRe.exec(body)) !== null) {
      segs.push({
        zone: sm[1],
        width_pct: Number(sm[2]),
        label: stripTags(sm[3]),
        tooltip: stripTags(sm[4]),
      });
    }
    if (name) zones.push({ name, team, segs });
  }
  return zones;
}

// Normalize common weapon-name truncations from the upstream DOM
// (e.g. "RAILGU" with the trailing "N" applied via CSS pseudo-content).
const WEAPON_NAME_NORMALIZE = {
  'RAILGU': 'Railgun',
  'ROCKE':  'Rocket',
  'PLASM':  'Plasma',
  'LIGHT':  'Light',
};
function normalizeWeaponName(raw) {
  if (!raw) return raw;
  const key = raw.trim().toUpperCase();
  return WEAPON_NAME_NORMALIZE[key] || raw.trim();
}

function parseMatchWeapons(html) {
  const regionMatch = html.match(/<div[^>]*class="[^"]*\bweapons\b[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*\b(?:zones|matrix|container|section)\b|<\/body>|$)/i);
  if (!regionMatch) return [];
  const region = regionMatch[1];

  const rows = [];
  const parts = region.split(/<div\s+class="weapon-row"[^>]*>/i).slice(1);
  for (const part of parts) {
    const head = part.slice(0, 250);
    const team = /color:\s*var\(--red\)/i.test(head) ? 'red'
              : /color:\s*var\(--blue\)/i.test(head) ? 'blue'
              : null;
    // Split on each .wpn opening so we can extract name/acc/tooltip
    // independently. The old single-regex approach broke when .wpn-name
    // contained a nested <span> (non-greedy stopped at the inner </span>).
    const wpnSlices = part.split(/<span\s+class="wpn"[^>]*>/i).slice(1);
    const wpns = [];
    for (const slice of wpnSlices) {
      // Name: everything from wpn-name open up to wpn-acc open (lookahead).
      // This captures the full name even if it contains nested elements.
      const nameMatch = slice.match(/<span\s+class="wpn-name"[^>]*>([\s\S]*?)(?=<span\s+class="wpn-acc")/i);
      const accMatch  = slice.match(/<span\s+class="wpn-acc"[^>]*>([\s\S]*?)<\/span>/i);
      const tipMatch  = slice.match(/<div\s+class="wpn-tooltip"[^>]*>([\s\S]*?)<\/div>/i);
      if (!nameMatch && !tipMatch) continue;
      const rawName = stripTags(nameMatch?.[1] || '');
      const name = normalizeWeaponName(rawName);
      const acc = stripTags(accMatch?.[1] || '');
      const tipText = stripTags(tipMatch?.[1] || '');
      const hs = tipText.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*Hits/i);
      const k  = tipText.match(/(\d[\d,]*)\s*Kills/i);
      const d  = tipText.match(/(\d[\d,]*)\s*Dmg/i);
      wpns.push({
        name,
        accuracy: acc,
        hits:   hs ? num(hs[1]) : null,
        shots:  hs ? num(hs[2]) : null,
        kills:  k  ? num(k[1])  : null,
        damage: d  ? num(d[1])  : null,
      });
    }
    rows.push({ team, weapons: wpns });
  }
  return rows;
}

/**
 * Master match-page parser.
 */
function parseMatch(html) {
  const boards = parseTeamBoards(html);

  const scoreboard = boards
    .filter(b => b.kind === 'summary')
    .map(b => ({ colour: b.colour, ...parseSummaryBoard(b.body) }));

  const perWeaponTables = boards
    .filter(b => b.kind === 'per-weapon')
    .map(b => ({ colour: b.colour, table: parsePerWeaponTable(b.body) }))
    .filter(b => b.table);

  const killMatrix = parseKillMatrix(html);
  const zones = parseZones(html);
  const weapons = parseMatchWeapons(html);

  const summary = {
    team_boards_total: boards.length,
    scoreboard_boards: scoreboard.length,
    per_weapon_tables: perWeaponTables.length,
    has_kill_matrix:   !!killMatrix,
    kill_matrix_rows:  killMatrix?.rows?.length ?? 0,
    zone_count:        zones.length,
    zones_with_segs:   zones.filter(z => z.segs?.length).length,
    team_weapon_rows:  weapons.length,
    team_weapons_parsed: weapons.reduce((a, w) => a + (w.weapons?.length || 0), 0),
    per_weapon_player_count: perWeaponTables.reduce((a, p) => a + (p.table?.rows?.length || 0), 0),
  };

  return { summary, scoreboard, perWeaponTables, killMatrix, zones, weapons };
}

// ---------- Exports ----------

module.exports = {
  decodeEntities, stripTags, firstTextPart, num,
  findSections, findSection,
  extractStatsGrid, extractTable, extractAllTables,
  // dashboard
  parsePerformanceSummary, parseMlMatchLayer, parseWeaponStats,
  parseKillFeed, parseHeadToHead, parseFlagStats, parseHeatmapMeta,
  parseDashboard,
  // match
  parseTeamBoards, parseSummaryBoard, parsePerWeaponTable,
  parseKillMatrix, parseZones, parseMatchWeapons, parseMatch,
};
