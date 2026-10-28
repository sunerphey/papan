import catalogue from '../hardware.json';
import { roomWalls, runFrame, type RunFrame } from './layout';
import type { Fronts, HardwareCatalogue, KitchenDesign, MaterialKey, Run, RunKind, Unit, Vec3 } from './types';

export const hardware = catalogue as unknown as HardwareCatalogue;
const MAX_DOOR_WIDTH = 600;
const MIN_WORKTOP_CLEARANCE = 450;

export interface Box { min: Vec3; max: Vec3 }
/** Banded edges: L1/L2 run along the panel length, W1/W2 along its width. */
export interface Edges { l1: boolean; l2: boolean; w1: boolean; w2: boolean }

/**
 * A board to cut, at its finished size. `box` is its closed position in run coordinates;
 * the 3D view draws exactly these panels, so what customers see is what gets cut.
 */
export interface Panel {
  name: string; cabinet: string; run: string; material: MaterialKey;
  length: number; width: number; edges: Edges; finish: string;
  box: Box; mover?: string;
}
/** Hardware drawn in 3D only; it is ordered through `HardwareLine`s. */
export interface Fitting { look: 'metal' | 'plastic'; shape: 'box' | 'cylinder'; run: string; box: Box; mover?: string }
/** A door, flap or drawer. Swing amounts are degrees around the pivot; slides are millimetres along z. */
export interface Mover { id: string; run: string; motion: 'swing-y' | 'swing-x' | 'slide'; pivot: Vec3; amount: number }
export interface HardwareLine { name: string; cabinet: string; qty: number }
export interface RunLayout { id: string; kind: RunKind; frame: RunFrame; length: number; labels: (string | null)[] }
export interface KitchenModel {
  runs: RunLayout[]; panels: Panel[]; fittings: Fitting[]; movers: Mover[];
  hardware: HardwareLine[]; warnings: string[];
}

const NONE: Edges = { l1: false, l2: false, w1: false, w2: false };
const FRONT_EDGE: Edges = { l1: true, l2: false, w1: false, w2: false };
const ALL: Edges = { l1: true, l2: true, w1: true, w2: true };
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box =>
  ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const span = (ids: string[]) => ids.length > 1 ? `${ids[0]}–${ids.at(-1)}` : ids[0] ?? '';

export function unitLabels(run: Run): (string | null)[] {
  let count = 0;
  return run.units.map(unit => unit.type === 'cabinet' ? `${run.id}${++count}` : null);
}

export function hingeCount(doorHeight: number): number {
  const rule = hardware.hinge.countByDoorHeight.find(([maxHeight]) => doorHeight <= maxHeight);
  if (!rule) throw new Error(`No hinge rule covers a ${doorHeight} mm door.`);
  return rule[1];
}

/** Splits a height in proportion into whole millimetres; the last part takes the rounding remainder. */
export function splitHeights(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const heights = weights.map(weight => Math.floor(total * weight / sum));
  heights[heights.length - 1] += total - heights.reduce((a, b) => a + b, 0);
  return heights;
}

/** The longest drawer set and tallest side that fit a front height and carcass depth. */
export function drawerFit(frontHeight: number, innerDepth: number) {
  const system = hardware.drawerSystem;
  const length = system.nominalLengths.filter(l => l <= innerDepth - system.depthClearance).at(-1);
  const sideHeight = system.sideHeights.filter(h => h <= frontHeight - system.frontClearance).at(-1);
  return length && sideHeight ? { length, sideHeight } : undefined;
}

