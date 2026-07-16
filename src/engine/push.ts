import { Level, GameObject, Position, Direction } from '../types';
import { isInBounds } from '../utils/level';
import { getNextPos, canMoveTo, canLeaveTile, canPassEdge, isBacked, yellowWallsSolid, orangeWallsSolid } from './helpers';
import { rollSnowball, rollSnowballGroup } from './roll';
import { applyForce } from './force';

export interface PushResult {
  level: Level;
  playerMoved: boolean;
}

export function executePush(level: Level, playerPos: Position, dir: Direction, turnCount: number): PushResult {
  const player = level.objects[playerPos.row][playerPos.col]!;
  const ps = player.size;

  // Check if player can leave current tile
  if (!canMoveTo(level, playerPos, dir, player)) {
    return { level, playerMoved: false };
  }

  const posA = getNextPos(playerPos, dir);
  if (!isInBounds(level, posA)) return { level, playerMoved: false };

  const objA = level.objects[posA.row][posA.col];

  // Laser: cannot push from emitting face.
  // Emitting face = direction laser fires. Player hits it by moving in OPP direction.
  // e.g. laser fires RIGHT → emitting face is right side → block player moving LEFT into it.
  if (objA?.type === 'laser' && dir === OPP_DIR[objA.laserDirection ?? 'right']) {
    return { level, playerMoved: false };
  }

  // No object: player just moves
  if (!objA) {
    moveObj(level, playerPos, posA);
    pickFlake(level, posA);
    return { level, playerMoved: true };
  }

  // Get objects A, B, C in push direction
  const a = objInfo(objA);

  const posB = getNextPos(posA, dir);
  const b = getObjAt(level, posB);

  const posC = (b.exists && isInBounds(level, posB)) ? getNextPos(posB, dir) : null;
  const c = posC ? getObjAt(level, posC) : { exists: false, type: 'wall' as const, size: 100, isSnowball: false, isWall: true, isBlock: false };

  // If there are 4+ objects in a row, treat C as wall
  if (c.exists && posC) {
    const posD = getNextPos(posC, dir);
    if (isInBounds(level, posD) && level.objects[posD.row][posD.col]) {
      // 4+ objects: treat as if C is a wall for push purposes
      return resolvePush(level, playerPos, posA, posB, posC, dir, ps, a, b,
        { exists: true, type: 'wall', size: 100, isSnowball: false, isWall: true, isBlock: false },
        turnCount);
    }
  }

  return resolvePush(level, playerPos, posA, posB, posC, dir, ps, a, b, c, turnCount);
}

interface ObjInfo {
  exists: boolean;
  type: string;
  size: number;
  isSnowball: boolean;
  isWall: boolean;
  isBlock: boolean;
}

const OPP_DIR: Record<string, string> = { right:'left', left:'right', up:'down', down:'up' };

function objInfo(obj: GameObject): ObjInfo {
  return {
    exists: true,
    type: obj.type,
    size: obj.size,
    isSnowball: obj.type === 'snowball',
    isWall: obj.type === 'wall' || obj.size === 100,
    isBlock: obj.type === 'block' || obj.type === 'laser',
  };
}

function getObjAt(level: Level, pos: Position): ObjInfo {
  if (!isInBounds(level, pos)) {
    return { exists: true, type: 'wall', size: 100, isSnowball: false, isWall: true, isBlock: false };
  }
  // A solid yellow wall (a tile, not an object) blocks and crushes exactly like a
  // real wall — so a snowball pushed against it turns to a flake instead of no-op.
  if (level.tiles[pos.row][pos.col].isYellowWall && yellowWallsSolid(level)) {
    return { exists: true, type: 'wall', size: 100, isSnowball: false, isWall: true, isBlock: false };
  }
  if (level.tiles[pos.row][pos.col].isOrangeWall && orangeWallsSolid(level)) {
    return { exists: true, type: 'wall', size: 100, isSnowball: false, isWall: true, isBlock: false };
  }
  const obj = level.objects[pos.row][pos.col];
  if (!obj) return { exists: false, type: 'none', size: 0, isSnowball: false, isWall: false, isBlock: false };
  return objInfo(obj);
}

