/** All lengths are millimetres. Plan points are [x, y] seen from above; plan y maps to world +Z. */
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** A wall runs from its start point to the next wall's start point. */
export interface Wall { id: string; start: Vec2 }

export type Placement =
  /** Along a wall; offset is from the wall's left end as seen from inside the room. */
  | { type: 'wall'; wall: string; offset: number }
  /** Freestanding, e.g. an island; origin is the run's back-left corner, angle its direction. */
  | { type: 'free'; origin: Vec2; angleDeg: number };

export type Fronts =
  | { kind: 'doors'; count: 1 | 2; hinge?: 'left' | 'right' }
  /** Drawer front heights in proportion, top to bottom, e.g. [1, 2, 2]. */
  | { kind: 'drawers'; split: number[] }
  | { kind: 'lift-up' }
  | { kind: 'open' };

export type Unit =
  | { type: 'cabinet'; width: number; fronts: Fronts; shelves: number }
  /** Space for an appliance or opening; underWorktop keeps the worktop running across it. */
  | { type: 'gap'; width: number; label: string; underWorktop?: boolean };

export type RunKind = 'base' | 'wall';
/** A straight row of units; cabinets are labelled with the run id, e.g. B1, B2. */
export interface Run { id: string; kind: RunKind; placement: Placement; units: Unit[] }

export type MaterialKey = 'carcass' | 'drawer' | 'back' | 'front' | 'worktop';
export interface BoardMaterial { name: string; thickness: number; color: string; maxLength: number }

export interface KitchenDesign {
  format: 'kitchen-design'; version: 1; units: 'mm';
  room: { height: number; walls: Wall[] };
  construction: {
    frontGap: number; shelfSetback: number; railWidth: number; worktopDepth: number;
    base: { height: number; depth: number; legHeight: number; plinthSetback: number };
    wall: { height: number; depth: number; bottomFromFloor: number };
  };
  materials: Record<MaterialKey, BoardMaterial>;
  frontStyle: { finish: 'painted' | 'laminated'; handles: 'bar' | 'none' };
  runs: Run[];
}

export interface HardwareCatalogue {
  note: string;
  hinge: { name: string; countByDoorHeight: [number, number][]; edgeDistance: number };
  drawerSystem: {
    name: string; nominalLengths: number[]; sideHeights: number[]; sideThickness: number;
    depthClearance: number; frontClearance: number;
    bottomWidthDeduction: number; bottomDepthDeduction: number;
    backWidthDeduction: number; backHeightDeduction: number;
  };
  liftUp: { name: string }; leg: { name: string }; plinthClip: { name: string };
  shelfPin: { name: string }; wallHanger: { name: string };
  handle: { name: string; length: number; centres: number };
}
