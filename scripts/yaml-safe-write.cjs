/**
 * Safe YAML writer — prevents scripts from accidentally dropping fields
 * they don't own.
 *
 * Usage:
 *   const { safeWriteYaml } = require('./yaml-safe-write.cjs');
 *   safeWriteYaml(filePath, newContent, ownedFields);
 *
 * ownedFields: array of field-name prefixes this script is allowed to
 *   add/remove (e.g. ['ctfGames', 'tdmGames']).  Any other top-level
 *   YAML key that exists in the original file but is missing from
 *   newContent will cause an error instead of a silent data loss.
 */

const fs = require('fs');

/** Extract top-level YAML keys from a string (ignores comments & blank lines) */
function extractKeys(content) {
  const keys = new Set();
  for (const line of content.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/**
 * Write a YAML file, but abort if any field not in `ownedFields` would be
 * dropped compared to the original file on disk.
 *
 * @param {string} filePath   — absolute path to the YAML file
 * @param {string} newContent — the full new file content
 * @param {string[]} ownedFields — field prefixes this script may add/remove
 * @returns {boolean} true if written, false if no change needed
 * @throws if unowned fields would be lost
 */
function safeWriteYaml(filePath, newContent, ownedFields) {
  const original = fs.readFileSync(filePath, 'utf8');

  if (original === newContent) return false;

  const originalKeys = extractKeys(original);
  const newKeys = extractKeys(newContent);
  const ownedSet = new Set(ownedFields);

  const dropped = [];
  for (const key of originalKeys) {
    if (!newKeys.has(key) && !ownedSet.has(key)) {
      dropped.push(key);
    }
  }

  if (dropped.length > 0) {
    throw new Error(
      `SAFETY: refusing to write ${filePath} — would drop unowned fields: ${dropped.join(', ')}. ` +
      `If intentional, add them to ownedFields.`
    );
  }

  fs.writeFileSync(filePath, newContent);
  return true;
}

module.exports = { safeWriteYaml, extractKeys };