function resolvePush(
  level: Level, playerPos: Position, posA: Position, posB: Position,
  posC: Position | null, dir: Direction,
  ps: number, a: ObjInfo, b: ObjInfo, c: ObjInfo,
  turnCount: number
): PushResult {
  // Check if A can physically move (arch constraints)
  const objA = level.objects[posA.row][posA.col]!;
  const aCanMove = canMoveTo(level, posA, dir, objA) && !b.exists;
  const aCanMoveIntoB = canMoveTo(level, posA, dir, objA);
  // For "force" (crash/split) we don't need A to ENTER B — only to be able to leave
  // its own tile and cross the edge toward B. This makes a snowball pressed against
  // the board edge crash (leave a flake) exactly like one pressed against a wall;
  // canMoveTo would wrongly return false for the out-of-bounds edge case.
  const aCanPress = canLeaveTile(level, posA, dir, objA) && canPassEdge(level, posA, dir, objA);

  // For force/build backing: does the cell behind B back the push?
  // (wall/block/tree/OOB/perpendicular tunnel/edge-arch blocking heavy objects)
  const backedAtB = isBacked(level, posB, dir);

  // A is a wall/tree (size 100)
  if (a.isWall) return { level, playerMoved: false };

  // ===== PLAYER SIZE 1 =====
  if (ps === 1) {
    if (!b.exists) {
      // A alone, B=NULL
      if ((a.isSnowball && a.size === 1) || (a.type === 'snowman' && a.size === 1) || a.isBlock) {
        if (aCanMove) return doMove1(level, playerPos, posA, posB);
      }
      return { level, playerMoved: false };
    }
    if (!c.exists) {
      // A+B, C=NULL (posC in bounds and empty, OR posB OOB)
      if (a.isSnowball && a.size === 1 && (b.isWall || b.isBlock)) {
        if (aCanPress) return doForceA(level, posA, dir, turnCount);
        return { level, playerMoved: false };
      }
      if (a.isSnowball && a.size === 1 && b.isSnowball && b.size === 1) {
        if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 1, turnCount);
        return { level, playerMoved: false };
      }
      return { level, playerMoved: false };
    }
    // A+B+C all exist
    if (a.isSnowball && a.size === 1 && (b.isWall || b.isBlock)) {
      if (aCanMoveIntoB) return doForceA(level, posA, dir, turnCount);
      return { level, playerMoved: false };
    }
    if (a.isSnowball && a.size === 1 && b.isSnowball && b.size === 1) {
      if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 1, turnCount);
      return { level, playerMoved: false };
    }
    return { level, playerMoved: false };
  }

  // ===== PLAYER SIZE 2 =====
  if (ps === 2) {
    if (!b.exists) {
      // A alone
      if (a.isSnowball && a.size === 1) {
        if (aCanMove) return doRollA(level, playerPos, posA, dir, turnCount);
        return doForceA(level, posA, dir, turnCount);
      }
      if ((a.type === 'snowman' && a.size === 1) || a.isBlock || (a.isSnowball && a.size === 2) || (a.type === 'snowman' && a.size === 2)) {
        if (aCanMove) return doMove1(level, playerPos, posA, posB);
        if (a.isSnowball) return doForceA(level, posA, dir, turnCount);
        return { level, playerMoved: false };
      }
      if (a.type === 'snowman' && a.size === 3) return { level, playerMoved: false };
      return { level, playerMoved: false };
    }

    if (!c.exists) {
      // A+B, C=NULL
      if (a.size === 1 && b.size === 1 && !b.isWall &&
        (a.isSnowball || a.type === 'snowman' || a.isBlock) &&
        (b.isSnowball || b.type === 'snowman' || b.isBlock)) {
        if (aCanMoveIntoB && canMoveObj(level, posB, dir)) {
          return doMove2(level, playerPos, posA, posB, dir);
        }
      }

      if (a.isSnowball && a.size === 1 && b.isWall) {
        return doForceA(level, posA, dir, turnCount);
      }
      // A=s1 snowball, B=s1 snowball, C empty: build only if backed
      if (a.isSnowball && a.size === 1 && b.isSnowball && b.size === 1) {
        if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 1, turnCount);
        return { level, playerMoved: false };
      }
      if (a.isSnowball && a.size === 1 && !b.isWall && !b.isBlock && b.size >= 2) {
        return { level, playerMoved: false };
      }
      if (a.isSnowball && a.size === 2 && (b.isWall || b.isBlock)) {
        return doForceA(level, posA, dir, turnCount);
      }
      if (a.isSnowball && a.size === 2 && (b.isSnowball || b.type === 'snowman')) {
        return { level, playerMoved: false };
      }
      if (a.type === 'snowman' && a.size === 2 && b.exists) return { level, playerMoved: false };
      if ((a.type === 'snowman' && a.size >= 3) || a.isWall) return { level, playerMoved: false };

      return { level, playerMoved: false };
    }

    // A+B+C all exist
    // A size-1 snowball backed by a wall OR block can't be pushed by a size-2
    // player (the block can't move because C backs it), so it crushes into a
    // flake — consistent with a size-2 snowball splitting against a backed block
    // (below) and with size-1/size-3 players.
    if (a.isSnowball && a.size === 1 && (b.isWall || b.isBlock)) {
      return doForceA(level, posA, dir, turnCount);
    }
    if (a.isSnowball && a.size === 2 && (b.isWall || b.isBlock)) {
      return doForceA(level, posA, dir, turnCount);
    }
    // A=s1 snowball, B=s1 snowball, C exists: build only if backed
    if (a.isSnowball && a.size === 1 && b.isSnowball && b.size === 1) {
      if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 1, turnCount);
      return { level, playerMoved: false };
    }
    // A=s1 snowball, B=s2 snowball, C exists: build only if backed
    if (a.isSnowball && a.size === 1 && b.isSnowball && b.size === 2) {
      if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 2, turnCount);
      return { level, playerMoved: false };
    }
    // A=s2 snowball, B=s1 snowball, C backed: A MOVES and B FORCED
    if (a.isSnowball && a.size === 2 && b.isSnowball && b.size === 1) {
      if (backedAtB) return doMoveThenForceB(level, posB, dir, turnCount);
      return { level, playerMoved: false };
    }

    return { level, playerMoved: false };
  }

  // ===== PLAYER SIZE 3 =====
  if (ps === 3) {
    if (!b.exists) {
      // A alone
      if (a.isSnowball) {
        if (aCanMove) return doRollA(level, playerPos, posA, dir, turnCount);
        return doForceA(level, posA, dir, turnCount);
      }
      if (a.type === 'snowman' || a.isBlock) {
        if (aCanMove) return doMove1(level, playerPos, posA, posB);
        return { level, playerMoved: false };
      }
      return { level, playerMoved: false };
    }

    if (!c.exists) {
      // A+B, C=NULL
      if (a.isSnowball && a.size === 1 && b.isSnowball && b.size === 1) {
        if (aCanMoveIntoB && canMoveObj(level, posB, dir)) {
          return doRoll2(level, playerPos, posA, posB, dir, turnCount);
        }
        // can't roll: if backed, build snowman size 1
        if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 1, turnCount);
        return { level, playerMoved: false };
      }
      if (a.isSnowball && a.size === 1 && b.isSnowball && b.size === 2) {
        if (aCanMoveIntoB && canMoveObj(level, posB, dir)) {
          return doMove2(level, playerPos, posA, posB, dir);
        }
        if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 2, turnCount);
        return { level, playerMoved: false };
      }
      if (a.isSnowball && a.size === 1 && b.type === 'snowman' && b.size <= 2) {
        if (aCanMoveIntoB && canMoveObj(level, posB, dir)) {
          return doMove2(level, playerPos, posA, posB, dir);
        }
      }
      if (a.isSnowball && a.size === 1 && b.type === 'snowman' && b.size >= 3) {
        return { level, playerMoved: false };
      }
      if (a.isSnowball && a.size === 2 && b.isSnowball && b.size === 1) {
        if (aCanMoveIntoB && canMoveObj(level, posB, dir)) {
          return doMove2(level, playerPos, posA, posB, dir);
        }
        // can't move forward: if backed, B is forced
        if (backedAtB) return doMoveThenForceB(level, posB, dir, turnCount);
        return { level, playerMoved: false };
      }
      if (a.isSnowball && a.size === 2 && b.isSnowball && b.size === 2) {
        if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 3, turnCount);
        return { level, playerMoved: false };
      }
      if (a.isSnowball && a.size === 2 && b.type === 'snowman' && b.size === 1) {
        if (aCanMoveIntoB && canMoveObj(level, posB, dir)) {
          return doMove2(level, playerPos, posA, posB, dir);
        }
      }
      if (a.isSnowball && a.size === 2 && b.type === 'snowman' && b.size >= 2) {
        return { level, playerMoved: false };
      }
      if (a.isSnowball && b.isBlock) {
        if (aCanMoveIntoB && canMoveObj(level, posB, dir)) {
          return doMove2(level, playerPos, posA, posB, dir);
        }
      }
      if (a.isSnowball && b.isWall) {
        return doForceA(level, posA, dir, turnCount);
      }
      if ((a.type === 'snowman' && a.size === 1 || a.isBlock) && b.size <= 2 && !b.isWall) {
        if (aCanMoveIntoB && canMoveObj(level, posB, dir)) {
          return doMove2(level, playerPos, posA, posB, dir);
        }
      }
      if ((a.type === 'snowman' && a.size === 1 || a.isBlock) && (b.size >= 3 || b.isWall)) {
        return { level, playerMoved: false };
      }
      if (a.type === 'snowman' && a.size === 2 && b.size <= 1 && !b.isWall) {
        if (aCanMoveIntoB && canMoveObj(level, posB, dir)) {
          return doMove2(level, playerPos, posA, posB, dir);
        }
      }
      if (a.type === 'snowman' && a.size === 2 && (b.size >= 2 || b.isWall)) {
        return { level, playerMoved: false };
      }
      if (a.type === 'snowman' && a.size >= 3) return { level, playerMoved: false };

      return { level, playerMoved: false };
    }

    // ===== A+B+C all exist, ps=3 =====
    if (a.size === 1 && b.size === 1 && c.size === 1 && !a.isWall && !b.isWall && !c.isWall) {
      // For chain pushes, B doesn't need its next cell empty NOW (C will move out of
      // the way first). Only check arch/tunnel passability for B, and let canMoveObj
      // handle C → D (where D must be in-bounds and empty).
      const objB = level.objects[posB.row][posB.col];
      const bCanPass = !!objB && canMoveTo(level, posB, dir, objB);
      if (posC && aCanMoveIntoB && bCanPass && canMoveObj(level, posC, dir)) {
        return doMove3(level, playerPos, posA, posB, posC, dir);
      }
    }

    // A=s1 snowball, B=s1 snowball, C size>=2 (or backed): snowman size 1
    if (a.isSnowball && a.size === 1 && b.isSnowball && b.size === 1 && c.size >= 2) {
      if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 1, turnCount);
      return { level, playerMoved: false };
    }

    if (a.isSnowball && a.size === 1 && b.isWall) {
      return doForceA(level, posA, dir, turnCount);
    }
    if (a.isSnowball && a.size === 1 && b.isBlock && c.size >= 2) {
      return doForceA(level, posA, dir, turnCount);
    }
    if (a.isSnowball && a.size === 1 && b.type === 'snowman' && b.size === 1 && c.size >= 2) {
      return { level, playerMoved: false };
    }
    if (a.isSnowball && a.size === 1 && b.isSnowball && b.size === 2) {
      if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 2, turnCount);
      return { level, playerMoved: false };
    }
    if (a.isSnowball && a.size === 1 && b.type === 'snowman' && b.size === 2) {
      return { level, playerMoved: false };
    }
    if (a.isSnowball && a.size === 1 && ((b.type === 'snowman' && b.size >= 3) || b.isWall)) {
      return { level, playerMoved: false };
    }

    if ((a.type === 'snowman' && a.size === 1 || a.isBlock) && b.size + c.size > 2) {
      return { level, playerMoved: false };
    }

    if (a.isSnowball && a.size === 2 && (b.isWall || b.isBlock)) {
      return doForceA(level, posA, dir, turnCount);
    }
    if (a.isSnowball && a.size === 2 && b.isSnowball && b.size === 1) {
      if (backedAtB) return doMoveThenForceB(level, posB, dir, turnCount);
      return { level, playerMoved: false };
    }
    if (a.isSnowball && a.size === 2 && b.isSnowball && b.size === 2) {
      if (backedAtB) return doBuildSnowman(level, playerPos, posA, posB, 3, turnCount);
      return { level, playerMoved: false };
    }
    if (a.isSnowball && a.size === 2 && !b.isSnowball) {
      return { level, playerMoved: false };
    }
    if (a.type === 'snowman' && a.size === 2) return { level, playerMoved: false };
    if ((a.type === 'snowman' && a.size >= 3) || a.isWall) return { level, playerMoved: false };

    return { level, playerMoved: false };
  }

  return { level, playerMoved: false };
}

