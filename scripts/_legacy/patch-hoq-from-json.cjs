#!/usr/bin/env node
/**
 * Patch player YAML files with updated HoQ rating data from JSON exports.
 *
 * This script contains hardcoded values extracted from the HoQ JSON API responses
 * (http://88.214.20.58/export_rating/ctf.json and tdm.json) as of 2026-02-24.
 *
 * It updates hoqCtfRating, hoqCtfGames, hoqTdmRating, hoqTdmGames fields ONLY
 * where the JSON value differs from the current YAML value.
 */

const fs = require('fs');
const path = require('path');

const PLAYERS_DIR = path.join(__dirname, '../src/content/players');

// CTF JSON data (only entries that differ from current YAML)
const ctfPatches = {
  'dem0n.yaml':        { rating: 44.57, games: 1034 },
  'mastermind.yaml':   { rating: 46.28, games: 2699 },
  'enesy.yaml':        { rating: 39.44, games: 1690 },
  'jcb.yaml':          { rating: 38.76, games: 2051 },
  'kirson.yaml':       { rating: 32.62, games: 1151 },
  'baldur.yaml':       { rating: 32.17, games: 1697 },
  'ins.yaml':          { rating: 31.29, games: 1702 },
  'lihensior.yaml':    { rating: 34.35, games: 1380 },
  'spart1e.yaml':      { rating: 34.70, games: 836 },
  'l1nkin.yaml':       { rating: 34.67, games: 84 },
  'iceman.yaml':       { rating: 37.62, games: 976 },
  'fo_tbh.yaml':       { rating: 35.34, games: 2208 },
  'frigolx.yaml':      { rating: 35.67, games: 837 },
  'fr0zik.yaml':       { rating: 30.07, games: 3579 },
  'drayan.yaml':       { rating: 27.63, games: 5779 },
  'knz.yaml':          { rating: 26.26, games: 2323 },
  'stripy.yaml':       { rating: 23.12, games: 2587 },
  'dloobiq.yaml':      { rating: 26.59, games: 4613 },
  'artemis4.yaml':     { rating: 27.25, games: 1532 },
  'pengelephant.yaml': { rating: 30.66, games: 572 },
  'janti.yaml':        { rating: 17.03, games: 9332 },
  'matr1x.yaml':       { rating: 16.30, games: 2074 },
  'pettern.yaml':      { rating: 13.05, games: 5214 },
};

// TDM JSON data (only entries that differ from current YAML)
const tdmPatches = {
  'rehepapp.yaml':     { rating: 39.90, games: 2636 },
  'spart1e.yaml':      { rating: 34.83, games: 345 },
  'furtzilla.yaml':    { rating: 26.07, games: 2090 },
  'pecka.yaml':        { rating: 27.69, games: 2369 },
  'dimebag.yaml':      { rating: 23.64, games: 3946 },
  'ne_raketa.yaml':    { rating: 20.04, games: 4432 },
};

// Helper: update a single field in YAML content
function updateField(content, fieldName, newValue) {
  const regex = new RegExp('^(' + fieldName + ':\\s*)(.+)$', 'm');
  const match = content.match(regex);
  if (match) {
    return content.replace(regex, fieldName + ': ' + newValue);
  }
  return null;
}

// Helper: add a field after another field
function addFieldAfter(content, afterField, fieldName, value) {
  const regex = new RegExp('^(' + afterField + ':.*)$', 'm');
  const match = content.match(regex);
  if (match) {
    return content.replace(regex, '$1\n' + fieldName + ': ' + value);
  }
  return null;
}

// Main
console.log('Patching player YAML files with updated HoQ JSON data...\n');

let totalChanges = 0;
const allChanges = [];

