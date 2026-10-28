import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKitchen } from '../src/cabinets';
import { roomWalls, runFrame, toPlan } from '../src/layout';
import type { Vec2, Wall } from '../src/types';
import { angledIsland, near } from './helpers';

const same = (actual: Vec2, expected: Vec2) => { near(actual[0], expected[0]); near(actual[1], expected[1]); };
const rectangle: Wall[] = [
  { id: 'north', start: [0, 0] }, { id: 'east', start: [3000, 0] },
  { id: 'south', start: [3000, 2800] }, { id: 'west', start: [0, 2800] },
];

test('a wall run starts at the left end as seen from inside, whichever way the outline is drawn', () => {
  const forward = runFrame({ type: 'wall', wall: 'north', offset: 200 }, roomWalls(rectangle));
  // The same room traced the other way round: wall "a" is the north wall drawn east to west.
  const reversed = runFrame({ type: 'wall', wall: 'a', offset: 200 }, roomWalls([
    { id: 'a', start: [3000, 0] }, { id: 'b', start: [0, 0] }, { id: 'c', start: [0, 2800] }, { id: 'd', start: [3000, 2800] },
  ]));
  for (const frame of [forward, reversed]) {
    same(frame.origin, [200, 0]); same(frame.xAxis, [1, 0]); same(frame.zAxis, [0, 1]);
  }
});

test('runs on side walls face into the room', () => {
  const walls = roomWalls(rectangle);
  const east = runFrame({ type: 'wall', wall: 'east', offset: 0 }, walls);
  same(east.origin, [3000, 0]); same(east.xAxis, [0, 1]); same(east.zAxis, [-1, 0]);
  const west = runFrame({ type: 'wall', wall: 'west', offset: 0 }, walls);
  same(west.origin, [0, 2800]); same(west.xAxis, [0, -1]); same(west.zAxis, [1, 0]);
});

test('an angled wall gets a frame along it, pointing into the room', () => {
  const frame = runFrame({ type: 'wall', wall: 'corner', offset: 0 }, roomWalls(angledIsland.room.walls));
  const s = Math.SQRT1_2;
  same(frame.origin, [3400, 0]); same(frame.xAxis, [s, s]); same(frame.zAxis, [-s, s]);
});

test('a freestanding island turns with its angle', () => {
  const frame = runFrame({ type: 'free', origin: [3000, 2700], angleDeg: 180 }, []);
  same(frame.xAxis, [-1, 0]); same(frame.zAxis, [0, -1]);
  // The island's far front corner, 1800 mm along and 600 mm out.
  same(toPlan(frame, 1800, 600), [1200, 2100]);
});

test('the angled room with an island generates with the same cabinet code', () => {
  const model = generateKitchen(angledIsland);
  assert.deepEqual(model.warnings, []);
  assert.deepEqual(model.runs.map(run => [run.id, run.length]), [['B', 3000], ['W', 3000], ['C', 600], ['I', 1800]]);
});
