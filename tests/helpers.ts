import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDesign } from '../src/design';
import type { Fronts, KitchenDesign, RunKind, Unit } from '../src/types';

export const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
export const defaults = validateDesign(read('kitchen-design.json'));
export const angledIsland = validateDesign(read('public/examples/angled-island.json'));
export const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
export const cabinet = (width: number, fronts: Fronts, shelves = 0): Unit => ({ type: 'cabinet', width, fronts, shelves });

/** The default room and materials with a single run along the north wall. */
export function withUnits(kind: RunKind, units: Unit[]): KitchenDesign {
  return { ...structuredClone(defaults), runs: [{ id: kind === 'base' ? 'B' : 'W', kind, placement: { type: 'wall', wall: 'north', offset: 0 }, units }] };
}
