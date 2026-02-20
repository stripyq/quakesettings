const fs = require('fs');
const path = require('path');

const PLAYERS_DIR = path.join(__dirname, '..', 'src', 'content', 'players');

// Player data from the user's table
// canonical, steam_id, aliases, team_2024, team_2026, team_2026_shortname
const playerData = [
  { canonical: 'enesy', slug: 'enesy', steamId: '76561198032236208', aliases: ['cockenesy'], team2024: 'Aimdead Brainers', team2026: 'Aimdead brainers', team2026Shortname: 'cock' },
  { canonical: 'ins', slug: 'ins', steamId: '76561198023589138', aliases: ['\u{1F1F5}\u{1F1F9}ins', 'cockins'], team2024: 'Aimdead brainers', team2026: 'Aimdead brainers', team2026Shortname: 'cock' },
  { canonical: 'supremee', slug: 'supremee', steamId: '76561197990531413', aliases: ['cocksupremee'], team2024: 'Aimdead Brainers', team2026: 'Aimdead brainers', team2026Shortname: 'cock' },
  { canonical: 'Cook', slug: 'cook', steamId: '76561197995232645', aliases: ['cook'], team2024: 'Aimdead Brainers', team2026: 'Aimdead brainers', team2026Shortname: 'cock' },
  { canonical: 'pengelephant', slug: 'pengelephant', steamId: '76561198062139103', aliases: ['cockpengelephant'], team2024: '', team2026: 'Aimdead brainers', team2026Shortname: 'cock' },
  { canonical: 'mutant', slug: 'mutant', steamId: '76561198117978344', aliases: ['\u{1E41}\u{01D4}\u{03C4}\u{2B65}\u{0148}\u{03C4}\u{203A}'], team2024: 'Bad But Happy', team2026: 'Astral Starlight', team2026Shortname: '' },
  { canonical: 'nebulas0n9', slug: 'nebulas0n9', steamId: '76561198141993917', aliases: ['nebula'], team2024: 'CTF4', team2026: 'Astral Starlight', team2026Shortname: '' },
  { canonical: 'Janti', slug: 'janti', steamId: '76561198258475383', aliases: [], team2024: 'Flappy Flags', team2026: 'Astral Starlight', team2026Shortname: '' },
  { canonical: 'Frigolx', slug: 'frigolx', steamId: '76561198053960733', aliases: [], team2024: 'Whatever name IDC', team2026: 'Astral Starlight', team2026Shortname: '' },
  { canonical: 'KHAN', slug: 'khan', steamId: '76561197973893045', aliases: [], team2024: '', team2026: 'Astral Starlight', team2026Shortname: '' },
  { canonical: 'Manty', slug: 'manty', steamId: '76561198146434639', aliases: [':)'], team2024: 'AHU', team2026: 'Czesnecka', team2026Shortname: 'CZE' },
  { canonical: 'Dloobiq', slug: 'dloobiq', steamId: '76561198107461408', aliases: ['Dloobiq', 'Dblq'], team2024: 'wAnnaBees', team2026: 'Czesnecka', team2026Shortname: 'CZE' },
  { canonical: 'Fr0zik', slug: 'fr0zik', steamId: '76561198895628868', aliases: ['fr0z', 'frozik'], team2024: '', team2026: 'Czesnecka', team2026Shortname: 'CZE' },
  { canonical: 'Needy', slug: 'needy', steamId: '76561198275956025', aliases: [], team2024: '', team2026: 'Czesnecka', team2026Shortname: 'CZE' },
  { canonical: 'Nvc', slug: 'nvc', steamId: '76561198000088567', aliases: ['nvc', 'twitch.tv/justnvc'], team2024: '', team2026: 'Czesnecka', team2026Shortname: 'CZE' },
  { canonical: 'cherepoff', slug: 'cherrypoff', steamId: '76561198149540641', aliases: ['chr'], team2024: 'Bad But Happy', team2026: 'GdeFlag?', team2026Shortname: 'GF?' },
  { canonical: 'ion', slug: 'ion', steamId: '76561197983318796', aliases: ['FX'], team2024: 'Whatever name IDC', team2026: 'GdeFlag?', team2026Shortname: 'GF?' },
  { canonical: 'd1z', slug: 'd1z', steamId: '76561198075079469', aliases: ['d1zulya'], team2024: '', team2026: 'GdeFlag?', team2026Shortname: 'GF?' },
  { canonical: 'Latrommi', slug: 'latrommi', steamId: '', aliases: [], team2024: '', team2026: 'GdeFlag?', team2026Shortname: 'GF?' },
  { canonical: 'pecka', slug: 'pecka', steamId: '76561198025225261', aliases: [], team2024: '', team2026: 'GdeFlag?', team2026Shortname: 'GF?' },
  { canonical: 'artemis4', slug: 'artemis4', steamId: '76561198151319268', aliases: ['CUBAartemis4'], team2024: 'CTF4', team2026: 'Le Cubanitos', team2026Shortname: 'CUBA' },
  { canonical: 'ioRek', slug: 'iorek', steamId: '76561197960736529', aliases: ['ioio_', 'CUBAioio', 'iOio'], team2024: 'CTF4', team2026: 'Le Cubanitos', team2026Shortname: 'CUBA' },
  { canonical: 'edd1', slug: 'edd1', steamId: '76561198084461653', aliases: ['eddi', 'CUBAedd1', 'Eddi'], team2024: '', team2026: 'Le Cubanitos', team2026Shortname: 'CUBA' },
  { canonical: 'knz', slug: 'knz', steamId: '76561198039145005', aliases: ['CUBAknz'], team2024: '', team2026: 'Le Cubanitos', team2026Shortname: 'CUBA' },
  { canonical: 'Lumi', slug: 'lumi', steamId: '76561198088925347', aliases: ['CUBAlumi', 'lumi'], team2024: '', team2026: 'Le Cubanitos', team2026Shortname: 'CUBA' },
  { canonical: 'Cheto!!', slug: 'cheto', steamId: '76561199044683584', aliases: ['Chet0!', 'Chet0!!'], team2024: '4friends', team2026: 'Old Sexy Quakers', team2026Shortname: 'OSQ' },
  { canonical: 'hypnoi', slug: 'hypnoi', steamId: '76561198141767332', aliases: ['OsQhypnoi'], team2024: 'Old sexy Quakers', team2026: 'Old sexy Quakers', team2026Shortname: 'OSQ' },
  { canonical: 'Baldur', slug: 'baldur', steamId: '76561198028016604', aliases: ['dBdBaldur'], team2024: 'Old sexy Quakers', team2026: 'Old Sexy Quakers', team2026Shortname: 'OSQ' },
  { canonical: 'mult', slug: 'mult', steamId: '76561198257362399', aliases: ['OsQmult'], team2024: 'Old sexy Quakers', team2026: 'Old sexy Quakers', team2026Shortname: 'OSQ' },
  { canonical: 'PYTON', slug: 'pyton', steamId: '76561198105088252', aliases: ['OsQPYTON'], team2024: 'Old sexy Quakers', team2026: 'Old sexy Quakers', team2026Shortname: 'OSQ' },
  { canonical: 're4', slug: 're4', steamId: '76561198155003669', aliases: ['re4'], team2024: '', team2026: 'Old Sexy Quakers', team2026Shortname: 'OSQ' },
  { canonical: 'dem0n', slug: 'dem0n', steamId: '76561198001355736', aliases: ['DEM0N', 'demon'], team2024: 'SHREKTALIKA', team2026: 'SHREKTALIKA', team2026Shortname: 'SHREK' },
  { canonical: 'Headz', slug: 'headz', steamId: '76561198013356693', aliases: ['\u{0397}\u{039E}\u{2206}\u{0110}\u{01B5}'], team2024: 'SHREKTALIKA', team2026: 'SHREKTALIKA', team2026Shortname: 'SHREK' },
  { canonical: 'l1nkin', slug: 'l1nkin', steamId: '76561198047335245', aliases: ['LK', 'L'], team2024: 'SHREKTALIKA', team2026: 'SHREKTALIKA', team2026Shortname: 'SHREK' },
  { canonical: 'Makie', slug: 'makie', steamId: '76561198008234329', aliases: ['MAKIE'], team2024: 'SHREKTALIKA', team2026: 'SHREKTALIKA', team2026Shortname: 'SHREK' },
  { canonical: 'Mastermind', slug: 'mastermind', steamId: '76561198033439430', aliases: ['MASTERZENMIND'], team2024: 'SHREKTALIKA', team2026: 'SHREKTALIKA', team2026Shortname: 'SHREK' },
  { canonical: 'Spart1e', slug: 'spart1e', steamId: '76561198239142044', aliases: ['SPART1E'], team2024: 'SHREKTALIKA', team2026: 'SHREKTALIKA', team2026Shortname: 'SHREK' },
  { canonical: 'iceman', slug: 'iceman', steamId: '76561198001355736', aliases: ['Iceman'], team2024: '', team2026: 'SHREKTALIKA', team2026Shortname: 'SHREK' },
  { canonical: 'fo_tbh', slug: 'fo_tbh', steamId: '76561198075628646', aliases: ['wB fo_tbh'], team2024: 'wAnnaBees', team2026: 'wAnnaBees', team2026Shortname: 'wB' },
  { canonical: 'jcb', slug: 'jcb', steamId: '76561198042268423', aliases: ['wB jcb'], team2024: 'wAnnaBees', team2026: 'wAnnaBees', team2026Shortname: 'wB' },
  { canonical: 'kirson', slug: 'kirson', steamId: '76561198114832578', aliases: ['wB kirson'], team2024: 'wAnnaBees', team2026: 'wAnnaBees', team2026Shortname: 'wB' },
  { canonical: 'stripy', slug: 'stripy', steamId: '76561197992882111', aliases: ['stripy\u{30C4}', 'wB stripy'], team2024: 'wAnnaBees', team2026: 'wAnnaBees', team2026Shortname: 'wB' },
  { canonical: 'zoza', slug: 'zoza', steamId: '76561198881954793', aliases: ['zozo', 'wB zoza'], team2024: 'wAnnaBees', team2026: 'wAnnaBees', team2026Shortname: 'wB' },
  { canonical: 'lihensior', slug: 'lihensior', steamId: '76561198007335390', aliases: ['liha', 'lih', 'wB lihensior'], team2024: 'Whatever name IDC', team2026: 'wAnnaBees', team2026Shortname: 'wB' },
  { canonical: 'Cham', slug: 'cham', steamId: '76561198090478714', aliases: ['RoumanianCham'], team2024: '4friends', team2026: '', team2026Shortname: '' },
  { canonical: 'cYpReSss', slug: 'cypresss', steamId: '76561199496005153', aliases: ['cYpReSss'], team2024: '4friends', team2026: '', team2026Shortname: '' },
  { canonical: 'shib', slug: 'shib', steamId: '76561198200942503', aliases: [], team2024: '4friends', team2026: '', team2026Shortname: '' },
  { canonical: 'tr1x0', slug: 'tr1x0', steamId: '76561198257316780', aliases: [], team2024: '4friends', team2026: '', team2026Shortname: '' },
  { canonical: 'cT', slug: 'ct', steamId: '76561197997252303', aliases: [], team2024: 'AHU', team2026: '', team2026Shortname: '' },
  { canonical: 'Denzoa', slug: 'denzoa', steamId: '76561198007682548', aliases: ['Denzoa\u{2122}'], team2024: 'AHU', team2026: '', team2026Shortname: '' },
  { canonical: 'Jonas', slug: 'jonas', steamId: '', aliases: [], team2024: 'AHU', team2026: '', team2026Shortname: '' },
  { canonical: 'Roxor', slug: 'roxor', steamId: '76561198043802405', aliases: ['Roxor'], team2024: 'AHU', team2026: '', team2026Shortname: '' },
  { canonical: 'Spenzer', slug: 'spenzer', steamId: '76561198088011443', aliases: ['spenzeR'], team2024: 'AHU', team2026: '', team2026Shortname: '' },
  { canonical: 'serious', slug: 'serious', steamId: '76561198136963513', aliases: ['serious'], team2024: 'Aimdead Brainers', team2026: '', team2026Shortname: '' },
  { canonical: 'apex', slug: 'apex', steamId: '76561198077156894', aliases: [], team2024: 'Bad But Happy', team2026: '', team2026Shortname: '' },
  { canonical: 'matr1x', slug: 'matr1x', steamId: '76561197985659232', aliases: ['#matr1x'], team2024: 'Bad But Happy', team2026: '', team2026Shortname: '' },
  { canonical: 'mezz', slug: 'mezz', steamId: '76561197961473367', aliases: ['CRYINGLAUGHINGB\u{00D3}BR'], team2024: 'Bad But Happy', team2026: '', team2026Shortname: '' },
  { canonical: 'vulTure', slug: 'vulture', steamId: '76561198257391553', aliases: [], team2024: 'Bad But Happy', team2026: '', team2026Shortname: '' },
  { canonical: 'andy.damn3d', slug: 'damn3d', steamId: '76561198162507961', aliases: ['damn3d'], team2024: 'CTF4', team2026: '', team2026Shortname: '' },
  { canonical: 'dehumanizeR', slug: 'dehumanizer', steamId: '76561197964623506', aliases: [], team2024: 'CTF4', team2026: '', team2026Shortname: '' },
  { canonical: 'imprez', slug: 'imprez', steamId: '76561198256071177', aliases: ['*4imprez'], team2024: 'CTF4', team2026: '', team2026Shortname: '' },
  { canonical: 'mousestar', slug: 'mousestar', steamId: '76561198191100033', aliases: ['FF^mouse*'], team2024: 'Flappy Flags', team2026: '', team2026Shortname: '' },
  { canonical: 'Pettern', slug: 'pettern', steamId: '76561197970764070', aliases: [], team2024: 'Flappy Flags', team2026: '', team2026Shortname: '' },
  { canonical: 'sno', slug: 'sno', steamId: '76561198065591498', aliases: ['sno'], team2024: 'Flappy Flags', team2026: '', team2026Shortname: '' },
  { canonical: 'storm', slug: 'storm', steamId: '', aliases: [], team2024: 'Flappy Flags', team2026: '', team2026Shortname: '' },
  { canonical: 'Zyb', slug: 'zyb', steamId: '76561198202091255', aliases: ['FF^Zyb'], team2024: 'Flappy Flags', team2026: '', team2026Shortname: '' },
  { canonical: 'abso', slug: 'abso', steamId: '76561198045866799', aliases: ['abso'], team2024: 'The expendables', team2026: '', team2026Shortname: '' },
  { canonical: 'clawz', slug: 'clawz', steamId: '76561198393765487', aliases: ['clawz'], team2024: 'The expendables', team2026: '', team2026Shortname: '' },
  { canonical: 'exodus', slug: 'exodus', steamId: '76561197965938361', aliases: ['\u{1D34}\u{1D2C}\u{1D34}\u{1D2C} XDS'], team2024: 'The expendables', team2026: '', team2026Shortname: '' },
  { canonical: 'ph0en|X', slug: 'ph0enix', steamId: '76561198228590616', aliases: ['ph0en|X'], team2024: 'The expendables', team2026: '', team2026Shortname: '' },
  { canonical: 'Silencep', slug: 'silencep', steamId: '76561198010942011', aliases: ['2z Silencep'], team2024: 'The expendables', team2026: '', team2026Shortname: '' },
  { canonical: 'ani', slug: 'ani', steamId: '76561197993861011', aliases: [], team2024: 'unreliable dogs', team2026: '', team2026Shortname: '' },
  { canonical: 'APH3X', slug: 'aph3x', steamId: '76561198346024921', aliases: [], team2024: 'unreliable dogs', team2026: '', team2026Shortname: '' },
  { canonical: 'BeukeR', slug: 'beuker', steamId: '76561197971635353', aliases: [], team2024: 'unreliable dogs', team2026: '', team2026Shortname: '' },
  { canonical: 'invi', slug: 'invi', steamId: '76561198064199875', aliases: ['invi'], team2024: 'unreliable dogs', team2026: '', team2026Shortname: '' },
  { canonical: 'Juven1le', slug: 'juven1le', steamId: '76561198089070422', aliases: [], team2024: 'unreliable dogs', team2026: '', team2026Shortname: '' },
  { canonical: 'lithz', slug: 'lithz', steamId: '76561198033171295', aliases: ['lith'], team2024: 'unreliable dogs', team2026: '', team2026Shortname: '' },
  { canonical: 'KRL', slug: 'krl', steamId: '76561198254687687', aliases: ['KRL'], team2024: 'Whatever name IDC', team2026: '', team2026Shortname: '' },
  { canonical: 'VergiL', slug: 'vergil', steamId: '76561198140092774', aliases: [], team2024: 'Whatever name IDC', team2026: '', team2026Shortname: '' },
  { canonical: 'YNAM', slug: 'ynam', steamId: '76561198054868921', aliases: ['Many', 'ynam'], team2024: 'Whatever name IDC', team2026: '', team2026Shortname: '' },
  { canonical: 'chakoala', slug: 'chakoala', steamId: '76561198109579696', aliases: ['chakoala'], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'coffin', slug: 'coffin', steamId: '76561199020037962', aliases: ['coffin'], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'estoty Klyb', slug: 'estoty-klyb', steamId: '76561198199452077', aliases: ['estoty Klyb'], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'FF^Sty', slug: 'ff-sty', steamId: '', aliases: [], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'FizzY', slug: 'fizzy', steamId: '76561198129795100', aliases: [], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'gaz', slug: 'gaz', steamId: '76561197991370790', aliases: [], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'phaze', slug: 'phaze', steamId: '76561198414877431', aliases: ['phaze'], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'prestij', slug: 'prestij', steamId: '76561198256203867', aliases: ['prestij'], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'rasharn', slug: 'rasharn', steamId: '76561198049631090', aliases: ['rash arn ghoul'], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'Ratman', slug: 'ratman', steamId: '', aliases: ['Ratman'], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'rindo', slug: 'rindo', steamId: '76561198152936342', aliases: ['rindo'], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 't000', slug: 't000', steamId: '', aliases: [], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'TK', slug: 'tk', steamId: '76561197977412349', aliases: ['TK'], team2024: '', team2026: '', team2026Shortname: '' },
  { canonical: 'Xron', slug: 'xron', steamId: '76561198017320685', aliases: ['xron'], team2024: '', team2026: '', team2026Shortname: '' },
];

