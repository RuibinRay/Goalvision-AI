"""Aggregate StatsBomb Open Data events into compact files for the match centre, tactics lab and player database.

  python3 -I scripts/build_statsbomb.py <raw-statsbomb-dir> <project-root>

Every number is derived from the provider's event stream; nothing is modelled or filled in.
Pitch frame: StatsBomb 120 x 80 yards, every team attacking towards x = 120.
Definitions used (also shown in the UI):
  possession      share of passes attempted
  xA              xG of the shots a player's passes directly created ("xG assisted"); providers differ
  progressive pass completed open-play pass starting outside the own 40% that moves the ball >= 10 yd closer to the
                  centre of the goal, or any completed pass into the penalty area from outside it
  progressive carry same rule applied to carries
"""
import sys, os, json, math, collections, datetime

RAW, ROOT = sys.argv[1], sys.argv[2]
OUT = os.path.join(ROOT, 'data', 'sb')
NOW = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
COMPS = [('43_106', 'wc2022', 'FIFA World Cup 2022', 'wc'), ('55_282', 'euro2024', 'UEFA Euro 2024', 'euro'), ('223_282', 'copa2024', 'Copa América 2024', 'copa')]
GOAL = (120.0, 40.0)
GX, GY = 12, 8                                   # heat-map grid (10 x 10 yd cells)
ON_TARGET = {'Goal', 'Saved', 'Saved to Post'}
OUTCOME_CODE = {'Goal': 'G', 'Saved': 'S', 'Saved to Post': 'S', 'Off T': 'O', 'Wayward': 'O', 'Saved Off Target': 'O', 'Post': 'P', 'Blocked': 'B'}
PERIOD_START = {1: 0, 2: 45, 3: 90, 4: 105, 5: 120}

def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

