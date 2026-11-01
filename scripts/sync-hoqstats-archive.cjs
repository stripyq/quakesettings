#!/usr/bin/env node
/**
 * Reconcile public/data/archive/<gt>.jsonl against the match index on hoqstats.vercel.app.
 *
 * The 88.x HoQ server the archive was scraped from is dead; hoqstats.vercel.app republishes the
 * same matches as static JS (see scripts/lib/hoqstats.cjs). This script is index-driven:
 *   1. fetch /matches/ (seasons), matches.js and the route's complete index (<route>-full.js)
 *   2. require ROUTE_META[route].full === true and unique matchIds === count, else abort
 *   3. compare every indexed matchId with the local archive and report
 *      indexed / already present / missing / present locally but not indexed
 *   4. fetch only the detail chunks that hold missing matches (disk-cached); every missing id
 *      must resolve to exactly one detail record, duplicates within or across chunks abort
 *   5. normalize, append sorted by ts, write to temp files, validate, then rename over the
 *      originals and update <gt>.meta.json. Any failure leaves the originals untouched.
 *
 * Existing lines are never modified by a normal sync (the new file is the old file byte for
 * byte plus appended lines; this is checked before the rename).
 *
 * Usage:
 *   node scripts/sync-hoqstats-archive.cjs                      # route all-y2026, ctf + tdm
 *   node scripts/sync-hoqstats-archive.cjs --dry-run            # report only, write nothing
 *   node scripts/sync-hoqstats-archive.cjs --route ctf-y2026-s4 # any <all|ctf|tdm>[-<seasonId>] route
 *   node scripts/sync-hoqstats-archive.cjs --since 2026-10-01   # only index rows played since
 *   node scripts/sync-hoqstats-archive.cjs --verify-existing 50 [--seed 7]
 *        diff N random already-archived matches per gametype against upstream; writes nothing
 *   node scripts/sync-hoqstats-archive.cjs --update-existing [--dry-run]
 *        also replace already-archived records of the route with the upstream version (for
 *        upstream corrections). Off by default: upstream lacks per-player time_sec, so replaced
 *        records lose it (see the verify report).
 *   --refresh-cache   ignore data-archive/hoqstats-cache and download everything again
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const H = require('./lib/hoqstats.cjs');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'public/data/archive');
const INDEX_MAX_AGE_MS = 60 * 60 * 1000;

// ---------- CLI ----------
const argv = process.argv.slice(2);
function opt(name, dflt) {
  const i = argv.findIndex(a => a === name || a.startsWith(name + '='));
  if (i < 0) return dflt;
  if (argv[i].includes('=')) return argv[i].slice(name.length + 1);
  const v = argv[i + 1];
  if (v == null || v.startsWith('--')) throw new Error(`${name} needs a value`);
  return v;
}
const ROUTE = opt('--route', 'all-y2026');
const SINCE = opt('--since', null);
const DRY_RUN = argv.includes('--dry-run');
const REFRESH = argv.includes('--refresh-cache');
const UPDATE_EXISTING = argv.includes('--update-existing');
const VERIFY_N = opt('--verify-existing', null);
const SEED = Number(opt('--seed', Date.now() % 1e9));

const routeMatch = /^(all|ctf|tdm)(?:-(.+))?$/.exec(ROUTE);
if (!routeMatch) {
  console.error(`Bad --route ${ROUTE}; expected all|ctf|tdm optionally followed by -<seasonId>`);
  process.exit(1);
}
const GTS = routeMatch[1] === 'all' ? ['ctf', 'tdm'] : [routeMatch[1]];
const SEASON_ID = routeMatch[2] || null;
const SINCE_SEC = SINCE ? Date.parse(SINCE) / 1000 : null;
if (SINCE && !Number.isFinite(SINCE_SEC)) {
  console.error(`Bad --since ${SINCE}`);
  process.exit(1);
}

const fail = msg => { throw new Error(msg); };
const fmtTs = s => (Number.isFinite(s) ? new Date(s * 1000).toISOString().slice(0, 19) + 'Z' : String(s));
const archivePath = gt => path.join(ARCHIVE_DIR, `${gt}.jsonl`);

// ---------- upstream ----------

async function loadUpstream() {
  const page = (await H.fetchText('/matches/', { refresh: REFRESH, maxAgeMs: INDEX_MAX_AGE_MS })).text;
  const seasons = H.extractAssignment(page, 'HOQ_MATCH_SEASONS');
  const updateLabel = H.extractAssignment(page, 'HOQ_UPDATE_LABEL');
  const updateTs = H.extractAssignment(page, 'HOQ_UPDATE_TS');

  const matchesJs = (await H.fetchText('/matches/matches.js', { refresh: REFRESH, maxAgeMs: INDEX_MAX_AGE_MS })).text;
  const globalMeta = H.extractAssignment(matchesJs, 'HOQ_MATCH_ROUTE_META["all"]');

  const fullFile = ROUTE === 'all' ? 'data/all-full.js' : `data/${ROUTE}-full.js`;
  const indexJs = (await H.fetchText(`/matches/${fullFile}`, { refresh: REFRESH, maxAgeMs: INDEX_MAX_AGE_MS })).text;
  const meta = H.extractAssignment(indexJs, `HOQ_MATCH_ROUTE_META[${JSON.stringify(ROUTE)}]`);
  const rows = H.extractAssignment(indexJs, 'HOQ_MATCH_INDEX_RAW').map(H.parseIndexRow);

  if (meta.full !== true) fail(`ROUTE_META[${ROUTE}].full is ${meta.full}, expected true`);
  const unique = new Set(rows.map(r => r.matchId));
  if (rows.length !== meta.count || unique.size !== meta.count) {
    fail(`ROUTE_META[${ROUTE}].count=${meta.count} but index has ${rows.length} rows / ${unique.size} unique ids`);
  }

  let window = [-Infinity, Infinity];
  if (SEASON_ID) {
    const season = seasons.find(s => s.id === SEASON_ID);
    if (!season) fail(`Season ${SEASON_ID} not in HOQ_MATCH_SEASONS`);
    window = H.seasonWindowSec(season);
  }
  if (SINCE_SEC != null) window[0] = Math.max(window[0], SINCE_SEC);

  console.log(`Upstream: hoqstats.vercel.app, last updated ${updateLabel}; ${globalMeta.count} matches in ${globalMeta.detailChunkCount} detail chunks`);
  console.log(`Route ${ROUTE}: ${meta.count} matches (full index), window ${fmtTs(window[0])} .. ${fmtTs(window[1])}`);
  return { rows, window, updateTs, updateLabel };
}

// Detail records for the given index rows, keyed by matchId. Aborts unless every id resolves to
// exactly one record and no id appears twice within or across the fetched chunks.
async function loadDetails(rows) {
  const byChunk = new Map();
  for (const r of rows) {
    if (!/^data\/details\/chunk-\d+\.js$/.test(r.chunk)) fail(`Unexpected chunk path ${r.chunk} for ${r.matchId}`);
    if (!byChunk.has(r.chunk)) byChunk.set(r.chunk, []);
    byChunk.get(r.chunk).push(r.matchId);
  }
  const owner = new Map(); // matchId -> chunk, over every record of every fetched chunk
  const details = new Map();
  const chunks = [...byChunk.keys()].sort();
  console.log(`Fetching ${chunks.length} detail chunk(s) for ${rows.length} match(es)...`);
  for (const chunk of chunks) {
    const wanted = byChunk.get(chunk);
    let { text, fromCache } = await H.fetchText(`/matches/${chunk}`, { refresh: REFRESH });
    let records = H.extractAssignment(text, `HOQ_MATCH_DETAIL_CHUNKS[${JSON.stringify(chunk)}]`);
    if (fromCache && !wanted.every(id => records.some(d => d && d.matchId === id))) {
      // The newest chunks grow nightly; a cached copy can predate the match.
      ({ text } = await H.fetchText(`/matches/${chunk}`, { refresh: true }));
      records = H.extractAssignment(text, `HOQ_MATCH_DETAIL_CHUNKS[${JSON.stringify(chunk)}]`);
    }
    if (!Array.isArray(records)) fail(`${chunk} is not an array`);
    for (const d of records) {
      if (!d || typeof d.matchId !== 'string') fail(`${chunk} has a record without matchId`);
      if (owner.has(d.matchId)) fail(`Duplicate matchId ${d.matchId} in ${owner.get(d.matchId)} and ${chunk}`);
      owner.set(d.matchId, chunk);
    }
    for (const id of wanted) {
      const hits = records.filter(d => d.matchId === id);
      if (hits.length !== 1) fail(`${id}: ${hits.length} detail records in ${chunk} (expected 1)`);
      details.set(id, hits[0]);
    }
  }
  return details;
}

// Index row and detail record must describe the same match.
function crossCheck(row, d) {
  const problems = [];
  if (String(d.gametype).toLowerCase() !== row.gametype) problems.push(`gametype ${d.gametype} vs ${row.gametype}`);
  if (d.playedAt !== row.playedAt) problems.push(`playedAt ${d.playedAt} vs ${row.playedAt}`);
  if (String(d.arena).toLowerCase() !== String(row.arena).toLowerCase()) problems.push(`arena ${d.arena} vs ${row.arena}`);
  if (!d.scores || d.scores.red !== row.red || d.scores.blue !== row.blue) problems.push('scores differ');
  if (d.winner !== row.winner) problems.push(`winner ${d.winner} vs ${row.winner}`);
  return problems;
}

// ---------- local archive ----------

const HEAD_RE = /^\{"uuid":"([^"]+)","ts":(-?\d+)/;

// Raw bytes of each line without its '\n' (a preceding '\r' is kept).
async function* rawLines(file) {
  let rest = Buffer.alloc(0);
  for await (const chunk of fs.createReadStream(file)) {
    const buf = rest.length ? Buffer.concat([rest, chunk]) : chunk;
    let start = 0;
    let nl;
    while ((nl = buf.indexOf(0x0a, start)) !== -1) {
      yield buf.subarray(start, nl);
      start = nl + 1;
    }
    rest = buf.subarray(start);
  }
  if (rest.length) yield rest;
}

async function scanArchive(gt) {
  const file = archivePath(gt);
  const out = { lines: 0, ts: new Map(), dups: 0, endsWithNewline: true, size: 0 };
  if (!fs.existsSync(file)) return out;
  out.size = fs.statSync(file).size;
  if (out.size > 0) {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(1);
    fs.readSync(fd, b, 0, 1, out.size - 1);
    fs.closeSync(fd);
    out.endsWithNewline = b[0] === 0x0a;
  }
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    out.lines++;
    let uuid, ts;
    const m = HEAD_RE.exec(line);
    if (m) { uuid = m[1]; ts = Number(m[2]); } else { const r = JSON.parse(line); uuid = r.uuid; ts = r.ts; }
    if (out.ts.has(uuid)) out.dups++;
    else out.ts.set(uuid, ts);
  }
  return out;
}

async function readArchiveRecords(gt, uuids) {
  const found = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(archivePath(gt)), crlfDelay: Infinity });
  for await (const line of rl) {
    const m = HEAD_RE.exec(line);
    const id = m ? m[1] : null;
    if (id && uuids.has(id) && !found.has(id)) found.set(id, JSON.parse(line));
  }
  return found;
}

// ---------- validation ----------

function validateRecord(r, gt) {
  if (!r || typeof r.uuid !== 'string' || !r.uuid) return 'missing uuid';
  if (r.gt !== gt) return `gt ${r.gt} in ${gt} archive`;
  if (!Number.isFinite(r.ts)) return 'bad ts';
  if (!Array.isArray(r.players) || r.players.length === 0) return 'no players';
  for (const p of r.players) {
    if (!p || typeof p.sid !== 'string' || !p.sid) return 'player without sid';
    if (p.team !== 'red' && p.team !== 'blue') return `player ${p.sid} team ${p.team}`;
  }
  return null;
}

async function sha256Prefix(file, bytes) {
  const hash = crypto.createHash('sha256');
  if (bytes > 0) {
    await new Promise((resolve, reject) => {
      fs.createReadStream(file, { start: 0, end: bytes - 1 })
        .on('data', d => hash.update(d)).on('end', resolve).on('error', reject);
    });
  }
  return hash.digest('hex');
}

async function validateTemp(gt, tmp, expectLines, expectDups) {
  let lines = 0;
  let dups = 0;
  const seen = new Set();
  const rl = readline.createInterface({ input: fs.createReadStream(tmp), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    lines++;
    let r;
    try { r = JSON.parse(line); } catch (e) { fail(`${tmp} line ${lines}: ${e.message}`); }
    const problem = validateRecord(r, gt);
    if (problem) fail(`${tmp} line ${lines} (${r && r.uuid}): ${problem}`);
    if (seen.has(r.uuid)) dups++;
    seen.add(r.uuid);
  }
  if (lines !== expectLines) fail(`${tmp}: ${lines} lines, expected ${expectLines}`);
  if (dups !== expectDups) fail(`${tmp}: ${dups} duplicate uuids, expected ${expectDups} (pre-existing)`);
  return { lines, unique: seen.size };
}

// ---------- diff (verify-existing) ----------

// Fields that must agree between the archive and the normalized upstream record.
const CRITICAL = [
  /^ts$/, /^duration_sec$/, /^scores\./, /^winner$/, /^players\.(set|team)$/,
  /^players\.(frags|deaths|dmg_dealt|dmg_taken|caps|new_rating)$/, /^players\.weapons\.\w+\.(hits|shots)$/,
];

// Known systematic differences between the 88.x-scraped archive and normalized upstream records
// (measured over every archived 2026 match). Returns the reason, or null if unexplained.
function explain(diff, matchDiffs) {
  const { field, a, b } = diff;
  if (field === 'players.time_sec' && b === null) return 'upstream has no per-player play time (stored null)';
  if (field === 'players.nick') return 'upstream lists another alias of the same steamId (display only)';
  if (/^players\.(old_rating|new_rating|rating_diff)$/.test(field) && b === null) {
    return 'upstream row has diff 0 (placeholder, no rating update recorded): stored null';
  }
  if (/^players\.weapons\.hmg\./.test(field) && (b === undefined || b === 'absent')) return 'upstream publishes no HMG stats';
  if (field === 'rating_diff') {
    if (a != null && b != null && Math.abs(a - b) <= 0.0101) return 'recomputed from 2-dp player ratings: +-0.01 rounding';
    if (matchDiffs.some(d => /^players\.(old|new)_rating$/.test(d.field))) return 'follows a player rating difference in the same match';
  }
  return null;
}

function diffRecords(a, b, add) {
  for (const k of ['ts', 'gt', 'map', 'duration_sec', 'rating_diff', 'winner']) {
    if (a[k] !== b[k]) add(k, a[k], b[k]);
  }
  for (const k of ['blue', 'red']) {
    if ((a.scores || {})[k] !== (b.scores || {})[k]) add(`scores.${k}`, (a.scores || {})[k], (b.scores || {})[k]);
  }
  const keyOf = (p, n) => `${p.sid}#${n}`;
  const index = list => {
    const seen = {};
    return new Map(list.map((p, i) => { seen[p.sid] = (seen[p.sid] || 0) + 1; return [keyOf(p, seen[p.sid]), { p, i }]; }));
  };
  const A = index(a.players);
  const B = index(b.players);
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    const x = A.get(k);
    const y = B.get(k);
    if (!x || !y) { add('players.set', x ? k : null, y ? k : null); continue; }
    if (x.i !== y.i) add('players.order', x.i, y.i);
    const pa = x.p;
    const pb = y.p;
    for (const f of Object.keys({ ...pa, ...pb })) {
      if (f === 'weapons' || f === 'medals' || f === 'sid') continue;
      if (pa[f] !== pb[f]) add(`players.${f}`, pa[f], pb[f], pa.sid);
    }
    const wa = pa.weapons || {};
    const wb = pb.weapons || {};
    for (const wk of new Set([...Object.keys(wa), ...Object.keys(wb)])) {
      if (!wa[wk] || !wb[wk]) {
        const present = wa[wk] || wb[wk];
        const empty = Object.values(present).every(v => v == null);
        add(`players.weapons.${wk}.<key${empty ? ', all null' : ''}>`, wa[wk] ? 'present' : 'absent', wb[wk] ? 'present' : 'absent', pa.sid);
        if (empty) continue;
      }
      for (const f of ['kills', 'hits', 'shots', 'acc']) {
        const va = wa[wk] ? wa[wk][f] : undefined;
        const vb = wb[wk] ? wb[wk][f] : undefined;
        if (va !== vb) add(`players.weapons.${wk}.${f}`, va, vb, pa.sid);
      }
    }
    const ma = pa.medals || {};
    const mb = pb.medals || {};
    for (const mk of new Set([...Object.keys(ma), ...Object.keys(mb)])) {
      if (ma[mk] !== mb[mk]) add(`players.medals.${mk}`, ma[mk], mb[mk], pa.sid);
    }
  }
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function verifyExisting(up, n) {
  const rand = mulberry32(SEED);
  console.log(`\nVerifying ${n} random archived matches per gametype against upstream (seed ${SEED})`);
  let critical = 0;
  let unexplained = 0;
  for (const gt of GTS) {
    const local = await scanArchive(gt);
    const pool = up.rows.filter(r => r.gametype === gt && local.ts.has(r.matchId));
    const sample = [];
    const copy = pool.slice();
    while (sample.length < n && copy.length) sample.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
    const details = await loadDetails(sample);
    const archived = await readArchiveRecords(gt, new Set(sample.map(r => r.matchId)));
    const stats = new Map();
    for (const row of sample) {
      const diffs = [];
      diffRecords(archived.get(row.matchId), H.normalizeDetail(details.get(row.matchId)),
        (field, a, b, sid) => diffs.push({ field, a, b, sid }));
      for (const d of diffs) {
        const reason = explain(d, diffs);
        const key = `${d.field}\u0000${reason || ''}`;
        let s = stats.get(key);
        if (!s) { s = { field: d.field, reason, n: 0, matches: new Set(), ex: [] }; stats.set(key, s); }
        s.n++;
        s.matches.add(row.matchId);
        if (s.ex.length < 3) s.ex.push(`${row.matchId.slice(0, 8)}${d.sid ? ' ' + d.sid : ''}: archive=${JSON.stringify(d.a)} upstream=${JSON.stringify(d.b)}`);
      }
    }
    console.log(`\n[${gt}] ${sample.length} matches compared (pool ${pool.length})`);
    if (!stats.size) console.log('  no differences');
    for (const s of [...stats.values()].sort((x, y) => !x.reason - !y.reason || y.n - x.n)) {
      const isCritical = CRITICAL.some(re => re.test(s.field));
      if (!s.reason) unexplained += s.n;
      if (!s.reason && isCritical) critical += s.n;
      console.log(`  ${s.reason ? 'explained  ' : 'UNEXPLAINED'} ${isCritical ? '[critical] ' : ''}${s.field}: ${s.n} diff(s) in ${s.matches.size} match(es)` +
        (s.reason ? ` -- ${s.reason}` : ''));
      for (const e of s.ex) console.log(`      ${e}`);
    }
  }
  console.log(unexplained ? `\n${unexplained} unexplained difference(s), ${critical} in critical fields.` : '\nNo unexplained differences.');
  return unexplained;
}

// ---------- sync ----------

async function sync(up) {
  const [winStart, winEnd] = up.window;
  const inWindow = ts => ts >= winStart && ts < winEnd;
  const indexIds = new Set(up.rows.map(r => r.matchId));
  const otherGt = up.rows.filter(r => !GTS.includes(r.gametype) && inWindow(r.playedAt));
  if (otherGt.length) console.log(`Skipping ${otherGt.length} indexed match(es) of other gametypes`);

  const plan = {};
  for (const gt of GTS) {
    const local = await scanArchive(gt);
    const rows = up.rows.filter(r => r.gametype === gt && inWindow(r.playedAt));
    const present = rows.filter(r => local.ts.has(r.matchId));
    const missing = rows.filter(r => !local.ts.has(r.matchId));
    const notIndexed = [...local.ts.entries()].filter(([id, ts]) => inWindow(ts) && !indexIds.has(id));
    const freezeTs = Math.max(0, ...local.ts.values());
    plan[gt] = { local, rows, present, missing, notIndexed, freezeTs };
  }
  // A match indexed as one gametype but archived under the other would be appended twice.
  for (const gt of GTS) {
    for (const other of GTS.filter(g => g !== gt)) {
      const clash = plan[gt].missing.filter(r => plan[other].local.ts.has(r.matchId));
      if (clash.length) fail(`${clash.length} ${gt} match(es) already archived as ${other}, e.g. ${clash[0].matchId}`);
    }
  }

  for (const gt of GTS) {
    const p = plan[gt];
    const gaps = p.missing.filter(r => r.playedAt <= p.freezeTs);
    console.log(`\n[${gt}] local archive: ${p.local.lines} lines, ${p.local.ts.size} unique` +
      (p.local.dups ? ` (${p.local.dups} pre-existing duplicate uuid lines, left as is)` : '') +
      `, newest ${fmtTs(p.freezeTs)}`);
    console.log(`  indexed in window:            ${p.rows.length}`);
    console.log(`  already present:              ${p.present.length}`);
    console.log(`  missing:                      ${p.missing.length}  (${gaps.length} older than the newest archived match)`);
    console.log(`  present locally, not indexed: ${p.notIndexed.length}`);
    for (const r of gaps.slice(0, 10)) console.log(`    gap ${r.matchId} ${fmtTs(r.playedAt)} ${r.arena} ${r.red}-${r.blue} ${r.winner}`);
    if (gaps.length > 10) console.log(`    ... ${gaps.length - 10} more`);
    for (const [id, ts] of p.notIndexed.slice(0, 10)) console.log(`    not indexed ${id} ${fmtTs(ts)}`);
  }

  // Details: missing matches, plus already-present ones when replacing.
  const wantRows = [];
  for (const gt of GTS) wantRows.push(...plan[gt].missing, ...(UPDATE_EXISTING ? plan[gt].present : []));
  const details = wantRows.length ? await loadDetails(wantRows) : new Map();
  const mismatches = [];
  for (const r of wantRows) {
    const problems = crossCheck(r, details.get(r.matchId));
    if (problems.length) mismatches.push(`${r.matchId}: ${problems.join('; ')}`);
  }
  if (mismatches.length) fail(`Index/detail mismatch:\n  ${mismatches.slice(0, 10).join('\n  ')}`);

  const writes = [];
  for (const gt of GTS) {
    const p = plan[gt];
    const append = p.missing.map(r => H.normalizeDetail(details.get(r.matchId)));
    for (const rec of append) {
      const problem = validateRecord(rec, gt);
      if (problem) fail(`${rec.uuid}: ${problem}`);
    }
    append.sort((a, b) => a.ts - b.ts || (a.uuid < b.uuid ? -1 : 1));
    const replace = new Map();
    if (UPDATE_EXISTING) {
      for (const r of p.present) replace.set(r.matchId, H.normalizeDetail(details.get(r.matchId)));
    }
    const noWinner = append.filter(r => r.winner == null);
    console.log(`\n[${gt}] to append: ${append.length}` +
      (append.length ? ` (${fmtTs(append[0].ts)} .. ${fmtTs(append[append.length - 1].ts)})` : '') +
      (noWinner.length ? `; ${noWinner.length} without a winner (draw / no score): ${noWinner.map(r => r.uuid.slice(0, 8)).join(', ')}` : ''));
    if (UPDATE_EXISTING) console.log(`[${gt}] to replace: ${replace.size}`);
    writes.push({ gt, plan: p, append, replace });
  }

  if (DRY_RUN) { console.log('\n--dry-run: nothing written.'); return; }
  if (writes.every(w => w.append.length === 0 && w.replace.size === 0)) { console.log('\nArchive already up to date.'); return; }

  // Build and validate every temp file, and the meta that goes with it, before touching any
  // original. After that only renames and small writes remain.
  const temps = [];
  try {
    for (const w of writes) {
      if (w.append.length === 0 && w.replace.size === 0) continue;
      const file = archivePath(w.gt);
      const tmp = `${file}.sync-${process.pid}.tmp`;
      const t = { ...w, file, tmp };
      temps.push(t);
      let replaced = 0;
      let changed = 0;
      if (w.replace.size === 0) {
        fs.copyFileSync(file, tmp);
      } else {
        // Unchanged lines are copied byte for byte; the older part of the archive ends its
        // lines with \r\n and that is kept, also on replaced lines.
        const out = fs.createWriteStream(tmp);
        const write = async bytes => { if (!out.write(bytes)) await new Promise(r => out.once('drain', r)); };
        for await (const raw of rawLines(file)) {
          const cr = raw.length > 0 && raw[raw.length - 1] === 0x0d;
          const text = raw.toString('utf8', 0, raw.length - (cr ? 1 : 0));
          const m = HEAD_RE.exec(text);
          const rec = m && w.replace.get(m[1]);
          let bytes = raw;
          if (rec) {
            replaced++;
            const next = JSON.stringify(rec);
            if (next !== text) { changed++; bytes = Buffer.from(next + (cr ? '\r' : ''), 'utf8'); }
          }
          await write(bytes);
          await write('\n');
        }
        await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
        console.log(`[${w.gt}] replaced ${replaced} existing line(s), ${changed} changed`);
      }
      const prefix = w.replace.size === 0 && !w.plan.local.endsWithNewline ? '\n' : '';
      if (w.append.length) fs.appendFileSync(tmp, prefix + w.append.map(r => JSON.stringify(r)).join('\n') + '\n');
      const v = await validateTemp(w.gt, tmp, w.plan.local.lines + w.append.length, w.plan.local.dups);
      if (w.replace.size === 0) {
        const [before, after] = await Promise.all([
          sha256Prefix(file, w.plan.local.size), sha256Prefix(tmp, w.plan.local.size),
        ]);
        if (before !== after) fail(`${tmp}: existing lines changed`);
      }
      console.log(`[${w.gt}] temp file validated: ${v.lines} lines, ${v.unique} unique uuids`);

      t.metaFile = path.join(ARCHIVE_DIR, `${w.gt}.meta.json`);
      const old = fs.existsSync(t.metaFile) ? JSON.parse(fs.readFileSync(t.metaFile, 'utf8')) : {};
      // Counters from the original 88.x scrape (scripts/_legacy/build-hoq-archive.cjs) are kept
      // under legacy_build.
      const legacy = old.legacy_build || (old.successful != null
        ? { total_uuids: old.total_uuids, successful: old.successful, dead: old.dead, still_in_retry: old.still_in_retry, last_update: old.last_update }
        : undefined);
      t.meta = {
        gametype: w.gt,
        source: 'hoqstats.vercel.app',
        matches: v.lines,
        unique_matches: v.unique,
        last_update: new Date().toISOString(),
        last_sync: {
          route: ROUTE,
          since: SINCE || null,
          upstream_updated: up.updateLabel,
          upstream_update_ts: up.updateTs,
          indexed: w.plan.rows.length,
          already_present: w.plan.present.length,
          missing: w.plan.missing.length,
          appended: w.append.length,
          replaced: w.replace.size,
          present_not_indexed: w.plan.notIndexed.length,
        },
        ...(legacy ? { legacy_build: legacy } : {}),
      };
    }
  } catch (err) {
    for (const t of temps) if (fs.existsSync(t.tmp)) fs.unlinkSync(t.tmp);
    throw err;
  }

  for (const t of temps) fs.renameSync(t.tmp, t.file);
  for (const t of temps) {
    fs.writeFileSync(t.metaFile, JSON.stringify(t.meta, null, 2) + '\n');
    console.log(`[${t.gt}] wrote ${path.relative(ROOT, t.file)} and ${path.relative(ROOT, t.metaFile)}`);
  }
}

// ---------- main ----------
(async () => {
  const up = await loadUpstream();
  if (VERIFY_N != null) {
    const n = parseInt(VERIFY_N, 10);
    if (!(n > 0)) fail(`Bad --verify-existing ${VERIFY_N}`);
    const unexplained = await verifyExisting(up, n);
    process.exit(unexplained ? 2 : 0);
  }
  await sync(up);
})().catch(err => {
  console.error(`\nABORTED: ${err.message}`);
  process.exit(1);
});
