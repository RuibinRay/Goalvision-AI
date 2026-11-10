/** MY DASHBOARD: favourites, watch list, saved comparisons, preferences and the data connection. Everything is stored in this browser only. */
import { $, $$, esc, html, fmt, seg, segmented, todayISO, toast, ICON } from '../core/dom.js';
import { getPrefs, setPref, toggleIn, leagues, league, club, allClubs, currentSeasons, modelState, sbPlayers, playerArt, SB_COMPS } from '../core/store.js';
import { setQuery, rerender } from '../core/router.js';
import { crest, flag, formDots, note, tabs, probBar, teamLink } from '../components/ui.js';
import { table, clubFixtures, played } from '../models/standings.js';
import { predictMatch } from '../models/predict.js';
import { backendUrl, backendHealth } from '../services/live.js';
import { CONFIG } from '../core/config.js';
import { applyTheme } from '../components/chrome.js';

export const title = 'My Dashboard';
const COMP = Object.fromEntries(SB_COMPS);
export async function render(el, _p, q) {
  const [seasons, state] = await Promise.all([currentSeasons(), modelState()]), P = getPrefs(), by = Object.fromEntries(seasons.map((s) => [s.league, s]));
  el.innerHTML = html`<div class="container"><header class="page-head"><h1>My dashboard</h1><p class="lead">Your clubs, players, leagues and saved comparisons in one place. Preferences live in this browser only: nothing is sent to a server and there is no account.</p></header>
    <div class="tabs" role="tablist">${[['overview', 'Overview'], ['prefs', 'Preferences'], ['data', 'Data connection']].map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`)}</div>
    <section data-pane="overview" id="ov"></section><section data-pane="prefs" hidden id="pf"></section><section data-pane="data" hidden id="dc"></section></div>`;

  const overview = () => {
    const P = getPrefs(), today = todayISO(), favClubs = P.clubs.filter((id) => !club(id).past), favLeagues = P.leagues.length ? P.leagues : [];
    const clubCard = (id) => { const c = club(id), s = by[c.league], r = table(s).find((x) => x.id === id), nx = clubFixtures(s, id, 3).find((f) => f.date >= today) || clubFixtures(s, id, 1)[0];
      const f = nx ? predictMatch(state, { home: nx.home ? id : nx.opp, away: nx.home ? nx.opp : id, date: nx.date }) : null;
      return `<div class="panel" style="border-top:4px solid ${c.colors[0]}"><div class="row between"><a class="team" href="#/club/${id}" style="font-size:18px">${crest(id, 44)}<span>${esc(c.name)}</span></a><button class="btn sm" data-rm="clubs" data-id="${id}" type="button" aria-label="Remove ${esc(c.name)}">Remove</button></div>
        <div class="stats" style="margin:14px 0;grid-template-columns:repeat(3,1fr)"><div class="stat"><span class="k">Position</span><span class="v num">${fmt.ord(r.pos)}</span></div><div class="stat"><span class="k">Points</span><span class="v num">${r.pts}</span></div><div class="stat"><span class="k">Elo</span><span class="v num">${Math.round(state.clubs[id].elo)}</span></div></div>
        <div class="row between small" style="margin-bottom:10px"><span class="muted">Form</span>${formDots(r.form.slice(-5).map((x) => x.res))}</div>
        ${nx ? `<div class="small muted" style="margin-bottom:6px">Next: ${nx.home ? 'home to' : 'away at'} <b style="color:var(--text)">${esc(club(nx.opp).short)}</b> · ${fmt.day(nx.date)} ${nx.time || ''}</div>${probBar(nx.home ? f.ensemble : [f.ensemble[2], f.ensemble[1], f.ensemble[0]], 'sm')}<div class="prob-labels"><span>${esc(c.short)}</span><span>Draw</span><span>${esc(club(nx.opp).short)}</span></div>` : '<p class="dim small">No fixture left in the snapshot.</p>'}</div>`; };
    $('#ov', el).innerHTML = html`
      <div class="section-head"><div><h2>My clubs</h2></div><a class="btn sm" href="#/clubs">Find clubs ${ICON.arrow}</a></div>
      ${favClubs.length ? `<div class="dash-grid">${favClubs.map(clubCard).join('')}</div>` : `<div class="empty"><h4>No favourite clubs yet</h4>Open any club and select the star, or <a class="link" href="#/clubs">browse all 96</a>. Each favourite gets its position, form and next-match forecast here.</div>`}
      <div class="section-head" style="margin-top:34px"><div><h2>My leagues</h2></div><a class="btn sm" href="#/dashboard?tab=prefs">Choose leagues ${ICON.arrow}</a></div>
      ${favLeagues.length ? `<div class="dash-grid">${favLeagues.filter((id) => by[id]).map((id) => { const t = table(by[id]); return `<a class="card" href="#/league/${id}"><div class="row between"><h3>${esc(league(id).name)}</h3><img class="flag" style="--s:26px" src="https://flagcdn.com/${league(id).flag}.svg" alt=""></div><ol class="board" style="margin-top:10px">${t.slice(0, 4).map((r) => `<li><span class="num dim">${r.pos}</span><span class="team">${crest(r.id, 22)}<span>${esc(club(r.id).short)}</span></span><b class="num">${r.pts}</b></li>`).join('')}</ol></a>`; }).join('')}</div>` : `<div class="empty"><h4>No preferred leagues</h4>Pick them under Preferences to pin their leaders here.</div>`}
      <div class="section-head" style="margin-top:34px"><div><h2>Player watch list</h2></div><a class="btn sm" href="#/players">Player database ${ICON.arrow}</a></div>
      ${P.players.length ? `<div class="dash-grid" id="pl">${P.players.map((p) => `<div class="card" style="display:grid;grid-template-columns:64px 1fr auto;gap:14px;align-items:center"><span class="avatar" style="--s:64px" data-art="${esc(p.name || '')}">${esc((p.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span><a href="#/player/${p.id}"><b>${esc(p.name || p.id)}</b><div class="small muted" data-line="${esc(p.id)}">${esc(COMP[p.comp] || '')}</div></a><button class="btn sm" data-rm="players" data-id="${esc(p.id)}" type="button">Remove</button></div>`).join('')}</div>` : `<div class="empty"><h4>No players on your watch list</h4>Select the star next to any player in the database or on a profile.</div>`}
      <div class="section-head" style="margin-top:34px"><div><h2>Saved comparisons and forecasts</h2></div><a class="btn sm" href="#/compare">Rivalry Lab ${ICON.arrow}</a></div>
      ${P.saved.length ? `<div class="dash-grid">${P.saved.map((s) => `<div class="card row between"><a href="${s.href}"><b>${esc(s.label)}</b><div class="small muted">${s.href.startsWith('#/predictions') ? 'Forecast' : 'Comparison'}</div></a><button class="btn sm" data-rm="saved" data-id="${esc(s.id)}" type="button">Remove</button></div>`).join('')}</div>` : `<div class="empty"><h4>Nothing saved yet</h4>Use “Save” in the Prediction Lab or “Save comparison” in the Rivalry Lab.</div>`}`;
    $$('#ov [data-art]', el).forEach(async (n) => { const a = await playerArt(n.dataset.art); if (a?.img && n.isConnected) n.innerHTML = `<img src="${a.img}" alt="">`; });
    P.players.forEach(async (p) => { const [comp, id] = String(p.id).split('/'); if (!COMP[comp]) return; const x = (await sbPlayers(comp)).players.find((y) => String(y.id) === id), n = $(`[data-line="${CSS.escape(p.id)}"]`, el); if (x && n) n.textContent = `${x.t} · ${COMP[comp]} · ${x.g} goals, ${x.a} assists in ${x.min} min`; });
  };
  $('#ov', el).addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; toggleIn(b.dataset.rm, b.dataset.id); overview(); toast('Removed'); });

  const prefs = () => { const P = getPrefs();
    $('#pf', el).innerHTML = html`<div class="grid g2"><div class="panel"><div class="panel-head"><h3>Appearance</h3></div><div class="field" style="margin-bottom:16px">Theme<div id="theme">${seg([['dark', 'Dark (floodlit)'], ['light', 'Light (daylight)']], P.theme === 'light' ? 'light' : 'dark')}</div></div>
          <div class="field">Motion<div id="motion">${seg([['auto', 'Follow my system'], ['full', 'Full motion'], ['reduced', 'Reduced motion']], P.motion)}</div></div><p class="src" style="margin-top:12px">Reduced motion replaces the scroll-driven homepage with a static layout and stops chart animations. “Follow my system” respects your device's accessibility setting.</p></div>
        <div class="panel"><div class="panel-head"><h3>Preferred leagues</h3></div><div class="pick" id="lgs">${leagues().map((l) => `<label><input type="checkbox" value="${l.id}"${P.leagues.includes(l.id) ? ' checked' : ''}><span><img class="flag" style="--s:20px" src="https://flagcdn.com/${l.flag}.svg" alt="">${esc(l.name)}</span></label>`).join('')}</div><p class="src" style="margin-top:12px">Preferred leagues are pinned on your overview.</p></div>
        <div class="panel"><div class="panel-head"><h3>Favourite clubs</h3></div><div class="pick" id="cls" style="max-height:260px;overflow-y:auto">${allClubs().sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<label><input type="checkbox" value="${c.id}"${P.clubs.includes(c.id) ? ' checked' : ''}><span>${crest(c.id, 20)}${esc(c.short)}</span></label>`).join('')}</div></div>
        <div class="panel"><div class="panel-head"><h3>Your data</h3></div><p class="muted small" style="margin-bottom:14px">${P.clubs.length} clubs, ${P.players.length} players, ${P.leagues.length} leagues and ${P.saved.length} saved items are stored in this browser's local storage.</p><div class="row"><button class="btn sm" id="export" type="button">${ICON.download} Export as JSON</button><label class="btn sm" style="cursor:pointer">Import<input type="file" id="import" accept="application/json" hidden></label><button class="btn sm" id="clear" type="button">Clear everything</button></div></div></div>`;
    segmented($('#theme .seg', el), (v) => { applyTheme(v); setPref('theme', v); document.dispatchEvent(new CustomEvent('theme-change')); });
    segmented($('#motion .seg', el), (v) => setPref('motion', v));
    $('#lgs', el).addEventListener('change', () => setPref('leagues', $$('#lgs input:checked', el).map((i) => i.value)));
    $('#cls', el).addEventListener('change', () => setPref('clubs', $$('#cls input:checked', el).map((i) => i.value)));
    $('#export', el).addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(getPrefs(), null, 2)], { type: 'application/json' })); a.download = 'goalvision-preferences.json'; a.click(); });
    $('#import', el).addEventListener('change', async (e) => { try { const d = JSON.parse(await e.target.files[0].text()); for (const k of ['clubs', 'players', 'leagues', 'saved', 'watch']) if (Array.isArray(d[k])) setPref(k, d[k]); toast('Preferences imported'); rerender(); } catch { toast('That file is not a GOALVISION preferences export'); } });
    $('#clear', el).addEventListener('click', () => { if (!confirm('Remove all favourites, watch-list players and saved items from this browser?')) return; for (const k of ['clubs', 'players', 'leagues', 'saved', 'watch']) setPref(k, []); toast('Cleared'); rerender(); });
  };

  const data = () => {
    $('#dc', el).innerHTML = html`<div class="grid g2"><div class="panel"><div class="panel-head"><h3>Live data backend</h3><span class="chip demo" id="st">Checking…</span></div>
          <p class="muted small" style="margin-bottom:14px">GOALVISION AI is a static site, so it cannot hold a sports-data API key safely. Live scores, line-ups, squads and the current Champions League come through a small worker you deploy yourself. Paste its URL here to switch this browser from DEMO to LIVE.</p>
          <form id="bf" class="stack"><label class="field">Backend URL<input class="input" id="burl" type="url" placeholder="https://goalvision-api.example.workers.dev" value="${esc(getPrefs().backend === 'off' ? '' : getPrefs().backend || '')}"></label><div class="row"><button class="btn primary sm" type="submit">Save and test</button><button class="btn sm" type="button" id="bclear">Use DEMO mode</button></div></form><p class="src" id="bmsg" style="margin-top:12px" aria-live="polite"></p></div>
        <div class="panel"><div class="panel-head"><h3>What each mode shows</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Feature</th><th>DEMO (snapshot)</th><th>LIVE (backend)</th></tr></thead><tbody>
          <tr><td>League tables, fixtures</td><td>Results to ${fmt.date(seasons[0].lastResult)}</td><td>Current</td></tr><tr><td>Live scores and clocks</td><td><span class="na">Not available</span></td><td>Provider refresh cadence</td></tr><tr><td>Line-ups, events, match stats</td><td>147 replay matches</td><td>Per provider plan</td></tr><tr><td>Squads, managers, top scorers</td><td><span class="na">Not available</span></td><td>Yes</td></tr><tr><td>Champions League 2026/27</td><td>2025/26 season</td><td>Yes</td></tr><tr><td>Forecasts, tactics, learning</td><td>Yes</td><td>Yes</td></tr></tbody></table></div></div></div>
      <div class="panel" style="margin-top:18px"><div class="panel-head"><h3>Deploy the backend in five minutes</h3></div><pre>cd backend/worker
npm install
npx wrangler secret put FOOTBALL_DATA_KEY     # free key from football-data.org (12 competitions)
npx wrangler secret put API_FOOTBALL_KEY      # optional: API-Football, for line-ups, events and statistics
npx wrangler deploy                            # prints the URL to paste above</pre><p class="src" style="margin-top:10px">The worker caches every upstream response, rate-limits visitors, retries with back-off and validates the provider's JSON before it reaches the site. Full notes: <code>backend/worker/README.md</code>.</p></div>`;
    const check = async () => { const st = $('#st', el), msg = $('#bmsg', el); if (!backendUrl()) { st.className = 'chip demo'; st.textContent = 'DEMO'; msg.textContent = getPrefs().backend === 'off' ? 'DEMO mode chosen for this browser: the site is using the dated snapshot. Save an empty field to return to the site\'s own backend.' : 'No backend set: the site is using the dated snapshot.'; return; }
      st.textContent = 'Testing…'; const h = await backendHealth(true); if (!el.isConnected) return; if (h.ok) { st.className = 'chip live'; st.textContent = 'LIVE'; msg.textContent = `Connected to ${h.provider}. Refresh every ${h.refreshSeconds || 60} seconds while matches are in play.`; } else if (h.noKey) { st.className = 'chip demo'; st.textContent = 'No API key'; msg.textContent = 'The backend answered, but it has no provider API key yet. Add one in backend/worker with "npx wrangler secret put FOOTBALL_DATA_KEY". The site stays in DEMO mode until then.'; } else { st.className = 'chip red'; st.textContent = 'Offline'; msg.textContent = `Could not reach the backend: ${h.error}. The site stays in DEMO mode.`; } };
    $('#bf', el).addEventListener('submit', (e) => { e.preventDefault(); const v = $('#burl', el).value.trim(); if (v && !/^https?:\/\//.test(v)) { $('#bmsg', el).textContent = 'Enter a full URL starting with https://'; return; } setPref('backend', v); check(); });
    $('#bclear', el).addEventListener('click', () => { $('#burl', el).value = ''; setPref('backend', CONFIG.backend ? 'off' : ''); check(); }); check();
  };
  const drawn = new Set();
  const show = tabs(el, (n) => { setQuery({ tab: n === 'overview' ? null : n }); if (n === 'overview') return overview(); if (drawn.has(n)) return; drawn.add(n); ({ prefs, data })[n](); });
  show(['prefs', 'data'].includes(q.tab) ? q.tab : 'overview');
}
