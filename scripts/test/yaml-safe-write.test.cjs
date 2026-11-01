// F5: yaml-safe-write must see every legal top-level key, not only /^[a-zA-Z_][a-zA-Z0-9_]*:/,
// and must refuse to write when either version of the file does not parse.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { safeWriteYaml, extractKeys } = require('../yaml-safe-write.cjs');

const ORIGINAL = [
  'name: tester',
  'mouse-pad: artisan-zero',
  '"sens dpi": 800',
  '2024: true',
  'mouse: viper-v3-pro',
  'lastUpdated: "2026-11-01"',
  '',
].join('\n');

function tempYaml(t, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-yaml-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'player.yaml');
  fs.writeFileSync(file, content);
  return file;
}

const without = (...keys) => ORIGINAL.split('\n').filter(l => !keys.some(k => l.startsWith(k))).join('\n');

test('extractKeys sees hyphenated, quoted and digit-leading keys', () => {
  assert.deepEqual([...extractKeys(ORIGINAL)].sort(),
    ['2024', 'lastUpdated', 'mouse', 'mouse-pad', 'name', 'sens dpi'].sort());
  assert.deepEqual([...extractKeys('name: a\r\nmouse-pad: b\r\n')], ['name', 'mouse-pad']);
});

test('a dropped mouse-pad key is detected and nothing is written', t => {
  const file = tempYaml(t, ORIGINAL);
  assert.throws(() => safeWriteYaml(file, without('mouse-pad:'), ['ctfGames']),
    /would drop unowned fields: mouse-pad\./);
  assert.equal(fs.readFileSync(file, 'utf8'), ORIGINAL);
});

test('dropped quoted and digit-leading keys are detected', t => {
  const file = tempYaml(t, ORIGINAL);
  assert.throws(() => safeWriteYaml(file, without('"sens dpi":', '2024:'), []), err => {
    const m = /would drop unowned fields: (.*?)\. /.exec(err.message);
    return m && m[1].split(', ').sort().join() === '2024,sens dpi';
  });
  assert.equal(fs.readFileSync(file, 'utf8'), ORIGINAL);
});

test('an owned key may be dropped', t => {
  const file = tempYaml(t, ORIGINAL);
  const next = without('mouse-pad:');
  assert.equal(safeWriteYaml(file, next, ['mouse-pad']), true);
  assert.equal(fs.readFileSync(file, 'utf8'), next);
});

test('unchanged content is not rewritten', t => {
  const file = tempYaml(t, ORIGINAL);
  assert.equal(safeWriteYaml(file, ORIGINAL, []), false);
});

test('new content that does not parse is refused; the line scan reports what it can', t => {
  const file = tempYaml(t, ORIGINAL);
  const broken = without('mouse-pad:').replace('mouse: viper-v3-pro', 'mouse: [viper-v3-pro');
  assert.throws(() => safeWriteYaml(file, broken, []),
    err => /the new content is not valid YAML/.test(err.message) && /missing: mouse-pad\./.test(err.message));
  assert.equal(fs.readFileSync(file, 'utf8'), ORIGINAL);
});

test('an original that does not parse is refused', t => {
  const bad = 'name: tester\nname: twice\n'; // duplicate keys are a js-yaml error
  const file = tempYaml(t, bad);
  assert.throws(() => safeWriteYaml(file, 'name: tester\n', []), /the file on disk is not valid YAML/);
  assert.equal(fs.readFileSync(file, 'utf8'), bad);
});
