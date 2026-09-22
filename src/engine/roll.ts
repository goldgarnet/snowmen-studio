import { Level, GameObject, Position, Direction, TriangleCorner } from '../types';
import { isInBounds } from '../utils/level';
import { getNextPos, canMoveTo, yellowWallsSolid } from './helpers';

// Triangle-mirror reflection — a snowball that has ENTERED a triangle cell turns 90°
// based on the direction it came in (like a light ray hitting the diagonal mirror).
const TRI_DEFLECT: Record<TriangleCorner, Partial<Record<Direction, Direction>>> = {
  br: { down: 'left', right: 'up' },
  bl: { down: 'right', left: 'up' },
  tl: { up: 'right', left: 'down' },
  tr: { up: 'left', right: 'down' },
};

/** Called after every committed rolling tick or at an elastic collision impact. */
export type RollTickHook = (level: Level, phase?: 'movement' | 'impact') => boolean;

interface RollingMember {
  pos: Position;
  obj: GameObject;
}

type RollingGroup = RollingMember[]; // rear → front in the direction of travel

// Kept local to avoid a turn.ts import cycle.
function findPortalsRoll(level: Level): Position[] {
  const portals: Position[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.tiles[r][c].isPortal) portals.push({ row: r, col: c });
    }
  }
  return portals;
}

// The rolling lead resolves holes and portals immediately after landing. A portal
// transfer ends this lead's motion; justTeleported prevents a later turn-level pass.
function resolveRollLeadSpecial(level: Level, group: RollingGroup): boolean {
  const lead = group[group.length - 1];
  if (!lead) return true;
  const tile = level.tiles[lead.pos.row][lead.pos.col];

  if (tile.isHole) {
    level.objects[lead.pos.row][lead.pos.col] = null;
    return true;
  }
  if (!tile.isPortal) return false;

  const portals = findPortalsRoll(level);
  if (portals.length !== 2) return false;
  const other = portals.find(p => p.row !== lead.pos.row || p.col !== lead.pos.col);
  if (!other || level.objects[other.row][other.col]) return false;

  const moving = level.objects[lead.pos.row][lead.pos.col];
  level.objects[lead.pos.row][lead.pos.col] = null;
  level.objects[other.row][other.col] = moving;
  if (moving) moving.justTeleported = true;
  return true;
}

// A triangle block turns a single ball at the block cell. The ball never rests in it;
// it exits on the reflected side in the same simulation tick.
function deflectOffTriangleBlock(
  level: Level, group: RollingGroup, blockPos: Position, dir: Direction
): Direction | null {
  const block = level.objects[blockPos.row][blockPos.col];
  if (!block?.triangleCorner) return null;
  const nextDir = TRI_DEFLECT[block.triangleCorner][dir];
  if (!nextDir) return null;

  const lead = group[group.length - 1];
  if (!lead || !canMoveTo(level, blockPos, nextDir, lead.obj)) return null;
  const exitPos = getNextPos(blockPos, nextDir);
  if (level.objects[exitPos.row][exitPos.col]) return null;

  level.objects[exitPos.row][exitPos.col] = level.objects[lead.pos.row][lead.pos.col];
  level.objects[lead.pos.row][lead.pos.col] = null;
  lead.pos = exitPos;
  return nextDir;
}

/**
 * Start rolling a snowball that has already been moved one cell by push.ts.
 * The tick hook records animation frames and resolves whole-board immediate effects.
 */
export function rollSnowball(
  level: Level, fromPos: Position, dir: Direction, _turnCount: number, onTick?: RollTickHook,
): void {
  const obj = level.objects[fromPos.row][fromPos.col];
  if (!obj || obj.type !== 'snowball') return;
  rollGroup(level, [{ pos: { ...fromPos }, obj }], dir, onTick);
}

export function rollSnowballGroup(
  level: Level, positions: Position[], dir: Direction, _turnCount: number, onTick?: RollTickHook,
): void {
  const group: RollingGroup = [];
  for (const pos of positions) {
    const obj = level.objects[pos.row][pos.col];
    if (obj?.type === 'snowball') group.push({ pos: { ...pos }, obj });
  }
  if (group.length > 0) rollGroup(level, group, dir, onTick);
}