// === Action helpers ===

function doMove1(level: Level, playerPos: Position, posA: Position, posB: Position): PushResult {
  moveObj(level, posA, posB);
  pickFlake(level, posB);
  moveObj(level, playerPos, posA);
  pickFlake(level, posA);
  return { level, playerMoved: true };
}

function doMove2(level: Level, playerPos: Position, posA: Position, posB: Position, dir: Direction): PushResult {
  const posC = getNextPos(posB, dir);
  moveObj(level, posB, posC);
  pickFlake(level, posC);
  moveObj(level, posA, posB);
  pickFlake(level, posB);
  moveObj(level, playerPos, posA);
  pickFlake(level, posA);
  return { level, playerMoved: true };
}

function doMove3(level: Level, playerPos: Position, posA: Position, posB: Position, posC: Position, dir: Direction): PushResult {
  const posD = getNextPos(posC, dir);
  moveObj(level, posC, posD);
  pickFlake(level, posD);
  moveObj(level, posB, posC);
  pickFlake(level, posC);
  moveObj(level, posA, posB);
  pickFlake(level, posB);
  moveObj(level, playerPos, posA);
  pickFlake(level, posA);
  return { level, playerMoved: true };
}

function doRollA(level: Level, playerPos: Position, posA: Position, dir: Direction, turnCount: number): PushResult {
  const posB = getNextPos(posA, dir);
  moveObj(level, posA, posB);
  pickFlake(level, posB);
  moveObj(level, playerPos, posA);
  pickFlake(level, posA);
  rollSnowball(level, posB, dir, turnCount);
  return { level, playerMoved: true };
}