def dist_goal(p): return math.hypot(GOAL[0] - p[0], GOAL[1] - p[1])
def in_box(p): return p[0] >= 102 and 18 <= p[1] <= 62
def progressive(a, b): return (a[0] >= 48 and dist_goal(a) - dist_goal(b) >= 10) or (in_box(b) and not in_box(a))
def cell(p): return min(GX - 1, max(0, int(p[0] // 10))) + GX * min(GY - 1, max(0, int(p[1] // 10)))
def r1(v): return round(v, 1)
def on_pitch(p): return [min(120.0, max(0.0, p[0])), min(80.0, max(0.0, p[1]))]      # providers occasionally log 120.1
def group_of(pid): return 'GK' if pid == 1 else 'DF' if pid <= 8 else 'MF' if (pid <= 16 or 18 <= pid <= 20) else 'FW'
def label(period, minute):
    base = {1: 45, 2: 90, 3: 105, 4: 120}.get(period, 120)
    m = minute + 1
    return f"{base}+{m - base}'" if m > base else f"{m}'"

def new_player(): return collections.defaultdict(float)

for key, cid, cname, ckind in COMPS:
    matches = json.load(open(os.path.join(RAW, 'matches', key + '.json'), encoding='utf-8'))
    matches.sort(key=lambda m: (m['match_date'], m['kick_off']))
    P = {}                 # player id -> totals
    info = {}              # player id -> name, team...
    pos_count = collections.defaultdict(collections.Counter)
    shots_by = collections.defaultdict(list)
    logs = collections.defaultdict(list)
    index = []
    for M in matches:
        mid = M['match_id']
        ev = json.load(open(os.path.join(RAW, 'events', f'{mid}.json'), encoding='utf-8'))
        lu = json.load(open(os.path.join(RAW, 'lineups', f'{mid}.json'), encoding='utf-8'))
        hid, aid = M['home_team']['home_team_id'], M['away_team']['away_team_id']
        side = {hid: 0, aid: 1}
        by_id = {e['id']: e for e in ev}
        # period lengths -> absolute elapsed minutes (stoppage time counted once)
        plen = {}
        for e in ev:
            if e['period'] < 5: plen[e['period']] = max(plen.get(e['period'], 0), e['minute'] + e['second'] / 60 - PERIOD_START[e['period']])
        def elapsed(period, clock):
            if clock is None: return sum(plen.values())
            mm, ss = clock.split(':'); t = int(mm) + int(ss) / 60
            return sum(plen.get(p, 0) for p in range(1, period)) + max(0, t - PERIOD_START.get(period, 0))
        total_min = sum(plen.values())

        names, nums, mins, started, on_at, off_at, first_pos, cards = {}, {}, {}, {}, {}, {}, {}, collections.defaultdict(list)
        for T in lu:
            for pl in T['lineup']:
                pid = pl['player_id']
                names[pid] = pl.get('player_nickname') or pl['player_name']
                nums[pid] = pl.get('jersey_number')
                info.setdefault(pid, dict(id=pid, n=names[pid], full=pl['player_name'], t=T['team_name'], nat=(pl.get('country') or {}).get('name')))
                tot = 0
                for ps in pl.get('positions') or []:
                    if ps.get('from_period', 1) >= 5: continue
                    a = elapsed(ps.get('from_period', 1), ps.get('from')); b = elapsed(ps.get('to_period') or 4, ps.get('to')) if ps.get('to') else total_min
                    b = min(b, total_min); tot += max(0, b - a)
                    pos_count[pid][ps['position_id']] += max(0, b - a)
                    if pid not in first_pos: first_pos[pid] = (ps['position_id'], ps['position'], a, ps.get('start_reason', ''))
                    off_at[pid] = None if not ps.get('to') else b
                mins[pid] = tot
                if pid in first_pos:
                    started[pid] = first_pos[pid][3] == 'Starting XI'; on_at[pid] = first_pos[pid][2]

        tstats = [collections.defaultdict(float), collections.defaultdict(float)]
        mp = collections.defaultdict(new_player)          # this match, per player
        formation = [None, None]; xi = [[], []]
        timeline, shots, shootout = [], [], []
        heat = [dict(touch=[0] * (GX * GY), deff=[0] * (GX * GY), press=[0] * (GX * GY)) for _ in (0, 1)]
        momentum = [collections.Counter(), collections.Counter()]
        prog = [[], []]
        touch_sum = [collections.defaultdict(lambda: [0.0, 0.0, 0]), collections.defaultdict(lambda: [0.0, 0.0, 0])]
        net_sum = [collections.defaultdict(lambda: [0.0, 0.0, 0]), collections.defaultdict(lambda: [0.0, 0.0, 0])]
        net_edge = [collections.Counter(), collections.Counter()]
        net_until = [None, None]
        lanes = [[0, 0, 0], [0, 0, 0]]
        score = [0, 0]

        for e in ev:
            tn = e['type']['name']; per = e['period']; tid = e.get('team', {}).get('id'); s = side.get(tid)
            pid = e.get('player', {}).get('id'); loc = e.get('location'); abs_min = e['minute']
            if tn == 'Starting XI':
                formation[s] = e['tactics'].get('formation')
                xi[s] = [dict(id=l['player']['id'], pos=l['position']['id'], posName=l['position']['name'], num=l['jersey_number']) for l in e['tactics']['lineup']]
                continue
            if per == 5:
                if tn == 'Shot': shootout.append(dict(side=s, player=names.get(pid, e['player']['name']), scored=e['shot']['outcome']['name'] == 'Goal'))
                continue
            st = tstats[s] if s is not None else None
            pm = mp[pid] if pid else None
            if loc and pid and tn not in ('Pressure',):
                if tn in ('Pass', 'Carry', 'Ball Receipt*', 'Dribble', 'Shot', 'Ball Recovery', 'Duel', 'Clearance', 'Interception', 'Block', 'Miscontrol', 'Dispossessed', 'Foul Won'):
                    heat[s]['touch'][cell(loc)] += 1
                    ts = touch_sum[s][pid]; ts[0] += loc[0]; ts[1] += loc[1]; ts[2] += 1
                    pm['touches'] += 1
                    if loc[0] >= 80 and tn in ('Pass', 'Carry', 'Dribble', 'Shot', 'Ball Receipt*'): momentum[s][abs_min] += 1
            if loc and tn in ('Duel', 'Interception', 'Block', 'Clearance', 'Ball Recovery', 'Foul Committed', 'Pressure'): heat[s]['deff'][cell(loc)] += 1
            if tn == 'Pressure':
                if loc: heat[s]['press'][cell(loc)] += 1
                pm['prs'] += 1; st['pressures'] += 1
            elif tn == 'Pass':
                ps = e['pass']; out = ps.get('outcome', {}).get('name'); done = out is None
                ptype = ps.get('type', {}).get('name')
                st['passes'] += 1; pm['pa'] += 1
                bp = ps.get('body_part', {}).get('name')
                if bp == 'Left Foot': pm['lf'] += 1
                elif bp == 'Right Foot': pm['rf'] += 1
                if ptype == 'Corner': st['corners'] += 1
                if out == 'Pass Offside': st['offsides'] += 1
                if done:
                    st['passesC'] += 1; pm['pc'] += 1; pm['pdist'] += ps.get('length', 0)
                    end = ps.get('end_location')
                    if ps.get('through_ball'): pm['tb'] += 1
                    if ps.get('cross'): pm['crs'] += 1
                    if end and ptype in (None, 'Recovery', 'Interception') and progressive(loc, end):
                        pm['prp'] += 1; prog[s].append([r1(loc[0]), r1(loc[1]), r1(end[0]), r1(end[1]), nums.get(pid)])
                    if end and end[0] >= 80 and loc[0] < 80: lanes[s][0 if end[1] < 26.67 else 1 if end[1] < 53.33 else 2] += 1
                    rec = ps.get('recipient', {}).get('id')
                    if rec and net_until[s] is None and started.get(pid) and started.get(rec):
                        a = net_sum[s][pid]; a[0] += loc[0]; a[1] += loc[1]; a[2] += 1
                        if end: b = net_sum[s][rec]; b[0] += end[0]; b[1] += end[1]; b[2] += 1
                        net_edge[s][tuple(sorted((pid, rec)))] += 1
                if ps.get('shot_assist') or ps.get('goal_assist'):
                    pm['kp'] += 1
                    sh = by_id.get(ps.get('assisted_shot_id'))
                    if sh and sh['period'] < 5: pm['xa'] += sh['shot'].get('statsbomb_xg', 0)
                    if ps.get('goal_assist'): pm['a'] += 1
                if ps.get('aerial_won'): pm['aw'] += 1
            elif tn == 'Carry':
                end = e['carry'].get('end_location')
                if end and loc and progressive(loc, end): pm['prc'] += 1
            elif tn == 'Shot':
                loc = on_pitch(loc); sh = e['shot']; oc = sh['outcome']['name']; xg = sh.get('statsbomb_xg', 0.0); pen = sh.get('type', {}).get('name') == 'Penalty'
                st['shots'] += 1; st['xg'] += xg; pm['sh'] += 1; pm['xg'] += xg
                if not pen: pm['npxg'] += xg; st['npxg'] += xg
                else: pm['pka'] += 1
                if oc in ON_TARGET: st['sot'] += 1; pm['sot'] += 1
                if oc in ('Saved', 'Saved to Post'): tstats[1 - s]['saves'] += 1
                momentum[s][abs_min] += 5
                if sh.get('aerial_won'): pm['aw'] += 1
                body = sh.get('body_part', {}).get('name', '')
                code = OUTCOME_CODE.get(oc, 'O')
                shots.append([s, names.get(pid), abs_min, r1(loc[0]), r1(loc[1]), round(xg, 3), code, 1 if pen else 0, body[:1], per])
                shots_by[pid].append([r1(loc[0]), r1(loc[1]), round(xg, 3), code, mid, abs_min, 1 if pen else 0, body[:1]])
                if oc == 'Goal':
                    score[s] += 1; pm['g'] += 1
                    if pen: pm['pk'] += 1
                    kp = by_id.get(sh.get('key_pass_id')); assist = None
                    if kp and kp.get('pass', {}).get('goal_assist'): assist = names.get(kp['player']['id'])
                    timeline.append(dict(t='goal', m=abs_min, lbl=label(per, abs_min), p=per, side=s, player=names.get(pid), assist=assist, pen=pen, score=list(score), xg=round(xg, 2)))
                elif pen:
                    timeline.append(dict(t='pen-miss', m=abs_min, lbl=label(per, abs_min), p=per, side=s, player=names.get(pid), detail=oc))
            elif tn == 'Own Goal Against':
                score[1 - s] += 1
                timeline.append(dict(t='own', m=abs_min, lbl=label(per, abs_min), p=per, side=1 - s, player=names.get(pid), score=list(score)))
            elif tn == 'Dribble':
                pm['dra'] += 1
                if e['dribble']['outcome']['name'] == 'Complete': pm['drc'] += 1
            elif tn == 'Duel':
                dt = e['duel'].get('type', {}).get('name'); oc = e['duel'].get('outcome', {}).get('name', '')
                if dt == 'Tackle':
                    pm['tkl'] += 1; st['tackles'] += 1
                    if oc in ('Won', 'Success', 'Success In Play', 'Success Out'): pm['tklw'] += 1
                elif dt == 'Aerial Lost': pm['al'] += 1
            elif tn == 'Interception': pm['int'] += 1; st['interceptions'] += 1
            elif tn == 'Block': pm['blk'] += 1
            elif tn == 'Clearance':
                pm['clr'] += 1; st['clearances'] += 1
                if e.get('clearance', {}).get('aerial_won'): pm['aw'] += 1
            elif tn == 'Miscontrol':
                if e.get('miscontrol', {}).get('aerial_won'): pm['aw'] += 1
            elif tn == 'Ball Recovery':
                if not e.get('ball_recovery', {}).get('recovery_failure'): pm['rec'] += 1; st['recoveries'] += 1
            elif tn == 'Offside': st['offsides'] += 1
            elif tn == 'Foul Won': pm['fw'] += 1
            elif tn in ('Foul Committed', 'Bad Behaviour'):
                if tn == 'Foul Committed': st['fouls'] += 1; pm['fc'] += 1
                card = (e.get('foul_committed') or e.get('bad_behaviour') or {}).get('card', {}).get('name')
                if card:
                    kind = 'yc' if card == 'Yellow Card' else 'y2' if card == 'Second Yellow' else 'rc'
                    st['yc' if kind == 'yc' else 'rc'] += 1; pm['yc' if kind == 'yc' else 'rc'] += 1
                    timeline.append(dict(t=kind, m=abs_min, lbl=label(per, abs_min), p=per, side=s, player=names.get(pid)))
                    if kind != 'yc' and net_until[s] is None: net_until[s] = abs_min
            elif tn == 'Substitution':
                timeline.append(dict(t='sub', m=abs_min, lbl=label(per, abs_min), p=per, side=s, off=names.get(pid), on=names.get(e['substitution']['replacement']['id'])))
                if net_until[s] is None: net_until[s] = abs_min
            elif tn == 'Goal Keeper':
                gt = e['goalkeeper'].get('type', {}).get('name', '')
                if gt in ('Shot Saved', 'Penalty Saved', 'Shot Saved to Post', 'Saved to Post'): pm['sv'] += 1; pm['sota'] += 1
                elif gt in ('Goal Conceded', 'Penalty Conceded'): pm['ga'] += 1; pm['sota'] += 1

        hs, as_ = M['home_score'], M['away_score']
        tot_pass = tstats[0]['passes'] + tstats[1]['passes'] or 1
        stats = []
        for s in (0, 1):
            t = tstats[s]
            stats.append(dict(poss=round(100 * t['passes'] / tot_pass, 1), shots=int(t['shots']), sot=int(t['sot']), xg=round(t['xg'], 2), npxg=round(t['npxg'], 2),
                              corners=int(t['corners']), fouls=int(t['fouls']), offsides=int(t['offsides']), passes=int(t['passes']),
                              passAcc=round(100 * t['passesC'] / t['passes'], 1) if t['passes'] else None, saves=int(t['saves']), tackles=int(t['tackles']),
                              interceptions=int(t['interceptions']), recoveries=int(t['recoveries']), pressures=int(t['pressures']), yc=int(t['yc']), rc=int(t['rc'])))
        lineups = []
        for s, T in ((0, hid), (1, aid)):
            team_lu = next(t for t in lu if t['team_id'] == T)
            xi_ids = {x['id']: x for x in xi[s]}
            rows = []
            for pl in team_lu['lineup']:
                pid = pl['player_id']
                if pid not in first_pos and pid not in xi_ids: continue      # unused squad member
                fp = first_pos.get(pid)
                rows.append(dict(id=pid, name=names[pid], num=nums[pid], pos=xi_ids[pid]['pos'] if pid in xi_ids else (fp[0] if fp else None),
                                 posName=xi_ids[pid]['posName'] if pid in xi_ids else (fp[1] if fp else None), start=pid in xi_ids,
                                 on=None if pid in xi_ids else round(on_at.get(pid, 0)), off=round(off_at[pid]) if off_at.get(pid) is not None else None,
                                 min=round(mins.get(pid, 0))))
            rows.sort(key=lambda r: (not r['start'], r['pos'] or 99, r['on'] or 0))
            bench = [dict(id=pl['player_id'], name=names[pl['player_id']], num=nums[pl['player_id']]) for pl in team_lu['lineup'] if pl['player_id'] not in first_pos and pl['player_id'] not in xi_ids]
            lineups.append(dict(players=rows, unused=bench))
        net = []
        for s in (0, 1):
            ids = [x['id'] for x in xi[s] if net_sum[s][x['id']][2] > 0]
            pos = {i: k for k, i in enumerate(ids)}
            nodes = [[names[i], nums[i], r1(net_sum[s][i][0] / net_sum[s][i][2]), r1(net_sum[s][i][1] / net_sum[s][i][2]), int(net_sum[s][i][2])] for i in ids]
            edges = [[pos[a], pos[b], n] for (a, b), n in net_edge[s].items() if n >= 2 and a in pos and b in pos]
            net.append(dict(until=net_until[s] if net_until[s] is not None else round(total_min), nodes=nodes, edges=edges))
        avg = [[[names[p], nums[p], r1(v[0] / v[2]), r1(v[1] / v[2]), v[2]] for p, v in touch_sum[s].items() if v[2] >= 8 and started.get(p)] for s in (0, 1)]
        maxm = int(max(e['minute'] for e in ev if e['period'] < 5)) + 1
        mom = [[momentum[s].get(m, 0) for m in range(maxm)] for s in (0, 1)]
        stage = M['competition_stage']['name']
        grp = M['home_team'].get('home_team_group')
        mgr = lambda t: (t.get('managers') or [{}])[0].get('nickname') or (t.get('managers') or [{}])[0].get('name')
        head = dict(id=mid, comp=cid, compName=cname, date=M['match_date'], kickoff=M['kick_off'][:5], stage=stage, group=grp,
                    stadium=(M.get('stadium') or {}).get('name'), referee=(M.get('referee') or {}).get('name'),
                    home=dict(name=M['home_team']['home_team_name'], score=hs, manager=mgr(M['home_team']), formation=formation[0]),
                    away=dict(name=M['away_team']['away_team_name'], score=as_, manager=mgr(M['away_team']), formation=formation[1]))
        if shootout:
            head['pens'] = [sum(1 for k in shootout if k['side'] == 0 and k['scored']), sum(1 for k in shootout if k['side'] == 1 and k['scored'])]
        timeline.sort(key=lambda t: (t['p'], t['m']))
        dump(os.path.join(OUT, 'matches', f'{mid}.json'), dict(
            **head, source='StatsBomb Open Data', minutes=round(total_min), periods={str(k): round(v, 1) for k, v in plen.items()}, lineups=lineups, events=timeline, shootout=shootout or None,
            stats=stats, shots=shots, momentum=mom, net=net, avg=avg, heat=[dict(touch=h['touch'], deff=h['deff'], press=h['press']) for h in heat],
            prog=prog, lanes=lanes, grid=[GX, GY]))
        index.append(dict(**head, stats=[dict(xg=x['xg'], shots=x['shots'], sot=x['sot'], poss=x['poss'], passAcc=x['passAcc']) for x in stats],
                          scorers=[[t['side'], t['player'], t['lbl'], t['t']] for t in timeline if t['t'] in ('goal', 'own')]))
        # roll the match into season totals
        conceded = {0: as_, 1: hs}
        for pid, pm in mp.items():
            if pid not in mins or mins[pid] <= 0: continue
            tot = P.setdefault(pid, new_player())
            for k, v in pm.items(): tot[k] += v
            tot['min'] += mins[pid]; tot['mp'] += 1; tot['st'] += 1 if started.get(pid) else 0
            s = side[next(t['team_id'] for t in lu if any(pl['player_id'] == pid for pl in t['lineup']))]
            if started.get(pid) and off_at.get(pid) is None and max(pos_count[pid], key=pos_count[pid].get) == 1 and conceded[s] == 0: tot['cs'] += 1
            opp = M['away_team']['away_team_name'] if s == 0 else M['home_team']['home_team_name']
            logs[pid].append([mid, M['match_date'], opp, round(mins[pid]), int(pm['g']), int(pm['a']), int(pm['sh']), round(pm['xg'], 2), round(pm['xa'], 2), int(pm['kp']), int(pm['pc']), int(pm['pa'])])
        for pid in mins:
            if mins[pid] > 0 and pid not in mp:
                tot = P.setdefault(pid, new_player()); tot['min'] += mins[pid]; tot['mp'] += 1; tot['st'] += 1 if started.get(pid) else 0

    players = []
    INT = ['mp','st','g','pk','pka','a','sh','sot','kp','pa','pc','prp','prc','tb','crs','drc','dra','tkl','tklw','int','blk','clr','aw','al','rec','prs','fc','fw','yc','rc','touches','sv','sota','ga','cs','lf','rf']
    for pid, tot in P.items():
        pc = pos_count[pid]
        if not pc: continue
        main = max(pc, key=pc.get)
        row = dict(info[pid]); row['pos'] = group_of(main); row['posId'] = main
        row['min'] = round(tot['min'])
        for k in INT: row[k] = int(tot[k])
        row['npg'] = row['g'] - row['pk']
        for k in ('xg', 'npxg', 'xa'): row[k] = round(tot[k], 2)
        row['pdist'] = round(tot['pdist'])
        feet = row['lf'] + row['rf']
        row['foot'] = None if feet < 30 else ('Left' if row['lf'] / feet > 0.6 else 'Right' if row['rf'] / feet > 0.6 else 'Both')
        players.append(row)
    players.sort(key=lambda r: (-r['g'], -r['xg']))
    teams = sorted({m['home']['name'] for m in index} | {m['away']['name'] for m in index})
    dump(os.path.join(OUT, cid, 'index.json'), dict(id=cid, name=cname, kind=ckind, source='StatsBomb Open Data', sourceUrl='https://github.com/statsbomb/open-data', generatedAt=NOW, teams=teams, matches=index))
    dump(os.path.join(OUT, cid, 'players.json'), dict(id=cid, name=cname, source='StatsBomb Open Data', generatedAt=NOW, players=players))
    dump(os.path.join(OUT, cid, 'shots.json'), dict(cols=['x', 'y', 'xg', 'outcome', 'match', 'minute', 'pen', 'body'], shots={str(k): v for k, v in shots_by.items()}))
    dump(os.path.join(OUT, cid, 'logs.json'), dict(cols=['match', 'date', 'opp', 'min', 'g', 'a', 'sh', 'xg', 'xa', 'kp', 'pc', 'pa'], logs={str(k): v for k, v in logs.items()}))
    top = players[:4]
    print(f"{cid}: {len(index)} matches, {len(players)} players, {sum(len(v) for v in shots_by.values())} shots · top:", [(p['n'], p['g'], p['xg'], p['min']) for p in top])
dump(os.path.join(OUT, 'index.json'), dict(source='StatsBomb Open Data', sourceUrl='https://github.com/statsbomb/open-data', generatedAt=NOW,
     competitions=[dict(id=c[1], name=c[2], kind=c[3]) for c in COMPS]))