/**
 * Resolve a rolling train one simulation tick at a time.
 *
 * A terrain boundary may stop an interior/rear member while a passable front suffix
 * continues. The stopped prefix loses its motion; the already-forward suffix keeps
 * its motion and receives a new mass calculation on the next collision.
 */
function rollGroup(
  level: Level, initialGroup: RollingGroup, initialDir: Direction, onTick?: RollTickHook,
  skipInitialTick = false,
): void {
  let group = initialGroup;
  let dir = initialDir;
  let isInitialTick = !skipInitialTick;
  let guard = 0;
  const maxTicks = level.width * level.height * 4 + 16;

  while (group.length > 0 && ++guard <= maxTicks) {
    // The first tick is the position produced by the player's push. It is observable:
    // a ball may have landed on a button, beam, hole, or portal already.
    if (isInitialTick) {
      isInitialTick = false;
      const stopped = resolveRollLeadSpecial(level, group);
      if (!finishTick(level, group, onTick) || stopped) return;
      continue;
    }

    const lead = group[group.length - 1];
    if (!lead || !isGroupPresent(level, group)) return;

    // A single ball can turn inside a triangle tile. Multi-ball trains cannot bend.
    const triangle = level.tiles[lead.pos.row][lead.pos.col].triangle;
    if (triangle && group.length === 1) {
      const reflected = TRI_DEFLECT[triangle][dir];
      if (reflected) dir = reflected;
    }

    // A height-limited boundary splits a moving train instead of freezing it. The
    // blocked member and rear prefix stay put; a passable front suffix advances in
    // this same tick, leaving a gap behind it.
    // Resolve this tick per member. First, every ball checks its own terrain/edge
    // crossing against the same tick-start board. Then resolve occupancy from front
    // to rear: a rear member may advance only when it can cross AND the member in
    // front will vacate its cell. This naturally leaves a stopped prefix and a moving
    // suffix without a color-wall-specific exception.
    const canCross = group.map(({ pos, obj }) => canMoveTo(level, pos, dir, obj));
    const willMove = new Array<boolean>(group.length).fill(false);
    let cellAheadWillVacate = true;
    for (let index = group.length - 1; index >= 0; index--) {
      willMove[index] = canCross[index] && cellAheadWillVacate;
      cellAheadWillVacate = willMove[index];
    }

    const movingStart = willMove.findIndex(Boolean);
    if (movingStart < 0) return;
    group = group.slice(movingStart);

    const activeLead = group[group.length - 1];
    const nextPos = getNextPos(activeLead.pos, dir);
    if (!isInBounds(level, nextPos)) return;
    const obstacle = level.objects[nextPos.row][nextPos.col];

    if (!obstacle) {
      moveRollingGroup(level, group, dir);
      handleRollFlakeAll(level, group);
      const stopped = resolveRollLeadSpecial(level, group);
      if (!finishTick(level, group, onTick) || stopped) return;
      continue;
    }

    // A triangle block deflects only a lone rolling ball.
    if (obstacle.type === 'block' && obstacle.triangleCorner && group.length === 1) {
      const reflected = deflectOffTriangleBlock(level, group, nextPos, dir);
      if (reflected === null) return;
      dir = reflected;
      handleRollFlakeAll(level, group);
      const stopped = resolveRollLeadSpecial(level, group);
      if (!finishTick(level, group, onTick) || stopped) return;
      continue;
    }

    const obstacleGroup = getConsecutiveObjects(level, nextPos, dir);
    if (!obstacleGroup.every(member => member.obj.type === 'snowball')) return;

    const rollingMass = getRollingMass(group);
    const obstacleMass = getRollingMass(obstacleGroup);

    if (obstacleMass < rollingMass) {
      // A stationary obstacle train has no independent momentum, so it must move as a
      // whole. The already-rolling train above is the only group that may split.
      if (!canMoveGroup(level, obstacleGroup, dir)) return;
      const obstacleLead = obstacleGroup[obstacleGroup.length - 1];
      const obstacleNext = getNextPos(obstacleLead.pos, dir);
      if (!isInBounds(level, obstacleNext) || level.objects[obstacleNext.row][obstacleNext.col]) return;

      // Both groups advance one cell during this one tick, then merge.
      moveRollingGroup(level, obstacleGroup, dir);
      handleRollFlakeAll(level, obstacleGroup);
      moveRollingGroup(level, group, dir);
      handleRollFlakeAll(level, group);
      group = [...group, ...obstacleGroup];

      const stopped = resolveRollLeadSpecial(level, group);
      if (!finishTick(level, group, onTick) || stopped) return;
      continue;
    }

    if (obstacleMass === rollingMass) {
      // Equal mass transfers motion to the stationary group.
      // Pause briefly at the contact state, then start the transferred group on its
      // first real movement tick. Its stationary position is already resolved by
      // the previous tick, so do not emit a duplicate initial snapshot.
      if (onTick && !onTick(level, 'impact')) return;
      rollGroup(level, obstacleGroup, dir, onTick, true);
    }
    return;
  }
}

