/**
 * Safe YAML writer — prevents scripts from accidentally dropping fields
 * they don't own.
 *
 * Usage:
 *   const { safeWriteYaml } = require('./yaml-safe-write.cjs');
 *   safeWriteYaml(filePath, newContent, ownedFields);
 *
 * ownedFields: array of top-level field names this script is allowed to
 *   add/remove (e.g. ['ctfGames', 'tdmGames']).  Any other top-level
 *   YAML key that exists in the original file but is missing from
 *   newContent will cause an error instead of a silent data loss.
 *
 * Keys come from parsing both documents with js-yaml, so quoted, hyphenated
 * (`mouse-pad:`) and digit-leading keys are guarded too. If either document
 * does not parse, nothing is written. Only top-level keys are compared:
 * blanked values and damage inside nested maps are not detected.
 */

const fs = require('fs');
const yaml = require('js-yaml');

/**
 * Top-level keys of a YAML document, from a real parse. Throws if `content` is not valid
 * YAML. A document whose top level is not a mapping (empty, scalar, list) has no keys.
 */
function extractKeys(content) {
  const doc = yaml.load(content);
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) return new Set();
  return new Set(Object.keys(doc));
}

/**
 * Best-effort line scan for top-level `key:` lines. Only used to describe documents js-yaml
 * rejects; it misses flow-style and multi-line keys and never decides whether to write.
 */
function scanKeys(content) {
  const keys = new Set();
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^(?:"([^"]*)"|'([^']*)'|([^\s#'"\-?:[\]{}][^#]*?|-[^\s#][^#]*?))\s*:(?:\s|$)/);
    if (m) keys.add(m[1] ?? m[2] ?? m[3]);
  }
  return keys;
}

/**
 * Write a YAML file, but abort if any field not in `ownedFields` would be
 * dropped compared to the original file on disk, or if either version does
 * not parse.
 *
 * @param {string} filePath   — absolute path to the YAML file
 * @param {string} newContent — the full new file content
 * @param {string[]} ownedFields — top-level field names this script may add/remove
 * @returns {boolean} true if written, false if no change needed
 * @throws if unowned fields would be lost or the YAML does not parse
 */
function safeWriteYaml(filePath, newContent, ownedFields) {
  const original = fs.readFileSync(filePath, 'utf8');

  if (original === newContent) return false;

  const ownedSet = new Set(ownedFields);
  const droppedFrom = (before, after) => [...before].filter(key => !after.has(key) && !ownedSet.has(key));

  let originalKeys;
  let newKeys;
  try {
    originalKeys = extractKeys(original);
    newKeys = extractKeys(newContent);
  } catch (err) {
    const which = originalKeys ? 'the new content' : 'the file on disk';
    const scanned = droppedFrom(scanKeys(original), scanKeys(newContent));
    throw new Error(
      `SAFETY: refusing to write ${filePath} — ${which} is not valid YAML ` +
      `(${String(err.message).split('\n')[0]}). ` +
      (scanned.length
        ? `A line scan (which can miss keys) also finds these unowned fields missing: ${scanned.join(', ')}.`
        : 'A line scan (which can miss keys) finds no unowned field missing.')
    );
  }

  const dropped = droppedFrom(originalKeys, newKeys);
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