function doRoll2(level: Level, playerPos: Position, posA: Position, posB: Position, dir: Direction, turnCount: number): PushResult {
  const posC = getNextPos(posB, dir);
  moveObj(level, posB, posC);
  pickFlake(level, posC);
  moveObj(level, posA, posB);
  pickFlake(level, posB);
  moveObj(level, playerPos, posA);
  pickFlake(level, posA);

  rollSnowballGroup(level, [posB, posC], dir, turnCount);

  return { level, playerMoved: true };
}

function doForceA(level: Level, posA: Position, dir: Direction, turnCount: number): PushResult {
  // Force: player stays in place, only the force effect is applied
  applyForce(level, posA, dir, turnCount);
  return { level, playerMoved: true };
}

function doMoveThenForceB(level: Level, posB: Position, dir: Direction, turnCount: number): PushResult {
  // Force on B: player and A stay in place, only force is applied on B
  applyForce(level, posB, dir, turnCount);
  return { level, playerMoved: true };
}

function doBuildSnowman(
  level: Level, playerPos: Position, posA: Position, posB: Position,
  snowmanSize: number, turnCount: number
): PushResult {
  // A and B merge into a snowman at B's position
  level.objects[posA.row][posA.col] = null;
  level.objects[posB.row][posB.col] = {
    type: 'snowman',
    size: snowmanSize,
    isMelting: false,
    createdAt: turnCount,
  };
  level.tiles[posB.row][posB.col].isWarm = false;

  // Player moves to A's former position
  moveObj(level, playerPos, posA);
  pickFlake(level, posA);
  return { level, playerMoved: true };
}

