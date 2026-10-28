import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKitchen } from '../src/cabinets';
import { cutList, materialTotals, orderCsv } from '../src/order';
import { cabinet, defaults, near, withUnits } from './helpers';

test('identical panels merge into one cut-list line', () => {
  const design = withUnits('base', [cabinet(600, { kind: 'doors', count: 1 }), cabinet(600, { kind: 'doors', count: 1 })]);
  const lines = cutList(design, generateKitchen(design));
  const side = lines.find(line => line.name === 'Side')!;
  assert.deepEqual([side.qty, side.cabinets, side.edges], [4, ['B1', 'B2'], 'L1']);
  const door = lines.find(line => line.name === 'Door')!;
  assert.deepEqual([door.qty, door.edges, door.finish], [2, '—', 'Painted #5d6b5f']);
});

test('material totals add up area and edge banding', () => {
  const design = withUnits('base', [cabinet(600, { kind: 'doors', count: 1 }, 1)]);
  const carcass = materialTotals(design, generateKitchen(design)).find(total => total.material === 'carcass')!;
  assert.equal(carcass.panels, 6);
  near(carcass.areaM2, 2 * 0.40104 + 0.314148 + 2 * 0.0564 + 0.301794);
  near(carcass.edgeBandM, (2 * 720 + 564 + 564 + 562) / 1000);
});

test('order CSV lists panels, then hardware, and quotes cells with commas', () => {
  const csv = orderCsv(defaults, generateKitchen(defaults));
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], 'Part,Cabinets,Material,Thickness (mm),Length (mm),Width (mm),Qty,Edge banding,Finish');
  assert.ok(lines.indexOf('Hardware,Qty,Cabinets') > 1);
  assert.match(csv, /^Side,B1 B2 B3 B4,"Melamine chipboard, white",18,720,557,8,L1,$/m);
});