function moveRollingGroup(level: Level, group: RollingGroup, dir: Direction): void {
  for (let i = group.length - 1; i >= 0; i--) {
    const member = group[i];
    const next = getNextPos(member.pos, dir);
    level.objects[next.row][next.col] = level.objects[member.pos.row][member.pos.col];
    level.objects[member.pos.row][member.pos.col] = null;
    member.pos = next;
  }
}

function canMoveGroup(level: Level, group: RollingGroup, dir: Direction): boolean {
  return group.every(({ pos, obj }) => canMoveTo(level, pos, dir, obj));
}

function isGroupPresent(level: Level, group: RollingGroup): boolean {
  return group.every(({ pos, obj }) => level.objects[pos.row][pos.col] === obj && obj.type === 'snowball');
}

function getConsecutiveObjects(level: Level, startPos: Position, dir: Direction): RollingGroup {
  const result: RollingGroup = [];
  let pos = startPos;
  while (isInBounds(level, pos)) {
    const obj = level.objects[pos.row][pos.col];
    if (!obj) break;
    result.push({ pos: { ...pos }, obj });
    pos = getNextPos(pos, dir);
  }
  return result;
}

function getRollingMass(group: RollingGroup): number {
  return group.reduce((total, member) => total + member.obj.size, 0);
}

function handleRollFlake(level: Level, member: RollingMember): void {
  const tile = level.tiles[member.pos.row][member.pos.col];
  if (!tile.isFlake || member.obj.type !== 'snowball' || member.obj.size >= 2) return;
  member.obj.size += 1;
  tile.isFlake = false;
  tile.isWarm = false;
}

function handleRollFlakeAll(level: Level, group: RollingGroup): void {
  for (const member of group) handleRollFlake(level, member);
}

// Fallback for callers without a turn-level hook. New turn resolution always supplies
// the hook, which performs the more complete whole-board laser calculation.
const BEAM_DIRS: Record<string, [number, number]> = {
  right: [0, 1], left: [0, -1], up: [-1, 0], down: [1, 0],
};
const BEAM_BLOCKERS = new Set(['wall', 'block', 'tree', 'laser']);

function killGroupOnBeam(level: Level, group: RollingGroup): boolean {
  const yellowSolid = yellowWallsSolid(level);
  let killed = false;
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const laser = level.objects[r][c];
      if (laser?.type !== 'laser') continue;
      const [dr, dc] = BEAM_DIRS[laser.laserDirection ?? 'right'];
      let cr = r + dr;
      let cc = c + dc;
      while (cr >= 0 && cc >= 0 && cr < level.height && cc < level.width) {
        if (level.tiles[cr][cc].isVoid) break;
        const hit = level.objects[cr][cc];
        if (hit) {
          if (BEAM_BLOCKERS.has(hit.type)) break;
          if (group.some(member => member.pos.row === cr && member.pos.col === cc)) {
            hit.size = 0;
            killed = true;
          }
          break;
        }
        if (level.tiles[cr][cc].triangle) break;
        if (yellowSolid && level.tiles[cr][cc].isYellowWall) break;
        cr += dr;
        cc += dc;
      }
    }
  }
  return killed;
}

function finishTick(level: Level, group: RollingGroup, onTick?: RollTickHook): boolean {
  if (onTick) return onTick(level) && isGroupPresent(level, group);
  return !killGroupOnBeam(level, group);
}
