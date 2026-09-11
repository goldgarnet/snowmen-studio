import { Level, GameObject, Position, Direction } from '../types';
import { isInBounds } from '../utils/level';
import { getNextPos, getPerpendicularDirs, canMoveTo } from './helpers';

/**
 * Apply a "force" (crush / split) to the snowball at `pos`, pushed in `dir`.
 *
 * `direct` distinguishes force the player applies BY DIRECTLY pushing the snowball
 * (true) from force transmitted INDIRECTLY through a block (false). Building a snowman
 * is not "applying force" and may only happen from a direct push, so indirect force
 * never creates a snowman: a size-2 ball with nowhere to split is simply left intact.
 *
 * Returns whether anything actually changed (so an indirect no-effect press is a no-op).
 */
export function applyForce(
  level: Level, pos: Position, dir: Direction, turnCount: number, direct = true
): boolean {
  const obj = level.objects[pos.row][pos.col];
  if (!obj || obj.type !== 'snowball') return false;

  if (obj.size === 1) {
    // Crashes: disappears, leaves flake
    level.objects[pos.row][pos.col] = null;
    level.tiles[pos.row][pos.col].isFlake = true;
    level.tiles[pos.row][pos.col].isWarm = false;
    return true;
  }

  if (obj.size === 2) {
    // "쪼개기": two size-1 snowballs are born in the origin cell, then each is shoved
    // ONE cell (strength 1) in the two directions perpendicular to the force.
    //  - A ball that can't move that way — a wall/edge/arch/tunnel blocks it, or its
    //    neighbour is an object it can't shove — stays in the origin cell.
    //  - A ball whose neighbour is a single pushable object (size ≤ 1, empty cell
    //    beyond) shoves it one cell and takes its place. This is a plain push, so it
    //    never builds a snowman.
    //  - If BOTH balls stay, they immediately merge into a size-1 snowman — but only on
    //    a DIRECT push. Indirect (block-transmitted) force never builds a snowman, so
    //    with nowhere to split the ball is left intact (a no-op press).
    //  - A lone ball left in the origin cell absorbs a snowflake there (→ size 2).
    const [dir1, dir2] = getPerpendicularDirs(dir);

    // A split is one atomic push result. In particular, a size-2 ball resting on
    // a yellow button must keep that button held while both new halves test their
    // exits. Removing it first would re-close a yellow wall before a half can
    // enter the wall cell that was open at the start of the push.
    level.objects[pos.row][pos.col] = obj;

    const moved1 = shoveSplitBall(level, pos, dir1, turnCount);
    const moved2 = shoveSplitBall(level, pos, dir2, turnCount);

    if (!moved1 && !moved2) {
      if (!direct) {
        // Indirect force with nowhere to split: leave the ball intact, press is a no-op.
        level.objects[pos.row][pos.col] = obj;
        return false;
      }
      // Both sides blocked: the two halves compact into a size-1 snowman.
      level.objects[pos.row][pos.col] = {
        type: 'snowman', size: 1, isMelting: false, createdAt: turnCount,
      };
      level.tiles[pos.row][pos.col].isWarm = false;
      return true;
    }

    // Exactly one side blocked → that half stays in the origin cell as a size-1 ball
    // (absorbing a flake there → size 2). If both moved, the origin stays empty.
    if (!moved1 || !moved2) {
      placeStayedSplitBall(level, pos, turnCount);
    } else {
      // Both halves left the origin, so release the source button only after the
      // complete split has resolved.
      level.objects[pos.row][pos.col] = null;
    }
    return true;
  }

  return false;
}

/**
 * Shove the freshly-split size-1 ball one cell from `origin` in `dir` (strength 1).
 * Returns true if the ball left the origin cell, false if it can't move (so it must
 * stay in the origin cell). Never builds a snowman.
 */
function shoveSplitBall(level: Level, origin: Position, dir: Direction, turnCount: number): boolean {
  const splitBall: GameObject = { type: 'snowball', size: 1, isMelting: false, createdAt: turnCount };

  // Can a size-1 ball physically leave origin and cross the edge into the neighbour?
  // (arches / tunnels / triangle legs / solid partitions). canMoveTo ignores whether the
  // neighbour cell is occupied — that is handled explicitly below.
  if (!canMoveTo(level, origin, dir, splitBall)) return false;
  const target = getNextPos(origin, dir);
  if (!isInBounds(level, target)) return false;

  const targetObj = level.objects[target.row][target.col];
  if (targetObj) {
    // Occupied: strength-1 can shove ONE pushable object (size ≤ 1, not a wall/tree) into
    // an empty passable cell beyond. No snowman is ever built by a split shove.
    if (targetObj.size > 1 || targetObj.type === 'wall' || targetObj.type === 'tree') return false;
    const beyond = getNextPos(target, dir);
    if (!isInBounds(level, beyond)) return false;
    if (level.objects[beyond.row][beyond.col]) return false;
    if (!canMoveTo(level, target, dir, targetObj)) return false;
    // Push the neighbour one cell, then move our split ball into the vacated cell.
    level.objects[beyond.row][beyond.col] = targetObj;
    level.objects[target.row][target.col] = null;
    absorbFlake(level, beyond); // the shoved piece grows on snow like any moved object
  }

  level.objects[target.row][target.col] = splitBall;
  absorbFlake(level, target);
  return true;
}

/**
 * A split ball that couldn't move stays in the origin cell as a size-1 ball, absorbing
 * a snowflake there (→ size 2) per the split rule.
 */
function placeStayedSplitBall(level: Level, pos: Position, turnCount: number): void {
  level.objects[pos.row][pos.col] = { type: 'snowball', size: 1, isMelting: false, createdAt: turnCount };
  absorbFlake(level, pos);
}

/**
 * Grow the snow object at `pos` by one size (cap: ball 2 / player 3 / snowman 3) if it
 * sits on a snowflake, consuming the flake — the same rule as pickFlake in push.ts.
 * Non-snow objects (block/laser/tree) never grow and leave the flake untouched.
 */
function absorbFlake(level: Level, pos: Position): void {
  const obj = level.objects[pos.row][pos.col];
  if (!obj) return;
  const tile = level.tiles[pos.row][pos.col];
  if (!tile.isFlake) return;
  const cap = obj.type === 'player' ? 3 : obj.type === 'snowman' ? 3 : obj.type === 'snowball' ? 2 : 0;
  if (obj.size < cap) {
    obj.size += 1;
    tile.isFlake = false;
    tile.isWarm = false;
  }
}
