// HoQ Player Stats Scraper - paste this into browser console at http://88.214.20.58/
// It will fetch all player pages and output JSON you can copy back.

const STEAM_IDS = [
"76561197993861011","76561198151319268","76561198034120620","76561198132543406",
"76561198028016604","76561197971635344","76561198354200908","76561198109579696",
"76561199044683584","76561199020037962","76561198075079469","76561198162507961",
"76561197964623506","76561198257310624","76561197985202252","76561198380825290",
"76561198257799111","76561198107461408","76561198196618515","76561197965308771",
"76561198084461653","76561198032236208","76561198257679175","76561198090058821",
"76561197968556118","76561198129795100","76561198075628646","76561198053960733",
"76561198053186404","76561198047715408","76561198255736445","76561198141767332",
"76561198001355736","76561198256071177","76561198023589138","76561197983318796",
"76561197960736529","76561198034572568","76561198258475383","76561198042268423",
"76561198041347061","76561197982199355","76561197973893045","76561198114832578",
"76561198286173236","76561198039145005","76561198254687687","76561198044065399",
"76561198068070185","76561198047335245","76561198007335390","76561198033171295",
"76561198030933162","76561198088925347","76561198008234329","76561198146434639",
"76561198033439430","76561197961473367","76561198004545167","76561198257362399",
"76561198284683846","76561198141993917","76561198275956025","76561198043070738",
"76561198000088567","76561198256080242","76561197972946521","76561198257018686",
"76561198144940773","76561197995121689","76561198054844275","76561198025225261",
"76561198062139103","76561197970764070","76561198228590616","76561197993233912",
"76561198105088252","76561198279892880","76561197989948663","76561198106787712",
"76561198049631090","76561198155003669","76561198002515349","76561198257496197",
"76561198136963513","76561198010942011","76561198031267126","76561198155662969",
"76561198239142044","76561198041115896","76561199756237860","76561198067064946",
"76561197992882111","76561197990531413","76561197977412349","76561198257330241",
"76561198257316780","76561198258932158","76561198140092774","76561198098777141",
"76561198257437671","76561198010106923","76561198081117111","76561197985620716",
"76561198026248899","76561198154954843","76561198077163281"
];

const DELAY = 1500;
const results = {};
let done = 0;
let errors = 0;
let notFound = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parsePage(html) {
  const data = {};
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // --- FAVORITES ---
  // Strategy 1: look for text "Arena", "Gametype", "Weapon" in table cells or labels
  const allCells = doc.querySelectorAll('td, th, dt, dd, span, div, li');
  const labels = { 'arena': 'favorite_map', 'gametype': 'favorite_gametype', 'weapon': 'favorite_weapon' };

  for (const cell of allCells) {
    const text = cell.textContent.trim().toLowerCase();
    for (const [label, field] of Object.entries(labels)) {
      if (text === label || text === label + ':') {
        // Get the next sibling element's text
        let next = cell.nextElementSibling;
        if (next) {
          const val = next.textContent.trim();
          if (val && val !== '-' && val !== 'N/A') {
            data[field] = val;
          }
        }
      }
    }
  }

  // Strategy 2: look for "Favorites" header, then parse its container
  const allHeaders = doc.querySelectorAll('h1, h2, h3, h4, h5, h6, .card-header, .panel-heading, .section-title');
  for (const header of allHeaders) {
    if (header.textContent.trim().toLowerCase().includes('favorite')) {
      const container = header.closest('div, section, table') || header.parentElement;
      if (container) {
        const rows = container.querySelectorAll('tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td, th');
          if (cells.length >= 2) {
            const key = cells[0].textContent.trim().toLowerCase();
            const val = cells[1].textContent.trim();
            if (key === 'arena' && val) data.favorite_map = val;
            if (key === 'gametype' && val) data.favorite_gametype = val;
            if (key === 'weapon' && val) data.favorite_weapon = val;
          }
        }
      }
    }
  }

  // --- WEAPON ACCURACIES ---
  const weaponMap = {
    'rocket launcher': 'accuracy_rl',
    'railgun': 'accuracy_rg',
    'lightning gun': 'accuracy_lg'
  };

  // Find all table rows that contain weapon names
  const allRows = doc.querySelectorAll('tr');
  for (const row of allRows) {
    const rowText = row.textContent.toLowerCase();
    for (const [weapon, key] of Object.entries(weaponMap)) {
      if (rowText.includes(weapon)) {
        // Look for percentage values in this row
        const cellTexts = [...row.querySelectorAll('td, th')].map(c => c.textContent.trim());
        for (const cellText of cellTexts) {
          const pctMatch = cellText.match(/([\d.]+)\s*%/);
          if (pctMatch) {
            const acc = parseFloat(pctMatch[1]);
            if (acc >= 0 && acc <= 100) {
              data[key] = acc;
              break;
            }
          }
        }
      }
    }
  }

  return data;
}

async function scrapeAll() {
  console.log(`Starting scrape of ${STEAM_IDS.length} players...`);

  for (const steamId of STEAM_IDS) {
    try {
      const resp = await fetch(`/player/${steamId}`);

      if (!resp.ok) {
        if (resp.status === 404) { notFound++; }
        else { errors++; console.warn(`${steamId}: HTTP ${resp.status}`); }
        await sleep(DELAY);
        continue;
      }

      const html = await resp.text();

      if (html.length < 500 || html.includes('Player not found') || html.includes('No data')) {
        notFound++;
        await sleep(DELAY);
        continue;
      }

      // Debug: show raw HTML structure for first player
      if (done === 0) {
        console.log('=== DEBUG: First player page structure ===');
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // Show all table headers
        const tables = doc.querySelectorAll('table');
        tables.forEach((t, i) => {
          const headers = [...t.querySelectorAll('th')].map(h => h.textContent.trim());
          const firstRow = t.querySelector('tr:nth-child(2)');
          const firstCells = firstRow ? [...firstRow.querySelectorAll('td')].map(c => c.textContent.trim()) : [];
          console.log(`Table ${i}: headers=[${headers.join(', ')}] firstRow=[${firstCells.join(', ')}]`);
        });
        // Show section headings
        const headings = doc.querySelectorAll('h1,h2,h3,h4');
        headings.forEach(h => console.log(`Heading: <${h.tagName}> "${h.textContent.trim()}"`));
        console.log('=== END DEBUG ===');
      }

      const data = parsePage(html);
      if (Object.keys(data).length > 0) {
        results[steamId] = data;
      }
      done++;
      console.log(`[${done}/${STEAM_IDS.length}] ${steamId}: ${JSON.stringify(data)}`);
    } catch (e) {
      errors++;
      console.warn(`${steamId}: ${e.message}`);
    }
    await sleep(DELAY);
  }

  console.log(`\n=== DONE === Found: ${Object.keys(results).length}, Not found: ${notFound}, Errors: ${errors}`);
  console.log('\nCopy the JSON below and paste it back:\n');

  // Use copy() to put it on clipboard automatically
  const json = JSON.stringify(results, null, 2);
  try { copy(json); console.log('(Copied to clipboard!)'); } catch(e) {}
  console.log(json);
}

scrapeAll();
