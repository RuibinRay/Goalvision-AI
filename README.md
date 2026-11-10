# GOALVISION AI — Beyond the Final Whistle

*Every match has a story. Every statistic reveals another chapter.*

An interactive football intelligence platform: a cinematic Three.js/GSAP homepage, 96 club dashboards across five leagues, a live match centre, a tactics lab built on real event data, a player database, six backtested prediction models, a 25-lesson analytics course and a football time machine.

**Live site:** https://ruibinray.github.io/Goalvision-AI/ · **Source:** https://github.com/RuibinRay/Goalvision-AI

**Independent educational and data-science portfolio project. Not affiliated with FIFA, UEFA, any league or any club. Forecasts are statistical estimates, never guarantees, and not betting advice.**

## What is inside

| Area | Route | Highlights |
|---|---|---|
| Home | `#/` | Two players face off over a procedural floodlit stadium. Five scroll chapters: floodlights → tale of the tape → 3D football and forecast → aerial view with real passing networks → the pitch becomes a map of 13 competitions. Small windows get a lighter version (entrances, a slowly drifting 3D backdrop, blocks that fade in on scroll). With reduced motion the page is static and offers a "Turn animations on" switch. |
| Live | `#/live`, `#/match/…` | Date navigator and league filter; match dashboard with line-ups on a pitch, event timeline, statistics, shot map, xG race, momentum, in-play win probability and a minute-by-minute replay for 147 matches with full event data. |
| Leagues | `#/leagues`, `#/league/eng.1`, `#/ucl`, `#/worldcup/2026` | Sortable tables (overall / home / away, season / last 5 / last 10), fixtures by matchday, leaders, season race; the 36-club Champions League league phase with play-offs and bracket; every World Cup 1930 → 2026. |
| Clubs | `#/clubs`, `#/club/arsenal` | Season line, percentile radar, rolling form, home v away, league-relative ranks, goals by half, 17 seasons of history and Elo, next fixtures with forecasts. |
| Players | `#/players`, `#/player/wc2022/5503` | 1,500 player-tournaments: totals or per 90, minutes floor, position-aware radar against peers, shot maps, match logs, similar players. |
| Predictions | `#/predictions` | The Prediction Lab: Poisson, Dixon-Coles, Elo, multinomial logistic, gradient-boosted trees and an ensemble; score matrix, Monte Carlo, feature contributions, what-if simulator, full validation report. |
| Compare | `#/compare` | The Rivalry Lab: club v club, player v player, nation v nation, with sample-size and competition caveats. |
| Tactics Lab | `#/tactics` | Nine real-data pitch layers per match (passing network, shape, shots, heat maps, pressing, progression, zones) and a draggable formation board with shareable links. |
| Data Lab | `#/datalab` | Build-your-own charts with CSV export, similarity engine (k-means + PCA), transparent Elo rankings, a data-grounded assistant. |
| Learn | `#/learn` | 25 lessons, each with a plain explanation, formula, worked example, interactive tool, limits and a quiz. |
| History | `#/history` | Rewind any season to any matchday, club journeys, rivalries, league eras. |
| My Dashboard | `#/dashboard` | Favourites, watch list, saved comparisons, theme and motion preferences, data connection. Stored locally. |

## DEMO mode and LIVE mode

The site is static, so it can never hold an API key. It therefore ships in **DEMO** mode on a dated snapshot and labels itself as such. Nothing in DEMO mode is presented as live, and anything a source does not provide is shown as *Not available* instead of being estimated.

| | DEMO (this repository) | LIVE (after deploying `backend/worker`) |
|---|---|---|
| League tables, fixtures, results | openfootball snapshot (results to 20 Sep 2026 at build time) | current, from the provider |
| Live scores, clocks, events | not available; past-dated fixtures show "result pending" | scores and match status at the provider's refresh cadence, last refresh time shown; goals, cards and line-ups only on provider plans that include them |
| Line-ups, timelines, match statistics | 147 international matches (StatsBomb Open Data) | per provider plan |
| Squads, managers, top scorers, Champions League 2026/27 | not available | yes |

Switch to LIVE by setting `backend` in [js/core/config.js](js/core/config.js), or per browser under **My Dashboard → Data connection**. In LIVE mode the current season of each league is loaded from the backend in the same file shape as the snapshot, so every table, fixture list and club page updates without a rebuild. The site only reports LIVE once that backend answers and says it has a provider key; if it is unreachable or has no key yet, the site stays in DEMO and the status chip says why.

## Data sources

