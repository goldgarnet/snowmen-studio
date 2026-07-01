import { Level } from '../types';
import { getObjectHeight, getDirectionDelta, getOppositeDirection, isInBounds } from '../utils/level';

export function recalcShadows(level: Level): void {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const tile = level.tiles[r][c];
      tile.isShade = tile.isRowArch || tile.isColumnArch;
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
