---
name: refresh-quakesettings
description: Refresh Quake Live player rating data on the quakesettings site from HoQ, QLLR (qllr.xyz), and QLRace (qlrace.com). Triggers on any ask to refresh, update, sync, or pull fresh ratings for quakesettings / the Quake Live settings database / stripyq.github.io/quakesettings. Use this whenever the user says "refresh qs", "refresh quake ratings", "update player ratings", "sync HoQ", "pull fresh ratings", "refresh the site data", or mentions refreshing any combination of HoQ ratings, QLLR ratings, seasonal stats, or race data. Also use when the user references the quakesettings repo and asks about running the scripts in scripts/fetch-*.cjs or scripts/update-*.cjs. Do not use for player submissions (new profile adds) or accuracy-only refreshes — those are separate workflows.
---

# Refresh quakesettings ratings

The Quake Live settings database at `stripyq.github.io/quakesettings` pulls ratings from four external sources. This skill runs all four refreshes in the right order, with the guardrails that past incidents made necessary.

## Context the user already knows

- Repo: `C:\Users\marin\quakesettings` on M's PC, `stripyq/quakesettings` on GitHub, deployed via GitHub Pages from `main` (auto-rebuilds 1–2 min after push).
- Astro static site, Node scripts in `scripts/*.cjs`, YAMLs per player in `src/content/players/`.
- **Sandbox cannot reach the data sources** (`qllr.xyz`, `88.214.20.58`, `77.90.2.137`, `qlrace.com`, raw.githubusercontent.com all blocked). The skill hands M PowerShell commands; M runs them on his PC and pastes output back.

## Data sources and what each refresh writes

| Source | Script | Writes |
|---|---|---|
| HoQ CTF + TDM (primary ratings) | `scripts/update-hoq-ratings.cjs` | `hoqCtfRating`, `hoqCtfGames`, `hoqTdmRating`, `hoqTdmGames` + display fields `ctfRating`, `ctfGames`, `tdmRating`, `tdmGames`, `ctfRatingUpdated`, `tdmRatingUpdated`. Also refreshes `public/data/hoq_ctf.csv` + `hoq_tdm.csv` and the root `ctf.json` + `tdm.json` caches. |
| QLLR (qllr.xyz, displayed as "CSQL" on the site) | `scripts/fetch-qllr-ratings.cjs` | `qllrCtfRating`, `qllrCtfGames` only |
| HoQ seasonal stats (2026 Season N) | `scripts/fetch-season-stats.cjs` | `public/data/season-stats.json` only — no YAML writes |
| QLRace / qlrace.com (VQL race records) | `scripts/fetch-qlrace.cjs` | `qlrace:` YAML block on players without one (add `--force` to re-fetch everyone) |

## The routine

### Step 1. Confirm scope with the user

Before running anything, clarify:
- "All four refreshes, or just some?" (default: all four)
- "Force-refresh QLRace for existing players too?" (default: no — skip ones that already have a `qlrace:` block)
- "Include inactive players in the QLLR fetch?" (default: active only)

Keep the check short. If the user says "just do it", skip questions 2 and 3 and use the defaults.

### Step 2. Preflight on M's PC

Give M exactly these commands to run:

```powershell
cd C:\Users\marin\quakesettings
git fetch origin
git status
```

Wait for the output. Decide:

- **Clean + up to date**: proceed.
- **Behind origin/main**: ask M to run `git pull`. If he has uncommitted changes first, tell him `git restore <files>` or stash before pulling. Don't advance to step 3 until local is on the latest commit with a clean tree.
- **Ahead of origin/main or has unpushed commits**: ask what those changes are. If they look like pending work he wants to keep, plan a stash/pull/pop dance. If they're accidental or old, offer `git restore .` after confirming.

**Why this matters:** on 2026-04-17 a session started against a 38-commit-stale local tree and spent a lot of time chasing "damage" that was actually just staleness. Always check first.

### Step 3. Run the refreshes in this order

Hand M each command, wait for output, summarize before the next one. Order matters — QLLR first because it's the smallest and fastest; HoQ ratings next (the main workhorse); then seasonal (often flaky); then QLRace (slowest, talks to an external CDN).

```powershell
node scripts/fetch-qllr-ratings.cjs
```

Expected: fetches 4 pages from qllr.xyz/ratings/ctf/, reports "Matched: N, Updated: N" at the end. If it says "Have qllr* but missing from this QLLR fetch" for a few players, they're inactive — re-run with `--include-inactive` if M wants them too.

```powershell
node scripts/update-hoq-ratings.cjs
```

Expected: updates ~130–140 players. The pulled version (post-Mar 2026) handles source and display fields in one pass and uses `yaml-safe-write.cjs` — no separate sync step needed. Most changes will be decimal-precision rounding (e.g. `34.480995` → `34.48`); real rating movements are a few dozen players.

