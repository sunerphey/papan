# Kitchen cabinet studio

Prototype kitchen-cabinet designer: lay out cabinets, open them in 3D, and get the order list of panels (cut, edge-banded, painted) plus hardware.

## Run

```sh
npm install
npm run dev
```

- `/`: the fixed layout from `kitchen-design.json`; edit the file and the page reloads.
- `/?design=examples/angled-island.json`: an angled wall and an island, using the same layout code.
- Order list tab: merged cut list, hardware and material totals; download it as CSV.

## Layout model

- Lengths are millimetres. The room is a closed outline of wall start points (any angles).
- A run is a straight row of cabinets and gaps, placed on a wall (`offset` from its left end, seen from inside) or freestanding (`origin` + `angleDeg`, e.g. an island).
- Cabinets are built in their run's local frame; the 3D view and the cut list read the same panel list.
- `hardware.json` holds generic hardware names and placeholder rules; replace them with real products and data sheets before taking orders.

## Construction conventions

- Carcass: full-height sides; bottom, top (wall units) or two 100 mm rails (base units) fit between them; 3 mm HDF back nailed on. Base units stand on legs behind a plinth.
- Fronts overlay the carcass with a `frontGap` (3 mm) split around each front. Doors are hinged on the outer edge; pairs open from the middle.
- Cut sizes are finished sizes. Length runs along the grain (vertical for sides, backs and doors; horizontal for drawer fronts, flaps, worktops and plinths). L1/L2 are the edges along the length, W1/W2 along the width.
- Cabinets are labelled by run and position, e.g. B1 and W3; gaps are not numbered.

## Decisions so far

- Business model: customers design here and order panels (we cut, edge-band, paint or face them, via a subcontractor) plus hardware, then fit them or hire a fitter.
- Front-end prototype first; a backend (accounts, saved designs, pricing, orders, payment) comes later and reruns the same pure TypeScript to recompute each order.
- Exports: a CSV/Excel cut list works with any cutting service; add PDF panel drawings with drill positions next; add machine formats (e.g. HOMAG woodWOP, Biesse, DXF layers, PRO100) per subcontractor, as separate exporters over the same panel list, tested against a sample file from that subcontractor.
- Start with a fixed layout, but keep the layout model general enough for angled walls, islands and other non-standard rooms.

## Next steps

See [plan.md](plan.md).

## Checks

```sh
npm test
npm run build && npm run preview   # then, in another shell:
node scripts/browser-check.mjs     # screenshots in artifacts/
```
