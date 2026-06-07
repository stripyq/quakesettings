---
name: refresh-quakesettings
description: Refresh Quake Live player rating data on the quakesettings site from HoQ, QLLR (qllr.xyz), and QLRace (qlrace.com). Triggers on any ask to refresh, update, sync, or pull fresh ratings for quakesettings / the Quake Live settings database / stripyq.github.io/quakesettings. Use this whenever the user says "refresh qs", "refresh quake ratings", "update player ratings", "sync HoQ", "pull fresh ratings", "refresh the site data", or mentions refreshing any combination of HoQ ratings, QLLR ratings, seasonal stats, or race data. Also use when the user references the quakesettings repo and asks about running the scripts in scripts/fetch-*.cjs or scripts/update-*.cjs. Do not use for player submissions (new profile adds) or accuracy-only refreshes, those are separate workflows.
---

# Refresh quakesettings ratings

The Quake Live settings database at `stripyq.github.io/quakesettings` pulls ratings from four external sources. This skill runs all four refreshes in the right order, with the guardrails that past incidents made necessary.

## Context the user already knows

- Repo: `~\quakesettings` on M's PC, `stripyq/quakesettings` on GitHub, deployed via GitHub Pages from `main` (auto-rebuilds 1-2 min after push).
- Astro static site, Node scripts in `scripts/*.cjs`, YAMLs per player in `src/content/players/`.
- **Sandbox cannot reach the data sources** (`qllr.xyz`, `88.214.20.58`, `77.90.2.137`, `qlrace.com`, raw.githubusercontent.com all blocked). The skill hands M PowerShell commands; M runs them on his PC and pastes output back.

## Data sources and what each refresh writes

| Source | Script | Writes |
|---|---|---|
| HoQ CTF + TDM (primary ratings) | `scripts/fetch-hoq-ratings.cjs` then `scripts/sync-hoq-to-display.cjs` | **fetch** writes the source fields `hoqCtfRating`, `hoqCtfGames`, `hoqTdmRating`, `hoqTdmGames` from the live API. **sync** copies those into the display fields the site reads (`ctfRating`, `ctfGames`, `tdmRating`, `tdmGames`, plus `ctfRatingUpdated`, `tdmRatingUpdated`), rounding ratings to 2 dp. Both steps required. Do NOT use `update-hoq-ratings.cjs` for a live refresh (it is CSV-fed, see the warning in Step 3). |
| QLLR (qllr.xyz, displayed as "CSQL" on the site) | `scripts/fetch-qllr-ratings.cjs` | `qllrCtfRating`, `qllrCtfGames` only |
| HoQ seasonal stats (2026 Season N) | `scripts/fetch-season-stats.cjs` | `public/data/season-stats.json` only, no YAML writes |
| QLRace / qlrace.com (VQL race records) | `scripts/fetch-qlrace.cjs` | `qlrace:` YAML block on players without one (add `--force` to re-fetch everyone) |

## The routine

### Step 1. Confirm scope with the user

Before running anything, clarify:
- "All four refreshes, or just some?" (default: all four)
- "Force-refresh QLRace for existing players too?" (default: no, skip ones that already have a `qlrace:` block)
- "Include inactive players in the QLLR fetch?" (default: active only)

Keep the check short. If the user says "just do it", skip questions 2 and 3 and use the defaults.

### Step 2. Preflight on M's PC

Give M exactly these commands to run:

```powershell
cd ~\quakesettings
git fetch origin
git status
```

Wait for the output. Decide:

- **Clean + up to date**: proceed.
- **Behind origin/main**: ask M to run `git pull`. If he has uncommitted changes first, tell him `git restore <files>` or stash before pulling. Don't advance to step 3 until local is on the latest commit with a clean tree.
- **Ahead of origin/main or has unpushed commits**: ask what those changes are. If they look like pending work he wants to keep, plan a stash/pull/pop dance. If they're accidental or old, offer `git restore .` after confirming. Also check `git log origin/main..HEAD --oneline --stat`: any unpushed commit ships on the next push, and if it contains a file over 100 MB the push will be rejected (see Step 5).

**Why this matters:** on 2026-04-17 a session started against a 38-commit-stale local tree and spent a lot of time chasing "damage" that was actually just staleness. Always check first.

### Step 3. Run the refreshes in this order

Hand M each command, wait for output, summarize before the next one. Order: QLLR first (smallest, fastest); HoQ next (the main workhorse, two commands); then seasonal (often flaky); then QLRace (slowest, talks to an external CDN).

```powershell
node scripts/fetch-qllr-ratings.cjs
```

