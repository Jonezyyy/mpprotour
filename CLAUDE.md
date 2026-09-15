# Miesperhe Pro Tour

Handicap disc golf league site at https://mpprotour.fi. Scores come from Disc Golf Metrix; the site ranks players by handicap score and totals season points. Owner: Jonezyyy (repo `Jonezyyy/mpprotour`).

## Architecture

- **Static site, no build step.** Vanilla HTML/CSS/JS with global `<script>` tags, no modules. Don't add build tools, frameworks, TypeScript or a frontend package manager.
- **Pages:** `index.html` is the current season; `2026.html` and `2025.html` are archives. All three load the same `css/style.css`, `js/data.js` and `js/app.js`.
- **`js/data.js`** holds all data:
  - `COMPETITIONS` — the current season only
  - `COMPETITIONS_2026` — frozen final results, the archive's source of truth
  - `STANDINGS_2025_FINAL` + `COMPETITIONS_2025` — 2025 used a different points system, so its stored places are authoritative and per-event points are never shown
  - `PLAYER_RATINGS` — fallback only (see Ratings)
  - `POINTS_TABLE`, `TOTAL_EVENTS`, `RAILWAY_API_URL`
- **`js/app.js`** renders everything. On load, `fetchAllCompetitionResults()` runs first and may close competitions, then renderers run, then live results for the current competition are fetched.
- **`backend/server.js`** is an Express proxy over the Metrix API with a 5-minute in-memory cache, hosted on Railway (project "MP Pro Tour", service `mpprotour`, built from this repo's `main` branch with root `/backend`). Endpoints: `GET /api/competition/:id` (registered names) and `GET /api/competition/:id/results` (`completed`, `crv`, players with rating/throws/dnf, and `layout`: the course's Metrix rating line `{ courseId, layout1000Result, ratingPerThrow }` or `null`, cached 24 h per course).
- **`tools/add-competition.js`** builds a `COMPETITIONS` entry from a Metrix link (see Add a competition).
- **Deploy:** pushing to `main` publishes the site via GitHub Pages in 1–3 minutes **and** triggers a Railway redeploy of the backend. Backend changes must stay compatible with the site running either version during the rollout. Pages serves the repo root except dot-folders, so tracked files are public — never commit secrets.

## Scoring — don't change without the owner's approval

```js
hc      = (1000 - rating) / crv
hcScore = throws - hc
place   = count of players with Math.round(hcScore) < Math.round(own hcScore), + 1
```

- Ties share a place and split the summed `POINTS_TABLE` points; places 16+ score 0. Every event counts; nothing is dropped.
- Always get places and winners through `calcRoundedResults(comp)`. Results fetched from Railway carry no `place`, so `comp.results[0]` is not the winner.
- A player with no rating plays scratch: rating treated as 1000, handicap 0, shown as "Ei ratingia".

## How competitions open and close

`state` in `data.js` is only the starting point; the site changes it in memory at runtime.

- **Current competition** = the earliest non-`over` competition by date. It shows as "Käynnissä" if its state is `active` or Metrix already has scores for it.
- **Closing** (`isReadyToClose`): a competition closes when every registrant has a score **or** its `date` has passed. A closed competition is never reopened.
- **Why not just `completed`:** Metrix adds a `WeeklyHC` row (Rating, HC) for each player as soon as their round is scored, so the backend reports `completed: true` after the very first round. Competitions run for a month.
- **Course CRV:** `courseCrv(comp)` gives the CRV for live handicaps and the live card: the course's Metrix rating line (`layout.ratingPerThrow`, fetched automatically) first, the hand-entered `courseRatingValue` only as a fallback (course not yet rated by Metrix, or backend down). When a competition closes, the CRV Metrix derives from the players' actual handicaps (`crv`) wins; if Metrix returns `HC: null` for every row (Kantola 2026) it falls back to `courseCrv`, so the competition never stays open forever.
- **No open competition:** the "Kausi päättynyt" card appears only once `TOTAL_EVENTS` competitions are over. Before that, the card says the next competition is "Julkaistaan pian".

## Ratings

Resolved newest-first by `lookupPlayerRating`:

1. The running competition's `WeeklyHC` (`liveRatings`)
2. The newest closed competition that has a rating for the player
3. `PLAYER_RATINGS`

Metrix `Rating: 0` means unrated and never overrides a known rating. The owner's rule: always use the rating the latest competition gives.

## Hot rounds

A round is **hot** when it beats the player's rating by at least a threshold that depends on that rating (`hotRoundMinPoints`), judged on the rounded value so the shown number always matches. A flat threshold effectively locked out high-rated players (near-max rating leaves little room to beat it) while over-triggering in the mid ratings, so the threshold is tiered instead:

