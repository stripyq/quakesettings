#!/usr/bin/env node
/**
 * Sync hoqCtfRating/hoqTdmRating values into the display fields
 * (ctfRating, tdmRating, ctfGames, tdmGames, ctfRatingUpdated, tdmRatingUpdated)
 */
const fs = require('fs');
const path = require('path');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');
const TODAY = '2026-02-24';
const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.yaml'));

let updated = 0;
const changes = [];

for (const file of files) {
  const filePath = path.join(PLAYERS_DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');

  const hoqCtfR = content.match(/^hoqCtfRating:\s*(.+)$/m);
  const hoqCtfG = content.match(/^hoqCtfGames:\s*(.+)$/m);
  const hoqTdmR = content.match(/^hoqTdmRating:\s*(.+)$/m);
  const hoqTdmG = content.match(/^hoqTdmGames:\s*(.+)$/m);

  if (!hoqCtfR && !hoqTdmR) continue;

  const newCtfR = hoqCtfR ? parseFloat(hoqCtfR[1]) : null;
  const newCtfG = hoqCtfG ? parseInt(hoqCtfG[1], 10) : null;
  const newTdmR = hoqTdmR ? parseFloat(hoqTdmR[1]) : null;
  const newTdmG = hoqTdmG ? parseInt(hoqTdmG[1], 10) : null;

  const curCtfR = content.match(/^ctfRating:\s*(.+)$/m);
  const curCtfG = content.match(/^ctfGames:\s*(.+)$/m);
  const curTdmR = content.match(/^tdmRating:\s*(.+)$/m);
  const curTdmG = content.match(/^tdmGames:\s*(.+)$/m);

  let changed = false;
  const playerName = (content.match(/^name:\s*(.+)$/m) || [, file])[1].trim();
  const diffs = [];

  // Update CTF rating
  if (newCtfR !== null) {
    const oldVal = curCtfR ? parseFloat(curCtfR[1]) : null;
    if (oldVal !== newCtfR) {
      if (curCtfR) {
        content = content.replace(/^ctfRating:.*$/m, 'ctfRating: ' + newCtfR);
      } else {
        // Insert after a suitable anchor line
        const anchor = content.match(/^(ctfRatingUpdated|duelRatingUpdated|duelRating|category):.*$/m);
        if (anchor) {
          const pos = anchor.index + anchor[0].length;
          content = content.slice(0, pos) + '\nctfRating: ' + newCtfR + content.slice(pos);
        }
      }
      diffs.push('ctfR: ' + (oldVal || '-') + ' → ' + newCtfR);
      changed = true;
    }
  }

  // Update/insert ctfRatingUpdated
  if (newCtfR !== null) {
    const curCtfU = content.match(/^ctfRatingUpdated:.*$/m);
    if (curCtfU) {
      content = content.replace(/^ctfRatingUpdated:.*$/m, 'ctfRatingUpdated: "' + TODAY + '"');
    } else {
      const ctfLine = content.match(/^ctfRating:.*$/m);
      if (ctfLine) {
        const pos = ctfLine.index + ctfLine[0].length;
        content = content.slice(0, pos) + '\nctfRatingUpdated: "' + TODAY + '"' + content.slice(pos);
      }
    }
  }

  // Update CTF games
  if (newCtfG !== null) {
    const oldVal = curCtfG ? parseInt(curCtfG[1], 10) : null;
    if (oldVal !== newCtfG) {
      if (curCtfG) {
        content = content.replace(/^ctfGames:.*$/m, 'ctfGames: ' + newCtfG);
      } else {
        // Insert after ctfRatingUpdated or hoqTdmGames
        const anchor = content.match(/^(ctfRatingUpdated|hoqTdmGames|hoqCtfGames):.*$/m);
        if (anchor) {
          const pos = anchor.index + anchor[0].length;
          content = content.slice(0, pos) + '\nctfGames: ' + newCtfG + content.slice(pos);
        }
      }
      diffs.push('ctfG: ' + (oldVal || '-') + ' → ' + newCtfG);
      changed = true;
    }
  }

  // Update TDM rating
  if (newTdmR !== null) {
    const oldVal = curTdmR ? parseFloat(curTdmR[1]) : null;
    if (oldVal !== newTdmR) {
      if (curTdmR) {
        content = content.replace(/^tdmRating:.*$/m, 'tdmRating: ' + newTdmR);
      } else {
        // Insert after tdmRatingUpdated or ctfRatingUpdated
        const anchor = content.match(/^(tdmRatingUpdated|ctfRatingUpdated|ctfRating|duelRatingUpdated|category):.*$/m);
        if (anchor) {
          const pos = anchor.index + anchor[0].length;
          content = content.slice(0, pos) + '\ntdmRating: ' + newTdmR + content.slice(pos);
        }
      }
      diffs.push('tdmR: ' + (oldVal || '-') + ' → ' + newTdmR);
      changed = true;
    }
  }

  // Update/insert tdmRatingUpdated
  if (newTdmR !== null) {
    const curTdmU = content.match(/^tdmRatingUpdated:.*$/m);
    if (curTdmU) {
      content = content.replace(/^tdmRatingUpdated:.*$/m, 'tdmRatingUpdated: "' + TODAY + '"');
    } else {
      const tdmLine = content.match(/^tdmRating:.*$/m);
      if (tdmLine) {
        const pos = tdmLine.index + tdmLine[0].length;
        content = content.slice(0, pos) + '\ntdmRatingUpdated: "' + TODAY + '"' + content.slice(pos);
      }
    }
  }

  // Update TDM games
  if (newTdmG !== null) {
    const oldVal = curTdmG ? parseInt(curTdmG[1], 10) : null;
    if (oldVal !== newTdmG) {
      if (curTdmG) {
        content = content.replace(/^tdmGames:.*$/m, 'tdmGames: ' + newTdmG);
      } else {
        const anchor = content.match(/^(tdmRatingUpdated|tdmRating):.*$/m);
        if (anchor) {
          const pos = anchor.index + anchor[0].length;
          content = content.slice(0, pos) + '\ntdmGames: ' + newTdmG + content.slice(pos);
        }
      }
      diffs.push('tdmG: ' + (oldVal || '-') + ' → ' + newTdmG);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    updated++;
    changes.push(playerName + ': ' + diffs.join(', '));
  }
}

console.log('Updated ' + updated + ' players');
console.log('');
changes.forEach(c => console.log('  ' + c));
