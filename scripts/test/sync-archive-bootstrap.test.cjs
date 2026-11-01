// F7: sync-hoqstats-archive.cjs must bootstrap a missing archive (the .jsonl files are
// gitignored, so a fresh checkout has none) and still keep every existing byte when one exists.
// Each test runs the real script in a temp root whose disk cache holds a two-match upstream
// (route "ctf"); the network is stubbed out, so nothing is fetched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const NO_NETWORK = path.join(__dirname, 'fixtures/no-network.cjs');
const CHUNK = 'data/details/chunk-000.js';

const MATCHES = [
  { id: 'fixture-a', ts: 1793000000, arena: 'ironworks', red: 3, blue: 2, winner: 'red' },
  { id: 'fixture-b', ts: 1793100000, arena: 'spidercrossings', red: 1, blue: 4, winner: 'blue' },
];

function detail(m) {
  const player = (sid, team) => ({
    steamId: sid, nick: `p${sid.slice(-1)}`, team,
    summary: { score: 100, frags: 10, deaths: 8, captures: 1, damage_dealt: 3000, damage_taken: 2500, new_rating: 20.5, diff: 0.3 },
    weapons: { rg: { frags: 2, hits: 5, shots: 10, acc: 50 } },
    medals: { captures: 1 },
  });
  return {
    matchId: m.id, playedAt: m.ts, gametype: 'ctf', arena: m.arena, duration: '20:00',
    scores: { red: m.red, blue: m.blue }, winner: m.winner,
    players: [player('76561190000000001', 'red'), player('76561190000000002', 'blue')],
  };
}

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-sync-'));
  for (const rel of ['scripts/sync-hoqstats-archive.cjs', 'scripts/lib/hoqstats.cjs']) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.copyFileSync(path.join(REPO, rel), path.join(root, rel));
  }
  fs.mkdirSync(path.join(root, 'public/data/archive'), { recursive: true });
  const cache = path.join(root, 'data-archive/hoqstats-cache/matches');
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(cache, rel)), { recursive: true });
    fs.writeFileSync(path.join(cache, rel), text);
  };
  put('index.html', '<script>window.HOQ_MATCH_SEASONS=[{"id":"all-time","startTs":0,"endTs":"Infinity"}];' +
    'window.HOQ_UPDATE_LABEL="fixture";window.HOQ_UPDATE_TS=1793100000000;</script>');
  put('matches.js', 'window.HOQ_MATCH_ROUTE_META["all"]={"key":"all","count":2,"full":false,"detailChunkCount":1};');
  const rows = MATCHES.map(m => [m.id, m.ts, 'ctf', m.arena, '20:00', m.red, m.blue, m.winner, 20, CHUNK, m.id]);
  put('data/ctf-full.js', 'window.HOQ_MATCH_ROUTE_META["ctf"]={"key":"ctf","count":2,"full":true};' +
    `window.HOQ_MATCH_INDEX_RAW=${JSON.stringify(rows)};`);
  put(CHUNK, `window.HOQ_MATCH_DETAIL_CHUNKS[${JSON.stringify(CHUNK)}]=${JSON.stringify(MATCHES.map(detail))};`);
  return root;
}

function sync(root, ...args) {
  const r = spawnSync(process.execPath,
    ['--require', NO_NETWORK, path.join(root, 'scripts/sync-hoqstats-archive.cjs'), '--route', 'ctf', ...args],
    { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const archive = root => path.join(root, 'public/data/archive/ctf.jsonl');
const lines = text => text.split('\n').filter(l => l.trim());

test('dry run without a local archive reports every match as missing', t => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const r = sync(root, '--dry-run');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /local archive: 0 lines/);
  assert.match(r.out, /already present: +0\b/);
  assert.match(r.out, /missing: +2\b/);
  assert.match(r.out, /--dry-run: nothing written/);
  assert.equal(fs.existsSync(archive(root)), false);
});

test('sync without a local archive writes it from an empty file', t => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const r = sync(root);
  assert.equal(r.code, 0, r.out);
  const recs = lines(fs.readFileSync(archive(root), 'utf8')).map(l => JSON.parse(l));
  assert.deepEqual(recs.map(x => x.uuid), ['fixture-a', 'fixture-b']);
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'public/data/archive/ctf.meta.json'), 'utf8'));
  assert.equal(meta.matches, 2);
  assert.equal(meta.last_sync.missing, 2);
  assert.deepEqual(fs.readdirSync(path.join(root, 'public/data/archive')).filter(f => f.endsWith('.tmp')), []);
});

test('sync with a local archive keeps its bytes (CRLF line included) and appends', t => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = { uuid: 'fixture-a', ts: 1793000000, gt: 'ctf', map: 'ironworks', players: [{ sid: '76561190000000001', team: 'red' }] };
  const before = Buffer.from(JSON.stringify(first) + '\r\n', 'utf8');
  fs.writeFileSync(archive(root), before);
  const r = sync(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /already present: +1\b/);
  const after = fs.readFileSync(archive(root));
  assert.ok(after.subarray(0, before.length).equals(before), 'existing bytes unchanged');
  assert.deepEqual(lines(after.toString('utf8')).map(l => JSON.parse(l).uuid), ['fixture-a', 'fixture-b']);
});