Expected: fetches 4 pages from qllr.xyz/ratings/ctf/, reports "Matched: N, Updated: N" at the end. If it says "Have qllr* but missing from this QLLR fetch" for a few players, they're inactive, re-run with `--include-inactive` if M wants them too.

```powershell
node scripts/fetch-hoq-ratings.cjs
node scripts/sync-hoq-to-display.cjs
```

Two steps, both required. `fetch-hoq-ratings.cjs` pulls the live API (`88.214.20.58/export_rating/ctf.json` + `tdm.json`) and writes the `hoq*` source fields; `sync-hoq-to-display.cjs` then copies those into the display fields the site actually reads and rounds ratings to 2 dp. Expected: fetch touches ~140 players (every value rewritten to full float precision), sync updates the few dozen whose rounded display value moved. Games should climb or hold, never drop. A fleet-wide games *decrease* means stale data was read (see the warning).

**Do NOT run `node scripts/update-hoq-ratings.cjs` with no arguments.** Despite its name it does not fetch: it reads `public/data/hoq_ctf.csv` / `hoq_tdm.csv`, which nothing in this routine refreshes, so it silently rolls every player back to whenever those CSVs were last written. On 2026-06-04 this regressed ~141 players (games fell across the board) before it was caught. It writes only `hoq*` source fields (no display sync), so the damage hides until a sync runs. It is only safe with explicit fresh JSON: save a live API pull to `ctf.json`/`tdm.json`, then `node scripts/update-hoq-ratings.cjs --ctf-json ctf.json --tdm-json tdm.json`. For a normal refresh, use the `fetch` + `sync` pair above.

```powershell
node scripts/fetch-season-stats.cjs
```

Expected: fetches from `77.90.2.137:8004/api`. This API has been unreliable. If every request prints "fetch failed" or it reports "Fetched: 0 players, No data: 2289", that's the API being down, NOT a script failure. It only writes `season-stats.json` after a full successful run, so an interrupt (Ctrl+C) leaves the existing JSON intact. Just note "seasonal API is down, retry later" and proceed.

```powershell
node scripts/fetch-qlrace.cjs
```

Expected: by default only fetches players without an existing `qlrace:` block, so on a maintained repo it often reports "Found 0 players to fetch", a clean no-op. For a full refresh, use `node scripts/fetch-qlrace.cjs --force` (takes a few minutes; 3 parallel requests per batch, 1s delay). Rate-limit is deliberate, don't raise it.

### Step 4. Verify scope, then verify contents

First, scope. Ask M to paste:

```powershell
git status
git diff --stat
```

- **Expected dirty files**: `src/content/players/*.yaml` only, for the HoQ + QLLR + QLRace steps (fetch and sync write nothing else). Add `public/data/season-stats.json` only if the seasonal fetch actually succeeded.
- **Red flags**: `.astro` files, `scripts/*.cjs`, `package.json`, anything in `src/pages/`. If `ctf.json`, `tdm.json`, or the `hoq_*.csv` files show up dirty, someone ran `update-hoq-ratings.cjs` against stale CSVs, stop and discard.

Then verify contents across the whole tree, not just one spot-checked file (a single spot-check missed the 2026-06-04 issues). The fast authoritative check is `git diff` on M's PC, grepped for accuracy lines:

```powershell
git diff -- src/content/players | Select-String 'accuracy_'
```

Every match must be a context line (leading space). A `+` or `-` on any `accuracy_` line is the March 1 wipe pattern, stop. For a thorough pass, have M run a short Node script (read-only) that compares each YAML to HEAD and flags: any changed accuracy field, `hoqCtfGames != ctfGames` (truncation), `round(hoqCtfRating) != ctfRating` (unsynced display), games regressed vs HEAD, or `published` flipped. It must print PASS before committing.

**Cowork sandbox caveat:** the Linux sandbox's mounted copy of the repo can lag M's real disk and may show phantom mid-write corruption (it showed a fake blanked accuracy and a fake truncated games count on 2026-06-04, neither real on disk). Never verify YAML contents from the sandbox. Read M's real files with the file tools, or have him run the check in PowerShell on his PC.

### Step 5. Hand-off to commit

Draft a commit message in chat for M to paste. Template:

```
Refresh ratings (YYYY-MM-DD): HoQ ({N1}) + QLLR ({N2}){ + QLRace if --force}
```

Then give the commit + push commands. Scope the `git add` to the player folder, the only thing the supported pipeline changes:

```powershell
git add src/content/players/
git commit -m "<message>"
git push
```

