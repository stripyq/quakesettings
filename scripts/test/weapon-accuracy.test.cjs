// F6: weapon accuracy must sum hits and shots independently. The archive stores a zero counter
// as null, so a match with shots but no hits used to drop its shots (0/10 + 5/10 read as 50%).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { weaponHitsShots } = require('../lib/hoqstats.cjs');
const { readSeason, buildMode } = require('../derive-season-stats.cjs');

const SID = '76561190000000001';

test('weaponHitsShots counts a null counter as 0 when the record exists', () => {
  assert.deepEqual(weaponHitsShots({ kills: null, hits: null, shots: 10, acc: null }), { hits: 0, shots: 10 });
  assert.deepEqual(weaponHitsShots({ kills: 2, hits: 5, shots: 10, acc: 50 }), { hits: 5, shots: 10 });
  assert.deepEqual(weaponHitsShots({ kills: null, hits: 3, shots: null, acc: null }), { hits: 3, shots: 0 });
  assert.equal(weaponHitsShots({ kills: 1, hits: null, shots: null, acc: null }), null);
  assert.equal(weaponHitsShots(null), null);
  assert.equal(weaponHitsShots(undefined), null);
});

test('season accuracy keeps the shots of a 0-hit match: 0/10 + 5/10 = 25%', async () => {
  const aggs = new Map();
  const n = await readSeason('ctf', 0, Infinity, aggs, path.join(__dirname, 'fixtures/season-accuracy'));
  assert.equal(n, 2);
  const mode = buildMode('ctf', aggs.get(SID), 'tester', '2026-11-01T00:00:00.000Z');
  const rg = mode.weapons.find(w => w.weapon === 'RAILGUN');
  assert.ok(rg, 'RAILGUN row present');
  assert.equal(rg.shots, 20);
  assert.equal(rg.hits, 5);
  assert.equal(rg.accuracy, 25);
  assert.equal(rg.kills, 2);
  // A weapon whose hits and shots are both null in every match was never fired: no row.
  assert.equal(mode.weapons.find(w => w.weapon === 'GRENADE_LAUNCHER'), undefined);
});
