import type { Placement, Vec2, Wall } from './types';

/** A wall segment; `inward` points into the room. */
export interface WallSegment { id: string; start: Vec2; end: Vec2; length: number; dir: Vec2; inward: Vec2 }

/**
 * Where a run sits in plan. Run-local x follows the run from left to right as seen from the front,
 * y is up and z points from the cabinet backs towards their fronts. Cabinets are built in this frame,
 * so angled walls and islands only change the frame, never the cabinet geometry.
 */
export interface RunFrame { origin: Vec2; xAxis: Vec2; zAxis: Vec2 }

export function signedArea(points: Vec2[]): number {
  return points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0) / 2;
}

export function roomWalls(walls: Wall[]): WallSegment[] {
  const side = signedArea(walls.map(wall => wall.start)) > 0 ? 1 : -1;
  return walls.map((wall, i) => {
    const start = wall.start, end = walls[(i + 1) % walls.length].start;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const dir: Vec2 = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
    return { id: wall.id, start, end, length, dir, inward: [-dir[1] * side, dir[0] * side] };
  });
}

export function runFrame(placement: Placement, walls: WallSegment[]): RunFrame {
  if (placement.type === 'free') {
    const angle = placement.angleDeg * Math.PI / 180;
    const xAxis: Vec2 = [Math.cos(angle), Math.sin(angle)];
    return { origin: placement.origin, xAxis, zAxis: [-xAxis[1], xAxis[0]] };
  }
  const wall = walls.find(w => w.id === placement.wall);
  if (!wall) throw new Error(`Unknown wall "${placement.wall}".`);
  const zAxis = wall.inward;
  // Facing the wall from inside the room, x runs from its left end to its right end.
  const xAxis: Vec2 = [zAxis[1], -zAxis[0]];
  const leftEnd = xAxis[0] * wall.dir[0] + xAxis[1] * wall.dir[1] > 0 ? wall.start : wall.end;
  return { origin: [leftEnd[0] + xAxis[0] * placement.offset, leftEnd[1] + xAxis[1] * placement.offset], xAxis, zAxis };
}

/** Plan position of a run-local point: x along the run, z out from its back. */
export function toPlan(frame: RunFrame, x: number, z: number): Vec2 {
  return [
    frame.origin[0] + frame.xAxis[0] * x + frame.zAxis[0] * z,
    frame.origin[1] + frame.xAxis[1] * x + frame.zAxis[1] * z,
  ];
}

/** Rotation about world Y that turns run-local axes into plan axes (plan y is world Z). */
export const frameYaw = (frame: RunFrame) => Math.atan2(-frame.xAxis[1], frame.xAxis[0]);