// === Utility ===

function moveObj(level: Level, from: Position, to: Position): void {
  if (from.row === to.row && from.col === to.col) return;
  level.objects[to.row][to.col] = level.objects[from.row][from.col];
  level.objects[from.row][from.col] = null;
}

function pickFlake(level: Level, pos: Position): void {
  const obj = level.objects[pos.row][pos.col];
  if (!obj) return;
  const tile = level.tiles[pos.row][pos.col];
  if (!tile.isFlake) return;

  if (obj.type === 'player' && obj.size < 3) {
    obj.size += 1;
    tile.isFlake = false;
    tile.isWarm = false;
  } else if (obj.type === 'snowball' && obj.size < 2) {
    obj.size += 1;
    tile.isFlake = false;
    tile.isWarm = false;
  } else if (obj.type === 'snowman' && obj.size < 3) {
    obj.size += 1;
    tile.isFlake = false;
    tile.isWarm = false;
  }
}

function canMoveObj(level: Level, pos: Position, dir: Direction): boolean {
  const next = getNextPos(pos, dir);
  if (!isInBounds(level, next)) return false;
  if (level.objects[next.row][next.col]) return false;
  const obj = level.objects[pos.row][pos.col];
  if (!obj) return false;
  return canMoveTo(level, pos, dir, obj);
}
