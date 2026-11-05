import { Level } from '../types';
import { getObjectHeight, getDirectionDelta, getOppositeDirection, isInBounds } from '../utils/level';
import { yellowWallsSolid } from './helpers';

/**
 * With shadows off there is no shade at all (B-11 decision, 9/29) — tunnel cells
 * included. The decoder and the editor's tunnel brush store tunnels as shaded, which only
 * holds on maps with shadows on; left alone, those cells kept their shade on maps with
 * shadows off (B-007).
 */
export function clearShadows(level: Level): void {
  for (const row of level.tiles) {
    for (const tile of row) tile.isShade = false;
  }
}

export function recalcShadows(level: Level): void {
  // A raised (solid) yellow wall does not shade its own cell — the sun still reaches
  // inside (2026-10-29); only its trapped object's shadow is kept from spilling out,
  // below. The wall-solid state is global, so compute it once. (The orange wall, whose
  // closed cell was shade, was removed from the game on 2026-11-03.)
  const ySolid = yellowWallsSolid(level);

  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const tile = level.tiles[r][c];
      if (tile.isVoid) {
        tile.isShade = false;
        continue;
      }
      tile.isShade = tile.isRowArch || tile.isColumnArch;
    }
  }

  const shadowDir = getOppositeDirection(level.sunDirection);
  const delta = getDirectionDelta(shadowDir);

  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (!obj) continue;

      // An object trapped inside a solid wall partition is fully enclosed, so its
      // shadow can't spill out onto neighboring cells.
      if (level.tiles[r][c].isYellowWall && ySolid) continue;

      const height = getObjectHeight(obj);
      const shadowLength = Math.floor(height);

      for (let i = 1; i <= shadowLength; i++) {
        const sr = r + delta.row * i;
        const sc = c + delta.col * i;
        if (isInBounds(level, { row: sr, col: sc })) {
          level.tiles[sr][sc].isShade = true;
        } else {
          break;
        }
      }
    }
  }
}
