import { roomWalls, signedArea } from './layout';
import type { Fronts, KitchenDesign, MaterialKey, Run, RunKind, Unit } from './types';

export const MATERIAL_KEYS: MaterialKey[] = ['carcass', 'drawer', 'back', 'front', 'worktop'];
const FRONTS_BY_RUN: Record<RunKind, string[]> = { base: ['doors', 'drawers', 'open'], wall: ['doors', 'lift-up', 'open'] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isVec2 = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);

function fail(message: string): never { throw new Error(message); }

function whole(value: unknown, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail(`${label} must be a whole number from ${min} to ${max}.`);
  }
}

function unique(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) fail(`${label} must be unique.`);
}

export function validateDesign(value: unknown): KitchenDesign {
  if (!isRecord(value) || value.format !== 'kitchen-design' || value.version !== 1 || value.units !== 'mm') {
    fail('Use a kitchen-design version 1 file in millimetres.');
  }
  const design = structuredClone(value) as unknown as KitchenDesign;
  const { room, construction: c, materials, frontStyle, runs } = design;
  if (![room, c, c?.base, c?.wall, materials, frontStyle].every(isRecord) || !Array.isArray(runs)) {
    fail('The design needs room, construction (with base and wall), materials, frontStyle and runs.');
  }

  whole(room.height, 2000, 4000, 'Room height (mm)');
  if (!Array.isArray(room.walls) || room.walls.length < 3) fail('The room needs at least three walls.');
  room.walls.forEach((wall, i) => {
    if (!isRecord(wall) || typeof wall.id !== 'string' || !wall.id || !isVec2(wall.start)) {
      fail(`Wall ${i + 1} needs an id and a start point [x, y].`);
    }
  });
  unique(room.walls.map(wall => wall.id), 'Wall ids');
  if (roomWalls(room.walls).some(wall => !(wall.length >= 1))) fail('Each wall must be at least 1 mm long.');
  if (Math.abs(signedArea(room.walls.map(wall => wall.start))) < 1e6) fail('The room outline must enclose at least 1 m².');

  whole(c.frontGap, 1, 6, 'Front gap (mm)');
  whole(c.shelfSetback, 0, 100, 'Shelf setback (mm)');
  whole(c.railWidth, 50, 200, 'Rail width (mm)');
  whole(c.base.height, 300, 1000, 'Base unit height (mm)');
  whole(c.base.depth, 300, 800, 'Base unit depth (mm)');
  whole(c.base.legHeight, 50, 250, 'Leg height (mm)');
  whole(c.base.plinthSetback, 0, 150, 'Plinth setback (mm)');
  whole(c.wall.height, 200, 1200, 'Wall unit height (mm)');
  whole(c.wall.depth, 200, 500, 'Wall unit depth (mm)');
  whole(c.wall.bottomFromFloor, 900, 2400, 'Wall unit height above the floor (mm)');

  for (const key of MATERIAL_KEYS) {
    const material = materials[key];
    if (!isRecord(material) || typeof material.name !== 'string' || !/^#[0-9a-f]{6}$/i.test(String(material.color))) {
      fail(`Material "${key}" needs a name and a #rrggbb colour.`);
    }
    whole(material.thickness, 2, 60, `${key} thickness (mm)`);
    whole(material.maxLength, 300, 6000, `${key} maximum length (mm)`);
  }
  whole(c.worktopDepth, c.base.depth + materials.front.thickness, 1200, 'Worktop depth (mm)');
  if (!['painted', 'laminated'].includes(frontStyle.finish) || !['bar', 'none'].includes(frontStyle.handles)) {
    fail('Front finish must be painted or laminated, and handles bar or none.');
  }

  const wallIds = room.walls.map(wall => wall.id);
  runs.forEach(run => validateRun(run, wallIds));
  unique(runs.map(run => run.id), 'Run ids');
  return design;
}

function validateRun(run: Run, wallIds: string[]) {
  if (!isRecord(run) || typeof run.id !== 'string' || !/^[A-Za-z][\w-]*$/.test(run.id) ||
      !['base', 'wall'].includes(run.kind) || !isRecord(run.placement) || !Array.isArray(run.units)) {
    fail('Each run needs an id starting with a letter, a kind (base or wall), a placement and units.');
  }
  const where = `Run ${run.id}`;
  const placement = run.placement;
  if (placement.type === 'wall') {
    if (!wallIds.includes(placement.wall)) fail(`${where}: unknown wall "${placement.wall}".`);
    whole(placement.offset, 0, 20000, `${where} offset (mm)`);
  } else if (placement.type === 'free') {
    if (!isVec2(placement.origin) || !Number.isFinite(placement.angleDeg)) {
      fail(`${where}: a free placement needs an origin [x, y] and angleDeg.`);
    }
  } else {
    fail(`${where}: placement type must be wall or free.`);
  }
  if (run.units.length > 40) fail(`${where}: use at most 40 units.`);
  run.units.forEach((unit, i) => validateUnit(unit, run.kind, `${where}, unit ${i + 1}`));
}

function validateUnit(unit: Unit, kind: RunKind, where: string) {
  if (!isRecord(unit)) fail(`${where} must be an object.`);
  if (unit.type === 'gap') {
    whole(unit.width, 1, 5000, `${where} width (mm)`);
    if (typeof unit.label !== 'string' || ![undefined, true, false].includes(unit.underWorktop)) {
      fail(`${where}: a gap needs a label and an optional underWorktop true/false.`);
    }
    return;
  }
  if (unit.type !== 'cabinet') fail(`${where}: type must be cabinet or gap.`);
  whole(unit.width, 150, 1200, `${where} width (mm)`);
  whole(unit.shelves, 0, 5, `${where} shelves`);
  validateFronts(unit.fronts, kind, where);
}

function validateFronts(fronts: Fronts, kind: RunKind, where: string) {
  if (!isRecord(fronts) || !FRONTS_BY_RUN[kind].includes(fronts.kind)) {
    fail(`${where}: ${kind} units can have ${FRONTS_BY_RUN[kind].join(', ')} fronts.`);
  }
  if (fronts.kind === 'doors' && (![1, 2].includes(fronts.count) || ![undefined, 'left', 'right'].includes(fronts.hinge))) {
    fail(`${where}: doors need a count of 1 or 2 and an optional left or right hinge.`);
  }
  if (fronts.kind === 'drawers' && (!Array.isArray(fronts.split) || fronts.split.length < 1 || fronts.split.length > 5 ||
      !fronts.split.every(weight => Number.isFinite(weight) && weight > 0 && weight <= 10))) {
    fail(`${where}: drawers need a split of 1 to 5 proportions, e.g. [1, 2, 2].`);
  }
}
