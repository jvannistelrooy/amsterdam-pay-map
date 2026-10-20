"""Pack 3DBAG buildings and TOP10NL topography for Amsterdam into one gzip'd binary for the browser.

Coordinates are RD New (EPSG:28992) metres, quantised to 0.25 m from (QX, QY) and delta-coded as int16
pairs per layer stream. Header is JSON describing every typed-array section.
"""
import json, glob, gzip, struct, math, collections, os
import numpy as np
from shapely.geometry import shape, Polygon, MultiPolygon, LineString, MultiLineString
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP = os.path.join(ROOT, 'raw') + '/'
OUT = os.path.join(ROOT, 'data', 'city.bin.gz')
QX, QY, RES = 115000, 479000, 0.25
X1, Y1 = 129000, 493000
CHUNK = 1000


class Stream:
    """Each ring: absolute uint16 start in .s, then n-1 int16 deltas in .d."""
    def __init__(self):
        self.d = []; self.s = []
    def ring(self, coords):
        q = [(min(max(round((x - QX) / RES), 0), 65535), min(max(round((y - QY) / RES), 0), 65535)) for x, y in coords]
        self.s += q[0]
        for (ax, ay), (bx, by) in zip(q, q[1:]):
            dx, dy = bx - ax, by - ay
            assert -32768 <= dx <= 32767 and -32768 <= dy <= 32767
            self.d += (dx, dy)
        return len(q)


def rings_of(poly):
    out = []
    for r in [poly.exterior] + list(poly.interiors):
        c = list(r.coords)[:-1]
        if len(c) >= 3:
            out.append(c)
    return out


def polys(geom):
    if geom.is_empty: return []
    if isinstance(geom, Polygon): return [geom]
    if isinstance(geom, MultiPolygon): return list(geom.geoms)
    return [g for g in getattr(geom, 'geoms', []) if isinstance(g, Polygon)]


def inside(p):
    return QX <= p.x <= X1 and QY <= p.y <= Y1


# ---------- buildings ----------
seen = set(); blds = []
for f in sorted(glob.glob(SP + 'bag/t_*.json')):
    for ft in json.load(open(f))['features']:
        p = ft['properties']; k = p['fid']
        if k in seen or not ft['geometry']: continue
        seen.add(k)
        g = shape(ft['geometry'])
        if g.area < 15: continue
        h = (p['b3_h_70p'] or 0) - (p['b3_h_maaiveld'] or 0)
        if not (1.5 <= h <= 250): h = max(3.0, min(h, 250)) if h > 0 else 3.0
        g = g.simplify(0.3, preserve_topology=True)
        for pg in polys(g):
            if pg.area < 15: continue
            c = pg.centroid
            if not inside(c): continue
            roof = {'horizontal': 0, 'slanted': 1, 'multiple horizontal': 2}.get(p['b3_dak_type'], 0)
            nok = (p['b3_h_nok'] or 0) - (p['b3_h_maaiveld'] or 0)
            blds.append((c.x, c.y, pg, h, p['oorspronkelijkbouwjaar'] or 0, roof, max(h, min(nok, h * 1.6))))
print('buildings', len(blds))

