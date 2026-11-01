---
title: Codex Findings Triage - quakesettings
date: 2026-06-04
project: quakesettings
type: code-review-triage
status: open
updated: 2026-11-01
source: Codex code review (18 findings); Codex audit 2026-11-01 (F2, F5, F6, F7)
tags: [quakesettings, code-review, data-integrity, triage]
---

# Codex Findings Triage - quakesettings

Prioritized plan for the 18-finding Codex review. Each item has severity, whether I verified it against the code or took it from the report, the location, the specific fix, effort, and risk. No code has been changed.

**Verified against the actual code:** #1, #2, #4, #5, #6, #8, #9, #17. The ones I checked were all accurate, so I treat the rest of the report as credible and mark them *Reported* where I did not open the exact lines.

## Status (2026-11-01)

| Status | Findings | How |
|---|---|---|
| Resolved | #1, #2, #3, #4, #6, #9 | PR 406 (archive restored from hoqstats.vercel.app, season stats derived locally, dead-server scripts retired) and PR 407 (map ratings derived from the archive). Per-item notes below. |
| Moot | #5, #7 | The duplicate profile is gone; the rivalry data has no source any more. Notes below. |
| Fixed | F2, F5, F6, F7 | Codex audit of 2026-11-01, one commit each on `codex-open-findings`. See [the section at the end](#codex-audit-2026-11-01). |
| Not re-checked | #8, #10-#18 | Still as triaged below. |

## Bottom line

- **Two findings protect the dataset at its source: #1 and #2. Do them first, before the next archive rebuild.** #1 means new matches are never discovered on a normal run, so everything derived (activity, totals, H2H, maps, badges) silently drifts stale. #2 means a single crash permanently double-counts matches. Together they are why "the data looks fine" can be false.
- **#5 is a five-minute fix** (chakoala and cham are one Steam account in two files) and is already affecting leaderboards.
- **#4 and #6 are real production risks** tied to flaky upstreams: the season-stats merge destroys good data on partial fetches, and a failed deploy-time map fetch ships a green build with empty leaderboards.
- The remaining MEDIUM/LOW items are statistical-validity and hygiene. Worth a pass, none corrupt the core dataset.

Three findings also connect to work from today: **#1** is the durable fix for the activity-chart staleness we just patched; **#13** is the same "trailing zeros look like zero activity" issue on the player-page chart; **#17** is the null-safety rule that already bit the ratings pipeline.

## Recommended sequence

| Phase | Findings | Theme | Why this order |
|---|---|---|---|
| 1 | #2, #1, #5 | Protect the dataset | Stop inflation (#2) and staleness (#1) before the next rebuild writes them in; kill the duplicate account (#5). |
| 2 | #4, #6 | Upstream resilience | Both already-flaky sources (season API, deploy fetch) can silently degrade data. |
| 3 | #9, #8, #7, #10, #13, #12, #11, #3, #14, #15 | Statistical validity | Noisy or mislabeled stats; batch by file (see below). |
| 4 | #16, #17, #18 | Hygiene + observability | Quick, and #18 makes the rest easier to trust. |

**Batch by file to minimize churn:** #1/#2/#3/#10/#15 live in the archive pipeline (`build-hoq-archive.cjs` + `derive-archive.cjs`). #4/#7/#9 live in `fetch-season-stats.cjs`. #5/#17 live in the registry generator (`generate-form-data.js`) plus the stats page. #6/#18 are observability.

---

## Phase 1 - protect the dataset

### #1 Archive never discovers new matches on a normal run (HIGH, verified) - RESOLVED (PR 406)

- **Status:** `build-hoq-archive.cjs` (and the dead 88.x server it scraped) is retired to `scripts/_legacy/`. `sync-hoqstats-archive.cjs` is index-driven: every run compares each indexed matchId with the archive and appends the missing ones.

- **Where:** `scripts/build-hoq-archive.cjs:479` - `if (state.uuids.length === 0 || MAX_PAGES < Infinity)` gates enumeration. Once a checkpoint has UUIDs and no `--max-pages`, it prints "All matches already processed" (line 490) and never enumerates.
- **Fix:** Always run `enumerateMatches(gt, state.uuids)` on resume. The enumerator already accepts known UUIDs and adds only new ones, so the gate is the only problem. Stop enumeration early once it hits a page of all-known UUIDs to keep it cheap.
- **Effort:** M. **Risk:** Low. Slightly longer runs; correctness win is large.

### #2 A crash permanently duplicates matches in the JSONL (HIGH, verified) - RESOLVED (PR 406)

- **Status:** The sync builds and validates a temp file and renames it over the archive, so a crash leaves the original untouched, and it never appends a matchId already present. The derive scripts also skip duplicate uuids (the few pre-existing duplicate lines are left in place and counted once).

- **Where:** `build-hoq-archive.cjs` appends each parsed match to the JSONL, but the durable checkpoint only saves every ~10s (`:556`). `derive-archive.cjs` parses every line (`:133`) with no UUID dedup. A kill between append and checkpoint re-appends the same match next run; all downstream counts inflate.
- **Fix:** Two layers. (a) Safety net now: dedup by UUID in the derive step - keep a `Set` of seen `uuid`/`u, skip repeats. Cheap, immediate. (b) Durable: record the UUID in the checkpoint in the same write as (or before) the append, or rewrite the JSONL from `successfulSet` rather than blind-appending.
- **Effort:** S (derive dedup) + M (checkpoint ordering). **Risk:** Low.
- **Note:** Worth a one-off audit of the current JSONL for existing duplicate UUIDs before trusting present totals.

### #5 Two player files share one Steam account (HIGH, verified) - MOOT

- **Status:** `chakoala.yaml` no longer exists; `cham.yaml` is the only file with `76561198109579696`.

- **Where:** `chakoala.yaml` and `cham.yaml` both have `steamId: "76561198109579696"` (chakoala is `published: false`). Map leaderboards in `stats/index.astro` iterate all content without deduping by Steam ID, so the account can appear twice; `generate-form-data.js` silently overwrites the duplicate in a `Map`, so identity resolution depends on file order.
- **Fix:** Decide which profile is canonical and delete or fold the other (chakoala looks like the unpublished stub). Then add a guard: dedup leaderboard entries by Steam ID, and make the registry generator warn (not silently overwrite) on a duplicate `steamId`.
- **Effort:** S. **Risk:** Low. Confirmed live during today's refresh (both got identical rating updates).

---

## Phase 2 - upstream resilience

### #4 Season-stats merge drops fresh fields and keeps stale ones (HIGH, verified) - RESOLVED (PR 406)

- **Status:** `fetch-season-stats.cjs` (dead season API) is retired. `derive-season-stats.cjs` rebuilds every entry from the local archive on each run; there is no merge with the previous file.

- **Where:** `fetch-season-stats.cjs` - `buildModeEntry` (`:183`) builds a mode object only from endpoints that succeeded (`:196` `if (stats.weapons) entry.weapons = ...`); `processResult` (`:208-216`) sets `entry.ctf` / `entry.tdm` to that partial object. On a partial failure, previously valid fields vanish; if a mode legitimately loses all data, the old object is retained because it is only overwritten when truthy.
- **Fix:** Merge per field against the existing entry: keep prior values for endpoints that failed this run, and explicitly clear a mode only on an authoritative empty (not on fetch error). Distinguish "fetch failed" from "no data".
- **Effort:** M. **Risk:** Medium - this is the merge logic the refresh skill leans on; test against a partial-failure fixture. (I have already corrected the skill doc's overclaim that the merge is safe.)

### #6 Map stats can vanish on a failed deploy fetch with a green build (HIGH, verified) - RESOLVED (PR 407)

- **Status:** The deploy no longer fetches anything (the dead `fetch:hoq` step is gone from `deploy.yml`). `map_ratings.json` is derived from the archive by `derive-map-ratings.cjs` and committed, so a build ships what was committed.

- **Where:** `.github/workflows/deploy.yml:34-35` runs `npm run fetch:hoq` with `continue-on-error: true`; the stats page silently skips missing `public/data/hoq/{steamId}/map_ratings.json`. A transient HoQ outage ships a successful build with empty/partial map leaderboards.
- **Fix:** Add a minimum-coverage gate to the fetch script (fail if fewer than N profiles fetched) and either fail the build or carry forward the last-good map data instead of shipping empties. At minimum, surface a visible warning on the page.
- **Effort:** S-M. **Risk:** Low.

---

## Phase 3 - statistical validity

### #9 Empty arrays counted as real season data (MEDIUM, verified) - RESOLVED (PR 406)

- **Status:** `derive-season-stats.cjs` builds entries from archived matches, so a player only gets the modes they played in the season.

- **Where:** `fetch-season-stats.cjs:190` - `hasData = stats.career || stats.weapons || hasFlagData`; an empty `weapons: []` is truthy, so players with no real data get a mode entry. Codex's read-only count: 2,171 CTF and 2,272 TDM entries are only `mapStats` + `weapons`.
- **Fix:** Test `stats.weapons?.length` and `stats.mapStats?.length`; require genuine career/flag/rivalry data before emitting a mode entry. Shrinks `season-stats.json` and makes player counts honest.
- **Effort:** S. **Risk:** Low. Pairs naturally with #4.

### #8 Player-page percentiles mix qualified and unqualified samples (MEDIUM, verified)

- **Where:** `players/[id].astro:389-390` builds the percentile pool from every entry with `career`, no minimum-games filter. Career/win-rate/KD/DPM percentiles compare against arbitrarily small samples.
- **Fix:** Add a minimum-games threshold (e.g. >= 20) to the percentile pool; show "insufficient sample" when below it.
- **Effort:** S. **Risk:** Low (smaller pools on sparse modes - acceptable).

### #7 Rivalry leaderboards have no sample threshold (MEDIUM, reported) - MOOT

- **Status:** Nemesis / favorite-victim came from the dead season API. Match records cannot supply them, so `derive-season-stats.cjs` leaves them out and the stats page's Most Feared / Most Targeted lists have no input to threshold.

- **Fix:** Require a minimum match count for the source player before counting a nemesis/favorite-victim vote; fetch only profiled/established players rather than the whole registry.
- **Effort:** S. **Risk:** Low.

### #10 Map duration average divides by all games even when duration is missing (MEDIUM, reported)

- **Where:** `derive-archive.cjs` adds duration only when `duration_sec` is finite but divides by total map games.
- **Fix:** Track a separate count of games with finite duration and divide by that. Ties into #3 (parser allows null duration).
- **Effort:** S. **Risk:** Low.

### #13 Activity charts show missing trailing coverage as zero (MEDIUM, reported)

- **Where:** Player-page activity timeline fills missing months with zero and only trims leading zeros, so after one mode's last month it draws zeros through the other mode's later coverage.
- **Fix:** Trim trailing zero buckets per mode, or render "no data" distinctly from "zero games". Align with the compare-chart fix shipped today (which also gap-fills zeros).
- **Effort:** S-M. **Risk:** Low.

### #12 Accuracy leaderboards drop tied players at the cutoff (MEDIUM, reported)

- **Where:** Stats page sorts, slices to 20, then assigns tie-aware ranks - so a tie spanning positions 20/21 silently excludes one.
- **Fix:** Assign ranks first, then include all rows whose rank <= 20 (ties extend the list).
- **Effort:** S. **Risk:** Low.

### #11 Badge percentile cutoffs split ties by sort order (MEDIUM, reported)

- **Fix:** Assign badge tiers by value, not array index; include ties at gold/silver boundaries; represent "Map King" ties as a tie rather than breaking by games played.
- **Effort:** S-M. **Risk:** Low.

### #3 Partial scoreboards accepted as complete (MEDIUM, reported) - RESOLVED (PR 406)

- **Status:** The archive no longer comes from scraped scoreboards. The sync takes upstream detail records, cross-checks each against its index row (gametype, time, arena, scores, winner) and validates it (uuid, gametype, ts, players with sid and team) before anything is written; any mismatch aborts the run.

- **Where:** A scoreboard is valid if >= 1 player row parses; no check for both teams, plausible counts, or score consistency. Parser drift then silently corrupts totals.
- **Fix:** Validate before accepting - require both teams, a plausible player count, and team/score correspondence; retry or flag on failure instead of appending.
- **Effort:** M. **Risk:** Medium (too strict could reject valid edge matches - tune thresholds, log rejects).

### #14 Map qualification depends on exact upstream name spelling (MEDIUM, reported)

- **Fix:** Canonicalize map names (lowercase, trim, normalize punctuation) before exclusion/threshold matching; centralize the map-name normalizer. Mitigates the casing footgun already noted in the rating skill.
- **Effort:** S-M. **Risk:** Low.

### #15 Missing map names bucketed into a real-looking "unknown" map (MEDIUM, reported)

- **Where:** Parser allows `map: null`; derivations fold these into one "unknown" map.
- **Fix:** Reject or flag null-map matches (ties into #3) rather than aggregating; at minimum surface the unknown count so a parser regression is visible.
- **Effort:** S. **Risk:** Low.

---

## Phase 4 - hygiene and observability

### #16 Map qualification floor undershoots its own "0.5%" rule (LOW, reported)

- **Fix:** Use `Math.ceil` instead of `Math.floor` for the "0.5% of map total" threshold so it meets the stated rule.
- **Effort:** S (one line). **Risk:** None.

### #17 CSV parse turns valid zero and malformed values into the same null (LOW, verified pattern)

- **Where:** Registry generator uses `parseFloat(row.rating) || null` / `parseInt(row.n) || null`; the same `|| null` idiom appears in `fetch-hoq-ratings.cjs:85-87` and similar. A legit 0 becomes null, and malformed is indistinguishable from missing.
- **Fix:** Parse explicitly: `Number.isFinite(x) ? x : null` (or `??`). This is the same null-safety rule (hard rule #2 in the refresh skill) that a rating of 0 must survive.
- **Effort:** S. **Risk:** Low.

### #18 Data-load failures are intentionally silent (LOW, reported)

- **Where:** Stats page falls back to empty season data, empty registry, empty map ratings, and default archive on any read/parse error - corrupt and legitimately-empty look identical.
- **Fix:** Log or throw on parse failure of generated data; for critical inputs, fail the build rather than shipping empties (pairs with #6).
- **Effort:** M. **Risk:** Low.

---

## Codex audit 2026-11-01

Four open findings, fixed on branch `codex-open-findings` with one commit each. Script tests run with `npm test`
(`node --test`, `scripts/test/*.test.cjs`); the page fix was checked in the built site.

### F2 Compare-page map comparison races the season section (P1) - FIXED

- **Where:** `src/pages/compare/index.astro`. The per-map win% table was appended into `season-compare-container`, which `updateSeasonCompare` clears on every player change. That listener runs after `updateHoqSections`, so the slot was wiped as soon as it was added; the `map_ratings` callback then threw on `.style` of a missing node, and its own `.catch` hid the error. After the first player change the table never appeared.
- **Fix:** The table has its own `hoq-map-compare-container` (heading "CTF Map Win%"), written only by `updateHoqSections`. A request token, bumped on every call before any early return, makes both fetch callbacks ignore results from a superseded selection.
- **Evidence:** Built page: three quick player changes, no console errors, table shows the last pair. With the first pair's responses delayed 1.5 s past the last change, the stale result is dropped and the values match the last pair's `map_ratings.json`.

### F5 yaml-safe-write's key regex misses legal keys (P2) - FIXED

- **Where:** `scripts/yaml-safe-write.cjs`. `extractKeys` only matched `/^[a-zA-Z_][a-zA-Z0-9_]*:/`, so `mouse-pad:`, quoted and digit-leading keys were invisible to the dropped-key guard.
- **Fix:** Both versions are parsed with js-yaml and their top-level key sets compared. If either does not parse, nothing is written; a line scan only reports which keys look missing. All 1225 content YAML files parse, and the old regex and the parser agree on every one, so no current write starts failing.
- **Evidence:** `scripts/test/yaml-safe-write.test.cjs` (dropped `mouse-pad:` detected, quoted and digit-leading keys, unparseable input refused). 5 of its 7 tests fail against the old file.

### F6 Season weapon accuracy drops zero-hit matches (P2) - FIXED

- **Where:** `scripts/derive-season-stats.cjs` summed hits and shots only when both were non-null; the archive stores a zero counter as null, so 0/10 + 5/10 read as 50%. `scripts/derive-signatures.cjs` had the same skip. `derive-archive.cjs` and `derive-tdm-all.cjs` already summed each counter on its own; `derive-map-ratings.cjs` has no weapon counters.
- **Fix:** Both go through `weaponHitsShots()` in `scripts/lib/hoqstats.cjs`: hits and shots summed independently, null counted as 0, a weapon skipped only when both are null.
- **Evidence:** Fixture test asserts 25% (old code: 50%). No output moves today: none of the archive's 3.57M weapon records has hits null with shots set (upstream leaves a weapon blank when it has no hits), so `season-stats.json` and both `signatures.json` regenerate identically.

### F7 A fresh checkout cannot bootstrap the archive (P2) - FIXED

- **Where:** `scripts/sync-hoqstats-archive.cjs` copied the existing `.jsonl` into the temp file unconditionally; the archives are gitignored, so a fresh clone hit ENOENT on the first real sync.
- **Fix:** With no archive the temp file starts empty and the byte-prefix check is skipped; both are unchanged when it exists. The `--update-existing` rewrite only runs for matches already archived, so it cannot reach a missing file (now asserted). `--verify-existing` no longer throws on a missing file.
- **Evidence:** `scripts/test/sync-archive-bootstrap.test.cjs` runs the script offline against a fixture upstream (the old script fails with the ENOENT). In a fresh scratch checkout: `--dry-run` reported all 5615 matches of `all-y2026` as missing (ctf 4624, tdm 991), and a narrow `--route ctf-y2026-s4 --since 2026-10-31` sync wrote 23 matches where the old script aborted.

---

## Notes

- I have not changed any code; this is planning only.
- Phase 1 should land before the next `build-hoq-archive.cjs` run, otherwise #1/#2 bake more drift/inflation into the archive that feeds everything else.
- If you want, I can take Phase 1 (#1, #2, #5) end to end next: implement, you run the rebuild and verify, then commit. Phases 2-4 can follow in file-batched chunks.
- This note lives in the repo root for now; move it into your Obsidian vault if you want it tracked there rather than in git.