```powershell
node scripts/fetch-season-stats.cjs
```

Expected: fetches from `77.90.2.137:8004/api`. This API has been unreliable — if it returns "Fetched: 0 players, No data: 2289", that's the API being down, NOT a script failure. The existing `season-stats.json` is preserved via merge logic. Don't panic M about it; just note "seasonal API is down, retry later" and proceed.

```powershell
node scripts/fetch-qlrace.cjs
```

Expected: by default only fetches players without an existing `qlrace:` block. For a full refresh, use `node scripts/fetch-qlrace.cjs --force` (takes a few minutes; 3 parallel requests per batch, 1s delay). Rate-limit is deliberate — don't raise it.

### Step 4. Verify scope of changes

Ask M to paste the output of:

```powershell
git status
git diff --stat
```

Sanity-check the list:
- **Expected dirty files**: `src/content/players/*.yaml` (some), `public/data/hoq_ctf.csv`, `public/data/hoq_tdm.csv`, `ctf.json`, `tdm.json`, `public/data/season-stats.json`, maybe `src/data/player-registry.json`.
- **Red flags**: modifications to `.astro` files, `scripts/*.cjs`, `package.json`, anything in `src/pages/`, or binary-file conversions on YAMLs. These mean something went wrong — stop and investigate before committing.

Spot-check one modified YAML to confirm:
- `accuracy_rl`, `accuracy_rg`, `accuracy_lg` are NOT wiped (the March 1 incident pattern)
- Expected rating fields updated, nothing else touched

```powershell
git diff src/content/players/stripy.yaml | Select-Object -First 60
```

### Step 5. Hand-off to commit

Draft a commit message in chat for M to paste. Template:

```
Refresh ratings: HoQ ({N1} players) + QLLR ({N2}) + QLRace ({N3}{, --force if applicable})

Co-Authored-By: Claude <noreply@anthropic.com>
```

Then give the commit + push commands:

```powershell
git add src/content/players/ public/data/ ctf.json tdm.json
git commit -m "<message>"
git push
```

**Never run these automatically.** M commits and pushes himself — CLAUDE.md requires explicit approval, and the production site deploys straight from `main`.

After M pushes, tell him to watch `https://github.com/stripyq/quakesettings/actions` for the green build (60–90s).

## Hard rules — learned from production incidents

1. **Never overwrite `accuracy_rg` / `accuracy_lg` / `accuracy_rl`.** The March 1, 2026 incident wiped these for ~54 players when a rating-refresh script didn't null-guard. Rating refresh and accuracy refresh are separate operations. This skill never runs the accuracy fetcher (`scripts/fetch-hoq-stats.cjs`).
2. **Null-safe comparisons.** A legit rating of 0 exists. Never use `||` or `!val` as a presence check; use `??` or `== null`.
3. **HoQ API responses are wrapped.** `{ ok: true, response: [...] }` — scripts unwrap `.response`. If you're writing a new fetch path, remember this.
4. **Match by steamId first, nickname second.** The YAML registry uses custom nicknames that diverge from API names (e.g. "zoza" vs "zozo").
5. **Never commit or push without explicit user approval.** GitHub Pages deploys straight from main. A bad commit ships immediately.
6. **Map casing is inconsistent.** `q3wcp9` vs `Q3WCP9` — handle both when doing map-keyed lookups.
7. **Preserve `published` on updates.** New player files default to `published: false`; existing values must never be clobbered.

## When the user wants something slightly different

- **"Only QLLR"** or **"only HoQ"** — skip the others. The scripts are fully independent except that `update-hoq-ratings.cjs` uses the CSVs in `public/data/` as a fallback, so if M runs it without a fresh fetch, it'll use stale CSVs.
- **"Also refresh accuracies"** — that's the fetch-hoq-stats.cjs flow, deliberately NOT part of this skill. Run it separately, after the rating refresh, and confirm with M first.
- **"Set up a scheduled weekly run"** — possible via the scheduled-tasks MCP, but only after the seasonal API stabilizes. Don't commit M to a cron while one of the sources is flaky.

## If the user asks for a dry-run

All four scripts support some form of preview:

- `fetch-qllr-ratings.cjs --dry-run` — prints the updates it would make without writing YAMLs
- `update-hoq-ratings.cjs` — the pulled version prints every change in the log; inspect first, then rerun to write (older versions required `--dry-run`; check the script header)
- `fetch-season-stats.cjs` — no dry-run; it always writes the JSON
- `fetch-qlrace.cjs --dry-run` — prints the YAML block it would add per player

Offer dry-runs unsolicited if M seems nervous or if the session started after a long gap (state drift likely).

## Path note

The repo is at `C:\Users\marin\quakesettings`, not `C:\Users\m\quakesettings`. The starter doc `claude-code-quakesettings-starter.md` in the repo root still has the wrong path — fix it next time it comes up.