| Source | Used for | Licence |
|---|---|---|
| [openfootball](https://github.com/openfootball) `football.json`, `worldcup.json`, `champions-league` | League fixtures and results 2010/11 → 2026/27, World Cups 1930 → 2026, Champions League 2025/26 | CC0 / public domain |
| [StatsBomb Open Data](https://github.com/statsbomb/open-data) | Event data: World Cup 2022, Euro 2024, Copa América 2024 | StatsBomb public data agreement: free for non-commercial use with attribution |
| [TheSportsDB](https://www.thesportsdb.com) | Player cut-outs and bios (eight bundled, the rest fetched in the browser) | Community artwork; check their terms before any commercial use |
| [Flagcdn](https://flagcdn.com) | National flags | Public domain artwork |
| Club crests | Supplied by the project owner, sliced by `scripts/slice_logos.py` | Trademarks of their owners, shown for identification only |

Live providers supported by the backend: [football-data.org](https://www.football-data.org/) (free tier covers the five leagues, Champions League, World Cup and Euros at 10 requests a minute) and [API-Football](https://www.api-football.com/) (line-ups, events, statistics; its free plan is limited to 100 requests a day and to past seasons).

## Prediction models and validation

All models are trained and validated by `scripts/train_models.mjs` with the same JavaScript modules the browser runs.

* Matches are replayed in date order; every rating and feature is read **before** kick-off.
* Walk-forward: each season is forecast by models fitted on earlier seasons only. Ensemble weights come from earlier out-of-sample forecasts.
* Hyper-parameters were chosen on 2012/13 → 2015/16, before the reported window.

Out-of-sample results, 2016/17 → 2026/27, 18,166 matches, five leagues:

| Model | Log loss | Brier | Accuracy |
|---|---|---|---|
| **Ensemble** | **0.9821** | 0.5848 | 53.0% |
| Multinomial logistic | 0.9832 | 0.5854 | 53.0% |
| Dixon-Coles | 0.9836 | 0.5856 | 53.1% |
| Elo + ordered logit | 0.9839 | 0.5860 | 52.8% |
| Poisson | 0.9842 | 0.5860 | 53.1% |
| Gradient-boosted trees | 0.9904 | 0.5896 | 52.6% |
| Baseline: historical outcome rates | 1.0711 | 0.6479 | 44.1% |
| Baseline: one third each | 1.0986 | 0.6667 | 44.1% |

The live figures are in `data/models/eval.json` and on the Validation tab, with calibration, by-season and by-league breakdowns. National-team and cross-league forecasts are rating-only and are not part of this validation; the UI says so.

Model 5 is XGBoost's objective implemented in JavaScript. `backend/ml/train_xgboost.py` trains the same model with the XGBoost library and writes the same JSON format; it was not run in the environment that produced the bundled artefacts, so run it and read its report before relying on it.

## Architecture

```
openfootball ─┐                                            ┌─ GitHub Pages: index.html + ES modules (no build step)
StatsBomb    ─┼─► scripts/ (build_data, build_statsbomb) ─► data/*.json ─┤
logos        ─┘     scripts/train_models.mjs ─► data/models/*.json       └─ js/models/* run the same maths in the browser

football-data.org / API-Football ─► backend/worker (key in env, cache, rate limit, retry, validate) ─► js/services/live.js
```

* **Frontend**: HTML, CSS and JavaScript ES modules, Three.js, GSAP ScrollTrigger and Apache ECharts from a pinned import map, SVG for pitches. Hash routing works on GitHub Pages and every filter is a deep link.
* **Canonical ids**: `scripts/registry.py` gives each club one id and an alias list. Every provider name resolves through it, so a crest cannot be attached to the wrong club. Season participants come from the season file, so promotion and relegation need no code change.
* **Backend**: a Cloudflare Worker. Visitors share one cached upstream response; stale data is served and labelled when a provider is down.

```
index.html, 404.html     app shell and GitHub Pages fallback
css/                     base (tokens), components, home, views
js/app.js                routes
js/core/                 router, store (data access + preferences), dom helpers, config
js/models/               poisson, elo, learners, features, predict, standings, playerMetrics, assistant
js/charts/               ECharts wrappers, SVG pitch
js/scenes/stadium.js     procedural Three.js stadium and football
js/services/             live client, provider adapters
js/views/                one module per page
data/                    registry, leagues, tournaments, sb (event data), models
scripts/                 data pipeline and model training
backend/worker/          Cloudflare Worker   backend/ml/  optional XGBoost trainer
tests/                   node --test suites
```

## Run it

```bash
python3 -m http.server 8777
```

Then open http://localhost:8777. The site needs a static server because it loads JSON and ES modules.

```bash
node --test tests/*.test.mjs
```

43 tests: prediction maths, provider adapters, data integrity (logos, fixtures, event files) and the backend with a mocked provider.

## Refresh the data

```bash
# 1. download the open datasets into a scratch folder (see the URL lists at the top of each script)
python3 -I scripts/build_data.py <raw-dir> .                    # leagues, World Cups, Champions League, registry
python3 -I scripts/build_statsbomb.py <raw-dir>/statsbomb .      # matches, players, shots
node scripts/train_models.mjs                                   # about one minute: models + validation report
node scripts/train_xg.mjs                                       # teaching xG model for the Learn section
```

## Deploy

1. Push to GitHub and enable Pages with the **GitHub Actions** source. `.github/workflows/pages.yml` runs the tests, then publishes the folder.
2. Optional live data: follow [backend/worker/README.md](backend/worker/README.md), then set the worker URL in `js/core/config.js`.

## Known limits

* Club-season possession, passing, shots and xG need a licensed event feed and are shown as not available.
* Open event data has no player tracking: tactical views use on-ball events only.
* The league snapshot is as fresh as the open archive it was built from. Rebuild it or connect the backend for current data.
* In LIVE mode the current season's tables, fixtures and club pages run on the provider's results, but forecast ratings are still the ones trained offline by `scripts/train_models.mjs`; every forecast states the date its ratings run to.
* football-data.org's free plan has no goalscorers, cards, line-ups or match statistics, so those parts of a live match page read *Not available*.
* VAR decisions and post-shot xG are not in StatsBomb Open Data.