// Process CTF patches
for (const [fileName, patch] of Object.entries(ctfPatches)) {
  const filePath = path.join(PLAYERS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.log('  WARN: ' + fileName + ' not found, skipping');
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const changeDetails = [];

  // Check/update hoqCtfRating
  const ratingMatch = content.match(/^hoqCtfRating:\s*(.+)$/m);
  if (ratingMatch) {
    const curVal = parseFloat(ratingMatch[1]);
    if (curVal !== patch.rating) {
      content = updateField(content, 'hoqCtfRating', patch.rating);
      changeDetails.push('ctfRating: ' + curVal + ' -> ' + patch.rating);
      modified = true;
    }
  } else {
    // Field does not exist yet, add it
    const result = addFieldAfter(content, 'qllrCtfGames', 'hoqCtfRating', patch.rating)
                || addFieldAfter(content, 'qllrCtfRating', 'hoqCtfRating', patch.rating)
                || addFieldAfter(content, 'ctfRatingUpdated', 'hoqCtfRating', patch.rating)
                || addFieldAfter(content, 'category', 'hoqCtfRating', patch.rating);
    if (result) {
      content = result;
      changeDetails.push('ctfRating: (new) -> ' + patch.rating);
      modified = true;
    }
  }

  // Check/update hoqCtfGames
  const gamesMatch = content.match(/^hoqCtfGames:\s*(.+)$/m);
  if (gamesMatch) {
    const curVal = parseInt(gamesMatch[1], 10);
    if (curVal !== patch.games) {
      content = updateField(content, 'hoqCtfGames', patch.games);
      changeDetails.push('ctfGames: ' + curVal + ' -> ' + patch.games);
      modified = true;
    }
  } else {
    // Add after hoqCtfRating if it now exists
    const result = addFieldAfter(content, 'hoqCtfRating', 'hoqCtfGames', patch.games);
    if (result) {
      content = result;
      changeDetails.push('ctfGames: (new) -> ' + patch.games);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    totalChanges++;
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const playerName = nameMatch ? nameMatch[1].trim() : fileName;
    allChanges.push('  ' + playerName + ' (' + fileName + '): ' + changeDetails.join(', '));
  }
}

// Process TDM patches
for (const [fileName, patch] of Object.entries(tdmPatches)) {
  const filePath = path.join(PLAYERS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.log('  WARN: ' + fileName + ' not found, skipping');
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const changeDetails = [];

  // Check/update hoqTdmRating
  const ratingMatch = content.match(/^hoqTdmRating:\s*(.+)$/m);
  if (ratingMatch) {
    const curVal = parseFloat(ratingMatch[1]);
    if (curVal !== patch.rating) {
      content = updateField(content, 'hoqTdmRating', patch.rating);
      changeDetails.push('tdmRating: ' + curVal + ' -> ' + patch.rating);
      modified = true;
    }
  } else {
    // Field does not exist, add it after hoqCtfGames or similar
    const result = addFieldAfter(content, 'hoqCtfGames', 'hoqTdmRating', patch.rating)
                || addFieldAfter(content, 'hoqCtfRating', 'hoqTdmRating', patch.rating)
                || addFieldAfter(content, 'category', 'hoqTdmRating', patch.rating);
    if (result) {
      content = result;
      changeDetails.push('tdmRating: (new) -> ' + patch.rating);
      modified = true;
    }
  }

  // Check/update hoqTdmGames
  const gamesMatch = content.match(/^hoqTdmGames:\s*(.+)$/m);
  if (gamesMatch) {
    const curVal = parseInt(gamesMatch[1], 10);
    if (curVal !== patch.games) {
      content = updateField(content, 'hoqTdmGames', patch.games);
      changeDetails.push('tdmGames: ' + curVal + ' -> ' + patch.games);
      modified = true;
    }
  } else {
    // Add after hoqTdmRating if it now exists
    const result = addFieldAfter(content, 'hoqTdmRating', 'hoqTdmGames', patch.games);
    if (result) {
      content = result;
      changeDetails.push('tdmGames: (new) -> ' + patch.games);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    totalChanges++;
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const playerName = nameMatch ? nameMatch[1].trim() : fileName;
    allChanges.push('  ' + playerName + ' (' + fileName + '): ' + changeDetails.join(', '));
  }
}

// Summary
console.log('=== Results ===');
console.log('Updated: ' + totalChanges + ' player files\n');
if (allChanges.length > 0) {
  console.log('Changes:');
  for (const c of allChanges) console.log(c);
}
console.log('\nDone.');
