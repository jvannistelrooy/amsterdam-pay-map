# Amsterdam Tech Pay

A 3D night map of Amsterdam that shows what tech companies pay. Every building is real: 146,431 footprints with their measured heights from 3DBAG, on top of water, parks, streets and rail from the Kadaster's TOP10NL. 65 tech companies appear as glowing pillars above their offices, and each pillar's height is the company's median total compensation in the Greater Amsterdam Area, from Levels.fyi.

**Live map: <https://jvannistelrooy.github.io/amsterdam-pay-map/>**

Inspired by [Ville Lumière](https://arikhanacademic-cpu.github.io/ville-lumiere/), Ari Khan's map of Paris tech pay, which was itself inspired by Levels.fyi's Peninsula atlas.

## Using the map

- Drag to pan, right-drag (or two fingers) to rotate and tilt, scroll to zoom.
- Search companies, streets, canals, landmarks and metro stations with `/` or `⌘K`.
- Click a pillar or a row in the ranking to see the median, the base / stock / bonus split and the pay per level.
- The layers menu toggles pillars, metro lines 52 and 54, street names, neighbourhood names, label density and currency.

## Running it

It's a static site with no build step. Serve the folder with any web server, for example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. It needs a browser with WebGL and `DecompressionStream` (any current Chrome, Edge, Firefox or Safari).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page, styles and interface |
| `main.js` | Map engine (three.js r128): loads the city, draws buildings, water, roads, trees and pillars, and runs the interface |
| `data.js` | Companies with their Levels.fyi pay figures and approximate office locations, sectors, metro lines and neighbourhoods |
| `data/city.bin.gz` | The packed city: buildings, water, green, roads, rail, trees and place names (4.5 MB) |
| `scripts/` | The pipeline that rebuilds `data/city.bin.gz` from the open data sources |

## Rebuilding the city data

```sh
pip install shapely numpy
scripts/fetch_3dbag.sh          # 3DBAG buildings, ~110 MB of GeoJSON into raw/bag
python3 scripts/fetch_top10nl.py  # TOP10NL topography, ~170 MB into raw/top
python3 scripts/build_city.py     # writes data/city.bin.gz
```

The map covers RD New (EPSG:28992) X 115000–129000, Y 479000–493000: about 14 × 14 km from Sloterdijk to Bijlmer and from Noord to Zuidas. `build_city.py` simplifies the geometry, drops buildings under 15 m², places trees along the canal quays and in woods and parks, and quantises everything to 25 cm.

## Data and attribution

- **Buildings:** [3DBAG](https://3dbag.nl) by 3DGI and the 3D Geoinformation group at TU Delft, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Topography:** [TOP10NL](https://www.kadaster.nl/zakelijk/producten/geo-informatie/topnl) © Kadaster, via [PDOK](https://www.pdok.nl), licensed CC BY 4.0.
- **Pay:** medians from [Levels.fyi](https://www.levels.fyi) for the Greater Amsterdam Area, retrieved 20 October 2026 and converted from USD to EUR at the rate Levels.fyi shows. A role is shown only when it has at least 3 submissions. These are self-reported figures and many samples are small, so check Levels.fyi for current numbers.
  - Included: every company from a list of about 175 with an Amsterdam presence that has Amsterdam pay data, except fully remote companies without an Amsterdam office (GitHub, GitLab, HashiCorp) and duplicates (Booking Holdings is shown as Booking.com, Yandex as its successor Nebius).
  - A few offices sit outside the 3D area: Microsoft (Schiphol), Ahold Delhaize (Zaandam), and Nike and Xebia (Hilversum).
  - Office positions are approximate (neighbourhood level).

This is an unofficial fan project and isn't affiliated with Levels.fyi, 3DGI, TU Delft or the Kadaster.

## Licence

The code is MIT licensed (see `LICENSE`). The data in `data/` keeps the licences of its sources listed above.
