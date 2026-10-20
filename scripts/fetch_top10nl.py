"""Download TOP10NL water, land use, roads and rail (Kadaster, via PDOK) for the map area, in 2 km tiles."""
import json,subprocess,os,sys,concurrent.futures as cf
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'raw','top')
os.makedirs(OUT,exist_ok=True)
RD='http://www.opengis.net/def/crs/EPSG/0/28992'
LAYERS=sys.argv[1:] or ['waterdeel_vlak','terrein_vlak','wegdeel_vlak','spoorbaandeel_lijn','functioneel_gebied_vlak']
def get(url):
    for i in range(5):
        r=subprocess.run(['curl','-sS','-f','-m','180',url],capture_output=True)
        if r.returncode==0:
            try: return json.loads(r.stdout)
            except Exception: pass
        import time; time.sleep(2+i*3)
    raise RuntimeError(url)
def tile(layer,x,y):
    fn=f'{OUT}/{layer}_{x}_{y}.json'
    if os.path.exists(fn): return
    url=f'https://api.pdok.nl/brt/top10nl/ogc/v1/collections/{layer}/items?f=json&limit=1000&crs={RD}&bbox-crs={RD}&bbox={x},{y},{x+2000},{y+2000}'
    feats=[]
    while url:
        d=get(url); feats+=d['features']
        url=next((l['href'] for l in d.get('links',[]) if l['rel']=='next'),None)
    json.dump({'type':'FeatureCollection','features':feats},open(fn+'.tmp','w')); os.rename(fn+'.tmp',fn)
jobs=[(l,x,y) for l in LAYERS for x in range(115000,129000,2000) for y in range(479000,493000,2000)]
with cf.ThreadPoolExecutor(4) as ex:
    for f in cf.as_completed([ex.submit(tile,*j) for j in jobs]):
        e=f.exception()
        if e: print('ERR',e,flush=True)
print('done',len(os.listdir(OUT)))