export function generateKitchen(design: KitchenDesign): KitchenModel {
  const model: KitchenModel = { runs: [], panels: [], fittings: [], movers: [], hardware: [], warnings: [] };
  const walls = roomWalls(design.room.walls);
  const c = design.construction;
  for (const run of design.runs) {
    const labels = unitLabels(run);
    let x = 0;
    run.units.forEach((unit, i) => {
      if (unit.type === 'cabinet') addCabinet(model, design, run, labels[i]!, x, unit);
      x += unit.width;
    });
    model.runs.push({ id: run.id, kind: run.kind, frame: runFrame(run.placement, walls), length: x, labels });
    if (run.kind === 'base') addWorktopsAndPlinths(model, design, run, labels);
    const placement = run.placement;
    if (placement.type === 'wall') {
      const wall = walls.find(w => w.id === placement.wall)!;
      const needed = placement.offset + x;
      if (needed > wall.length + 0.5) {
        model.warnings.push(`Run ${run.id} needs ${needed} mm along wall ${wall.id}, which is ${Math.round(wall.length)} mm.`);
      }
    }
  }
  const hasRun = (kind: RunKind) => design.runs.some(run => run.kind === kind && run.units.some(u => u.type === 'cabinet'));
  const worktopTop = c.base.legHeight + c.base.height + design.materials.worktop.thickness;
  if (hasRun('base') && hasRun('wall') && c.wall.bottomFromFloor - worktopTop < MIN_WORKTOP_CLEARANCE) {
    model.warnings.push(`Wall units are only ${c.wall.bottomFromFloor - worktopTop} mm above the worktop.`);
  }
  if (hasRun('wall') && c.wall.bottomFromFloor + c.wall.height > design.room.height) {
    model.warnings.push(`Wall units reach ${c.wall.bottomFromFloor + c.wall.height} mm, above the ${design.room.height} mm ceiling.`);
  }
  for (const panel of model.panels) {
    const material = design.materials[panel.material];
    const message = `${panel.cabinet} ${panel.name.toLowerCase()} is ${Math.max(panel.length, panel.width)} mm, ` +
      `longer than ${material.maxLength} mm ${material.name}; it needs a joint.`;
    if (Math.max(panel.length, panel.width) > material.maxLength && !model.warnings.includes(message)) model.warnings.push(message);
  }
  return model;
}

