#!/usr/bin/env node
/**
 * Enrich personal Obsidian match notes with data from the HoQ archive.
 *
 * Reads every .md file in <vault>/matches/, looks up each by UUID in the
 * local JSONL archive, and injects a "## Game Data" section with the full
 * scoreboard. Frontmatter auto-fields (map, date, result, your stats) are
 * updated each run. Your "## Positions" and "## Notes" sections are
 * preserved untouched.
 *
 * With --create-stubs, also creates a note for every game you played
 * that doesn't have a pre-existing file — so you can backfill retroactively.
 *
 * Usage:
 *   node scripts/enrich-my-games.cjs \
 *     --vault="C:\Users\marin\Documents\Obsidian Vault\Quake" \
 *     --steamid=76561197992882111 \
 *     --gt=ctf
 *
 *   node scripts/enrich-my-games.cjs --vault=... --steamid=... --create-stubs
 *   node scripts/enrich-my-games.cjs --vault=... --steamid=... --dry-run
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const yaml = require('js-yaml');

// ---------- Defaults + CLI ----------

const DEFAULT_VAULT = 'C:\\Users\\marin\\Documents\\Obsidian Vault\\Quake';
const DEFAULT_STEAMID = '76561197992882111'; // stripy

const args = process.argv.slice(2);
const getArg = (k, d) => {
  const a = args.find(x => x.startsWith(k + '='));
  return a ? a.slice(k.length + 1).replace(/^"|"$/g, '') : d;
};
const VAULT = getArg('--vault', DEFAULT_VAULT);
const STEAMID = getArg('--steamid', DEFAULT_STEAMID);
const GT = getArg('--gt', 'ctf');
const CREATE_STUBS = args.includes('--create-stubs');
const DRY_RUN = args.includes('--dry-run');

const ROOT = path.join(__dirname, '..');
const ARCHIVE = path.join(ROOT, 'public/data/archive', `${GT}.jsonl`);
const MATCHES_DIR = path.join(VAULT, 'matches');

// ---------- Vocabulary ----------

// Map aliases. Keys are lowercased user input; values are the HoQ canonical
// map name as it appears in scoreboard data (see the archive for the exact strings).
const MAP_ALIASES = {
  // Japanese Castles
  'cp1': 'q3wcp1', 'jpc': 'q3wcp1', 'p1': 'q3wcp1', 'japanesecastles': 'japanesecastles',
  // Spider Crossings
  'cp9': 'q3wcp9', 'spider': 'q3wcp9', 'spiders': 'q3wcp9', 'q3wcp9': 'q3wcp9',
  // Ironworks
  'iron': 'ironworks', 'iw': 'ironworks', 'ironworks': 'ironworks',
  // Troubled Waters
  'tw': 'troubledwaters', 'troubled': 'troubledwaters', 'troubledwaters': 'troubledwaters',
  // Shining Forces
  'shining': 'shiningforces', 'sf': 'shiningforces', 'shiningforces': 'shiningforces',
  // Infinity
  'infy': 'infinity', 'infinity': 'infinity',
  // Courtyard
  'court': 'courtyard', 'c10': 'courtyard', 'courtyard': 'courtyard',
  // Others
  'c8': 'siberia', 'siberia': 'siberia',
  'c7': 'campercrossings', 'camper': 'campercrossings', 'campercrossings': 'campercrossings',
  'pb': 'pillbox', 'pillbox': 'pillbox',
  'reflux': 'reflux',
};

// Role aliases. Keys are lowercased user input; values are canonical.
const ROLE_ALIASES = {
  'def': 'def',
  'off': 'off', 'offs': 'off',
  'mid': 'mid',
  'lg': 'lg',
  'high': 'high',
  'hmed': 'hmed', 'hm': 'hmed', 'hmk': 'hmed',
  'nmemd': 'nmemd',
  'hra': 'hra',
  'era': 'era', 'nmera': 'era',
};
const VALID_ROLES = new Set(Object.values(ROLE_ALIASES));

function canonicalMap(raw) {
  if (!raw) return null;
  const k = String(raw).trim().toLowerCase();
  return MAP_ALIASES[k] || k;
}
function canonicalRole(raw) {
  if (!raw) return null;
  const k = String(raw).trim().toLowerCase();
  return ROLE_ALIASES[k] || null;
}

// ---------- Archive loading ----------

async function loadArchive(steamid) {
  if (!fs.existsSync(ARCHIVE)) {
    throw new Error(`Archive not found: ${ARCHIVE}\nRun scripts/build-hoq-archive.cjs first (or finish the scrape).`);
  }
  const byUuid = new Map();
  let total = 0, mine = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(ARCHIVE),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    try {
      const m = JSON.parse(line);
      if (Array.isArray(m.players) && m.players.some(p => p.sid === steamid)) {
        byUuid.set(m.uuid, m);
        mine++;
      }
    } catch { /* skip malformed line */ }
  }
  console.log(`Archive: ${total} ${GT} matches total, ${mine} where you played`);
  return byUuid;
}

