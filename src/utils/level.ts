import { Level, Tile, GameObject, Position, SunDirection } from '../types';

export function createDefaultTile(): Tile {
  return {
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
    hasShadow: true,
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
  return pos.row >= 0 && pos.row < level.height && pos.col >= 0 && pos.col < level.width;
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

export function serializeLevel(level: Level): string {
  return JSON.stringify(level, null, 2);
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
      return parsed as Level;
    }
    return null;
  } catch {
    return null;
  }
}