| Pre-round rating | Threshold |
|---|---|
| 900+ | +30 |
| 800-899 | +40 |
| 700-799 | +50 |
| 0-699 | +60 |

```js
roundRating = 1000 - (throws - layout.layout1000Result) * layout.ratingPerThrow
pointsAbove = roundRating - pre-round rating
```

- **Pre-round rating:** the round's own `WeeklyHC.Rating` on the live card (`liveRatings`), or the row's `rating` in closed results. Never a fallback rating. This is also what selects the tier.
- **No verdict** (`roundRatingInfo` returns `null`) for unrated players, DNFs, or a course without a Metrix rating line. No marker, no error.
- **Shown as** an orange `🔥 +NN` pill after the name (`hotRoundBadge`), with the round rating in the tooltip. It appears on the live card, in closed results and in archives, never in season standings.
- **During the season** verdicts are recomputed from current Metrix data, so a round near its tier's threshold can gain or lose its pill. At rollover they are frozen (see below).

## Common tasks

### Add a competition

1. Run `node tools/add-competition.js <Metrix link or id>`. It fetches everything from Metrix's public APIs (no key) and prints a `COMPETITIONS` entry: name, date, course, par, holes, registrants, city and area (`courses_list`), and CRV (`course_rating_server.php`).
2. Check the printed entry before pasting it into `COMPETITIONS`:
   - **Name:** the tool strips the "MP Pro Tour YYYY –" prefix. Shorten further if the league uses a shorter name (it prints "Sibbe Blue" for Sibbe).
   - **Location:** Metrix's `Area` isn't always the region (Iittala lists "Iittala"). Fix it if needed.
   - **CRV:** only a fallback, since the site uses the live Metrix value. **Ask the owner for the CRV only if the tool reports that the course has no Metrix rating.**
3. Bump the cache version, run tests, commit, push, verify live.

### Roll over to a new season

1. Freeze the finished season into `COMPETITIONS_<year>` in `data.js`. **Store `hc` and `hcScore` at full precision — never round them.** Rounding to 2 decimals once pushed a score across a .5 boundary and changed two players' season totals; `tests/archive.test.js` guards this. **Also store each row's `roundRating` and `pointsAbove` at full precision**, computed from the course's Metrix rating line on the rollover date. Archive pages show hot-round pills only from these frozen fields, and rows without them (2025, 2026) show none.
2. Create `<year>.html` from an existing archive page, rendering with `renderArchiveCompetitions` and a standings renderer.
3. Remove the finished competitions from `COMPETITIONS`.
4. Update `index.html`: title, meta description, nav, hero label, tagline years, section headings, footer status and ticker. Add the new archive link to the nav and footer of every page.

## Commands

```bash
node --test
```

Runs the whole suite with Node's built-in runner (Node 22, zero dependencies). CI runs the same on push and PRs.

```bash
python -m http.server 8000
```

Local preview at http://localhost:8000. It calls the live Railway backend and Metrix, so live data renders locally.

## Conventions

- **Cache busting:** bump `?v=1.0.N` on the CSS and JS references of **every page that loads a changed file** — all three pages load the same assets. If someone reports old numbers after a deploy, it's their cached copy; a hard refresh fixes it.
- **Language:** identifiers in English; code comments and all UI text in Finnish. Commit subject in English, body in Finnish.
- **Git:** commit directly to `main` (that is what deploys). Commit and push only when the owner asks.
- **Tests:** `loadSite()` in `tests/support.js` replaces the whole `COMPETITIONS` array with a synthetic season and fixes "today" (`loadSite({ today })`), so tests never depend on the real season or the run date. Only archive tests use real (frozen) data. Check new behaviour by deliberately breaking it and confirming a test fails.
- **After deploying,** verify on the live site with a cache-busting query, e.g. `curl -s "https://mpprotour.fi/index.html?cb=$RANDOM" | grep -o '?v=1\.0\.[0-9]*'`.

## Environment gotchas

- The repo lives in OneDrive, which has reverted working-tree files to older versions. If `git status` shows changes that delete finished competitions, it's a sync conflict: `git restore` the files.
- `gh` is not installed; use `git` and `curl`.
- Headless Chrome screenshots work through the Bash tool but fail through PowerShell.
- Run Python scripts that edit Finnish text with `PYTHONUTF8=1`.
- `.github/copilot-instructions.md` (Copilot) and `.github/agents/pistelaskenta.agent.md` (scoring agent) are Finnish counterparts of this file. When a rule here changes, update them too so the tools don't drift apart.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default role labels, as `Status:` lines: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
