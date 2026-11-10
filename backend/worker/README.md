# GOALVISION AI data backend

A Cloudflare Worker that sits between the static site and a football data provider.

```
Football API → worker (secure ingestion, cache, rate limit, retry, validation) → GOALVISION frontend
```

The API key lives only in the worker's environment. The browser never sees it, and every visitor shares one cached upstream response.

## Providers

| Provider | Secret | Gives you | Free plan |
|---|---|---|---|
| [football-data.org](https://www.football-data.org/) | `FOOTBALL_DATA_KEY` | Fixtures, live scores, standings, scorers, squads for the five leagues, Champions League, World Cup, Euros | 10 requests a minute; goals, cards and line-ups are on paid tiers |
| [API-Football](https://www.api-football.com/) | `API_FOOTBALL_KEY` | Fixtures with events, line-ups and match statistics for every supported competition | 100 requests a day and past seasons only; the current season needs a paid plan |

Set either or both. When both are set the worker uses API-Football for matches and standings and football-data.org for squads.

## Deploy

```bash
cd backend/worker
npm install
npx wrangler login
npx wrangler secret put FOOTBALL_DATA_KEY
npx wrangler secret put API_FOOTBALL_KEY     # optional
npx wrangler deploy
```

Wrangler prints the worker URL. Put it in `js/core/config.js` (`backend: 'https://…workers.dev'`) for everyone, or paste it under **My Dashboard → Data connection** for one browser.

In `wrangler.toml` set `ALLOWED_ORIGINS` to your site (for example `https://<user>.github.io`) and `SEASON` to the season start year.

Local development: copy `.dev.vars.example` to `.dev.vars`, add keys, run `npx wrangler dev`.

## Routes

| Route | Returns |
|---|---|
| `GET /v1/health` | Which providers are configured, refresh cadence |
| `GET /v1/matches?date=YYYY-MM-DD[&competition=eng.1]` | Normalised matches for a day |
| `GET /v1/match/fd:<id>` or `/v1/match/af:<id>` | One match with events, line-ups and statistics where the plan provides them |
| `GET /v1/standings?competition=ucl` | Normalised table |
| `GET /v1/scorers?competition=eng.1` | Top scorers |
| `GET /v1/club/arsenal` | Coach and squad |

Competition ids are GOALVISION's canonical ids (`eng.1`, `esp.1`, `ita.1`, `ger.1`, `fra.1`, `ucl`, `uel`, `uecl`, `wc`, …) from `data/registry.json`.

Every response carries `provider`, `fetchedAt` (the last successful upstream refresh), `cached`, and `stale: true` when the provider failed and an older copy is being served.

## How it protects the provider and the site

* **Cache**: live matches 30 seconds, match detail 60 seconds, standings 10 minutes, scorers 30 minutes, squads 24 hours.
* **Upstream budget**: at most nine upstream requests a minute per provider, inside football-data.org's free limit.
* **Visitor rate limit**: a token bucket per IP address.
* **Retries**: up to three attempts with exponential back-off on 429 and 5xx, honouring `Retry-After`.
* **Validation**: adapters drop malformed rows and reject payloads in an unexpected shape with a 502 instead of passing them on.
* **Canonical clubs**: provider team names resolve to GOALVISION club ids through the registry aliases; an unknown name resolves to `null`, never to a guess.

The adapters are plain functions in `js/services/adapters.js`, shared with the test suite (`node --test tests/*.test.mjs`).

## Other hosts

The worker uses only `fetch`, `caches.default` and environment variables. To run it on Vercel or Deno Deploy, replace the cache helper with that platform's key-value store.
