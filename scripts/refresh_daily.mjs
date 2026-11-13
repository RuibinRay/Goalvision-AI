/**
 * Daily refresh of the bundled data.   node scripts/refresh_daily.mjs
 *
 * What it keeps current
 *   data/leagues/<league>/<current season>.json   the snapshot the site falls back to, and the input to model training
 *   data/registry.json                            the season summary (matches, played, last result) and the build stamp
 *   data/refresh.json                             a record of this run: what was checked, what changed, what was refused
 * The forecast ratings are rebuilt from those files by scripts/train_models.mjs, which the workflow runs next.
 *
 * Source: the project's own backend (`/v1/season`), which holds the provider key and returns a whole league season in
 * the snapshot's file shape, with every club already resolved to a canonical id. No key is needed here.
 *
 * Safeguards: a season is written only if it passes checkSeason() — the right clubs, the right number of fixtures,
 * well-formed rows, no result dated in the future and no fewer results than the file it replaces. A league that fails
 * keeps its existing file and is reported; the run fails only if every league fails.
 *
 * Environment: GV_BACKEND overrides the backend URL from js/core/config.js.
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COLS = ['md', 'date', 'time', 'home', 'away', 'hg', 'ag', 'hth', 'hta'];
const SOURCE = { source: 'football-data.org (daily, via the GOALVISION backend)', sourceUrl: 'https://www.football-data.org/' };
const isInt = (v) => Number.isInteger(v) && v >= 0;

/**
 * Decide whether `next` (a season from the backend) may replace `prev` (the bundled file).
 * Returns a list of problems; empty means it is safe to write.
 */
export function checkSeason(next, prev, clubIds, today = new Date().toISOString().slice(0, 10)) {
  const bad = [];
  if (!next || !Array.isArray(next.teams) || !Array.isArray(next.matches)) return ['the backend did not return a season'];
  const n = clubIds.length, want = new Set(clubIds), got = new Set(next.teams);
  if (next.teams.length !== n || got.size !== n || [...want].some((id) => !got.has(id))) bad.push(`clubs do not match the registry (expected ${n}, got ${next.teams.length}: ${[...got].filter((id) => !want.has(id)).join(', ') || 'same count, different clubs'})`);
  if (next.matches.length !== n * (n - 1)) bad.push(`expected ${n * (n - 1)} fixtures, got ${next.matches.length}`);
  const pairs = new Set(); let played = 0, last = null;
  for (const m of next.matches) {
    const ok = Array.isArray(m) && m.length === 9 && isInt(m[0]) && /^\d{4}-\d{2}-\d{2}$/.test(m[1] || '') && (m[2] === null || /^\d{2}:\d{2}$/.test(m[2])) && isInt(m[3]) && isInt(m[4]) && m[3] < n && m[4] < n && m[3] !== m[4];
    if (!ok) { bad.push(`malformed row ${JSON.stringify(m).slice(0, 80)}`); break; }
    const done = m[5] !== null || m[6] !== null;
    if (done && !(isInt(m[5]) && isInt(m[6]) && (m[7] === null ? m[8] === null : isInt(m[7]) && isInt(m[8]) && m[7] <= m[5] && m[8] <= m[6]))) { bad.push(`bad score in ${JSON.stringify(m)}`); break; }
    if (!done && (m[7] !== null || m[8] !== null)) { bad.push(`half-time score without a result in ${JSON.stringify(m)}`); break; }
    if (done) { played++; if (m[1] > today) { bad.push(`a result dated in the future (${m[1]})`); break; } if (!last || m[1] > last) last = m[1]; }
    const key = m[3] + '>' + m[4]; if (pairs.has(key)) { bad.push(`the same fixture twice (${next.teams[m[3]]} v ${next.teams[m[4]]})`); break; } pairs.add(key);
  }
  if (prev && played < prev.played) bad.push(`fewer results than the current file (${played} < ${prev.played})`);
  if (prev && prev.lastResult && last && last < prev.lastResult) bad.push(`older results than the current file (${last} < ${prev.lastResult})`);
  return bad;
}
/** The season as it is stored: the snapshot's keys in the snapshot's order, nothing transient from the backend. */
export function toSnapshot(next, league, season) {
  const done = next.matches.filter((m) => m[5] !== null);
  return { league, season, ...SOURCE, fetchedAt: next.fetchedAt, lastResult: done.map((m) => m[1]).sort().at(-1) ?? null, played: done.length, teams: next.teams, cols: COLS, matches: next.matches };
}
/** Did anything a reader could see change? (fixtures, kick-off times or results; the fetch time alone does not count) */
export const sameData = (a, b) => !!a && !!b && JSON.stringify([a.teams, a.matches]) === JSON.stringify([b.teams, b.matches]);

