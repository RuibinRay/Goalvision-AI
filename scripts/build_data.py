"""Build the static data snapshot (leagues, tournaments, registry) from raw open-data downloads.

  python3 -I scripts/build_data.py <raw-dir> <project-root>

raw-dir layout:  openfootball/<season>_<key>.json   worldcup/<year>.json   ucl/<season>.txt
Sources: openfootball/football.json, openfootball/worldcup.json, openfootball/champions-league (all CC0 / public domain).
Nothing is invented: an unplayed fixture has null scores, a missing field stays missing.
"""
import sys, os, json, re, glob, colorsys, datetime, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from registry import LEAGUES, COMPETITIONS, Resolver, FLAGS
from PIL import Image

RAW, ROOT = sys.argv[1], sys.argv[2]
DATA = os.path.join(ROOT, 'data')
NOW = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
R = Resolver()

def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

def matches_of(d):
    return d.get('matches') or [m for r in d.get('rounds', []) for m in r['matches']]

def score_of(m):
    """-> (ft, ht) lists or (None, None). The archive uses three shapes: dict, [h,a] list, or {} / missing."""
    sc = m.get('score')
    if isinstance(sc, list) and len(sc) == 2: return sc, None
    if isinstance(sc, dict) and sc.get('ft'): return sc['ft'], sc.get('ht')
    return None, None