Add `public/data/season-stats.json` only if the seasonal fetch wrote new data. Do not blanket-add `public/data/` or the CSV/json caches.

**Never run these automatically.** M commits and pushes himself, CLAUDE.md requires explicit approval, and the production site deploys straight from `main`. After M pushes, tell him to watch `https://github.com/stripyq/quakesettings/actions` for the green build (60-90s), and confirm a player page on the live site shows the new values.

**If a push is rejected for large files (GH001, ">100 MB"):** on 2026-06-04 the culprits were `public/data/archive/ctf.jsonl` (202 MB) and `tdm.jsonl` (141 MB), raw match dumps committed by accident in an earlier unpushed commit. They are local inputs for the `derive-*` / `build-hoq-archive` scripts; the deployed site only needs the derived JSON (already committed). They are now gitignored as `public/data/archive/*.jsonl`. If oversized files reappear in an unpushed commit, the fix is to rewrite that commit to drop them (`git branch backup-<date>`; `git reset --soft origin/main`; `git rm --cached <files>`; gitignore them; recommit), never push a file over 100 MB, and never commit raw jsonl.

## Hard rules, learned from production incidents

1. **Never overwrite `accuracy_rg` / `accuracy_lg` / `accuracy_rl`.** The March 1, 2026 incident wiped these for ~54 players when a rating-refresh script didn't null-guard. Rating refresh and accuracy refresh are separate operations. This skill never runs the accuracy fetcher (`scripts/fetch-hoq-stats.cjs`).
2. **Null-safe comparisons.** A legit rating of 0 exists. Never use `||` or `!val` as a presence check; use `??` or `== null`.
3. **HoQ API responses are wrapped.** `{ ok: true, response: [...] }`, scripts unwrap `.response`. If you're writing a new fetch path, remember this.
4. **Match by steamId first, nickname second.** The YAML registry uses custom nicknames that diverge from API names (e.g. "zoza" vs "zozo").
5. **Never commit or push without explicit user approval.** GitHub Pages deploys straight from main. A bad commit ships immediately.
6. **Map casing is inconsistent.** `q3wcp9` vs `Q3WCP9`, handle both when doing map-keyed lookups.
7. **Preserve `published` on updates.** New player files default to `published: false`; existing values must never be clobbered.
8. **`update-hoq-ratings.cjs` is CSV-fed, not a fetcher.** It reads stale `public/data/hoq_*.csv` and writes only `hoq*` source fields (no display sync). For a live refresh use `fetch-hoq-ratings.cjs` then `sync-hoq-to-display.cjs` (see Step 3).
9. **Never track files over 100 MB.** GitHub rejects them outright. Raw `public/data/archive/*.jsonl` dumps are gitignored; only the derived JSON is committed.

## When the user wants something slightly different

- **"Only QLLR"** or **"only HoQ"** â€” skip the others; the scripts are independent. For "only HoQ", still run BOTH `fetch-hoq-ratings.cjs` and `sync-hoq-to-display.cjs` (fetch alone updates source fields but leaves the site showing the old display values).
- **"Also refresh accuracies"** â€” that's the `fetch-hoq-stats.cjs` flow, deliberately NOT part of this skill. Run it separately, after the rating refresh, and confirm with M first.
- **"Set up a scheduled weekly run"** â€” possible via the scheduled-tasks MCP, but the fetches must run on M's PC (the sandbox can't reach the sources), so a sandbox-side cron cannot do it. Revisit only after the seasonal API stabilizes.

## If the user asks for a dry-run

- `fetch-qllr-ratings.cjs --dry-run` â€” prints the updates it would make without writing YAMLs.
- `fetch-hoq-ratings.cjs` and `sync-hoq-to-display.cjs` â€” no dry-run flag, but each prints every change as it writes. Inspect the output, then run the Step 4 verifier before committing. (If you must preview without writing, pull the API JSON and diff it against current YAML values by hand.)
- `fetch-season-stats.cjs` â€” no dry-run; it only writes after a full successful fetch.
- `fetch-qlrace.cjs --dry-run` â€” prints the YAML block it would add per player.

Offer dry-runs unsolicited if M seems nervous or if the session started after a long gap (state drift likely).

## Path note

The repo is at `~\quakesettings`, not `C:\Users\m\quakesettings`. The starter doc `claude-code-quakesettings-starter.md` in the repo root still has the wrong path, and its "TASK RECIPE, Refresh HoQ ratings" section still points at `update-hoq-ratings.cjs` + a separate sync; update it to the `fetch-hoq-ratings.cjs` + `sync-hoq-to-display.cjs` pair next time it comes up.
