import { Level, GameObject, Position, Direction, Tile, TriangleCorner } from '../types';
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

/** Required mass of the button on this tile (1..3). Buttons without a value need 1. */
export function buttonMass(tile: Tile): number {
  const mass = tile.buttonMass ?? 1;
  return Number.isFinite(mass) ? Math.min(3, Math.max(1, Math.round(mass))) : 1;
}

/**
 * Mass of an object that rests on a button = its size (team decision 2026-11-13):
 * snowball 1·2, snowman/player 1·2·3, block/laser 1. Walls and trees (size 100) are
 * never pushed onto a button; if the editor put one there it presses anything.
 */
export function objectMass(obj: GameObject): number {
  return obj.size;
}

/** A green/yellow button is pressed while the object on it is at least as heavy as it requires. */
export function isPressedBy(tile: Tile, obj: GameObject | null | undefined): boolean {
  return !!obj && objectMass(obj) >= buttonMass(tile);
}

export function isButtonPressed(level: Level, row: number, col: number): boolean {
  return isPressedBy(level.tiles[row][col], level.objects[row][col]);
}

/**
 * Yellow walls are solid unless there is at least one yellow button AND every
 * yellow button is currently pressed (an object of at least its required mass on it).
 * With no yellow buttons, the walls never disappear — they behave like plain walls.
 */
export function yellowWallsSolid(level: Level): boolean {
  let hasButton = false;
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.tiles[r][c].isYellowButton) {
        hasButton = true;
        if (!isButtonPressed(level, r, c)) return true; // a button not pressed → walls solid
      }
    }
  }
  return !hasButton; // no buttons → solid; all buttons pressed → not solid
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

  // Hole: anything may enter, including the player (2026-10-26; the player used to be
  // blocked here). The turn/roll resolver removes whatever stands on a hole
  // (applyHoles): a player who walks in falls at the turn's hole step, and the soul
  // jumps to the nearest snowman before the end-of-turn melt, as when a crack crumbles
  // beneath it (game over if no snowman is left).

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

  // Yellow walls are partitions: an object can enter the cell only while the wall is
  // open (buttons pressed), but once it re-solidifies whatever is inside can no longer
  // leave — it is trapped. Because this is evaluated per cell-step (during a roll,
  // canLeaveTile runs each cell), a snowball that rolls over the button and on into the
  // wall cell gets sealed in the instant it steps off the button.
  if (tile.isYellowWall && yellowWallsSolid(level)) return false;

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
 *  - An edge arch that the object at `pos` is too large to pass
 *  - A triangle wall whose solid leg edge faces the push
 *
 */
const SOLID_BACKERS = new Set(['wall', 'block', 'tree', 'laser']);

export function isBacked(level: Level, pos: Position, dir: Direction): boolean {
  const nextPos = getNextPos(pos, dir);
  if (!isInBounds(level, nextPos)) return true;

  const tile = level.tiles[pos.row][pos.col];
  const nextTile = level.tiles[nextPos.row][nextPos.col];

  // Terrain between pos and the next cell is resolved BEFORE whatever object sits in
  // the next cell. A boundary that stops the object at pos backs it even when a soft
  // object lies beyond that boundary; otherwise the farther object would mask the
  // nearer wall (the same "nearest boundary first" rule push.ts applies to A).
  const currentObj = level.objects[pos.row][pos.col];
  if (currentObj && !canMoveTo(level, pos, dir, currentObj)) return true;

  // An edge arch is a backer only when it actually blocks the object being pushed.
  // This lets a size-1 ball combine with a size-2 ball stopped at a height-1 arch,
  // while preserving normal movement through an arch that both balls fit through.
  if (currentObj && !canPassEdge(level, pos, dir, currentObj)) return true;

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

  const nextObj = level.objects[nextPos.row][nextPos.col];
  return !!nextObj && SOLID_BACKERS.has(nextObj.type);
}

/**
 * A solid (closed) yellow partition encloses its whole cell: nothing enters or leaves
 * it, its trapped object casts no shadow outside, and a laser standing inside cannot
 * fire out of it. (Its interior is not shade — the sun still gets in, 2026-10-29.)
 */
export function isClosedPartition(level: Level, pos: Position): boolean {
  const tile = level.tiles[pos.row][pos.col];
  return !!tile.isYellowWall && yellowWallsSolid(level);
}
