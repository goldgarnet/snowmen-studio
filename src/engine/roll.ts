import { Level, GameObject, Position, Direction, TriangleCorner } from '../types';
import { isInBounds } from '../utils/level';
import { getNextPos, canMoveTo, yellowWallsSolid } from './helpers';

// Triangle-mirror reflection — a snowball that has ENTERED a triangle cell turns 90°
// based on the direction it came in (like a light ray hitting the diagonal mirror).
// "/" mirror swaps right↔up & left↔down; "\" mirror swaps right↔down & left↔up.
const TRI_DEFLECT: Record<TriangleCorner, Partial<Record<Direction, Direction>>> = {
  br: { down: 'left', right: 'up' },    // ◢ mirror "/"
  bl: { down: 'right', left: 'up' },    // ◣ mirror "\"
  tl: { up: 'right', left: 'down' },    // ◤ mirror "/"
  tr: { up: 'left', right: 'down' },    // ◥ mirror "\"
};

export function rollSnowball(level: Level, fromPos: Position, dir: Direction, turnCount: number): void {
  const obj = level.objects[fromPos.row][fromPos.col];
  if (!obj || obj.type !== 'snowball') return;

  let rollingGroup: { pos: Position; obj: GameObject }[] = [{ pos: { ...fromPos }, obj }];
  let rollingSize = obj.size;
  let guard = 0;
  const MAX_ITERS = level.width * level.height * 4 + 16;

  while (true) {
    if (++guard > MAX_ITERS) break;
    const leadPos = rollingGroup[rollingGroup.length - 1].pos;
    const leadObj = rollingGroup[rollingGroup.length - 1].obj;

    // Triangle mirror: if a single ball is currently inside a triangle cell, reflect
    // its direction (it entered across an open edge). A train can't turn a corner.
    const curTri = level.tiles[leadPos.row][leadPos.col].triangle;
    if (curTri && rollingGroup.length === 1) {
      const nd = TRI_DEFLECT[curTri][dir];
      if (nd) dir = nd;
    }

    if (!canMoveTo(level, leadPos, dir, leadObj)) break;

    const nextPos = getNextPos(leadPos, dir);
    if (!isInBounds(level, nextPos)) break;

    const obstacle = level.objects[nextPos.row][nextPos.col];

    if (!obstacle) {
      moveRollingGroup(level, rollingGroup, dir);
      handleRollFlake(level, rollingGroup[rollingGroup.length - 1].pos, leadObj);
      if (killIfOnBeam(level, rollingGroup)) break;
      continue;
    }

    // Collision with obstacle
    const obstacleGroup = getConsecutiveObjects(level, nextPos, dir);
    const obstacleSize = obstacleGroup.reduce((sum, g) => sum + g.obj.size, 0);
    const allSnowballs = obstacleGroup.every(g => g.obj.type === 'snowball');

    if (!allSnowballs) break;

    if (obstacleSize < rollingSize) {
      // Absorb: need room for obstacle to be pushed forward
      const obsLead = obstacleGroup[obstacleGroup.length - 1];
      if (!canMoveTo(level, obsLead.pos, dir, obsLead.obj)) break;
      const obsNextPos = getNextPos(obsLead.pos, dir);
      if (!isInBounds(level, obsNextPos) || level.objects[obsNextPos.row][obsNextPos.col]) break;

      // Move obstacle forward first, then rolling group
      moveRollingGroup(level, obstacleGroup, dir);
      const newObsLead = obstacleGroup[obstacleGroup.length - 1];
      handleRollFlake(level, newObsLead.pos, newObsLead.obj);

      moveRollingGroup(level, rollingGroup, dir);

      // Merge obstacle group into rolling group
      for (const g of obstacleGroup) {
        rollingGroup.push({ pos: { ...g.pos }, obj: g.obj });
      }
      rollingSize += obstacleSize;
      continue;
    } else if (obstacleSize === rollingSize) {
      // Rolling group stops, obstacle group starts rolling as a unit
      rollGroup(level, obstacleGroup, dir, turnCount);
      break;
    } else {
      break;
    }
  }
}

export function rollSnowballGroup(level: Level, positions: Position[], dir: Direction, turnCount: number): void {
  const group: { pos: Position; obj: GameObject }[] = [];
  for (const pos of positions) {
    const obj = level.objects[pos.row][pos.col];
    if (obj && obj.type === 'snowball') {
      group.push({ pos: { ...pos }, obj });
    }
  }
  if (group.length === 0) return;
  rollGroup(level, group, dir, turnCount);
}

