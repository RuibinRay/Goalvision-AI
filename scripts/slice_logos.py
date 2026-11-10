"""Slice the five transparent league sprite sheets into one logo per club.
Usage: python3 -I scripts/slice_logos.py <dir-with-1..5.webp> <out-dir>
Rows/columns are found from the alpha channel (never a fixed grid), each logo keeps its own aspect ratio.
The club order per sheet is the canonical mapping; the script aborts if the detected count differs."""
import sys, os, json
from PIL import Image

SHEETS = {
 '1.webp': ('eng.1', 5, ['bournemouth','arsenal','aston-villa','brentford','brighton','chelsea','coventry','crystal-palace','everton','fulham','hull','ipswich','leeds','liverpool','man-city','man-united','newcastle','nottingham-forest','sunderland','tottenham']),
 '2.webp': ('esp.1', 5, ['athletic','atletico','osasuna','celta','alaves','elche','barcelona','getafe','levante','malaga','racing','rayo','deportivo','espanyol','betis','real-madrid','real-sociedad','sevilla','valencia','villarreal']),
 '3.webp': ('ita.1', 5, ['milan','monza','roma','atalanta','bologna','cagliari','como','fiorentina','frosinone','genoa','inter','juventus','lazio','lecce','napoli','parma','sassuolo','torino','udinese','venezia']),
 '4.webp': ('ger.1', 6, ['bayern','dortmund','leipzig','stuttgart','hoffenheim','leverkusen','freiburg','frankfurt','augsburg','mainz','union-berlin','gladbach','hamburg','koln','bremen','schalke','elversberg','paderborn']),
 '5.webp': ('fra.1', 6, ['auxerre','angers','monaco','lorient','le-havre','le-mans','lille','nice','marseille','lyon','paris-fc','psg','lens','strasbourg','brest','rennes','toulouse','troyes']),
}

def runs(profile, min_gap):
    """Return [start,end) spans of non-empty profile, merging gaps smaller than min_gap."""
    spans, start, last = [], None, None
    for i, v in enumerate(profile):
        if v:
            if start is None: start = i
            elif i - last > min_gap: spans.append((start, last + 1)); start = i
            last = i
    if start is not None: spans.append((start, last + 1))
    return spans

def main(src, out):
    manifest = {}
    for fname, (league, cols, ids) in SHEETS.items():
        im = Image.open(os.path.join(src, fname)).convert('RGBA')
        W, H = im.size
        a = im.getchannel('A').point(lambda v: 255 if v > 24 else 0)
        px = a.load()
        rowp = [any(px[x, y] for x in range(0, W, 2)) for y in range(H)]
        rows = [r for r in runs(rowp, 6) if r[1] - r[0] > 40]
        boxes = []
        for (y0, y1) in rows:
            colp = [any(px[x, y] for y in range(y0, y1, 2)) for x in range(W)]
            # adaptive: sheets differ in spacing, so shrink the merge gap until the row yields the expected column count
            spans = []
            for gap in (14, 11, 8, 6, 4, 3, 2, 1, 0):
                spans = [c for c in runs(colp, gap) if c[1] - c[0] > 30]
                if len(spans) == cols: break
            for (x0, x1) in spans:
                bb = a.crop((x0, y0, x1, y1)).getbbox()
                boxes.append((x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3]))
        print(fname, league, 'rows', len(rows), 'logos', len(boxes))
        if len(boxes) != len(ids):
            print('  !! expected', len(ids), 'row spans', rows); 
            for (y0, y1) in rows:
                colp = [any(px[x, y] for y in range(y0, y1, 2)) for x in range(W)]
                print('   row', y0, y1, [c for c in runs(colp, 14)])
            sys.exit(1)
        os.makedirs(os.path.join(out, league), exist_ok=True)
        for cid, (x0, y0, x1, y1) in zip(ids, boxes):
            pad = 4
            crop = im.crop((max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)))
            path = os.path.join(out, league, cid + '.webp')
            crop.save(path, 'WEBP', quality=92, method=6)
            manifest[f'{league}/{cid}'] = {'w': crop.size[0], 'h': crop.size[1]}
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=0)
    print('total', len(manifest))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
