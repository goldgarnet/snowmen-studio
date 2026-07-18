import { Level } from '../types';
import { getObjectHeight, getDirectionDelta, getOppositeDirection, isInBounds } from '../utils/level';
import { yellowWallsSolid, orangeWallsSolid } from './helpers';

export function recalcShadows(level: Level): void {
  // A solid (active) yellow/orange wall is a partition that fully encloses its cell,
  // so whatever is trapped inside is permanently in shade. We compute the wall-solid
  // state once (it's global) and treat those cells as shaded regardless of the sun.
  const ySolid = yellowWallsSolid(level);
  const oSolid = orangeWallsSolid(level);

  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const tile = level.tiles[r][c];
      let shade = tile.isRowArch || tile.isColumnArch;
      if (tile.isYellowWall && ySolid) shade = true;
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

      const height = getObjectHeight(obj);
      const shadowLength = Math.floor(height);

      for (let i = 1; i <= shadowLength; i++) {
        const sr = r + delta.row * i;
        const sc = c + delta.col * i;
        if (isInBounds(level, { row: sr, col: sc })) {
          level.tiles[sr][sc].isShade = true;
        }
      }
    }
  }
}
