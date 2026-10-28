import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKitchen, hardware, hingeCount, splitHeights, type KitchenModel } from '../src/cabinets';
import { validateDesign } from '../src/design';
import { angledIsland, cabinet, defaults, near, withUnits } from './helpers';

const sizes = (model: KitchenModel, name: string) =>
  model.panels.filter(panel => panel.name === name).map(panel => [panel.length, panel.width]);
const qty = (model: KitchenModel, name: string) =>
  model.hardware.filter(line => line.name === name).reduce((sum, line) => sum + line.qty, 0);

test('every panel drawn in 3D has exactly its cut size and board thickness', () => {
  for (const design of [defaults, angledIsland]) {
    for (const panel of generateKitchen(design).panels) {
      const drawn = panel.box.min.map((v, i) => panel.box.max[i] - v).sort((a, b) => a - b);
      const cut = [panel.length, panel.width, design.materials[panel.material].thickness].sort((a, b) => a - b);
      drawn.forEach((v, i) => near(v, cut[i]));
    }
  }
});

test('a 600 mm single-door base unit', () => {
  const model = generateKitchen(withUnits('base', [cabinet(600, { kind: 'doors', count: 1 }, 1)]));
  assert.deepEqual(sizes(model, 'Side'), [[720, 557], [720, 557]]);
  assert.deepEqual(sizes(model, 'Bottom'), [[564, 557]]);
  assert.deepEqual(sizes(model, 'Front rail'), [[564, 100]]);
  assert.deepEqual(sizes(model, 'Back rail'), [[564, 100]]);
  assert.deepEqual(sizes(model, 'Back'), [[720, 600]]);
  assert.deepEqual(sizes(model, 'Shelf'), [[562, 537]]);
  assert.deepEqual(sizes(model, 'Door'), [[717, 597]]);
  assert.deepEqual(sizes(model, 'Worktop'), [[600, 600]]);
  assert.deepEqual(sizes(model, 'Plinth'), [[600, 137]]);
  assert.equal(qty(model, hardware.hinge.name), 2);
  assert.equal(qty(model, hardware.leg.name), 4);
  assert.equal(qty(model, hardware.plinthClip.name), 2);
  assert.equal(qty(model, hardware.shelfPin.name), 4);
  assert.equal(qty(model, hardware.handle.name), 1);
  assert.deepEqual(model.movers.map(mover => mover.id), ['B1-door-1']);
});

test('paired doors share the width with equal gaps', () => {
  const model = generateKitchen(withUnits('base', [cabinet(600, { kind: 'doors', count: 2 })]));
  const [left, right] = model.panels.filter(panel => panel.name === 'Door');
  assert.deepEqual([left.width, right.width], [297, 297]);
  near(left.box.min[0], 1.5); near(right.box.min[0] - left.box.max[0], 3); near(600 - right.box.max[0], 1.5);
  assert.deepEqual(model.movers.map(mover => Math.sign(mover.amount)), [-1, 1]);
});

test('drawer fronts fill the carcass height and get drawer sets that fit', () => {
  assert.deepEqual(splitHeights(711, [1, 2, 2]), [142, 284, 285]);
  const model = generateKitchen(withUnits('base', [cabinet(600, { kind: 'drawers', split: [1, 2, 2] }, 2)]));
  const fronts = sizes(model, 'Drawer front');
  assert.deepEqual(fronts, [[597, 142], [597, 284], [597, 285]]);
  assert.equal(fronts.reduce((sum, [, height]) => sum + height, 0) + 3 * 3, 720);
  assert.deepEqual(sizes(model, 'Shelf'), []);
  assert.deepEqual(sizes(model, 'Drawer bottom'), [[489, 490], [489, 490], [489, 490]]);
  assert.deepEqual(sizes(model, 'Drawer back'), [[477, 68], [477, 184], [477, 184]]);
  assert.equal(qty(model, `${hardware.drawerSystem.name}, 500 mm, side 83 mm`), 1);
  assert.equal(qty(model, `${hardware.drawerSystem.name}, 500 mm, side 199 mm`), 2);
});

test('worktops run across under-worktop gaps; plinths stop at every gap', () => {
  const model = generateKitchen(defaults);
  assert.deepEqual(model.panels.filter(p => p.name === 'Worktop').map(p => [p.cabinet, p.length]), [['B1–B4', 3000]]);
  assert.deepEqual(model.panels.filter(p => p.name === 'Plinth').map(p => [p.cabinet, p.length]), [['B1–B2', 1200], ['B3–B4', 1200]]);
  assert.deepEqual(model.warnings, []);
});

test('wall units hang on hangers and lift-up flaps hinge at the top', () => {
  const model = generateKitchen(withUnits('wall', [cabinet(600, { kind: 'lift-up' }, 1)]));
  assert.deepEqual(sizes(model, 'Top'), [[564, 317]]);
  assert.deepEqual(sizes(model, 'Lift-up front'), [[597, 717]]);
  assert.deepEqual(sizes(model, 'Worktop'), []);
  const [flap] = model.movers;
  assert.equal(flap.motion, 'swing-x');
  assert.equal(flap.pivot[1], 1450 + 720 - 1.5);
  assert.equal(qty(model, hardware.liftUp.name), 1);
  assert.equal(qty(model, hardware.wallHanger.name), 2);
  assert.equal(qty(model, hardware.hinge.name), 0);
});

test('hinge count grows with door height', () => {
  assert.deepEqual([717, 1200, 1900].map(hingeCount), [2, 3, 4]);
});

test('validation rejects fronts that do not suit the run and out-of-range sizes', () => {
  assert.throws(() => validateDesign(withUnits('base', [cabinet(600, { kind: 'lift-up' })])), /base units can have doors, drawers, open/);
  assert.throws(() => validateDesign(withUnits('wall', [cabinet(600, { kind: 'drawers', split: [1] })])), /wall units can have/);
  assert.throws(() => validateDesign(withUnits('base', [cabinet(1300, { kind: 'open' })])), /width \(mm\) must be a whole number from 150 to 1200/);
  const unknownWall = withUnits('base', []);
  unknownWall.runs[0].placement = { type: 'wall', wall: 'kitchen', offset: 0 };
  assert.throws(() => validateDesign(unknownWall), /unknown wall "kitchen"/);
});

test('warnings flag a run that overflows its wall and doors that are too wide', () => {
  const door = { kind: 'doors', count: 1 } as const;
  const model = generateKitchen(withUnits('base', [cabinet(1200, door), cabinet(1200, door), cabinet(900, door)]));
  assert.ok(model.warnings.includes('Run B needs 3300 mm along wall north, which is 3000 mm.'));
  assert.ok(model.warnings.includes('B1: a 1197 mm door is heavy; use two doors.'));
});

test('front legs stand behind the plinth', () => {
  const model = generateKitchen(withUnits('base', [cabinet(600, { kind: 'open' })]));
  const plinth = model.panels.find(panel => panel.name === 'Plinth')!;
  const frontLegs = model.fittings.filter(f => f.shape === 'cylinder' && f.box.max[2] > 300);
  assert.equal(frontLegs.length, 2);
  for (const leg of frontLegs) assert.ok(leg.box.max[2] < plinth.box.min[2]);
});
