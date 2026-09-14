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
- **`backend/server.js`** is an Express proxy over the Metrix API with a 5-minute in-memory cache, hosted on Railway (deployed separately from the site). Endpoints: `GET /api/competition/:id` (registered names) and `GET /api/competition/:id/results` (`completed`, `crv`, players with rating/throws/dnf).
- **Deploy:** pushing to `main` publishes via GitHub Pages in 1–3 minutes. Pages serves the repo root except dot-folders, so tracked files are public — never commit secrets.

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
- **CRV fallback:** Metrix sometimes returns `HC: null` for every row (Kantola 2026), making the backend's `crv` null. The hand-entered `courseRatingValue` is then used; without it the competition would stay open forever.
- **No open competition:** the "Kausi päättynyt" card appears only once `TOTAL_EVENTS` competitions are over. Before that, the card says the next competition is "Julkaistaan pian".

## Ratings

Resolved newest-first by `lookupPlayerRating`:

1. The running competition's `WeeklyHC` (`liveRatings`)
2. The newest closed competition that has a rating for the player
3. `PLAYER_RATINGS`

Metrix `Rating: 0` means unrated and never overrides a known rating. The owner's rule: always use the rating the latest competition gives.

## Common tasks

### Add a competition

1. Fetch `https://discgolfmetrix.com/api.php?content=result&id=<ID>` and read `Name`, `Date`, `CourseName`, `Tracks` (sum `Par`, count holes) and `Results` (registrants).
2. **Ask the owner for the CRV.** It isn't available from the public API before anyone has played (`content=course` needs an API key); the owner reads it from the Metrix UI, and their values are reliable. Also ask for the city, which the API doesn't return.
3. Add the entry to `COMPETITIONS` in the existing shape (`state`, `id`, `name`, `fullName`, `date`, `course`, `location`, `par`, `holes`, `courseRatingValue`, `registrationEnd`, `url`, `registerUrl`, `registered`).
4. Bump the cache version, run tests, commit, push, verify live.

### Roll over to a new season

1. Freeze the finished season into `COMPETITIONS_<year>` in `data.js`. **Store `hc` and `hcScore` at full precision — never round them.** Rounding to 2 decimals once pushed a score across a .5 boundary and changed two players' season totals; `tests/archive.test.js` guards this.
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
