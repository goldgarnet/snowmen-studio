import { Level, GameObject, Position, Direction, TriangleCorner } from '../types';
import { getDirectionDelta, getOppositeDirection, isInBounds, getObjectHeight } from '../utils/level';

// Triangle wall: the right-angle corner has two solid leg edges. Moving across a
// solid edge (in or out) is blocked; the other two edges are open (passable).
const TRI_SOLID: Record<TriangleCorner, Direction[]> = {
  tl: ['up', 'left'],
  tr: ['up', 'right'],
  bl: ['down', 'left'],
  br: ['down', 'right'],
};

export function getNextPos(pos: Position, dir: Direction): Position {
  const delta = getDirectionDelta(dir);
  return { row: pos.row + delta.row, col: pos.col + delta.col };
}

/**
 * Yellow walls are solid unless there is at least one yellow button AND every
 * yellow button is currently covered by an object. (With no yellow buttons, the
 * walls never disappear — they behave like plain walls.)
 */
export function yellowWallsSolid(level: Level): boolean {
  let hasButton = false;
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.tiles[r][c].isYellowButton) {
        hasButton = true;
        if (!level.objects[r][c]) return true; // an uncovered button → walls solid
      }
    }
  }
  return !hasButton; // no buttons → solid; all buttons covered → not solid
}

/**
 * Returns the edge-arch level (max passable size) on the boundary between `from`
 * and the next cell in direction `dir`. Returns 0 if no arch is present.
 */
export function getEdgeArchLevel(level: Level, from: Position, dir: Direction): number {
  switch (dir) {
    case 'right': {
      const target = { row: from.row, col: from.col + 1 };
      if (!isInBounds(level, target)) return 0;
      return level.tiles[target.row][target.col].edgeArchLeft ?? 0;
    }
    case 'left': {
      if (from.col < 0 || from.col >= level.width || from.row < 0 || from.row >= level.height) return 0;
      return level.tiles[from.row][from.col].edgeArchLeft ?? 0;
    }
    case 'down': {
      const target = { row: from.row + 1, col: from.col };
      if (!isInBounds(level, target)) return 0;
      return level.tiles[target.row][target.col].edgeArchTop ?? 0;
    }
    case 'up': {
      if (from.col < 0 || from.col >= level.width || from.row < 0 || from.row >= level.height) return 0;
      return level.tiles[from.row][from.col].edgeArchTop ?? 0;
    }
  }
}

/**
 * Can an object pass through any edge-arch between `from` and the next cell in `dir`?
 * - No arch: always passes.
 * - Height-N arch: only objects with size <= N pass.
 */
export function canPassEdge(level: Level, from: Position, dir: Direction, obj: GameObject): boolean {
  const lvl = getEdgeArchLevel(level, from, dir);
  if (lvl === 0) return true;
  return obj.size <= lvl;
}

export function canEnterTile(level: Level, pos: Position, dir: Direction, obj: GameObject): boolean {
  if (!isInBounds(level, pos)) return false;

  const tile = level.tiles[pos.row][pos.col];
  const height = getObjectHeight(obj);

  if (tile.isRowArch) {
    if (dir === 'left' || dir === 'right') return false;
    if (height > 1) return false;
  }
  if (tile.isColumnArch) {
    if (dir === 'up' || dir === 'down') return false;
    if (height > 1) return false;
  }

  // Triangle wall: entering `pos` moving `dir` crosses pos's opposite-dir edge.
  // Blocked if that edge is a solid leg.
  if (tile.triangle && TRI_SOLID[tile.triangle].includes(getOppositeDirection(dir))) {
    return false;
  }

  // Solid yellow wall: impassable (only scan buttons when this is a yellow-wall tile).
  if (tile.isYellowWall && yellowWallsSolid(level)) {
    return false;
  }

  return true;
}

export function canLeaveTile(level: Level, pos: Position, dir: Direction, obj: GameObject): boolean {
  const tile = level.tiles[pos.row][pos.col];
  const height = getObjectHeight(obj);

  if (tile.isRowArch) {
    if (dir === 'left' || dir === 'right') return false;
    if (height > 1) return false;
  }
  if (tile.isColumnArch) {
    if (dir === 'up' || dir === 'down') return false;
    if (height > 1) return false;
  }

  // Triangle wall: leaving `pos` in `dir` crosses pos's dir edge. Blocked if solid.
  if (tile.triangle && TRI_SOLID[tile.triangle].includes(dir)) {
    return false;
  }

  return true;
}

export function canMoveTo(level: Level, from: Position, dir: Direction, obj: GameObject): boolean {
  if (!canLeaveTile(level, from, dir, obj)) return false;
  if (!canPassEdge(level, from, dir, obj)) return false;
  const to = getNextPos(from, dir);
  if (!canEnterTile(level, to, dir, obj)) return false;
  return true;
}

export function isSnowMade(type: string): boolean {
  return type === 'player' || type === 'snowball' || type === 'snowman';
}

export function getPerpendicularDirs(dir: Direction): [Direction, Direction] {
  if (dir === 'left' || dir === 'right') return ['up', 'down'];
  return ['left', 'right'];
}

/**
 * Returns true if movement in direction `dir` from `pos` is "backed" — i.e. the cell
 * at `getNextPos(pos, dir)` acts as a wall for force/snowman-build backing purposes.
 *
 * Per spec, backing conditions are exactly:
 *  - Map edge (out of bounds) — always counts as wall
 *  - Wall / block / tree / laser object at the next cell
 *  - A perpendicular tunnel between `pos` and the next cell (i.e., the rowArch /
 *    columnArch oriented to block the push direction)
 *  - A triangle wall whose solid leg edge faces the push
 *
 * Edge arches do NOT back force/build, regardless of their height.
 */
const SOLID_BACKERS = new Set(['wall', 'block', 'tree', 'laser']);

export function isBacked(level: Level, pos: Position, dir: Direction): boolean {
  const nextPos = getNextPos(pos, dir);
  if (!isInBounds(level, nextPos)) return true;

  const nextObj = level.objects[nextPos.row][nextPos.col];
  if (nextObj) {
    return SOLID_BACKERS.has(nextObj.type);
  }

  const tile = level.tiles[pos.row][pos.col];
  const nextTile = level.tiles[nextPos.row][nextPos.col];

  // Triangle solid leg edge backs the push like a wall.
  if (tile.triangle && TRI_SOLID[tile.triangle].includes(dir)) return true;
  if (nextTile.triangle && TRI_SOLID[nextTile.triangle].includes(getOppositeDirection(dir))) return true;

  // A solid yellow wall at the next cell backs the push like a wall.
  if (nextTile.isYellowWall && yellowWallsSolid(level)) return true;

  // Check perpendicular tunnel blockage (existing arch-tile semantics): rowArch
  // blocks left/right movement; columnArch blocks up/down movement.
  const isHorz = dir === 'left' || dir === 'right';
  if (isHorz) {
    if (tile.isRowArch || nextTile.isRowArch) return true;
  } else {
    if (tile.isColumnArch || nextTile.isColumnArch) return true;
  }

  return false;
}
