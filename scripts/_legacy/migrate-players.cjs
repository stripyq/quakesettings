const fs = require('fs');
const path = require('path');

// Read the gear data
const gearDataContent = fs.readFileSync('/home/user/quakesettings/data/gear-data.ts', 'utf8');

// Extract the array from the TypeScript file
const arrayMatch = gearDataContent.match(/export const gearData: GearItem\[\] = \[([\s\S]*)\];/);
if (!arrayMatch) {
  console.error('Could not find gearData array');
  process.exit(1);
}

// Parse the array content (convert to valid JSON-ish format)
let arrayContent = arrayMatch[1];

// Convert to proper JSON by fixing the TypeScript object syntax
arrayContent = arrayContent
  .replace(/(\w+):/g, '"$1":')  // Quote property names
  .replace(/,\s*}/g, '}')       // Remove trailing commas
  .replace(/,\s*\]/g, ']')      // Remove trailing commas in arrays
  .replace(/nan/g, 'null')      // Replace nan with null
  .replace(/""/g, 'null')       // Replace empty strings with null for optional fields
  .replace(/\\"/g, '\\"');      // Escape quotes

// Wrap in array brackets and parse
let players;
try {
  players = JSON.parse('[' + arrayContent + ']');
} catch (e) {
  console.error('Error parsing players:', e.message);
  // Try a different approach - eval (only for migration script)
  const evalContent = `[${arrayMatch[1].replace(/nan/g, 'null')}]`;
  players = eval(evalContent);
}

console.log(`Found ${players.length} players to migrate`);

// Helper to create slug from name
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Helper to escape YAML values
function yamlValue(val) {
  if (val === null || val === undefined || val === 'null' || val === '') return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val;
  // Check if string needs quoting
  const str = String(val);
  if (str.includes(':') || str.includes('#') || str.includes("'") || str.includes('"') ||
      str.includes('\n') || str.startsWith('-') || str.startsWith('>') ||
      /^\d/.test(str) || str === 'true' || str === 'false' || str === 'null') {
    return JSON.stringify(str);
  }
  return str;
}

// Track unique hardware
const mice = new Map();
const monitors = new Map();
const keyboards = new Map();
const mousepads = new Map();
const headsets = new Map();

// Process players
players.forEach(p => {
  // Track hardware
  if (p.mouse && p.mouse !== 'null') {
    const slug = slugify(p.mouse);
    if (!mice.has(slug)) {
      mice.set(slug, { name: p.mouse, brand: p.mouse.split(' ')[0] });
    }
  }
  if (p.monitor && p.monitor !== 'null') {
    const slug = slugify(p.monitor);
    if (!monitors.has(slug)) {
      monitors.set(slug, {
        name: p.monitor,
        brand: p.monitor.split(' ')[0],
        size: p.size || '',
        refreshRate: p.refreshRate || ''
      });
    }
  }
  if (p.keyboard && p.keyboard !== 'null' && p.keyboard !== 'nan') {
    const slug = slugify(p.keyboard);
    if (!keyboards.has(slug)) {
      keyboards.set(slug, { name: p.keyboard, brand: p.keyboard.split(' ')[0] });
    }
  }
  if (p.mousepad && p.mousepad !== 'null' && p.mousepad !== 'NO NAME') {
    const slug = slugify(p.mousepad);
    if (!mousepads.has(slug)) {
      mousepads.set(slug, { name: p.mousepad, brand: p.mousepad.split(' ')[0] });
    }
  }
  if (p.headphones && p.headphones !== 'null' && p.headphones !== 'nan' && !p.headphones.startsWith('>')) {
    const slug = slugify(p.headphones);
    if (!headsets.has(slug)) {
      headsets.set(slug, { name: p.headphones, brand: p.headphones.split(' ')[0] });
    }
  }
});

// Create directories
const contentDir = '/home/user/quakesettings-astro/src/content';
['mice', 'monitors', 'keyboards', 'mousepads', 'headsets', 'players'].forEach(dir => {
  const dirPath = path.join(contentDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Write mice YAML files
console.log(`\nWriting ${mice.size} mice...`);
mice.forEach((data, slug) => {
  const yaml = `name: ${yamlValue(data.name)}
brand: ${yamlValue(data.brand)}
weight: "Unknown"
shape: "Ambidextrous"
sensor: "Unknown"
dpiRange: "Unknown"
pollingRate: "1000Hz"
buttons: 5
connection: "Wired"
`;
  fs.writeFileSync(path.join(contentDir, 'mice', `${slug}.yaml`), yaml);
});

// Write monitors YAML files
console.log(`Writing ${monitors.size} monitors...`);
monitors.forEach((data, slug) => {
  const yaml = `name: ${yamlValue(data.name)}
brand: ${yamlValue(data.brand)}
size: ${yamlValue(data.size || 'Unknown')}
resolution: "1920x1080"
refreshRate: ${yamlValue(data.refreshRate || 'Unknown')}
panelType: "TN"
responseTime: "1ms"
`;
  fs.writeFileSync(path.join(contentDir, 'monitors', `${slug}.yaml`), yaml);
});

// Write keyboards YAML files
console.log(`Writing ${keyboards.size} keyboards...`);
keyboards.forEach((data, slug) => {
  const yaml = `name: ${yamlValue(data.name)}
brand: ${yamlValue(data.brand)}
size: "TKL"
switches: "Mechanical"
connection: "Wired"
`;
  fs.writeFileSync(path.join(contentDir, 'keyboards', `${slug}.yaml`), yaml);
});

// Write mousepads YAML files
console.log(`Writing ${mousepads.size} mousepads...`);
mousepads.forEach((data, slug) => {
  const yaml = `name: ${yamlValue(data.name)}
brand: ${yamlValue(data.brand)}
surface: "Cloth"
speed: "Balanced"
dimensions: "Unknown"
`;
  fs.writeFileSync(path.join(contentDir, 'mousepads', `${slug}.yaml`), yaml);
});

// Write headsets YAML files
console.log(`Writing ${headsets.size} headsets...`);
headsets.forEach((data, slug) => {
  const yaml = `name: ${yamlValue(data.name)}
brand: ${yamlValue(data.brand)}
type: "Closed-back"
driverSize: "Unknown"
connection: "Wired"
microphone: false
`;
  fs.writeFileSync(path.join(contentDir, 'headsets', `${slug}.yaml`), yaml);
});

// Write player YAML files
console.log(`\nWriting ${players.length} players...`);
players.forEach(p => {
  const nickname = p.nickname;
  const slug = slugify(nickname);

  // Parse values
  const dpi = parseInt(p.mouseDPI) || 800;
  const sens = parseFloat(p.inGameSensitivity) || 1;
  const edpi = parseInt(p.eDPI) || (dpi * sens);
  const cm360 = parseFloat(p.cm360) || null;
  const fov = parseFloat(p.fov) || 100;
  const accel = p.acceleration && p.acceleration !== 'null' ? parseFloat(p.acceleration) : null;
  const inverted = p.invertedMouse === 'Yes';

  // Parse movement binds
  const binds = (p.movementBinds || 'w a s d Mouse1 Space').split(' ').filter(b => b);

  let yaml = `name: ${yamlValue(nickname)}
country: "Unknown"
category: "duel"
dpi: ${dpi}
sensitivity: ${sens}
edpi: ${edpi}
`;

  if (cm360) yaml += `cm360: ${cm360}\n`;
  if (accel !== null && !isNaN(accel)) {
    yaml += `acceleration: true\naccelValue: ${accel}\n`;
  } else {
    yaml += `acceleration: false\n`;
  }

  yaml += `rawInput: true
fov: ${Math.round(fov)}
crosshair: ${yamlValue(p.crosshair || '2')}
invertedMouse: ${inverted}
`;

  // Key bindings
  if (binds.length >= 4) {
    yaml += `forward: ${yamlValue(binds[0] || 'W')}
back: ${yamlValue(binds[2] || 'S')}
left: ${yamlValue(binds[1] || 'A')}
right: ${yamlValue(binds[3] || 'D')}
`;
  }
  if (binds[4]) yaml += `attack: ${yamlValue(binds[4])}\n`;
  if (binds[5]) yaml += `jump: ${yamlValue(binds[5])}\n`;

  // Hardware references
  if (p.mouse && p.mouse !== 'null') {
    yaml += `mouse: ${yamlValue(slugify(p.mouse))}\n`;
  }
  if (p.mousepad && p.mousepad !== 'null' && p.mousepad !== 'NO NAME') {
    yaml += `mousepad: ${yamlValue(slugify(p.mousepad))}\n`;
  }
  if (p.keyboard && p.keyboard !== 'null' && p.keyboard !== 'nan') {
    yaml += `keyboard: ${yamlValue(slugify(p.keyboard))}\n`;
  }
  if (p.monitor && p.monitor !== 'null') {
    yaml += `monitor: ${yamlValue(slugify(p.monitor))}\n`;
  }
  if (p.headphones && p.headphones !== 'null' && p.headphones !== 'nan' && !p.headphones.startsWith('>')) {
    yaml += `headset: ${yamlValue(slugify(p.headphones))}\n`;
  }

  fs.writeFileSync(path.join(contentDir, 'players', `${slug}.yaml`), yaml);
});

console.log('\nMigration complete!');
console.log(`Total: ${mice.size} mice, ${monitors.size} monitors, ${keyboards.size} keyboards, ${mousepads.size} mousepads, ${headsets.size} headsets, ${players.length} players`);
