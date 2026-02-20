const fs = require('fs');
const path = require('path');

const PLAYERS_DIR = path.join(__dirname, '..', 'src', 'content', 'players');

// Read all player YAML files (simple parser for flat YAML)
function parseYaml(content) {
  const data = {};
  let currentArrayKey = null;
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('  - ') && currentArrayKey) {
      if (!data[currentArrayKey]) data[currentArrayKey] = [];
      let val = line.slice(4).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      data[currentArrayKey].push(val);
      continue;
    }
    currentArrayKey = null;

    const match = line.match(/^(\w[\w\d_]*)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, key, rawVal] = match;
    let val = rawVal.trim();

    if (val === '' || val === '[]') {
      if (val === '[]') data[key] = [];
      continue;
    }

    // Check if this is the start of an array
    if (val === '') {
      currentArrayKey = key;
      data[key] = [];
      continue;
    }

    // Remove quotes
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);

    // Parse booleans and numbers
    if (val === 'true') { data[key] = true; continue; }
    if (val === 'false') { data[key] = false; continue; }
    if (/^-?\d+(\.\d+)?$/.test(val)) { data[key] = parseFloat(val); continue; }

    data[key] = val;

    // Check for array start
    currentArrayKey = null;
  }
  return data;
}

// Read all players
const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));
const players = files.map(f => {
  const content = fs.readFileSync(path.join(PLAYERS_DIR, f), 'utf8');
  return { slug: f.replace('.yaml', ''), ...parseYaml(content) };
});

// Group by team2026
const teamMap = {};
for (const p of players) {
  if (!p.team2026) continue;
  if (!teamMap[p.team2026]) teamMap[p.team2026] = [];
  teamMap[p.team2026].push(p);
}

// Sort teams alphabetically
const teamNames = Object.keys(teamMap).sort((a, b) => a.localeCompare(b));

function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function fmt(val) {
  if (val === null) return '—';
  return val.toFixed(1);
}

function calculateCm360(p) {
  if (p.dpi && p.sensitivity) {
    if (p.m_cpi && p.m_cpi > 0) {
      return (360 / p.sensitivity) * (p.m_cpi / p.dpi);
    }
    const yaw = p.m_yaw || 0.022;
    return (360 / (yaw * p.dpi * p.sensitivity)) * 2.54;
  }
  return p.cm360 || null;
}

let md = '# CSQL Team Statistics Report\n\n';
md += `*Generated: ${new Date().toISOString().split('T')[0]}*\n\n`;
md += `**Total teams:** ${teamNames.length}  \n`;
md += `**Total rostered players:** ${Object.values(teamMap).reduce((s, t) => s + t.length, 0)}\n\n`;

// Team Rosters
md += '## Team Rosters\n\n';
for (const team of teamNames) {
  const roster = teamMap[team].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  md += `### ${team}\n\n`;
  md += '| Player | Duel | CTF | TDM | RG% | LG% | RL% | cm/360 |\n';
  md += '|--------|------|-----|-----|-----|-----|-----|--------|\n';
  for (const p of roster) {
    const cm = calculateCm360(p);
    md += `| ${p.name || p.slug} | ${p.duelRating || '—'} | ${p.ctfRating ? p.ctfRating.toFixed(1) : '—'} | ${p.tdmRating ? p.tdmRating.toFixed(1) : '—'} | ${p.accuracy_rg != null ? p.accuracy_rg + '%' : '—'} | ${p.accuracy_lg != null ? p.accuracy_lg + '%' : '—'} | ${p.accuracy_rl != null ? p.accuracy_rl + '%' : '—'} | ${cm ? cm.toFixed(1) : '—'} |\n`;
  }
  md += '\n';
}

// Team Average Stats
md += '## Team Averages\n\n';
md += '| Team | Players | Avg RG% | Avg LG% | Avg RL% | Avg cm/360 | Avg CTF | Avg TDM |\n';
md += '|------|---------|---------|---------|---------|------------|---------|--------|\n';

const teamStats = [];
for (const team of teamNames) {
  const roster = teamMap[team];
  const rg = avg(roster.map(p => p.accuracy_rg));
  const lg = avg(roster.map(p => p.accuracy_lg));
  const rl = avg(roster.map(p => p.accuracy_rl));
  const cm = avg(roster.map(p => calculateCm360(p)));
  const ctf = avg(roster.map(p => p.ctfRating));
  const tdm = avg(roster.map(p => p.tdmRating));
  teamStats.push({ team, count: roster.length, rg, lg, rl, cm, ctf, tdm });
  md += `| ${team} | ${roster.length} | ${fmt(rg)}${rg != null ? '%' : ''} | ${fmt(lg)}${lg != null ? '%' : ''} | ${fmt(rl)}${rl != null ? '%' : ''} | ${fmt(cm)} | ${fmt(ctf)} | ${fmt(tdm)} |\n`;
}
md += '\n';

// Leaderboards
md += '## Team Leaderboards\n\n';

function leaderboard(title, key, unit) {
  const sorted = teamStats.filter(t => t[key] != null).sort((a, b) => b[key] - a[key]);
  if (sorted.length === 0) return '';
  let s = `### ${title}\n\n`;
  s += '| Rank | Team | Value |\n';
  s += '|------|------|-------|\n';
  sorted.forEach((t, i) => {
    s += `| ${i + 1} | ${t.team} | ${fmt(t[key])}${unit} |\n`;
  });
  s += '\n';
  return s;
}

md += leaderboard('Best Average RG Accuracy', 'rg', '%');
md += leaderboard('Best Average LG Accuracy', 'lg', '%');
md += leaderboard('Best Average RL Accuracy', 'rl', '%');

// cm/360 leaderboard (lower = faster sens, but show both directions)
const cmSorted = teamStats.filter(t => t.cm != null).sort((a, b) => a.cm - b.cm);
if (cmSorted.length > 0) {
  md += '### Lowest Average cm/360 (fastest sensitivity)\n\n';
  md += '| Rank | Team | Value |\n';
  md += '|------|------|-------|\n';
  cmSorted.forEach((t, i) => {
    md += `| ${i + 1} | ${t.team} | ${fmt(t.cm)} cm |\n`;
  });
  md += '\n';
}

md += leaderboard('Highest Average CTF Rating', 'ctf', '');
md += leaderboard('Highest Average TDM Rating', 'tdm', '');

fs.writeFileSync(path.join(__dirname, '..', 'analysis', 'team-stats.md'), md);
console.log('Generated analysis/team-stats.md');