function yamlQuote(str) {
  // Quote strings that contain special YAML characters
  if (!str) return '""';
  if (/[:#\[\]{}&*!|>'"%@`,\?]/.test(str) || str.includes('\n') || str.trim() !== str) {
    // Use double quotes with escaping
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return str;
}

function formatAliases(aliases) {
  if (!aliases || aliases.length === 0) return 'aliases: []';
  const items = aliases.map(a => '  - ' + yamlQuote(a));
  return 'aliases:\n' + items.join('\n');
}

function buildNewFields(player) {
  const lines = [];

  // aliases
  lines.push(formatAliases(player.aliases));

  // team2024
  if (player.team2024) {
    lines.push('team2024: ' + yamlQuote(player.team2024));
  }

  // team2026
  if (player.team2026) {
    lines.push('team2026: ' + yamlQuote(player.team2026));
  }

  // team2026Shortname
  if (player.team2026Shortname) {
    lines.push('team2026Shortname: ' + yamlQuote(player.team2026Shortname));
  }

  return lines.join('\n');
}

function updateExistingFile(filePath, player) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Remove existing fields if present (in case of re-run)
  content = content.replace(/^aliases:.*\n(?:  - .*\n)*/m, '');
  content = content.replace(/^team2024:.*\n/m, '');
  content = content.replace(/^team2026Shortname:.*\n/m, '');
  content = content.replace(/^team2026:.*\n/m, '');

  const newFields = buildNewFields(player);

  // Insert after steamId or qlstatsNick line, or after name line
  const insertPoints = [
    /^qlstatsNick:.*$/m,
    /^steamId:.*$/m,
    /^name:.*$/m,
  ];

  let inserted = false;
  for (const regex of insertPoints) {
    const match = content.match(regex);
    if (match) {
      const idx = content.indexOf(match[0]) + match[0].length;
      content = content.slice(0, idx) + '\n' + newFields + content.slice(idx);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    // Append at end
    content = content.trimEnd() + '\n' + newFields + '\n';
  }

  // Also update steamId if the file doesn't have one and we have one
  if (player.steamId && !content.match(/^steamId:/m)) {
    const nameMatch = content.match(/^name:.*$/m);
    if (nameMatch) {
      const idx = content.indexOf(nameMatch[0]) + nameMatch[0].length;
      content = content.slice(0, idx) + '\nsteamId: "' + player.steamId + '"' + content.slice(idx);
    }
  }

  fs.writeFileSync(filePath, content);
  return 'updated';
}

function createNewFile(filePath, player) {
  const lines = [
    'name: ' + yamlQuote(player.canonical),
  ];

  if (player.steamId) {
    lines.push('steamId: "' + player.steamId + '"');
  }

  lines.push(formatAliases(player.aliases));

  lines.push('category: ctf');
  lines.push('published: false');

  if (player.team2024) {
    lines.push('team2024: ' + yamlQuote(player.team2024));
  }
  if (player.team2026) {
    lines.push('team2026: ' + yamlQuote(player.team2026));
  }
  if (player.team2026Shortname) {
    lines.push('team2026Shortname: ' + yamlQuote(player.team2026Shortname));
  }

  fs.writeFileSync(filePath, lines.join('\n') + '\n');
  return 'created';
}

// Process all players
let updated = 0;
let created = 0;
let skipped = 0;

for (const player of playerData) {
  const filePath = path.join(PLAYERS_DIR, player.slug + '.yaml');
  const exists = fs.existsSync(filePath);

  if (exists) {
    updateExistingFile(filePath, player);
    console.log(`  Updated: ${player.slug}.yaml`);
    updated++;
  } else {
    createNewFile(filePath, player);
    console.log(`  Created: ${player.slug}.yaml`);
    created++;
  }
}

console.log(`\nDone! Updated: ${updated}, Created: ${created}, Skipped: ${skipped}`);
