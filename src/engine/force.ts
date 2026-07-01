import { Level, GameObject, Position, Direction } from '../types';
import { isInBounds } from '../utils/level';
import { getNextPos, getPerpendicularDirs, canMoveTo } from './helpers';

export function applyForce(level: Level, pos: Position, dir: Direction, turnCount: number): void {
  const obj = level.objects[pos.row][pos.col];
  if (!obj || obj.type !== 'snowball') return;

  if (obj.size === 1) {
    // Crashes: disappears, leaves flake
    level.objects[pos.row][pos.col] = null;
    level.tiles[pos.row][pos.col].isFlake = true;
    level.tiles[pos.row][pos.col].isWarm = false;
  } else if (obj.size === 2) {
    // Splits into two size-1 snowballs perpendicular to force direction
    level.objects[pos.row][pos.col] = null;
    const [dir1, dir2] = getPerpendicularDirs(dir);
    const pos1 = getNextPos(pos, dir1);
    const pos2 = getNextPos(pos, dir2);

    const placed1 = tryPlaceSplitSnowball(level, pos, pos1, dir1, turnCount);
    const placed2 = tryPlaceSplitSnowball(level, pos, pos2, dir2, turnCount);

    if (!placed1 && !placed2) {
      // Both failed: two snowballs at original pos -> size 1 snowman
      level.objects[pos.row][pos.col] = {
        type: 'snowman',
        size: 1,
        isMelting: false,
        createdAt: turnCount,
      };
      level.tiles[pos.row][pos.col].isWarm = false;
    } else if (!placed1) {
      // One failed: place it at the original pos (if empty)
      if (!level.objects[pos.row][pos.col]) {
        level.objects[pos.row][pos.col] = {
          type: 'snowball',
          size: 1,
          isMelting: false,
          createdAt: turnCount,
        };
      } else {
        // Original pos was taken (e.g. by snowman from placed2) - check if snowman building
        const existing = level.objects[pos.row][pos.col];
        if (existing && existing.type === 'snowball') {
          // Two snowballs at same pos -> snowman
          level.objects[pos.row][pos.col] = {
            type: 'snowman',
            size: 1,
            isMelting: false,
            createdAt: turnCount,
          };
          level.tiles[pos.row][pos.col].isWarm = false;
        }
      }
    } else if (!placed2) {
      if (!level.objects[pos.row][pos.col]) {
        level.objects[pos.row][pos.col] = {
          type: 'snowball',
          size: 1,
          isMelting: false,
          createdAt: turnCount,
        };
      } else {
        const existing = level.objects[pos.row][pos.col];
        if (existing && existing.type === 'snowball') {
          level.objects[pos.row][pos.col] = {
            type: 'snowman',
            size: 1,
            isMelting: false,
            createdAt: turnCount,
          };
          level.tiles[pos.row][pos.col].isWarm = false;
        }
      }
    }
  }
}

function tryPlaceSplitSnowball(
  level: Level, originPos: Position, targetPos: Position, dir: Direction, turnCount: number
): boolean {
  // Out of bounds = wall
  if (!isInBounds(level, targetPos)) return false;

  // Check arch constraints: can a split snowball leave origin and enter target in this direction?
  const splitBall: GameObject = { type: 'snowball', size: 1, isMelting: false, createdAt: 0 };
  if (!canMoveTo(level, originPos, dir, splitBall)) return false;

  const targetObj = level.objects[targetPos.row][targetPos.col];

  if (!targetObj) {
    // Empty: place snowball
    level.objects[targetPos.row][targetPos.col] = {
      type: 'snowball',
      size: 1,
      isMelting: false,
      createdAt: turnCount,
    };
    // Check flake
    const tile = level.tiles[targetPos.row][targetPos.col];
    if (tile.isFlake) {
      const sb = level.objects[targetPos.row][targetPos.col]!;
      if (sb.size < 2) {
        sb.size += 1;
        tile.isFlake = false;
        tile.isWarm = false;
      }
    }
    return true;
  }

  // Target has a snowball: build snowman
  if (targetObj.type === 'snowball') {
    const snowmanSize = targetObj.size === 2 ? 2 : 1;
    level.objects[targetPos.row][targetPos.col] = {
      type: 'snowman',
      size: snowmanSize,
      isMelting: false,
      createdAt: turnCount,
    };
    level.tiles[targetPos.row][targetPos.col].isWarm = false;
    return true;
  }

  // Target has another object: try to push it (effective size = 1)
  if (targetObj.size <= 1 && targetObj.type !== 'wall') {
    // Can push size-1 objects
    const pushTarget = getNextPos(targetPos, dir);
    if (isInBounds(level, pushTarget) && !level.objects[pushTarget.row][pushTarget.col] &&
        canMoveTo(level, targetPos, dir, targetObj)) {
      // Push the object
      level.objects[pushTarget.row][pushTarget.col] = targetObj;
      level.objects[targetPos.row][targetPos.col] = {
        type: 'snowball',
        size: 1,
        isMelting: false,
        createdAt: turnCount,
      };
      return true;
    }
  }

  // Can't place here
  return false;
}
