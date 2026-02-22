const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PLAYERS_DIR = path.join(__dirname, '..', 'src', 'content', 'players');

// Read all players
const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
const players = files.map(f => {
  const content = fs.readFileSync(path.join(PLAYERS_DIR, f), 'utf8');
  const data = yaml.load(content) || {};
  return { slug: f.replace('.yaml', ''), ...data };
});

// Calculate cm/360 from settings if not directly available
function calculateCm360(p) {
  if (p.cm360) return p.cm360;
  if (p.dpi && p.sensitivity) {
    const yaw = p.m_yaw || 0.022;
    return (360 / (yaw * p.dpi * p.sensitivity)) * 2.54;
  }
  return null;
}

// Helpers
function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function fmt(val, decimals = 1) {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

function countWith(arr, key) {
  return arr.filter(p => p[key] != null && !isNaN(p[key])).length;
}

function hasProfile(p) {
  return p.published !== false;
}

// Group by team2026
const teamMap = {};
for (const p of players) {
  if (!p.team2026) continue;
  if (!teamMap[p.team2026]) teamMap[p.team2026] = [];
  teamMap[p.team2026].push(p);
}

const teamNames = Object.keys(teamMap).sort((a, b) => a.localeCompare(b));

// Build team stats
const teamStats = teamNames.map(team => {
  const roster = teamMap[team].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const shortname = roster[0]?.team2026Shortname || '';
  const cm360s = roster.map(p => calculateCm360(p)).filter(v => v != null);
  return {
    team,
    shortname,
    roster,
    count: roster.length,
    withProfiles: roster.filter(hasProfile).length,
    rg: avg(roster.map(p => p.accuracy_rg)),
    lg: avg(roster.map(p => p.accuracy_lg)),
    rl: avg(roster.map(p => p.accuracy_rl)),
    cm: avg(cm360s),
    cmMin: cm360s.length > 0 ? Math.min(...cm360s) : null,
    cmMax: cm360s.length > 0 ? Math.max(...cm360s) : null,
    ctf: avg(roster.map(p => p.ctfRating)),
    tdm: avg(roster.map(p => p.tdmRating)),
    duel: avg(roster.map(p => p.duelRating)),
    rgCount: countWith(roster, 'accuracy_rg'),
    lgCount: countWith(roster, 'accuracy_lg'),
    rlCount: countWith(roster, 'accuracy_rl'),
    cmCount: cm360s.length,
    ctfCount: roster.filter(p => p.ctfRating != null).length,
    tdmCount: roster.filter(p => p.tdmRating != null).length,
    duelCount: roster.filter(p => p.duelRating != null).length,
  };
});

// Players without 2026 team
const noTeam = players.filter(p => !p.team2026).sort((a, b) => (a.name || a.slug).localeCompare(b.name || b.slug));

// Start building markdown
let md = '# CSQL Team Statistics Report\n\n';
md += `*Generated: ${new Date().toISOString().split('T')[0]}*\n\n`;
md += `**Total teams:** ${teamNames.length}  \n`;
md += `**Total rostered players:** ${teamStats.reduce((s, t) => s + t.count, 0)}  \n`;
md += `**Players with profiles:** ${teamStats.reduce((s, t) => s + t.withProfiles, 0)}  \n`;
md += `**Players without teams:** ${noTeam.length}\n\n`;

// ── Section 1: Team Rosters ──
md += '## Team Rosters\n\n';
for (const ts of teamStats) {
  const label = ts.shortname ? `${ts.team} (${ts.shortname})` : ts.team;
  md += `### ${label}\n\n`;
  md += '| Player | Profile | Duel | CTF | TDM | RG% | LG% | RL% | cm/360 |\n';
  md += '|--------|---------|------|-----|-----|-----|-----|-----|--------|\n';
  for (const p of ts.roster) {
    const cm = calculateCm360(p);
    const profile = hasProfile(p) ? 'Yes' : '—';
    md += `| ${p.name || p.slug}`;
    md += ` | ${profile}`;
    md += ` | ${p.duelRating != null ? p.duelRating : '—'}`;
    md += ` | ${p.ctfRating != null ? fmt(p.ctfRating) : '—'}`;
    md += ` | ${p.tdmRating != null ? fmt(p.tdmRating) : '—'}`;
    md += ` | ${p.accuracy_rg != null ? p.accuracy_rg + '%' : '—'}`;
    md += ` | ${p.accuracy_lg != null ? p.accuracy_lg + '%' : '—'}`;
    md += ` | ${p.accuracy_rl != null ? p.accuracy_rl + '%' : '—'}`;
    md += ` | ${cm != null ? fmt(cm) : '—'} |\n`;
  }
  // Team averages row
  const cm = ts.cm;
  md += `| **Average** | **${ts.withProfiles}/${ts.count}**`;
  md += ` | ${ts.duel != null ? fmt(ts.duel, 0) : '—'}`;
  md += ` | ${ts.ctf != null ? fmt(ts.ctf) : '—'}`;
  md += ` | ${ts.tdm != null ? fmt(ts.tdm) : '—'}`;
  md += ` | ${ts.rg != null ? fmt(ts.rg) + '%' : '—'}`;
  md += ` | ${ts.lg != null ? fmt(ts.lg) + '%' : '—'}`;
  md += ` | ${ts.rl != null ? fmt(ts.rl) + '%' : '—'}`;
  md += ` | ${cm != null ? fmt(cm) : '—'} |\n`;
  md += '\n';
}

// ── Section 2: Team Leaderboards ──
md += '## Team Leaderboards\n\n';

function leaderboard(title, key, countKey, unit, ascending = false) {
  const sorted = teamStats
    .filter(t => t[key] != null)
    .sort((a, b) => ascending ? a[key] - b[key] : b[key] - a[key]);
  if (sorted.length === 0) return '';
  let s = `### ${title}\n\n`;
  s += '| Rank | Team | Value | Players w/ Data |\n';
  s += '|------|------|-------|----------------|\n';
  sorted.forEach((t, i) => {
    s += `| ${i + 1} | ${t.team} | ${fmt(t[key])}${unit} | ${t[countKey]}/${t.count} |\n`;
  });
  s += '\n';
  return s;
}

md += leaderboard('Best Average RG Accuracy', 'rg', 'rgCount', '%');
md += leaderboard('Best Average LG Accuracy', 'lg', 'lgCount', '%');
md += leaderboard('Best Average RL Accuracy', 'rl', 'rlCount', '%');
md += leaderboard('Highest Average CTF Rating', 'ctf', 'ctfCount', '');
md += leaderboard('Highest Average TDM Rating', 'tdm', 'tdmCount', '');
md += leaderboard('Highest Average Duel Rating', 'duel', 'duelCount', '');

// cm/360 leaderboard with range
const cmSorted = teamStats.filter(t => t.cm != null).sort((a, b) => a.cm - b.cm);
if (cmSorted.length > 0) {
  md += '### Lowest Average cm/360 (Sensitivity)\n\n';
  md += '| Rank | Team | Avg cm/360 | Range | Players w/ Data |\n';
  md += '|------|------|-----------|-------|----------------|\n';
  cmSorted.forEach((t, i) => {
    const range = t.cmMin != null && t.cmMax != null
      ? `${fmt(t.cmMin, 0)}–${fmt(t.cmMax, 0)} cm`
      : '—';
    md += `| ${i + 1} | ${t.team} | ${fmt(t.cm)} cm | ${range} | ${t.cmCount}/${t.count} |\n`;
  });
  md += '\n';
}

// ── Section 3: Team Comparison Matrix ──
md += '## Team Comparison Matrix\n\n';
md += '| Team | Players | With Profiles | Avg RG | Avg LG | Avg RL | Avg cm/360 | Avg CTF | Avg TDM |\n';
md += '|------|---------|---------------|--------|--------|--------|------------|---------|--------|\n';
for (const ts of teamStats) {
  md += `| ${ts.team}`;
  md += ` | ${ts.count}`;
  md += ` | ${ts.withProfiles}`;
  md += ` | ${ts.rg != null ? fmt(ts.rg) + '%' : '—'}`;
  md += ` | ${ts.lg != null ? fmt(ts.lg) + '%' : '—'}`;
  md += ` | ${ts.rl != null ? fmt(ts.rl) + '%' : '—'}`;
  md += ` | ${ts.cm != null ? fmt(ts.cm) : '—'}`;
  md += ` | ${ts.ctf != null ? fmt(ts.ctf) : '—'}`;
  md += ` | ${ts.tdm != null ? fmt(ts.tdm) : '—'} |\n`;
}
md += '\n';

// ── Section 4: Notable Stats ──
md += '## Notable Stats\n\n';

// Helper to find team superlatives
function findBest(key, ascending = false) {
  const valid = teamStats.filter(t => t[key] != null);
  if (valid.length === 0) return null;
  return valid.sort((a, b) => ascending ? a[key] - b[key] : b[key] - a[key])[0];
}

// Helper to find player superlatives
function findBestPlayer(field, ascending = false) {
  const rostered = players.filter(p => p.team2026 && p[field] != null && !isNaN(p[field]));
  if (rostered.length === 0) return null;
  return rostered.sort((a, b) => ascending ? a[field] - b[field] : b[field] - a[field])[0];
}

const bestRgTeam = findBest('rg');
const bestLgTeam = findBest('lg');
const bestRlTeam = findBest('rl');
const bestCtfTeam = findBest('ctf');
const bestTdmTeam = findBest('tdm');
const bestDuelTeam = findBest('duel');
const lowestCmTeam = findBest('cm', true);
const mostProfiles = teamStats.sort((a, b) => b.withProfiles - a.withProfiles)[0];
const largestRoster = teamStats.sort((a, b) => b.count - a.count)[0];

md += '### Team Superlatives\n\n';
if (bestRgTeam) md += `- **Highest team RG accuracy:** ${bestRgTeam.team} (${fmt(bestRgTeam.rg)}%)\n`;
if (bestLgTeam) md += `- **Highest team LG accuracy:** ${bestLgTeam.team} (${fmt(bestLgTeam.lg)}%)\n`;
if (bestRlTeam) md += `- **Highest team RL accuracy:** ${bestRlTeam.team} (${fmt(bestRlTeam.rl)}%)\n`;
if (bestCtfTeam) md += `- **Highest team CTF rating:** ${bestCtfTeam.team} (${fmt(bestCtfTeam.ctf)})\n`;
if (bestTdmTeam) md += `- **Highest team TDM rating:** ${bestTdmTeam.team} (${fmt(bestTdmTeam.tdm)})\n`;
if (bestDuelTeam) md += `- **Highest team Duel rating:** ${bestDuelTeam.team} (${fmt(bestDuelTeam.duel, 0)})\n`;
if (lowestCmTeam) md += `- **Lowest average sensitivity:** ${lowestCmTeam.team} (${fmt(lowestCmTeam.cm)} cm/360)\n`;
if (mostProfiles) md += `- **Most players with profiles:** ${mostProfiles.team} (${mostProfiles.withProfiles}/${mostProfiles.count})\n`;
if (largestRoster) md += `- **Largest roster:** ${largestRoster.team} (${largestRoster.count} players)\n`;
md += '\n';

// Player superlatives
const bestRgPlayer = findBestPlayer('accuracy_rg');
const bestLgPlayer = findBestPlayer('accuracy_lg');
const bestRlPlayer = findBestPlayer('accuracy_rl');
const bestCtfPlayer = findBestPlayer('ctfRating');
const bestTdmPlayer = findBestPlayer('tdmRating');
const bestDuelPlayer = findBestPlayer('duelRating');
const lowestCmPlayer = findBestPlayer('cm360', true);
const highestCmPlayer = findBestPlayer('cm360');

md += '### Player Superlatives\n\n';
if (bestRgPlayer) md += `- **Highest RG accuracy:** ${bestRgPlayer.name} (${bestRgPlayer.accuracy_rg}%, ${bestRgPlayer.team2026})\n`;
if (bestLgPlayer) md += `- **Highest LG accuracy:** ${bestLgPlayer.name} (${bestLgPlayer.accuracy_lg}%, ${bestLgPlayer.team2026})\n`;
if (bestRlPlayer) md += `- **Highest RL accuracy:** ${bestRlPlayer.name} (${bestRlPlayer.accuracy_rl}%, ${bestRlPlayer.team2026})\n`;
if (bestCtfPlayer) md += `- **Highest CTF rating:** ${bestCtfPlayer.name} (${fmt(bestCtfPlayer.ctfRating)}, ${bestCtfPlayer.team2026})\n`;
if (bestTdmPlayer) md += `- **Highest TDM rating:** ${bestTdmPlayer.name} (${fmt(bestTdmPlayer.tdmRating)}, ${bestTdmPlayer.team2026})\n`;
if (bestDuelPlayer) md += `- **Highest Duel rating:** ${bestDuelPlayer.name} (${bestDuelPlayer.duelRating}, ${bestDuelPlayer.team2026})\n`;
if (lowestCmPlayer) md += `- **Lowest sensitivity:** ${lowestCmPlayer.name} (${fmt(lowestCmPlayer.cm360)} cm/360, ${lowestCmPlayer.team2026})\n`;
if (highestCmPlayer) md += `- **Highest sensitivity:** ${highestCmPlayer.name} (${fmt(highestCmPlayer.cm360)} cm/360, ${highestCmPlayer.team2026})\n`;
md += '\n';

// ── Section 5: Players Without 2026 Teams ──
md += '## Players Without 2026 Teams\n\n';
if (noTeam.length === 0) {
  md += '*All players have 2026 team assignments.*\n\n';
} else {
  md += `| Player | Profile | Steam ID | 2024 Team |\n`;
  md += `|--------|---------|----------|----------|\n`;
  for (const p of noTeam) {
    const profile = hasProfile(p) ? 'Yes' : '—';
    md += `| ${p.name || p.slug} | ${profile} | ${p.steamId || '—'} | ${p.team2024 || '—'} |\n`;
  }
  md += '\n';
}

// ── Section 6: Data Quality Notes ──
md += '## Data Quality Notes\n\n';

// Check for potential data issues
const issues = [];

// Check for very high cm/360 values (likely data entry errors)
for (const p of players) {
  const cm = calculateCm360(p);
  if (cm != null && cm > 200) {
    issues.push(`**${p.name || p.slug}** has unusually high cm/360: ${fmt(cm)} cm (${p.team2026 || 'no team'})`);
  }
}

// Check for players without steam IDs
const noSteamId = players.filter(p => p.team2026 && !p.steamId);
if (noSteamId.length > 0) {
  issues.push(`**${noSteamId.length} rostered player(s) without Steam ID:** ${noSteamId.map(p => p.name || p.slug).join(', ')}`);
}

// Check for players without any accuracy data
const noAccuracy = players.filter(p => p.team2026 && p.accuracy_rg == null && p.accuracy_lg == null && p.accuracy_rl == null);
if (noAccuracy.length > 0) {
  issues.push(`**${noAccuracy.length} rostered player(s) without any accuracy data:** ${noAccuracy.map(p => p.name || p.slug).join(', ')}`);
}

// Check for team name inconsistencies (case-sensitive duplicates)
const teamNameLower = {};
for (const p of players) {
  if (!p.team2026) continue;
  const lower = p.team2026.toLowerCase();
  if (!teamNameLower[lower]) teamNameLower[lower] = new Set();
  teamNameLower[lower].add(p.team2026);
}
for (const [, variants] of Object.entries(teamNameLower)) {
  if (variants.size > 1) {
    issues.push(`**Team name inconsistency:** ${[...variants].join(' vs ')}`);
  }
}

if (issues.length === 0) {
  md += '*No data quality issues detected.*\n\n';
} else {
  for (const issue of issues) {
    md += `- ${issue}\n`;
  }
  md += '\n';
}

// Write output
const outPath = path.join(__dirname, '..', 'analysis', 'team-stats.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);
console.log(`Generated ${outPath}`);
console.log(`  ${teamNames.length} teams, ${teamStats.reduce((s, t) => s + t.count, 0)} rostered players`);
console.log(`  ${noTeam.length} players without teams`);
console.log(`  ${issues.length} data quality issue(s)`);