// ---------- Frontmatter parsing ----------

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: md };
  let fm = {};
  try { fm = yaml.load(m[1]) || {}; } catch (e) { fm = { __parse_error: e.message }; }
  return { fm, body: md.slice(m[0].length) };
}

function buildFrontmatter(fm) {
  // Order fields for readability. Unknown fields appended in their natural order.
  const preferredOrder = [
    'uuid', 'map', 'map_input', 'date', 'duration', 'result',
    'score_team', 'score_opp',
    'my_role', 'my_caps', 'my_frags', 'my_deaths', 'my_dmg', 'my_rating_diff',
    'status', 'tags',
  ];
  const ordered = {};
  for (const k of preferredOrder) if (k in fm) ordered[k] = fm[k];
  for (const k of Object.keys(fm)) if (!(k in ordered)) ordered[k] = fm[k];
  const yamlStr = yaml.dump(ordered, { lineWidth: -1, noRefs: true });
  return `---\n${yamlStr}---\n`;
}

// ---------- Positions parsing + validation ----------

function extractPositions(body) {
  const match = body.match(/##\s*Positions\s*\n([\s\S]*?)(?=\n##\s|\n*$)/);
  if (!match) return [];
  const rows = [];
  for (const line of match[1].split('\n')) {
    const m = line.match(/^\s*-\s+(.+?)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const name = m[1].trim();
    const role = m[2].trim();
    if (!name) continue;
    rows.push({ name, role: role || null });
  }
  return rows;
}

function validatePositions(positions, match, mySid) {
  const problems = [];
  const byNickLower = new Map();
  for (const p of match.players) byNickLower.set(p.nick.toLowerCase(), p);

  for (const pos of positions) {
    // "me" handled specially — skip roster lookup
    if (pos.name.toLowerCase() === 'me') {
      if (pos.role && !canonicalRole(pos.role)) {
        problems.push(`role "${pos.role}" for me is not in the known set`);
      }
      continue;
    }
    const lower = pos.name.toLowerCase();
    let matched = byNickLower.get(lower);
    if (!matched) {
      // substring fallback (both directions)
      const candidates = [...byNickLower.entries()].filter(([nick]) =>
        nick.includes(lower) || lower.includes(nick)
      );
      if (candidates.length === 1) matched = candidates[0][1];
      else if (candidates.length === 0) {
        problems.push(`"${pos.name}" → no player in this match's roster`);
        continue;
      } else if (candidates.length > 1) {
        problems.push(`"${pos.name}" → ambiguous: ${candidates.map(c => c[0]).join(', ')}`);
        continue;
      }
    }
    if (matched.sid === mySid) {
      problems.push(`"${pos.name}" (${matched.nick}) is yourself — use "me" instead`);
    }
    if (pos.role && !canonicalRole(pos.role)) {
      problems.push(`role "${pos.role}" for ${pos.name} is not in the known set`);
    }
  }
  return problems;
}

// ---------- Auto-generated game data section ----------

const AUTO_BEGIN = '<!-- HoQ-AUTO-BEGIN — do not edit; re-enrichment overwrites this section -->';
const AUTO_END = '<!-- HoQ-AUTO-END -->';

function formatDuration(sec) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function formatSigned(n, d = 2) {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + Number(n).toFixed(d);
}

function buildPlayerTable(players) {
  const head = '| Nick | Score | Frags | Deaths | Caps | Asts | Defs | DMG | RG% | Impressive |';
  const sep  = '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
  const rows = players.map(p => {
    const rgAcc = p.weapons?.rg?.acc != null ? `${p.weapons.rg.acc}%` : '—';
    const imp = p.medals?.impressive ?? '—';
    return `| ${p.nick} | ${p.score ?? '—'} | ${p.frags ?? '—'} | ${p.deaths ?? '—'} | ${p.caps ?? '—'} | ${p.assists ?? '—'} | ${p.defends ?? '—'} | ${p.dmg_dealt ?? '—'} | ${rgAcc} | ${imp} |`;
  });
  return [head, sep, ...rows].join('\n');
}

function buildGameDataSection(match, mySid) {
  const myPlayer = match.players.find(p => p.sid === mySid);
  const myTeam = myPlayer?.team;
  const teammates = match.players.filter(p => p.team === myTeam && p.sid !== mySid);
  const opponents = match.players.filter(p => p.team !== myTeam);

  const result = !myTeam ? '—' : match.winner === 'draw' ? 'D' : match.winner === myTeam ? 'W' : 'L';
  const myScore = myTeam === 'blue' ? match.scores.blue : myTeam === 'red' ? match.scores.red : null;
  const oppScore = myTeam === 'blue' ? match.scores.red : myTeam === 'red' ? match.scores.blue : null;
  const date = match.ts ? new Date(match.ts * 1000).toISOString().slice(0, 10) : '—';

  let md = '## Game Data\n\n';
  md += AUTO_BEGIN + '\n\n';
  md += `**${match.map || '—'}** · ${formatDuration(match.duration_sec)} · **${result}** ${myScore ?? '—'}–${oppScore ?? '—'} · ${date}`;
  if (myPlayer?.rating_diff != null) md += ` · ratingΔ ${formatSigned(myPlayer.rating_diff)}`;
  md += '\n\n';

  if (myPlayer) {
    md += '### Me\n\n';
    md += buildPlayerTable([myPlayer]) + '\n\n';
  }

  md += `### Teammates (${teammates.length})\n\n`;
  md += buildPlayerTable(teammates) + '\n\n';

  md += `### Opponents (${opponents.length})\n\n`;
  md += buildPlayerTable(opponents) + '\n\n';

  md += `[View scoreboard on HoQ](http://88.214.20.58/scoreboard/${match.uuid})\n\n`;
  md += AUTO_END + '\n';
  return md;
}

function replaceOrInsertGameData(body, gameDataSection) {
  // Replace a previous auto-section if present (matches "## Game Data" + auto markers)
  const autoRe = new RegExp(
    '##\\s*Game Data\\s*\\n\\s*' +
    AUTO_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\\s\\S]*?' +
    AUTO_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '\\s*'
  );
  if (autoRe.test(body)) {
    return body.replace(autoRe, gameDataSection);
  }
  // Insert immediately before the ## Notes section if present
  const notesIdx = body.search(/\n##\s*Notes\b/);
  if (notesIdx >= 0) {
    return body.slice(0, notesIdx) + '\n' + gameDataSection + body.slice(notesIdx);
  }
  // Fall back: append at end
  return body.trimEnd() + '\n\n' + gameDataSection;
}

// ---------- Stub file for games without pre-existing notes ----------

function buildStubContent(match, mySid) {
  const myPlayer = match.players.find(p => p.sid === mySid);
  const myTeam = myPlayer?.team;
  const result = !myTeam ? '—' : match.winner === 'draw' ? 'D' : match.winner === myTeam ? 'W' : 'L';
  const myScore = myTeam === 'blue' ? match.scores.blue : myTeam === 'red' ? match.scores.red : null;
  const oppScore = myTeam === 'blue' ? match.scores.red : myTeam === 'red' ? match.scores.blue : null;
  const date = match.ts ? new Date(match.ts * 1000).toISOString().slice(0, 10) : null;

  const fm = {
    uuid: match.uuid,
    map: match.map,
    date,
    duration: formatDuration(match.duration_sec),
    result,
    score_team: myScore,
    score_opp: oppScore,
    my_role: '',
    my_caps: myPlayer?.caps ?? 0,
    my_frags: myPlayer?.frags ?? null,
    my_deaths: myPlayer?.deaths ?? null,
    my_dmg: myPlayer?.dmg_dealt ?? null,
    my_rating_diff: myPlayer?.rating_diff ?? null,
    status: 'stub-no-notes',
    tags: [],
  };

  let md = buildFrontmatter(fm) + '\n';
  md += '## Positions\n\n';
  md += '<!-- Format: `nickname: role`. Role: def | off | mid | lg | high | hmed | nmemd | hra | era. -->\n\n';
  md += '- me: \n\n';
  md += buildGameDataSection(match, mySid) + '\n';
  md += '## Notes\n\n';
  return md;
}

function stubFilename(match) {
  const date = match.ts ? new Date(match.ts * 1000).toISOString().slice(0, 10) : 'unknown-date';
  const mapSlug = (match.map || 'unknown').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'map';
  const uuidShort = match.uuid.slice(0, 8);
  return `${date}-${mapSlug}-${uuidShort}.md`;
}

// ---------- Main ----------

async function main() {
  console.log(`Vault:    ${VAULT}`);
  console.log(`Matches:  ${MATCHES_DIR}`);
  console.log(`Archive:  ${ARCHIVE}`);
  console.log(`SteamID:  ${STEAMID}`);
  console.log(`Stubs:    ${CREATE_STUBS ? 'yes' : 'no'}`);
  console.log(`Dry-run:  ${DRY_RUN ? 'yes' : 'no'}\n`);

  if (!fs.existsSync(VAULT)) {
    console.error(`Vault folder not found: ${VAULT}`);
    process.exit(1);
  }
  if (!fs.existsSync(MATCHES_DIR)) {
    console.error(`matches/ folder not found inside vault: ${MATCHES_DIR}`);
    console.error(`Create it (or let --create-stubs create the first stubs).`);
    if (CREATE_STUBS && !DRY_RUN) fs.mkdirSync(MATCHES_DIR, { recursive: true });
    else process.exit(1);
  }

  const byUuid = await loadArchive(STEAMID);
  const files = fs.existsSync(MATCHES_DIR)
    ? fs.readdirSync(MATCHES_DIR).filter(f => f.toLowerCase().endsWith('.md'))
    : [];
  console.log(`Existing vault notes: ${files.length}\n`);

  const seen = new Set();
  let enriched = 0, skipped = 0, errored = 0;
  const problems = [];

  for (const file of files) {
    const fullPath = path.join(MATCHES_DIR, file);
    let raw;
    try { raw = fs.readFileSync(fullPath, 'utf8'); }
    catch (e) { console.warn(`  [read-error] ${file}: ${e.message}`); errored++; continue; }

    const { fm, body } = parseFrontmatter(raw);
    if (fm.__parse_error) {
      console.warn(`  [yaml-error] ${file}: ${fm.__parse_error}`);
      errored++; continue;
    }
    if (!fm.uuid) {
      console.warn(`  [no-uuid] ${file}: missing uuid in frontmatter — skipping`);
      skipped++; continue;
    }
    const match = byUuid.get(fm.uuid);
    if (!match) {
      console.warn(`  [not-in-archive] ${file}: uuid ${fm.uuid} not found (you may not have played in this match yet, or wrong gametype, or uuid typo)`);
      skipped++; continue;
    }
    seen.add(fm.uuid);

    const myPlayer = match.players.find(p => p.sid === STEAMID);
    const myTeam = myPlayer?.team;
    const myScore = myTeam === 'blue' ? match.scores.blue : myTeam === 'red' ? match.scores.red : null;
    const oppScore = myTeam === 'blue' ? match.scores.red : myTeam === 'red' ? match.scores.blue : null;
    const result = !myTeam ? '—' : match.winner === 'draw' ? 'D' : match.winner === myTeam ? 'W' : 'L';

    // Map normalization: canonicalize user input, warn on mismatch with HoQ's map name
    if (fm.map) {
      const userMap = canonicalMap(fm.map);
      if (userMap !== match.map) {
        if (userMap && userMap !== String(fm.map).toLowerCase()) fm.map_input = fm.map;
        fm.map = match.map; // always trust HoQ's canonical name
      } else {
        fm.map = match.map;
      }
    } else {
      fm.map = match.map;
    }
    fm.date = match.ts ? new Date(match.ts * 1000).toISOString().slice(0, 10) : fm.date ?? null;
    fm.duration = formatDuration(match.duration_sec);
    fm.result = result;
    fm.score_team = myScore;
    fm.score_opp = oppScore;
    fm.my_frags = myPlayer?.frags ?? null;
    fm.my_deaths = myPlayer?.deaths ?? null;
    fm.my_caps = myPlayer?.caps ?? fm.my_caps ?? 0;
    fm.my_dmg = myPlayer?.dmg_dealt ?? null;
    fm.my_rating_diff = myPlayer?.rating_diff ?? null;
    fm.status = 'enriched';

    // Validate positions block
    const positions = extractPositions(body);
    const posProblems = validatePositions(positions, match, STEAMID);
    for (const p of posProblems) problems.push(`${file}: ${p}`);

    const gameData = buildGameDataSection(match, STEAMID);
    const newBody = replaceOrInsertGameData(body, gameData);
    const newContent = buildFrontmatter(fm) + '\n' + newBody.trimStart();

    if (DRY_RUN) {
      console.log(`  [would enrich] ${file}`);
    } else {
      fs.writeFileSync(fullPath, newContent, 'utf8');
      console.log(`  [enriched] ${file}`);
    }
    enriched++;
  }

  // Stubs for games without pre-existing notes
  let stubs = 0;
  if (CREATE_STUBS) {
    for (const [uuid, match] of byUuid) {
      if (seen.has(uuid)) continue;
      const filename = stubFilename(match);
      const fullPath = path.join(MATCHES_DIR, filename);
      if (fs.existsSync(fullPath)) continue; // respect existing stubs

      const content = buildStubContent(match, STEAMID);
      if (DRY_RUN) {
        console.log(`  [would stub] ${filename}`);
      } else {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`  [stub] ${filename}`);
      }
      stubs++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Enriched:        ${enriched}`);
  console.log(`Stubs created:   ${stubs}`);
  console.log(`Skipped:         ${skipped}`);
  console.log(`Errored:         ${errored}`);
  console.log(`Your games in archive: ${byUuid.size}`);
  console.log(`Games without notes:   ${byUuid.size - seen.size}${CREATE_STUBS ? ' (see stubs above)' : ' (run with --create-stubs to generate)'}`);

  if (problems.length > 0) {
    console.log(`\n=== Problems (${problems.length}) ===`);
    for (const p of problems) console.log(`  ${p}`);
  } else {
    console.log(`\nNo problems — all position names matched the rosters.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
