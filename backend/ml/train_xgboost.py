"""Optional: train Model 5 with the XGBoost library instead of the bundled JavaScript booster.

    node scripts/train_models.mjs --export-rows        # writes backend/ml/rows.csv (pre-match features, leak-free)
    pip install -r backend/ml/requirements.txt
    python backend/ml/train_xgboost.py                  # walk-forward validation, then data/models/gbt_xgboost.json

The exported JSON uses the same tree format the site already reads ({"f": feature, "t": threshold, "l": …, "r": …} /
{"v": leaf}), so replacing `params.gbt` in data/models/state.json with it switches the Prediction Lab to XGBoost.

Validation is walk-forward by season, exactly like scripts/train_models.mjs: season S is predicted by a model fitted on
seasons before S only. NOTE: this script was written alongside the JS pipeline but has not been executed in the
environment that produced the bundled artefacts (XGBoost was not installed there). Run it and check its report before
relying on it.
"""
import json, pathlib
import numpy as np, pandas as pd, xgboost as xgb
from sklearn.metrics import log_loss, accuracy_score

ROOT = pathlib.Path(__file__).resolve().parents[2]
rows = pd.read_csv(ROOT / 'backend/ml/rows.csv')
FEATURES = [c for c in rows.columns if c not in ('season', 'league', 'date', 'home', 'away', 'y')]
PARAMS = dict(objective='multi:softprob', num_class=3, max_depth=3, eta=0.06, subsample=0.8, min_child_weight=40, reg_lambda=1.0, tree_method='hist', max_bin=32, seed=11)
ROUNDS, REPORT_FROM = 120, '2016-17'

def fit(df):
    return xgb.train(PARAMS, xgb.DMatrix(df[FEATURES].values, label=df['y'].values), num_boost_round=ROUNDS)

oos = []
for season in sorted(s for s in rows.season.unique() if s >= REPORT_FROM):
    train, test = rows[rows.season < season], rows[rows.season == season]
    proba = fit(train).predict(xgb.DMatrix(test[FEATURES].values))
    oos.append(pd.DataFrame(dict(season=season, y=test.y.values, p0=proba[:, 0], p1=proba[:, 1], p2=proba[:, 2])))
    print(season, len(train), len(test), 'log loss', round(log_loss(test.y, proba, labels=[0, 1, 2]), 4))
oos = pd.concat(oos); P = oos[['p0', 'p1', 'p2']].values
base = rows[rows.season < REPORT_FROM].y.value_counts(normalize=True).sort_index().values
report = dict(matches=int(len(oos)), logLoss=float(log_loss(oos.y, P, labels=[0, 1, 2])), accuracy=float(accuracy_score(oos.y, P.argmax(1))),
              brier=float(((P - np.eye(3)[oos.y.values]) ** 2).sum(1).mean()), baselineLogLoss=float(log_loss(oos.y, np.tile(base, (len(oos), 1)), labels=[0, 1, 2])))
print(json.dumps(report, indent=1))

def convert(node):
    if 'leaf' in node: return {'v': round(float(node['leaf']), 5)}
    kids = {c['nodeid']: c for c in node['children']}
    return {'f': int(node['split'][1:]), 't': round(float(node['split_condition']), 5), 'l': convert(kids[node['yes']]), 'r': convert(kids[node['no']])}   # "yes" = x < threshold

final = fit(rows)
dump = [convert(json.loads(t)) for t in final.get_dump(dump_format='json')]            # trees are ordered round by round, class by class
gain = final.get_score(importance_type='total_gain'); tot = sum(gain.values()) or 1.0
out = dict(engine='xgboost ' + xgb.__version__, prior=[0.0, 0.0, 0.0], trees=[dump[i:i + 3] for i in range(0, len(dump), 3)],
           importance=[round(gain.get(f'f{i}', 0.0) / tot, 4) for i in range(len(FEATURES))], params=dict(rounds=ROUNDS, depth=PARAMS['max_depth'], lr=PARAMS['eta']), validation=report)
(ROOT / 'data/models/gbt_xgboost.json').write_text(json.dumps(out))
print('wrote data/models/gbt_xgboost.json')
