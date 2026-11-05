import { Level, Tile, GameObject, Position, SunDirection } from '../types';

export function createDefaultTile(): Tile {
  return {
    isVoid: false,
    isWarm: false,
    isShade: false,
    isFlake: false,
    isRowArch: false,
    isColumnArch: false,
    isGoal: false,
  };
}

export function createLevel(width: number, height: number): Level {
  const tiles: Tile[][] = [];
  const objects: (GameObject | null)[][] = [];

  for (let r = 0; r < height; r++) {
    tiles.push([]);
    objects.push([]);
    for (let c = 0; c < width; c++) {
      tiles[r].push(createDefaultTile());
      objects[r].push(null);
    }
  }

  return {
    width,
    height,
    sunDirection: 'left',
    hasShadow: false,
    soulSwapEnabled: false,
    tiles,
    objects,
  };
}

export function getObjectHeight(obj: GameObject): number {
  switch (obj.type) {
    case 'player':
    case 'snowball':
    case 'snowman':
      return obj.size - 0.5;
    case 'block':
      return 1.5;
    case 'wall':
      return 0;
    case 'tree':
      return obj.treeHeight ?? 1;
    case 'laser':
      return 1.5;
  }
  return 0;
}

export function isInBounds(level: Level, pos: Position): boolean {
  return pos.row >= 0 && pos.row < level.height && pos.col >= 0 && pos.col < level.width
    && !level.tiles[pos.row]?.[pos.col]?.isVoid;
}

export function getDirectionDelta(dir: SunDirection): Position {
  switch (dir) {
    case 'up': return { row: -1, col: 0 };
    case 'down': return { row: 1, col: 0 };
    case 'left': return { row: 0, col: -1 };
    case 'right': return { row: 0, col: 1 };
  }
}

export function getOppositeDirection(dir: SunDirection): SunDirection {
  switch (dir) {
    case 'up': return 'down';
    case 'down': return 'up';
    case 'left': return 'right';
    case 'right': return 'left';
  }
}

export function cloneLevel(level: Level): Level {
  return {
    width: level.width,
    height: level.height,
    sunDirection: level.sunDirection,
    hasShadow: level.hasShadow,
    soulSwapEnabled: level.soulSwapEnabled,
    soulSwapArmedAt: level.soulSwapArmedAt ? { ...level.soulSwapArmedAt } : null,
    tiles: level.tiles.map(row => row.map(tile => ({ ...tile }))),
    objects: level.objects.map(row =>
      row.map(obj => (obj ? { ...obj } : null))
    ),
  };
}

export function findPlayer(level: Level): Position | null {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.objects[r][c]?.type === 'player') {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

// Identity of the body that holds the soul. The engine's motionId survives moves, while
// a soul transfer or footplate swap builds a fresh player object, so the id changes with
// the body. An untagged player (before the first turn, or right after an M cycle) gets
// the id the engine is about to give it.
function playerBodyId(level: Level): string | null {
  const pos = findPlayer(level);
  if (!pos) return null;
  return level.objects[pos.row][pos.col]?.motionId ?? `player:${pos.row}:${pos.col}`;
}

// True when the soul moved into another body during the turn (hole, crack, laser, melt,
// footplate). Play screens use it to stop a held key from walking the new body on.
export function soulChangedBody(before: Level, after: Level): boolean {
  const from = playerBodyId(before);
  const to = playerBodyId(after);
  return from !== null && to !== null && from !== to;
}

export function serializeLevel(level: Level): string {
  return JSON.stringify(level, null, 2);
}

// Fields of features removed from the game on 2026-11-03 (team decision): orange
// buttons/walls with their latch, and portals with their per-turn mark. Level JSON saved
// before then may still carry them; they are dropped on reading, so such a cell is plain
// ground. (Map codes drop the same bits in levelCode.ts.)
const REMOVED_TILE_FIELDS = ['isPortal', 'isOrangeButton', 'isOrangeWall', 'orangePressed'] as const;
const REMOVED_OBJECT_FIELDS = ['justTeleported'] as const;

/** Delete the removed features' fields from every tile and object. Mutates `level`. */
export function dropRemovedFeatures(level: Level): void {
  for (const row of level.tiles) {
    for (const tile of row ?? []) {
      if (!tile) continue;
      const record = tile as unknown as Record<string, unknown>;
      for (const field of REMOVED_TILE_FIELDS) delete record[field];
    }
  }
  for (const row of level.objects) {
    for (const object of row ?? []) {
      if (!object) continue;
      const record = object as unknown as Record<string, unknown>;
      for (const field of REMOVED_OBJECT_FIELDS) delete record[field];
    }
  }
}

export function deserializeLevel(json: string): Level | null {
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      parsed.sunDirection &&
      Array.isArray(parsed.tiles) &&
      Array.isArray(parsed.objects)
    ) {
      // Fill in missing hasShadow with default true
      if (typeof parsed.hasShadow !== 'boolean') parsed.hasShadow = true;
      if (typeof parsed.soulSwapEnabled !== 'boolean') parsed.soulSwapEnabled = false;
      for (let r = 0; r < parsed.height; r++) {
        for (let c = 0; c < parsed.width; c++) {
          if (parsed.tiles[r]?.[c]?.isVoid) {
            parsed.tiles[r][c] = { ...createDefaultTile(), isVoid: true };
            if (parsed.objects[r]) parsed.objects[r][c] = null;
          }
        }
      }
      dropRemovedFeatures(parsed as Level);
      return parsed as Level;
    }
    return null;
  } catch {
    return null;
  }
}
