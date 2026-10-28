# Plan

Working plan for the kitchen cabinet studio. Tick items off and adjust as decisions change; `README.md` keeps the conventions and decisions already made.

Order of work: finish the layout core first (it is the base everything else sits on), then editing, then manufacturing data and exports, then the backend.

## Done

- [x] Room as an outline of wall points at any angle; runs placed on a wall or freestanding (islands).
- [x] Base and wall cabinets built in run-local frames: doors, drawers, lift-up flaps, open shelves, gaps.
- [x] 3D view with clickable doors, drawers and flaps; shelves, drawer boxes, runners and hinges visible.
- [x] Cut list (merged, edge banding, finish), hardware list, material totals, CSV download.
- [x] Tests (layout frames, cabinet sizes, 3D = cut list, order) and a browser check with screenshots.

## Phase 1: Layout core

1. **Collision and fit checks**
   - Footprint of every run in plan (wall units at their height); warn when runs overlap each other, leave the room outline, or wall units clash with tall units.
   - Done when: overlapping runs, a run through a wall and a wall unit over a tall unit each give a clear warning, with tests.
2. **Corners where runs meet** (90° first)
   - Blind corner base and wall units (blind side and width), filler panels (also at walls, so doors and handles clear).
   - Worktops: one runs through the corner, the other butts against it; plinths meet at the corner.
   - Done when: an L-shaped default example renders, cut list includes fillers and both worktops at the right lengths, no false overlap warnings.
3. **Non-90° corners** (angled walls)
   - Angled fillers or worktop cuts between runs that meet at other angles; extends the angled-island example.
4. **Tall units**
   - Fridge and oven housings in a base run, full height; wall runs must leave space (caught by step 1).
5. **Islands finished**
   - Finished back and end panels for freestanding runs; worktop overhang for seating.
6. **Openings in walls**
   - Windows and doors on walls (offset, width, sill height, height); shown in 3D; wall units over them give a warning.

## Phase 2: Editing

1. **Unit editor**: per run, add, remove and reorder units; width, fronts, shelves, hinge side; inline validation; save and load JSON, keep the last design in browser storage.
2. **Room and run editor**: a 2D plan view to edit wall points (lengths and angles) and place runs on walls or freely (islands).
3. **Style choices**: front colour, painted or laminated, handles; carcass and worktop materials from a list.

## Phase 3: Manufacturing data

1. **Real hardware catalogue** (needs your choice of brands): drawer systems with their bottom and back deductions per length, hinges with cup position and overlay, lift-up mechanisms sized by front weight, legs, hangers.
2. **Drill positions on panels**: holes in panel coordinates (face, position, diameter, depth) for hinge cups and plates, shelf pin rows, assembly joints, runners, handles. Optionally shown in 3D.
3. **Assembly fixings**: count confirmat screws or dowels, back nails, plinth clips (depends on the chosen assembly method).

## Phase 4: Output

1. **Cut list options**: column order per subcontractor, `,` or `;` separator, .xlsx.
2. **Panel drawings**: PDF or SVG sheet per unique panel with sizes, edge banding and holes.
3. **Machine exports** once a subcontractor is chosen: DXF with named layers first, then their format (woodWOP, Biesse, PRO100…); each tested against a sample file from them.
4. **Customer documents**: wall elevations with dimensions; assembly instructions per cabinet.

## Phase 5: Backend

- Accounts and saved designs; the server reruns `generateKitchen` on the saved design instead of trusting the browser's cut list.
- Pricing: board per m², paint or facing per m², edge banding per metre, hardware unit prices, cutting and labour.
- Orders, payment, sending files to the subcontractor, order status.
- Stack decided then; Node.js keeps the shared TypeScript as-is.

## Decisions needed from you

- Hardware brands for hinges, drawer systems and lift-ups (Phase 3.1).
- Board materials, decors, paint colours and sheens you will offer (Phase 2.3).
- Standard sizes: carcass height, leg height, wall unit heights (defaults are 720 / 140 / 720 mm).
- Assembly method: confirmat screws, dowels or cam locks (affects drilling).
- Cutting subcontractor, their cut-list template and a sample file (Phase 4).
- Whether you sell worktops, or only cabinets.

## Next up

Phase 1.1 and 1.2: collision checks, then corner units with an L-shaped example. Then Phase 2.1, the unit editor.