function addCabinet(model: KitchenModel, design: KitchenDesign, run: Run, id: string, x: number,
  unit: Extract<Unit, { type: 'cabinet' }>) {
  const c = design.construction, m = design.materials;
  const t = m.carcass.thickness, bt = m.back.thickness, ft = m.front.thickness, g = c.frontGap;
  const base = run.kind === 'base';
  const { height: H, depth: D } = base ? c.base : c.wall;
  const y0 = base ? c.base.legHeight : c.wall.bottomFromFloor;
  const W = unit.width, inner = W - 2 * t, sideDepth = D - bt;
  const frontFinish = design.frontStyle.finish === 'painted' ? `Painted ${m.front.color}` : 'Laminated';
  const frontEdges = design.frontStyle.finish === 'laminated' ? ALL : NONE;

  const panel = (name: string, material: MaterialKey, length: number, width: number, edges: Edges, b: Box,
    mover?: string, finish = '') =>
    model.panels.push({ name, cabinet: id, run: run.id, material, length, width, edges, finish, box: b, mover });
  const front = (name: string, b: Box, vertical: boolean, mover: string) => {
    const across = b.max[0] - b.min[0], up = b.max[1] - b.min[1];
    panel(name, 'front', vertical ? up : across, vertical ? across : up, frontEdges, b, mover, frontFinish);
  };
  const fitting = (look: Fitting['look'], b: Box, mover?: string, shape: Fitting['shape'] = 'box') =>
    model.fittings.push({ look, shape, run: run.id, box: b, mover });
  const order = (name: string, qty: number) => model.hardware.push({ name, cabinet: id, qty });
  const handle = (cx: number, cy: number, vertical: boolean, mover: string) => {
    if (design.frontStyle.handles === 'none') return;
    const { length, centres, name } = hardware.handle;
    const along = (offset: number, half: number, size: number, z0: number, z1: number) => vertical
      ? box(cx - size / 2, cy + offset - half, z0, cx + size / 2, cy + offset + half, z1)
      : box(cx + offset - half, cy - size / 2, z0, cx + offset + half, cy + size / 2, z1);
    fitting('metal', along(0, length / 2, 10, D + ft + 22, D + ft + 32), mover);
    for (const offset of [-centres / 2, centres / 2]) fitting('metal', along(offset, 4, 8, D + ft, D + ft + 22), mover);
    order(name, 1);
  };

  // Full-height sides; bottom, top and rails fit between them; the back is nailed on.
  panel('Side', 'carcass', H, sideDepth, FRONT_EDGE, box(x, y0, bt, x + t, y0 + H, D));
  panel('Side', 'carcass', H, sideDepth, FRONT_EDGE, box(x + W - t, y0, bt, x + W, y0 + H, D));
  panel('Bottom', 'carcass', inner, sideDepth, FRONT_EDGE, box(x + t, y0, bt, x + W - t, y0 + t, D));
  if (base) {
    const r = c.railWidth;
    panel('Front rail', 'carcass', inner, r, FRONT_EDGE, box(x + t, y0 + H - t, D - r, x + W - t, y0 + H, D));
    panel('Back rail', 'carcass', inner, r, NONE, box(x + t, y0 + H - t, bt, x + W - t, y0 + H, bt + r));
  } else {
    panel('Top', 'carcass', inner, sideDepth, FRONT_EDGE, box(x + t, y0 + H - t, bt, x + W - t, y0 + H, D));
  }
  panel('Back', 'back', H, W, NONE, box(x, y0, 0, x + W, y0 + H, bt));

  const shelves = unit.fronts.kind === 'drawers' ? 0 : unit.shelves;
  const pitch = (H - 2 * t - shelves * t) / (shelves + 1);
  for (let i = 0; i < shelves; i++) {
    const y = y0 + t + pitch * (i + 1) + t * i;
    panel('Shelf', 'carcass', inner - 2, sideDepth - c.shelfSetback, FRONT_EDGE,
      box(x + t + 1, y, bt, x + W - t - 1, y + t, D - c.shelfSetback));
  }
  if (shelves) order(hardware.shelfPin.name, 4 * shelves);

  if (base) {
    const legXs = W >= 1000 ? [50, W / 2, W - 50] : [50, W - 50];
    // Front legs stand just behind the plinth, which clips onto them.
    const frontLegZ = D - c.base.plinthSetback - ft - 20;
    for (const lx of legXs) for (const lz of [60, frontLegZ]) {
      fitting('plastic', box(x + lx - 15, 0, lz - 15, x + lx + 15, y0, lz + 15), undefined, 'cylinder');
    }
    order(hardware.leg.name, legXs.length * 2);
    order(hardware.plinthClip.name, legXs.length);
  } else {
    for (const hx of [x + t, x + W - t - 40]) fitting('metal', box(hx, y0 + H - t - 60, bt, hx + 40, y0 + H - t, bt + 30));
    order(hardware.wallHanger.name, 2);
  }

  addFronts(unit.fronts);

  function addFronts(fronts: Fronts) {
    if (fronts.kind === 'doors') {
      const n = fronts.count, doorW = Math.floor((W - n * g) / n), doorH = H - g;
      const fy = base ? y0 : y0 + g / 2;
      if (doorW > MAX_DOOR_WIDTH) model.warnings.push(`${id}: a ${doorW} mm door is heavy; use two doors.`);
      for (let i = 0; i < n; i++) {
        const x0 = x + i * W / n + g / 2, x1 = x0 + doorW;
        const left = (n === 2 ? (i === 0 ? 'left' : 'right') : fronts.hinge ?? 'left') === 'left';
        const mover = `${id}-door-${i + 1}`;
        model.movers.push({ id: mover, run: run.id, motion: 'swing-y', pivot: [left ? x0 : x1, 0, D], amount: left ? -105 : 105 });
        front('Door', box(x0, fy, D, x1, fy + doorH, D + ft), true, mover);
        const hinges = hingeCount(doorH), e = hardware.hinge.edgeDistance;
        order(hardware.hinge.name, hinges);
        for (let k = 0; k < hinges; k++) {
          const hy = fy + e + (doorH - 2 * e) * k / (hinges - 1);
          const arm = left ? x0 + 5 : x1 - 45, plate = left ? x + t : x + W - t - 12;
          fitting('metal', box(arm, hy - 20, D - 35, arm + 40, hy + 20, D), mover);
          fitting('metal', box(plate, hy - 25, D - 70, plate + 12, hy + 25, D - 30));
        }
        const handleY = base ? fy + doorH - 40 - hardware.handle.length / 2 : fy + 40 + hardware.handle.length / 2;
        handle(left ? x1 - 35 : x0 + 35, handleY, true, mover);
      }
    } else if (fronts.kind === 'drawers') {
      const system = hardware.drawerSystem, dt = m.drawer.thickness;
      const heights = splitHeights(H - fronts.split.length * g, fronts.split);
      let top = y0 + H - g;
      heights.forEach((h, i) => {
        const fy = top - h, mover = `${id}-drawer-${i + 1}`;
        const fit = drawerFit(h, sideDepth);
        model.movers.push({ id: mover, run: run.id, motion: 'slide', pivot: [0, 0, 0], amount: (fit?.length ?? sideDepth) - 50 });
        front('Drawer front', box(x + g / 2, fy, D, x + W - g / 2, top, D + ft), false, mover);
        handle(x + W / 2, top - 40, false, mover);
        if (!fit) {
          model.warnings.push(`${id}: no drawer set fits a ${h} mm front.`);
        } else {
          const { length: nl, sideHeight: sh } = fit;
          const bw = inner - system.bottomWidthDeduction, bd = nl - system.bottomDepthDeduction;
          const backW = inner - system.backWidthDeduction, backH = sh - system.backHeightDeduction;
          const cx = x + W / 2, by = fy + t + 5, z0 = D - nl;
          panel('Drawer bottom', 'drawer', bw, bd, NONE, box(cx - bw / 2, by, z0, cx + bw / 2, by + dt, z0 + bd), mover);
          // Only the top edge of the back shows inside the drawer.
          panel('Drawer back', 'drawer', backW, backH, FRONT_EDGE,
            box(cx - backW / 2, by + dt, z0, cx + backW / 2, by + dt + backH, z0 + dt), mover);
          const sides: [number, number][] = [[cx - bw / 2 - system.sideThickness, cx - bw / 2], [cx + bw / 2, cx + bw / 2 + system.sideThickness]];
          for (const [a, b] of sides) fitting('metal', box(a, by, z0, b, by + sh, D), mover);
          fitting('metal', box(x + t, by - 5, z0, sides[0][0], by + 25, D - 10));
          fitting('metal', box(sides[1][1], by - 5, z0, x + W - t, by + 25, D - 10));
          order(`${system.name}, ${nl} mm, side ${sh} mm`, 1);
        }
        top = fy - g;
      });
    } else if (fronts.kind === 'lift-up') {
      const mover = `${id}-flap`, fy = y0 + g / 2, fy1 = y0 + H - g / 2;
      model.movers.push({ id: mover, run: run.id, motion: 'swing-x', pivot: [0, fy1, D], amount: -100 });
      front('Lift-up front', box(x + g / 2, fy, D, x + W - g / 2, fy1, D + ft), false, mover);
      handle(x + W / 2, fy + 40, false, mover);
      order(hardware.liftUp.name, 1);
      for (const mx of [x + t, x + W - t - 25]) fitting('metal', box(mx, fy1 - 170, D - 220, mx + 25, fy1 - 30, D - 20));
    }
  }
}

