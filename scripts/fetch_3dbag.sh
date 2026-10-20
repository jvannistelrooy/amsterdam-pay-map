#!/bin/bash
# Download 3DBAG LoD1.2 footprints with heights for the map area, in 2 km tiles (RD New).
set -u
mkdir -p "$(dirname "$0")/../raw/bag" && cd "$(dirname "$0")/../raw/bag"
fetch(){ x=$1; y=$2; f="t_${x}_${y}.json"; [ -s "$f" ] && return
  for i in 1 2 3 4; do curl -sS -f -m 300 "https://data.3dbag.nl/api/BAG3D/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=BAG3D:lod12&outputFormat=application/json&count=50000&propertyName=geom,b3_h_70p,b3_h_maaiveld,b3_h_nok,b3_dak_type,oorspronkelijkbouwjaar&bbox=$x,$y,$((x+2000)),$((y+2000)),EPSG:28992" -o "$f.tmp" && mv "$f.tmp" "$f" && return; sleep $((i*3)); done; echo "FAIL $x $y"; }
export -f fetch
for x in $(seq 115000 2000 127000); do for y in $(seq 479000 2000 491000); do echo $x $y; done; done | xargs -P 4 -n 2 bash -c 'fetch "$@"' _
echo done; ls | wc -l; du -sh .
