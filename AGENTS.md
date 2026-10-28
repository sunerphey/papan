# Agent notes

- Kitchen cabinet designer prototype: customers design cabinets and order the cut, edge-banded and finished panels plus hardware, to fit themselves or hire a fitter.
- Read `README.md` (construction conventions, decisions so far) and `plan.md` (what is done and what comes next) first. Keep both up to date.
- Front end only for now. Keep `src/layout.ts`, `src/cabinets.ts`, `src/design.ts` and `src/order.ts` free of DOM and Three.js so a backend can rerun them to recompute orders.
- Lengths are millimetres; plan points are [x, y] seen from above, with plan y mapping to world +Z. Preserve JSON compatibility of `kitchen-design.json`.
- The 3D view and the cut list must come from the same panel list.
- The layout must stay extendable (angled walls, islands, corners); cabinets are built in run-local frames.
- Keep this a practical prototype. Avoid unrequested polish or scope expansion.
- For code changes run `npm test` and `npm run build`; check visual changes with `scripts/browser-check.mjs` against `npm run preview`.
