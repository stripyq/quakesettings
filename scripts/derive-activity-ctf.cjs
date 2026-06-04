#!/usr/bin/env node
/**
 * Derive the compare-chart activity source from the local match archive.
 *
 *   reads:  public/data/ctf/activity.json   (by_day counts, from derive-archive.cjs)
 *   writes: public/data/activity-ctf.json   (weekly [{ week, games }], Monday-aligned, gap-filled)
 *
 * The compare-page rating chart (src/pages/compare/index.astro) draws the grey
 * "games per week" activity bars behind the rating lines from public/data/activity-ctf.json.
 *
 * That file used to be produced by fetch-activity-data.cjs, which pulled the HoQ Season
 * Tracker API (77.90.2.137:8004). That API has been down since ~March 2026, so the bars
 * froze at 2026-02-23. The archive (built from the working 88.x match host) is the live
 * source now, so we derive the weekly buckets from it instead.
 *
 * Run after the archive is refreshed:  build-hoq-archive.cjs -> derive-archive.cjs -> this.
 * Usage: node scripts/derive-activity-ctf.cjs
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../public/data/ctf/activity.json');
const OUT = path.join(__dirname, '../public/data/activity-ctf.json');

function monday(s) {
  const d = new Date(s + 'T00:00:00Z');
  const wd = d.getUTCDay();              // 0=Sun..6=Sat
  const diff = (wd === 0 ? -6 : 1 - wd); // back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

const byDay = (JSON.parse(fs.readFileSync(SRC, 'utf8')).by_day) || {};
const weekly = {};
for (const [day, n] of Object.entries(byDay)) {
  const m = monday(day);
  weekly[m] = (weekly[m] || 0) + n;
}

const keys = Object.keys(weekly).sort();
if (keys.length === 0) {
  console.error('No by_day data in ' + SRC + ' — did derive-archive.cjs run?');
  process.exit(1);
}

// Emit every week from first to last (fill gaps with 0 so the bars stay contiguous).
const out = [];
const cur = new Date(keys[0] + 'T00:00:00Z');
const end = new Date(keys[keys.length - 1] + 'T00:00:00Z');
while (cur <= end) {
  const k = cur.toISOString().slice(0, 10);
  out.push({ week: k, games: weekly[k] || 0 });
  cur.setUTCDate(cur.getUTCDate() + 7);
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('Wrote ' + path.relative(process.cwd(), OUT));
console.log('  ' + out.length + ' weeks, ' + out[0].week + ' -> ' + out[out.length - 1].week);