# ───────────────────────── club colours straight from the supplied logos ─────────────────────────
def logo_colors(path):
    im = Image.open(path).convert('RGBA'); im.thumbnail((72, 72))
    buckets = collections.defaultdict(lambda: [0, 0, 0, 0])
    neutral = collections.Counter()
    for r, g, b, a in list(im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()):
        if a < 200: continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < 0.22 or v < 0.16:
            neutral['white' if v > 0.8 else 'black' if v < 0.25 else 'grey'] += 1; continue
        k = (int(h * 18), int(v * 3))
        bk = buckets[k]; bk[0] += 1; bk[1] += r; bk[2] += g; bk[3] += b
    # crowns, laurels and outlines are metallic gold on most crests: down-weight that hue band so the identity colour wins
    trim = lambda hk: 0.4 if 1.2 <= hk < 2.6 else 1.0
    ranked = sorted(buckets.items(), key=lambda kv: -kv[1][0] * trim(kv[0][0]))
    hexes = []
    for (hk, _), (n, r, g, b) in ranked:
        if any(min(abs(hk - o), 18 - abs(hk - o)) < 2 for o, _ in hexes): continue
        hexes.append((hk, '#%02X%02X%02X' % (r // n, g // n, b // n)))
        if len(hexes) == 2: break
    cols = [h for _, h in hexes]
    total_col = sum(v[0] for v in buckets.values()); total_neu = sum(neutral.values())
    if not cols or total_col < 0.12 * (total_col + total_neu):      # essentially monochrome crest
        cols = ['#F7FAFF', '#1B2430'] if neutral['white'] >= neutral['black'] * 0.4 else ['#1B2430', '#F7FAFF']
    elif len(cols) == 1:
        cols.append('#F7FAFF' if neutral['white'] >= neutral['black'] else '#10151C')
    return cols

# ───────────────────────── domestic leagues ─────────────────────────
league_index = []
for lg in LEAGUES:
    seasons = []
    for f in sorted(glob.glob(os.path.join(RAW, 'openfootball', f"*_{lg['of']}.json"))):
        season = os.path.basename(f).split('_')[0]
        ms = matches_of(json.load(open(f, encoding='utf-8')))
        teams, rows, last, played = [], [], None, 0
        idx = {}
        def tid(raw):
            name = raw if isinstance(raw, str) else raw.get('name')
            cid = R.resolve(name, lg['id'])
            if cid not in idx: idx[cid] = len(teams); teams.append(cid)
            return idx[cid]
        for m in ms:
            ft, ht = score_of(m)
            md = re.search(r'(\d+)', m.get('round', '') or '')
            h, a = tid(m['team1']), tid(m['team2'])
            row = [int(md.group(1)) if md else None, m.get('date'), m.get('time'), h, a,
                   ft[0] if ft else None, ft[1] if ft else None, ht[0] if ht else None, ht[1] if ht else None]
            rows.append(row)
            if ft: played += 1; last = max(last or '', m['date'])
        rows.sort(key=lambda r: (r[1] or '', r[2] or ''))
        dump(os.path.join(DATA, 'leagues', lg['id'], season + '.json'), dict(
            league=lg['id'], season=season, source='openfootball/football.json',
            sourceUrl=f"https://github.com/openfootball/football.json/blob/master/{season}/{lg['of']}.json",
            fetchedAt=NOW, lastResult=last, played=played, teams=teams,
            cols=['md', 'date', 'time', 'home', 'away', 'hg', 'ag', 'hth', 'hta'], matches=rows))
        seasons.append(dict(season=season, matches=len(rows), played=played, lastResult=last, teams=len(teams)))
    league_index.append(dict(**lg, seasons=seasons))
    cur = seasons[-1]
    print(f"{lg['id']:6} {len(seasons)} seasons · current {cur['season']}: {cur['played']}/{cur['matches']} played, last {cur['lastResult']}, {cur['teams']} clubs")

# current-season membership check: every 2026-27 participant must be a curated club with a logo
man = json.load(open(os.path.join(ROOT, 'assets/logos/manifest.json')))
for lg in LEAGUES:
    cur = json.load(open(os.path.join(DATA, 'leagues', lg['id'], '2026-27.json')))
    miss = [t for t in cur['teams'] if f"{lg['id']}/{t}" not in man]
    extra = [k for k in man if k.startswith(lg['id'] + '/') and k.split('/')[1] not in cur['teams']]
    assert not miss and not extra, (lg['id'], 'no logo for', miss, 'logo without club', extra)
print('2026-27 participants match the supplied logo sheets exactly (96/96)')

# ───────────────────────── registry ─────────────────────────
clubs = {}
for cid, c in R.clubs.items():
    key = f"{c['league']}/{cid}"
    c['logo'] = f"assets/logos/{key}.webp"; c['logoW'], c['logoH'] = man[key]['w'], man[key]['h']
    c['colors'] = logo_colors(os.path.join(ROOT, c['logo']))
    clubs[cid] = c
dump(os.path.join(DATA, 'registry.json'), dict(
    generatedAt=NOW, season='2026-27', leagues=league_index, competitions=COMPETITIONS, clubs=clubs,
    pastClubs={k: v for k, v in sorted(R.past.items())}, flags=FLAGS,
    sources=[
        dict(id='openfootball', name='openfootball (football.json, worldcup.json, champions-league)', license='CC0-1.0 / public domain', url='https://github.com/openfootball'),
        dict(id='statsbomb', name='StatsBomb Open Data', license='StatsBomb public data user agreement (non-commercial, attribution)', url='https://github.com/statsbomb/open-data'),
    ]))

# ───────────────────────── FIFA World Cup 1930 → 2026 ─────────────────────────
HOSTS = {1930:'Uruguay',1934:'Italy',1938:'France',1950:'Brazil',1954:'Switzerland',1958:'Sweden',1962:'Chile',1966:'England',1970:'Mexico',
         1974:'West Germany',1978:'Argentina',1982:'Spain',1986:'Mexico',1990:'Italy',1994:'United States',1998:'France',2002:'South Korea / Japan',
         2006:'Germany',2010:'South Africa',2014:'Brazil',2018:'Russia',2022:'Qatar',2026:'United States / Canada / Mexico'}
wc_index = []
def winner(m):
    sc = m['score']
    for k in ('p', 'et', 'ft'):
        if sc.get(k) and sc[k][0] != sc[k][1]: return m['team1'] if sc[k][0] > sc[k][1] else m['team2']
    return None
for f in sorted(glob.glob(os.path.join(RAW, 'worldcup', '*.json'))):
    year = int(os.path.basename(f)[:4]); d = json.load(open(f, encoding='utf-8'))
    out, goals, teams, scorers, listed = [], 0, set(), collections.Counter(), 0
    for m in matches_of(d):
        sc = m.get('score'); sc = {'ft': sc} if isinstance(sc, list) else (sc or {})
        t1 = m['team1'] if isinstance(m['team1'], str) else m['team1']['name']
        t2 = m['team2'] if isinstance(m['team2'], str) else m['team2']['name']
        row = dict(round=m.get('round'), group=m.get('group'), num=m.get('num'), date=m.get('date'), time=m.get('time'),
                   team1=t1, team2=t2, score=sc, goals1=m.get('goals1'), goals2=m.get('goals2'), ground=m.get('ground'))
        out.append({k: v for k, v in row.items() if v is not None})
        teams |= {t1, t2}
        final = sc.get('et') or sc.get('ft')
        if final: goals += final[0] + final[1]
        for side, tm in (('goals1', t1), ('goals2', t2)):
            for g in m.get(side) or []:
                listed += 1
                if not g.get('owngoal'): scorers[(g['name'], tm)] += 1
    finals = [m for m in out if (m.get('round') or '').lower() == 'final']
    champ = runner = None
    if finals:
        champ = winner(finals[-1]); runner = finals[-1]['team2'] if champ == finals[-1]['team1'] else finals[-1]['team1']
    elif year == 1950:                       # decided by a final round-robin, not a single final
        pts = collections.Counter()
        for m in out:
            if 'final' in (m.get('round') or '').lower() or 'final' in (m.get('group') or '').lower():
                a, b = m['score']['ft']; pts[m['team1']] += 2 if a > b else 1 if a == b else 0; pts[m['team2']] += 2 if b > a else 1 if a == b else 0
        if pts: (champ, _), (runner, _) = pts.most_common(2)
    # the archive sometimes writes one player two ways ("Mbappé" / "Kylian Mbappé"): merge by surname within a team,
    # and only publish a scorers table when every goal of the tournament is listed.
    merged = collections.Counter()
    for (nm, tm), n in sorted(scorers.items(), key=lambda kv: -len(kv[0][0])):
        hit = next((k for k in merged if k[1] == tm and (k[0] == nm or k[0].endswith(' ' + nm))), None)
        merged[hit or (nm, tm)] += n
    complete = goals > 0 and listed == goals
    top = merged.most_common(1) if complete else []
    table = [dict(name=k[0], team=k[1], goals=n) for k, n in merged.most_common()] if complete else None
    dump(os.path.join(DATA, 'tournaments', 'worldcup', f'{year}.json'), dict(
        year=year, name=d.get('name'), host=HOSTS.get(year), source='openfootball/worldcup.json', fetchedAt=NOW, scorers=table, matches=out))
    wc_index.append(dict(year=year, host=HOSTS.get(year), champion=champ, runnerUp=runner, teams=len(teams), matches=len(out), goals=goals,
                         topScorer=dict(name=top[0][0][0], team=top[0][0][1], goals=top[0][1]) if top else None,
                         scorersComplete=complete))
    print(f"WC {year}: {len(out)} matches, {len(teams)} teams, champion {champ}, goals {goals} listed {listed}, top {merged.most_common(3) if complete else None}")
dump(os.path.join(DATA, 'tournaments', 'worldcup', 'index.json'), dict(source='openfootball/worldcup.json', fetchedAt=NOW, editions=wc_index))

# ───────────────────────── UEFA Champions League (36-team league phase era) ─────────────────────────
MONTHS = {m: i + 1 for i, m in enumerate(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])}
STAGE = {'Round of 16': 'r16', 'Quarterfinals': 'qf', 'Semifinals': 'sf', 'Final': 'final'}
for f in sorted(glob.glob(os.path.join(RAW, 'ucl', '*.txt'))):
    season = os.path.basename(f)[:-4]; y0 = int(season[:4])
    stage = md = date = time = None; out = []; teams = {}
    for line in open(f, encoding='utf-8'):
        line = line.rstrip('\n')
        if line.startswith('▪'):
            a, _, b = line[1:].strip().partition(',')
            b = b.strip()
            if a == 'League': stage, md = 'league', int(re.search(r'\d+', b).group())
            elif a == 'Playoffs': stage, md = 'playoff', int(re.search(r'\d+', b).group())
            else: stage, md = STAGE[b], None
            continue
        dm = re.match(r'^\s{2}(?:\w{3})\s+(\w{3})\s+(\d{1,2})(?:\s+(\d{4}))?\s*$', line)
        if dm:
            mon, day = MONTHS[dm.group(1)], int(dm.group(2))
            year = int(dm.group(3)) if dm.group(3) else (y0 if mon >= 7 else y0 + 1)
            date = f'{year:04d}-{mon:02d}-{day:02d}'; continue
        mm = re.match(r'^\s+(?:(\d{1,2}:\d{2})\s+)?(.+?)\s+\(([A-Z]{3})\)\s+v\s+(.+?)\s+\(([A-Z]{3})\)\s+(.*)$', line)
        if not mm: continue
        if mm.group(1): time = mm.group(1)
        res = mm.group(6).strip()
        ft = et = pen = ht = None
        pm = re.search(r'(\d+)-(\d+)\s+pen\.', res)
        if pm: pen = [int(pm.group(1)), int(pm.group(2))]
        em = re.search(r'(\d+)-(\d+)\s+a\.e\.t\.', res)
        if em: et = [int(em.group(1)), int(em.group(2))]
        par = re.search(r'\(([^)]*)\)', res)
        inner = [list(map(int, p.split('-'))) for p in re.findall(r'\d+-\d+', par.group(1))] if par else []
        if et:                                  # "(1-1, 0-1)" = full time, half time
            ft, ht = (inner[0] if inner else None), (inner[1] if len(inner) > 1 else None)
        else:
            lead = re.match(r'(\d+)-(\d+)', res)
            if lead: ft = [int(lead.group(1)), int(lead.group(2))]
            ht = inner[0] if inner else None
        row = dict(stage=stage, md=md, date=date, time=time, ft=ft, ht=ht, et=et, pen=pen)
        for side, nm, cc in (('home', mm.group(2), mm.group(3)), ('away', mm.group(4), mm.group(5))):
            cid = R.resolve(nm)
            teams[cid] = dict(id=cid, name=R.clubs[cid]['name'] if cid in R.clubs else R.past.get(cid, nm), country=cc, club=cid in R.clubs)
            row[side] = cid
        out.append({k: v for k, v in row.items() if v is not None})
    dump(os.path.join(DATA, 'tournaments', 'ucl', season + '.json'), dict(
        season=season, name='UEFA Champions League', format='league-phase-36', source='openfootball/champions-league', fetchedAt=NOW,
        teams=sorted(teams.values(), key=lambda t: t['name']), matches=out))
    c = collections.Counter(m['stage'] for m in out)
    print(f'UCL {season}: {len(teams)} teams, {dict(c)}, final {out[-1]}')
print('registry clubs', len(clubs), 'past clubs', len(R.past))