# chunk + serpentine order so deltas stay small
nx = (X1 - QX) // CHUNK; ny = (Y1 - QY) // CHUNK
bych = collections.defaultdict(list)
for b in blds:
    i = int((b[0] - QX) // CHUNK); j = int((b[1] - QY) // CHUNK)
    bych[(i, j)].append(b)
order = []
for j in range(ny):
    cols = range(nx) if j % 2 == 0 else range(nx - 1, -1, -1)
    for i in cols:
        if (i, j) in bych: order.append((i, j))
bs = Stream(); bH = []; bNok = []; bYear = []; bRoof = []; bRings = []; rLen = []; chunks = []
for (i, j) in order:
    L = sorted(bych[(i, j)], key=lambda b: (round(b[1] / 100), b[0]))
    chunks.append([i, j, len(L)])
    for cx, cy, pg, h, yr, roof, nok in L:
        rs = rings_of(pg)
        bH.append(round(h * 10)); bNok.append(round(nok * 10)); bYear.append(yr); bRoof.append(roof); bRings.append(len(rs))
        for r in rs: rLen.append(bs.ring(r))

# ---------- topography ----------
def load(layer):
    ids = set(); out = []
    for f in sorted(glob.glob(SP + f'top/{layer}_*.json')):
        for ft in json.load(open(f))['features']:
            p = ft['properties']; i = p.get('lokaal_id')
            if i in ids or not ft['geometry']: continue
            ids.add(i); out.append((p, shape(ft['geometry'])))
    return out

from shapely.geometry import box as _box
BOX = _box(QX + 1, QY + 1, X1 - 1, Y1 - 1)
def serp(items):
    def key(it):
        c = it[1].centroid; band = int((c.y - QY) // 500)
        return (it[0], band, c.x if band % 2 == 0 else -c.x)
    return sorted(items, key=key)
def poly_layer(items, tol):
    st = Stream(); cls = []; nr = []; lens = []
    items = [(c, g.intersection(BOX)) for c, g in items if g.intersects(BOX)]
    for c, g in serp([it for it in items if not it[1].is_empty]):
        for pg in polys(g.simplify(tol, preserve_topology=True)):
            if pg.area < 4: continue
            rs = rings_of(pg)
            if not rs: continue
            cls.append(c); nr.append(len(rs))
            for r in rs: lens.append(st.ring(r))
    return st, cls, nr, lens

water = load('waterdeel_vlak')
wl = [(0 if p['typewater'] == 'waterloop' else 1, g) for p, g in water]
names = collections.defaultdict(list)
for p, g in water:
    n = p.get('naamnl')
    if n and p.get('hoogteniveau', 0) == 0: names[n.split('|')[0]].append(g)
wlabels = []
for n, gs in names.items():
    u = unary_union(gs); area = u.area
    if area < 2500: continue
    pcs = sorted(polys(u), key=lambda q: -q.area)
    for k, pc in enumerate(pcs[:3]):
        if pc.area < max(2500, area * 0.2) and k: break
        rp = pc.representative_point()
        if inside(rp): wlabels.append([n, round(rp.x, 1), round(rp.y, 1), round(pc.area)])
print('water labels', len(wlabels))

GREEN = {'grasland': 1, 'akkerland': 1, 'dodenakker': 1, 'boomgaard': 2, 'populieren': 2, 'bos: loofbos': 2, 'bos: gemengd bos': 2, 'bos: naaldbos': 2, 'spoorbaanlichaam': 3, 'zand': 4}
terr = [(GREEN[p['typelandgebruik']], g) for p, g in load('terrein_vlak') if p['typelandgebruik'] in GREEN and p.get('hoogteniveau', 0) >= 0]

def road_class(p):
    t = (p.get('typeweg') or '').split('|'); u = (p.get('hoofdverkeersgebruik') or '')
    if 'autosnelweg' in t or 'hoofdweg' in t: return 4
    if 'regionale weg' in t: return 3
    if 'lokale weg' in t or 'straat' in t or 'parkeerplaats' in t:
        return 2 if 'gemengd' in u or 'bus' in u or not u else (1 if 'fietsers' in u else 0)
    if 'fietsers' in u: return 1
    return 0
rlabels = collections.defaultdict(list)
roads = []
for p, g in load('wegdeel_vlak'):
    if p.get('hoogteniveau', 0) < 0: continue
    c = road_class(p); roads.append((c, g))
    n = p.get('naam') or p.get('straatnaam')
    if n and c >= 2: rlabels[n.split('|')[0]].append(g)
roadlabels = []
for n, gs in rlabels.items():
    u = unary_union(gs)
    if u.area < 1500: continue
    pc = max(polys(u), key=lambda q: q.area) if polys(u) else None
    if pc is None: continue
    rp = pc.representative_point()
    # direction from the oriented bounding box, so labels can follow the street
    mrr = pc.minimum_rotated_rectangle; cs = list(mrr.exterior.coords)
    e1 = (cs[1][0] - cs[0][0], cs[1][1] - cs[0][1]); e2 = (cs[2][0] - cs[1][0], cs[2][1] - cs[1][1])
    e = e1 if math.hypot(*e1) > math.hypot(*e2) else e2
    if inside(rp): roadlabels.append([n, round(rp.x, 1), round(rp.y, 1), round(u.area), round(math.atan2(e[1], e[0]), 3)])
print('road labels', len(roadlabels))

rails = []
for p, g in load('spoorbaandeel_lijn'):
    if p.get('hoogteniveau', 0) < 0 or 'tunnel' in (p.get('fysiekvoorkomen') or ''): continue
    c = {'trein': 0, 'tram': 1, 'metro': 2}.get(p.get('typespoorbaan'), 0)
    gs = [g] if isinstance(g, LineString) else list(getattr(g, 'geoms', []))
    for l in gs:
        l = l.intersection(BOX)
        for q in ([l] if isinstance(l, LineString) else list(getattr(l, 'geoms', []))):
            if isinstance(q, LineString) and not q.is_empty: rails.append((c, q.simplify(0.8)))
rails = serp(rails)
rs_ = Stream(); railC = []; railLen = []
for c, l in rails:
    cs = list(l.coords)
    if len(cs) < 2: continue
    railC.append(c); railLen.append(rs_.ring(cs))

wS, wC, wN, wL = poly_layer(wl, 0.8)
gS, gC, gN, gL = poly_layer(terr, 1.5)
rS, rC, rN, rL = poly_layer(roads, 0.6)
print('water', len(wC), 'green', len(gC), 'roads', len(rC), 'rails', len(railC))

# ---------- trees: canal quays + woods + parks ----------
import random
from shapely.strtree import STRtree
from shapely.geometry import Point
from shapely.prepared import prep
random.seed(5)
btree = STRtree([b[2] for b in blds]); wtree = STRtree([g for c, g in wl])
def free(pt):
    return not len(btree.query(pt, predicate='intersects')) and not len(wtree.query(pt, predicate='intersects'))
TR = []
QUAY = ('gracht', 'amstel', 'singel', 'kanaal', 'vaart', 'kade', 'sloot', 'wetering', 'rak')
for p, g in water:
    n = (p.get('naamnl') or '').lower()
    if p.get('typewater') != 'waterloop' or p.get('hoogteniveau', 0) != 0 or not any(k in n for k in QUAY): continue
    for pg in polys(g):
        ring = pg.exterior; L = ring.length; d = random.random() * 6
        while d < L:
            a = ring.interpolate(d); b = ring.interpolate(min(L, d + 1.0))
            tx, ty = b.x - a.x, b.y - a.y; m = math.hypot(tx, ty) or 1
            for sgn in (1, -1):
                q = Point(a.x - ty / m * 4.5 * sgn, a.y + tx / m * 4.5 * sgn)
                if not pg.contains(q):
                    if inside(q) and free(q): TR.append((q.x, q.y, 1))
                    break
            d += 8.5 + random.random() * 3
nq = len(TR)
for cls, g in terr:
    if cls not in (1, 2): continue
    dens = 260 if cls == 2 else 1400
    for pg in polys(g.intersection(BOX)):
        n = int(pg.area / dens)
        if n < 1: continue
        pp = prep(pg); x0, y0, x1, y1 = pg.bounds; k = 0; tries = 0
        while k < n and tries < n * 6:
            tries += 1
            q = Point(x0 + random.random() * (x1 - x0), y0 + random.random() * (y1 - y0))
            if pp.contains(q): TR.append((q.x, q.y, 2 if cls == 2 else 3)); k += 1
print('trees quay', nq, 'park/wood', len(TR) - nq)
tXY = []; tK = []
for x, y, k in TR:
    tXY += (min(max(round((x - QX) / RES), 0), 65535), min(max(round((y - QY) / RES), 0), 65535)); tK.append(k)

# ---------- write ----------
secs = []; blobs = []; off = 0
def add(name, arr, dt):
    global off
    a = np.asarray(arr, dtype=dt).tobytes()
    pad = (-off) % 4
    if pad: blobs.append(b'\0' * pad); off += pad
    secs.append([name, np.dtype(dt).name, off, len(arr)]); blobs.append(a); off += len(a)
add('bH', bH, np.uint16); add('bNok', bNok, np.uint16); add('bYear', bYear, np.uint16); add('bRoof', bRoof, np.uint8); add('bRings', bRings, np.uint8); add('bLen', rLen, np.uint16); add('bXY', bs.d, np.int16); add('bS', bs.s, np.uint16)
for nm, (S, C, N, L) in {'w': (wS, wC, wN, wL), 'g': (gS, gC, gN, gL), 'r': (rS, rC, rN, rL)}.items():
    add(nm + 'C', C, np.uint8); add(nm + 'N', N, np.uint16); add(nm + 'Len', L, np.uint32); add(nm + 'XY', S.d, np.int16); add(nm + 'S', S.s, np.uint16)
add('tXY', tXY, np.uint16); add('tK', tK, np.uint8)
add('lC', railC, np.uint8); add('lLen', railLen, np.uint32); add('lXY', rs_.d, np.int16); add('lS', rs_.s, np.uint16)
head = json.dumps({'q': [QX, QY, RES], 'chunk': CHUNK, 'chunks': chunks, 'sections': secs,
                   'waterLabels': wlabels, 'roadLabels': sorted(roadlabels, key=lambda r: -r[3])[:900],
                   'source': '3DBAG (TU Delft / 3DGI, CC BY 4.0) and TOP10NL (Kadaster, CC BY 4.0) via PDOK'}, ensure_ascii=False).encode()
hpad = (-(4 + len(head))) % 4
raw = struct.pack('<I', len(head) + hpad) + head + b' ' * hpad + b''.join(blobs)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with gzip.open(OUT, 'wb', 9) as fh: fh.write(raw)
print('raw MB', round(len(raw) / 1e6, 2), 'gz MB', round(os.path.getsize(OUT) / 1e6, 2))
