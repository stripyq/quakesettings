# Claude Code — quakesettings starter prompt

Drop-in prompts for starting any Claude Code session on the Quake Live settings database.

Repo lives at: `C:\Users\m\quakesettings`  
Live site: https://stripyq.github.io/quakesettings/  
GitHub: https://github.com/stripyq/quakesettings

---

## 1. CONTEXT BLOCK — paste at the start of every session

```
You are working on the Quake Live player settings database at C:\Users\m\quakesettings.
Repo: stripyq/quakesettings on GitHub. Deployed via GitHub Pages from main branch.

TECH STACK
- Astro static site generator
- Individual YAML files per player in src/content/players/
- Node.js scripts in scripts/ (.cjs files)
- Dependencies: js-yaml, csv-parse
- No TypeScript, plain JS

KEY DATA SOURCES
- HoQ rating API (primary): http://88.214.20.58/export_rating/ctf.json
- HoQ rating API (TDM):     http://88.214.20.58/export_rating/tdm.json
- HoQ per-player pages:     http://88.214.20.58/player/{steamId}
- HoQ match history:        http://88.214.20.58/matches/ctf/
- HoQ season tracker:       http://77.90.2.137:8004/api/
- QLStats, QLRace.com (external)

KEY SCRIPTS (always read them before modifying data flow)
- scripts/update-hoq-ratings.cjs   — pulls bulk JSON, updates hoqCtfRating/hoqCtfGames
- scripts/sync-hoq-to-display.cjs  — copies hoqCtfRating → ctfRating (display layer)
- scripts/fetch-hoq-stats.cjs      — per-player scrape: accuracies, favorites
- scripts/fetch-season-stats.cjs   — seasonal rating/games
- scripts/yaml-safe-write.cjs      — the ONLY safe way to write YAMLs

CRITICAL ARCHITECTURE RULE
- hoqCtfRating / hoqCtfGames = source of truth (from HoQ API)
- ctfRating   / ctfGames     = display fields (what the site reads)
- After ANY rating update, run sync-hoq-to-display.cjs or the site shows stale data.

HARD RULES (learned from production incidents)
1. NEVER overwrite existing non-blank fields with blank values on YAML updates.
2. NEVER overwrite accuracy_rg / accuracy_lg / accuracy_rl — the March 1 incident
   wiped these for ~54 players. Rating refresh and accuracy refresh are SEPARATE steps.
3. Preserve `published` and rating fields on updates. New files default published: false.
4. HoQ API responses are wrapped: { ok: true, response: [...] } — unwrap .response.
5. HoQ pagination uses `skip`, not `offset`.
6. Map names have inconsistent casing (q3wcp9 vs Q3WCP9) — handle both.
7. Match players by steamId FIRST, then nickname.
8. Steam IDs in CSVs lose float precision — always verify large integer IDs.
9. Use null-safe operators (??, == null) in templates. NEVER || or !val — a legit
   rating of 0 gets suppressed by falsy guards.
10. Custom nicknames in the player registry override API names (e.g. "zoza" not "zozo").

SCOPE DISCIPLINE
- Only touch files explicitly specified in the task.
- Do NOT run unsolicited builds, commits, or git pushes.
- Do NOT push directly to main — push to a feature branch, I'll merge manually.
- If something looks wrong but is out of scope, flag it, don't fix it.
```

---

## 2. TASK RECIPE — Refresh HoQ ratings (the standard routine)

```
Refresh HoQ ratings for all players. [Context block above applies.]

STEPS
1. Fetch http://88.214.20.58/export_rating/ctf.json
   Fetch http://88.214.20.58/export_rating/tdm.json
   Unwrap the .response array from each.

2. For each YAML in src/content/players/ that has a steamId:
   - Look up steamId in CTF data → update hoqCtfRating, hoqCtfGames IF changed
   - Look up steamId in TDM data → update hoqTdmRating, hoqTdmGames IF changed
   - Do NOT touch accuracy_rg, accuracy_lg, accuracy_rl
   - Do NOT touch any other field
   - Use yaml-safe-write.cjs for all writes

3. Run: node scripts/sync-hoq-to-display.cjs
   (copies hoq* → display fields so the site actually shows the updated values)

4. Print a report:
   - Total players scanned
   - Ratings updated (with before → after for each)
   - Any steamIds not found in HoQ data
   - Any errors

5. Do NOT build. Do NOT commit. Do NOT push.
   Stop and wait for my confirmation before any git operations.
```

---

## 3. TASK RECIPE — Process new player submissions

```
Process N new player submissions. [Context block above applies.]

For each submission:

1. MATCH against existing players:
   - First try steamId exact match
   - Then try nickname case-insensitive match
   - Log the decision: MATCHED (update) or NEW (create)

2. If MATCHED (update existing YAML):
   - Preserve existing: published, hoqCtfRating, hoqCtfGames, hoqTdmRating,
     hoqTdmGames, accuracy_rg, accuracy_lg, accuracy_rl
   - Only update fields the submission explicitly provides non-blank values for
   - Never blank out an existing field

3. If NEW (create YAML):
   - Use schema matching existing files (check any file in src/content/players/)
   - Set published: false
   - Add inline # comments on fields the submission didn't provide
   - Field names: hoqCtfRating NOT ctfRating, hoqCtfGames NOT ctfGames

4. After all submissions processed:
   - Run: node scripts/sync-hoq-to-display.cjs
   - Report: list of matched updates, list of new files, any conflicts

5. Do NOT build. Do NOT commit. Do NOT push. Wait for confirmation.
```

---

## 4. TASK RECIPE — Fetch accuracies & favorites (separate from ratings)

```
Refresh weapon accuracies and favorites for all players. [Context block above applies.]

This is a SEPARATE operation from rating refresh. Do not combine them.

1. Run: node scripts/fetch-hoq-stats.cjs
   - Scrapes http://88.214.20.58/player/{steamId} for each player
   - Updates: accuracy_rg, accuracy_lg, accuracy_rl, favorite weapon/map/mode
   - 1.5s delay between requests (do not modify)

2. Report what changed.

3. Do NOT touch rating fields. Do NOT build/commit/push.
```

---

## 5. TASK RECIPE — Data integrity check

```
Audit player data integrity. [Context block above applies.]

CHECKS TO RUN

1. SteamID validity:
   - For every YAML with a steamId, verify it appears in HoQ ctf.json OR tdm.json
   - Flag any steamId that exists in no HoQ dataset
   - Flag any obvious typos (steamIds differing from a known-good one by 1-2 digits
     where the player's nickname is similar to another entry)

2. Field name consistency:
   - Flag any file using ctfRating/ctfGames/ctfRatingUpdated WITHOUT the hoq* prefix
     (these are legacy/wrong names from before the display/source split)

3. Sync drift:
   - Flag any file where hoqCtfRating differs from ctfRating (sync script not run)
   - Same for TDM

4. Missing display fields:
   - Flag any file with hoqCtfRating but NO ctfRating (sync script never ran)

Output a table. Do NOT fix anything — just report.
```

---

## Notes on workflow

- **Feature branches:** Claude Code pushes to feature branches (it lacks main push rights). Merge manually via `git merge -X theirs origin/<branch>` or GitHub web editor. PowerShell is your main local shell.
- **Verification:** After Claude Code claims success, spot-check in PowerShell:
  ```powershell
  cat src/content/players/<name>.yaml
  ```
- **Don't trust a clean report without verifying** — the March 1 incident reported success while silently wiping data.
