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

// Portals for the roll module (kept local to avoid a turn.ts import cycle).
function findPortalsRoll(level: Level): Position[] {
  const ps: Position[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.tiles[r][c].isPortal) ps.push({ row: r, col: c });
    }
  }
  return ps;
}

// After the rolling group's lead lands on a cell, resolve holes and portals:
//   - Hole: the lead falls in and disappears → the roll stops (returns true).
//   - Portal: if the map has exactly two portals and the OTHER portal is empty, the
//     lead is relocated there and the roll stops (returns true). If the destination
//     portal is occupied (or portals aren't paired), nothing happens and the ball
//     keeps rolling (returns false).
function resolveRollLeadSpecial(level: Level, group: { pos: Position; obj: GameObject }[]): boolean {
  if (group.length === 0) return true;
  const lead = group[group.length - 1];
  const tile = level.tiles[lead.pos.row][lead.pos.col];
  if (tile.isHole) {
    level.objects[lead.pos.row][lead.pos.col] = null;
    return true;
  }
  if (tile.isPortal) {
    const portals = findPortalsRoll(level);
    if (portals.length === 2) {
      const other = portals.find(p => !(p.row === lead.pos.row && p.col === lead.pos.col));
      if (other && !level.objects[other.row][other.col]) {
        const moving = level.objects[lead.pos.row][lead.pos.col];
        level.objects[lead.pos.row][lead.pos.col] = null;
        level.objects[other.row][other.col] = moving;
        if (moving) moving.justTeleported = true;
        return true;
      }
    }
    return false; // destination occupied / unpaired → keep rolling
  }
  return false;
}

export function rollSnowball(level: Level, fromPos: Position, dir: Direction, turnCount: number): void {
  const obj = level.objects[fromPos.row][fromPos.col];
  if (!obj || obj.type !== 'snowball') return;

  let rollingGroup: { pos: Position; obj: GameObject }[] = [{ pos: { ...fromPos }, obj }];
  let rollingSize = obj.size;
  let guard = 0;
  const MAX_ITERS = level.width * level.height * 4 + 16;

  // The ball has just been placed at fromPos by the push helper (which may have
  // moved it one cell forward onto a beam). If that starting cell is already on a
  // laser beam, it dies right there — before rolling any further.
  if (killIfOnBeam(level, rollingGroup)) return;
  // Likewise, if it was placed onto a hole or portal, resolve that immediately.
  if (resolveRollLeadSpecial(level, rollingGroup)) return;

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
      handleRollFlakeAll(level, rollingGroup);
      if (killIfOnBeam(level, rollingGroup)) break;
      if (resolveRollLeadSpecial(level, rollingGroup)) break;
      continue;
    }

    // Triangle block: a single rolling ball deflects off it like a triangle wall of the
    // same corner (it can't enter the block's cell). Hitting a solid-leg side (no
    // deflection mapping) just stops, like a normal block.
    if (obstacle.type === 'block' && obstacle.triangleCorner && rollingGroup.length === 1) {
      const nd = TRI_DEFLECT[obstacle.triangleCorner][dir];
      if (nd) { dir = nd; continue; }
      break;
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
      handleRollFlakeAll(level, obstacleGroup);

      moveRollingGroup(level, rollingGroup, dir);
      handleRollFlakeAll(level, rollingGroup);

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

  // Same as rollSnowball: if the group's starting cell is already on a beam
  // (e.g. it was just placed there by the push helper), it dies before rolling.
  if (killIfOnBeam(level, group)) return;
  if (resolveRollLeadSpecial(level, group)) return;

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
      handleRollFlakeAll(level, group);
      if (killIfOnBeam(level, group)) break;
      if (resolveRollLeadSpecial(level, group)) break;
      continue;
    }

    // Triangle block deflection (single ball only) — see rollSnowball.
    if (obstacle.type === 'block' && obstacle.triangleCorner && group.length === 1) {
      const nd = TRI_DEFLECT[obstacle.triangleCorner][dir];
      if (nd) { dir = nd; continue; }
      break;
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
      handleRollFlakeAll(level, obstacleGroup);

      moveRollingGroup(level, group, dir);
      handleRollFlakeAll(level, group);

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

// Every ball in a rolling group picks up a flake on the cell it just landed on —
// not only the lead ball. Without this, trailing balls roll over flakes without
// growing (and a flake the size-2 lead can't absorb is left for the ball behind).
function handleRollFlakeAll(level: Level, group: { pos: Position; obj: GameObject }[]): void {
  for (const g of group) handleRollFlake(level, g.pos, g.obj);
}
