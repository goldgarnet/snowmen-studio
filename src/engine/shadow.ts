import { Level } from '../types';
import { getObjectHeight, getDirectionDelta, getOppositeDirection, isInBounds } from '../utils/level';
import { yellowWallsSolid, orangeWallsSolid } from './helpers';

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
  // A solid (active) orange wall is a partition that fully encloses its cell, so
  // whatever is trapped inside is permanently in shade. A raised YELLOW wall does not
  // shade its own cell — the sun still reaches inside (only its trapped object's shadow
  // is kept from spilling out, below). The wall-solid state is global, so compute once.
  const ySolid = yellowWallsSolid(level);
  const oSolid = orangeWallsSolid(level);

  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const tile = level.tiles[r][c];
      if (tile.isVoid) {
        tile.isShade = false;
        continue;
      }
      let shade = tile.isRowArch || tile.isColumnArch;
      if (tile.isOrangeWall && oSolid) shade = true;
      tile.isShade = shade;
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
      const objTile = level.tiles[r][c];
      if (objTile.isYellowWall && ySolid) continue;
      if (objTile.isOrangeWall && oSolid) continue;

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
