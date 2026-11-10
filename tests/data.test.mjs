// Data integrity: the snapshot the site ships must be internally consistent, and logos must match clubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { table } from '../js/models/standings.js';

const root = new URL('../', import.meta.url), read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const reg = read('data/registry.json');

test('registry: 96 clubs in five leagues, unique ids and codes, one logo file each', () => {
  const clubs = Object.values(reg.clubs); assert.equal(clubs.length, 96);
  assert.deepEqual(reg.leagues.map((l) => clubs.filter((c) => c.league === l.id).length), [20, 20, 20, 18, 18]);
  assert.equal(new Set(clubs.map((c) => c.id)).size, 96); assert.equal(new Set(clubs.map((c) => c.logo)).size, 96, 'no two clubs share a logo file');
  for (const c of clubs) { assert.ok(existsSync(new URL(c.logo, root)), c.logo); assert.equal(c.logo, `assets/logos/${c.league}/${c.id}.webp`); assert.ok(c.logoW > 40 && c.logoH > 40); assert.match(c.colors[0], /^#[0-9A-F]{6}$/); assert.ok(c.name && c.short && c.tla && c.ground); }
  for (const l of reg.leagues) assert.equal(new Set(clubs.filter((c) => c.league === l.id).map((c) => c.tla)).size, clubs.filter((c) => c.league === l.id).length, 'codes unique inside ' + l.id);
  const logoFiles = reg.leagues.flatMap((l) => readdirSync(new URL(`assets/logos/${l.id}/`, root)).map((f) => `${l.id}/${f}`)); assert.equal(logoFiles.length, 96, 'no orphan logo files');
});
test('2026/27 participants come from the season data and all have a curated club', () => {
  for (const l of reg.leagues) { const s = read(`data/leagues/${l.id}/2026-27.json`); assert.equal(s.teams.length, l.id === 'ger.1' || l.id === 'fra.1' ? 18 : 20); for (const t of s.teams) assert.equal(reg.clubs[t]?.league, l.id, `${t} in ${l.id}`); }
});
test('season files: valid indexes, complete round-robins, plausible scores, no invented results', () => {
  for (const l of reg.leagues) for (const meta of l.seasons) {
    const s = read(`data/leagues/${l.id}/${meta.season}.json`), n = s.teams.length; assert.equal(new Set(s.teams).size, n);
    let played = 0; for (const m of s.matches) { assert.ok(m[3] >= 0 && m[3] < n && m[4] >= 0 && m[4] < n && m[3] !== m[4]); assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/); if (m[5] != null) { played++; assert.ok(Number.isInteger(m[5]) && Number.isInteger(m[6]) && m[5] >= 0 && m[6] >= 0 && m[5] < 15 && m[6] < 15); if (m[7] != null) assert.ok(m[7] <= m[5] && m[8] <= m[6], 'half-time cannot exceed full-time'); } else assert.equal(m[6], null); }
    assert.equal(played, s.played); assert.ok(s.matches.length <= n * (n - 1)); if (meta.season === '2026-27') { assert.equal(s.matches.length, n * (n - 1)); assert.ok(s.matches.filter((m) => m[1] > s.lastResult).every((m) => m[5] == null), 'nothing is "played" after the snapshot date'); }
    const t = table(s); assert.equal(t.reduce((a, r) => a + r.gf, 0), t.reduce((a, r) => a + r.ga, 0)); assert.equal(t.reduce((a, r) => a + r.w, 0), t.reduce((a, r) => a + r.l, 0));
  }
});
test('World Cup archive: 23 editions, known champions, complete 2026 bracket', () => {
  const idx = read('data/tournaments/worldcup/index.json'); assert.equal(idx.editions.length, 23);
  const champ = Object.fromEntries(idx.editions.map((e) => [e.year, e.champion])); assert.equal(champ[1930], 'Uruguay'); assert.equal(champ[1950], 'Uruguay'); assert.equal(champ[1966], 'England'); assert.equal(champ[1998], 'France'); assert.equal(champ[2010], 'Spain'); assert.equal(champ[2022], 'Argentina');
  const wc = read('data/tournaments/worldcup/2026.json'); assert.equal(wc.matches.length, 104); assert.equal(new Set(wc.matches.flatMap((m) => [m.team1, m.team2])).size, 48); assert.equal(new Set(wc.matches.filter((m) => m.group).map((m) => m.group)).size, 12);
  assert.equal(wc.scorers.reduce((a, s) => a + s.goals, 0) + wc.matches.flatMap((m) => [...(m.goals1 || []), ...(m.goals2 || [])]).filter((g) => g.owngoal).length, idx.editions.at(-1).goals, 'every goal has a scorer');
  for (const n of new Set(wc.matches.flatMap((m) => [m.team1, m.team2]))) assert.ok(n in reg.flags, 'flag mapping for ' + n);
});
test('StatsBomb match files: score equals goal events, line-ups of eleven, stats add up', () => {
  for (const comp of ['wc2022', 'euro2024', 'copa2024']) { const idx = read(`data/sb/${comp}/index.json`); assert.equal(idx.matches.length, { wc2022: 64, euro2024: 51, copa2024: 32 }[comp]);
    for (const h of idx.matches) { const m = read(`data/sb/matches/${h.id}.json`); for (const s of [0, 1]) { assert.equal(m.events.filter((e) => (e.t === 'goal' || e.t === 'own') && e.side === s).length, [m.home.score, m.away.score][s], `${h.id} goals side ${s}`); assert.equal(m.lineups[s].players.filter((p) => p.start).length, 11); assert.ok(m.stats[s].sot <= m.stats[s].shots); }
      assert.ok(Math.abs(m.stats[0].poss + m.stats[1].poss - 100) < 0.2); assert.equal(m.shots.length, m.stats[0].shots + m.stats[1].shots); for (const sh of m.shots) assert.ok(sh[3] >= 0 && sh[3] <= 120 && sh[4] >= 0 && sh[4] <= 80 && sh[5] >= 0 && sh[5] <= 1); assert.ok(reg.flags[m.home.name] !== undefined && reg.flags[m.away.name] !== undefined, 'flags for ' + m.home.name + ' / ' + m.away.name); } }
});
test('player files: totals are consistent', () => {
  for (const comp of ['wc2022', 'euro2024', 'copa2024']) for (const p of read(`data/sb/${comp}/players.json`).players) { assert.ok(p.min > 0 && p.mp >= p.st); assert.ok(p.pc <= p.pa && p.sot <= p.sh && p.g <= p.sh + 1 && p.npg === p.g - p.pk && p.tklw <= p.tkl && p.drc <= p.dra); assert.ok(['GK', 'DF', 'MF', 'FW'].includes(p.pos)); assert.ok(p.xg >= 0 && p.npxg <= p.xg + 1e-6); }
  const top = read('data/sb/wc2022/players.json').players[0]; assert.equal(top.n, 'Kylian Mbappé'); assert.equal(top.g, 8);
});
test('model artefact covers every current club and nation ratings are plausible', () => {
  const st = read('data/models/state.json'); for (const id of Object.keys(reg.clubs)) { const c = st.clubs[id]; assert.ok(c && c.elo > 1100 && c.elo < 2200 && c.recent.length > 0, id); assert.equal(c.league, reg.clubs[id].league); }
  assert.equal(st.featureNames.length, 10); assert.equal(st.params.logistic.W.length, 3); assert.ok(st.params.gbt.trees.length > 50); const w = Object.values(st.params.ensemble); assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-3 && w.every((v) => v >= 0));
  assert.ok(st.nations.Spain && st.nations.Argentina && st.nations.France); assert.ok(st.asOf <= new Date().toISOString().slice(0, 10));
});