/** One league season from the backend. The backend may answer with its previous copy while it refreshes, so ask again until the copy is recent. */
async function fetchSeason(backend, league, { tries = 6, gapMs = 20000, freshMs = 3 * 3600e3, usableMs = 36 * 3600e3 } = {}) {
  let best = null, error = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${backend}/v1/season?competition=${encodeURIComponent(league)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(40000) });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
      best = body; const age = Date.now() - Date.parse(body.fetchedAt);
      if (age < freshMs && !body.stale) return { season: body, age };
    } catch (e) { error = e.message; }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, gapMs));
  }
  if (best && Date.now() - Date.parse(best.fetchedAt) < usableMs) return { season: best, age: Date.now() - Date.parse(best.fetchedAt), note: 'the backend could not refresh; using its most recent copy' };
  throw new Error(error || 'the backend only has an old copy');
}

async function main() {
  const { CONFIG } = await import('../js/core/config.js');
  const backend = (process.env.GV_BACKEND || CONFIG.backend || '').replace(/\/+$/, '');
  if (!backend) throw new Error('No backend URL: set `backend` in js/core/config.js or GV_BACKEND');
  const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8')), write = (p, v) => writeFileSync(join(ROOT, p), JSON.stringify(v));
  const registry = read('data/registry.json'), season = registry.season, now = new Date().toISOString().replace(/\.\d+Z$/, 'Z'), report = [];
  for (const lg of registry.leagues) {
    const file = `data/leagues/${lg.id}/${season}.json`, prev = read(file), clubIds = Object.values(registry.clubs).filter((c) => c.league === lg.id).map((c) => c.id), row = { league: lg.id, status: 'unchanged', played: prev.played, lastResult: prev.lastResult };
    try {
      const { season: next, note } = await fetchSeason(backend, lg.id), problems = checkSeason(next, prev, clubIds);
      if (problems.length) { row.status = 'refused'; row.problems = problems; }
      else {
        const snap = toSnapshot(next, lg.id, season);
        if (!sameData(prev, snap)) {
          write(file, snap); row.status = 'updated'; row.newResults = snap.played - prev.played; row.played = snap.played; row.lastResult = snap.lastResult;
          const entry = lg.seasons.find((s) => s.season === season); if (entry) Object.assign(entry, { matches: snap.matches.length, played: snap.played, lastResult: snap.lastResult, teams: snap.teams.length });
        }
        row.sourceFetchedAt = next.fetchedAt; if (note) row.note = note;
      }
    } catch (e) { row.status = 'failed'; row.error = e.message; }
    report.push(row);
    console.log(`${lg.id.padEnd(6)} ${row.status.padEnd(9)} ${row.played} played, results to ${row.lastResult}${row.newResults ? `, +${row.newResults} new` : ''}${row.problems ? ' | ' + row.problems.join('; ') : ''}${row.error ? ' | ' + row.error : ''}${row.note ? ' | ' + row.note : ''}`);
  }
  const changed = report.some((r) => r.status === 'updated'), ok = report.filter((r) => r.status === 'updated' || r.status === 'unchanged').length;
  registry.generatedAt = now;
  if (!registry.sources.some((s) => s.id === 'football-data')) registry.sources.push({ id: 'football-data', name: 'football-data.org (current-season results, refreshed daily through the project backend)', license: 'football-data.org terms of use', url: 'https://www.football-data.org/' });
  write('data/registry.json', registry);
  write('data/refresh.json', { checkedAt: now, backend, season, changed, leagues: report });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);      // the workflow retrains only when results changed
  console.log(`${ok} of ${report.length} leagues checked; ${changed ? 'results changed, ratings need retraining' : 'no new results'}.`);
  if (!ok) { console.error('Every league failed: nothing was refreshed.'); process.exit(1); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