function rollGroup(level: Level, group: { pos: Position; obj: GameObject }[], dir: Direction, turnCount: number): void {
  let rollingSize = group.reduce((sum, g) => sum + g.obj.size, 0);
  let guard = 0;
  const MAX_ITERS = level.width * level.height * 4 + 16;

  while (true) {
    if (++guard > MAX_ITERS) break;
    const leadPos = group[group.length - 1].pos;
    const leadObj = group[group.length - 1].obj;

    const curTri = level.tiles[leadPos.row][leadPos.col].triangle;
    if (curTri && group.length === 1) {
      const nd = TRI_DEFLECT[curTri][dir];
      if (nd) dir = nd;
    }

    if (!canMoveTo(level, leadPos, dir, leadObj)) break;

    const nextPos = getNextPos(leadPos, dir);
    if (!isInBounds(level, nextPos)) break;

    const obstacle = level.objects[nextPos.row][nextPos.col];

    if (!obstacle) {
      moveRollingGroup(level, group, dir);
      handleRollFlake(level, group[group.length - 1].pos, leadObj);
      if (killIfOnBeam(level, group)) break;
      continue;
    }

    const obstacleGroup = getConsecutiveObjects(level, nextPos, dir);
    const obstacleSize = obstacleGroup.reduce((sum, g) => sum + g.obj.size, 0);
    const allSnowballs = obstacleGroup.every(g => g.obj.type === 'snowball');

    if (!allSnowballs) break;

    if (obstacleSize < rollingSize) {
      // Absorb: need room for obstacle to be pushed forward
      const obsLead = obstacleGroup[obstacleGroup.length - 1];
      if (!canMoveTo(level, obsLead.pos, dir, obsLead.obj)) break;
      const obsNextPos = getNextPos(obsLead.pos, dir);
      if (!isInBounds(level, obsNextPos) || level.objects[obsNextPos.row][obsNextPos.col]) break;

      moveRollingGroup(level, obstacleGroup, dir);
      const newObsLead = obstacleGroup[obstacleGroup.length - 1];
      handleRollFlake(level, newObsLead.pos, newObsLead.obj);

      moveRollingGroup(level, group, dir);

      for (const g of obstacleGroup) {
        group.push({ pos: { ...g.pos }, obj: g.obj });
      }
      rollingSize += obstacleSize;
      continue;
    } else if (obstacleSize === rollingSize) {
      rollGroup(level, obstacleGroup, dir, turnCount);
      break;
    } else {
      break;
    }
  }
}

function moveRollingGroup(level: Level, group: { pos: Position; obj: GameObject }[], dir: Direction): void {
  for (let i = group.length - 1; i >= 0; i--) {
    const { pos } = group[i];
    const nextPos = getNextPos(pos, dir);
    level.objects[nextPos.row][nextPos.col] = level.objects[pos.row][pos.col];
    level.objects[pos.row][pos.col] = null;
    group[i].pos = nextPos;
  }
}

const BEAM_DIRS_ROLL: Record<string, [number, number]> = {
  right: [0, 1], left: [0, -1], up: [-1, 0], down: [1, 0],
};
const BEAM_BLOCKERS_ROLL = new Set(['wall', 'block', 'tree', 'laser']);

// Returns true and kills the object if pos is on any laser beam. Triangle tiles
// stop the beam at their own cell (one cell further than a solid blocker).
function killIfOnBeam(level: Level, group: { pos: Position; obj: GameObject }[]): boolean {
  let killed = false;
  const ySolid = yellowWallsSolid(level);
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const laser = level.objects[r][c];
      if (!laser || laser.type !== 'laser') continue;
      const [dr, dc] = BEAM_DIRS_ROLL[laser.laserDirection ?? 'right'];
      let cr = r + dr;
      let cc = c + dc;
      while (cr >= 0 && cc >= 0 && cr < level.height && cc < level.width) {
        const hit = level.objects[cr][cc];
        if (hit) {
          if (BEAM_BLOCKERS_ROLL.has(hit.type)) break;
          // Check if this hit object is in our rolling group
          if (group.some(g => g.pos.row === cr && g.pos.col === cc)) {
            hit.size = 0;
            killed = true;
          }
          break; // beam is blocked by this object (killed or not)
        }
        if (level.tiles[cr][cc].triangle) break; // triangle stops the beam at this cell
        if (ySolid && level.tiles[cr][cc].isYellowWall) break; // solid yellow wall blocks
        cr += dr;
        cc += dc;
      }
    }
  }
  return killed;
}

function getConsecutiveObjects(level: Level, startPos: Position, dir: Direction): { pos: Position; obj: GameObject }[] {
  const result: { pos: Position; obj: GameObject }[] = [];
  let pos = startPos;

  while (isInBounds(level, pos)) {
    const obj = level.objects[pos.row][pos.col];
    if (!obj) break;
    result.push({ pos: { ...pos }, obj });
    pos = getNextPos(pos, dir);
  }

  return result;
}

function handleRollFlake(level: Level, pos: Position, obj: GameObject): void {
  const tile = level.tiles[pos.row][pos.col];
  if (!tile.isFlake) return;

  if (obj.type === 'snowball' && obj.size < 2) {
    obj.size += 1;
    tile.isFlake = false;
    tile.isWarm = false;
  }
}