/** Worktops span cabinets and under-worktop gaps; plinths span cabinets only. */
function addWorktopsAndPlinths(model: KitchenModel, design: KitchenDesign, run: Run, labels: (string | null)[]) {
  const c = design.construction, m = design.materials;
  const segments = (covers: (unit: Unit) => boolean) => {
    const found: { start: number; end: number; cabinets: string[] }[] = [];
    let x = 0, current: (typeof found)[number] | undefined;
    run.units.forEach((unit, i) => {
      if (covers(unit)) {
        current ??= { start: x, end: x, cabinets: [] };
        current.end = x + unit.width;
        if (labels[i]) current.cabinets.push(labels[i]!);
      } else if (current) {
        found.push(current);
        current = undefined;
      }
      x += unit.width;
    });
    if (current) found.push(current);
    return found;
  };
  const top = c.base.legHeight + c.base.height;
  for (const s of segments(unit => unit.type === 'cabinet' || !!unit.underWorktop)) {
    model.panels.push({
      name: 'Worktop', cabinet: span(s.cabinets), run: run.id, material: 'worktop',
      length: s.end - s.start, width: c.worktopDepth, edges: FRONT_EDGE, finish: '',
      box: box(s.start, top, 0, s.end, top + m.worktop.thickness, c.worktopDepth),
    });
  }
  const plinthHeight = c.base.legHeight - 3, z1 = c.base.depth - c.base.plinthSetback;
  for (const s of segments(unit => unit.type === 'cabinet')) {
    model.panels.push({
      name: 'Plinth', cabinet: span(s.cabinets), run: run.id, material: 'front',
      length: s.end - s.start, width: plinthHeight, edges: NONE,
      finish: design.frontStyle.finish === 'painted' ? `Painted ${m.front.color}` : 'Laminated',
      box: box(s.start, 0, z1 - m.front.thickness, s.end, plinthHeight, z1),
    });
  }
}
