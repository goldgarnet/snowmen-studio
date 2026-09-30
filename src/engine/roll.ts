import { Level, GameObject, Position, Direction, TriangleCorner } from '../types';
import { isInBounds } from '../utils/level';
import { getNextPos, canMoveTo, yellowWallsSolid } from './helpers';

// Triangle-mirror reflection — a snowball that has ENTERED a triangle cell turns 90°
// based on the direction it came in (like a light ray hitting the diagonal mirror).
// Keys and results never overlap, so a ball that waits inside the cell after turning
// is not turned a second time.
const TRI_DEFLECT: Record<TriangleCorner, Partial<Record<Direction, Direction>>> = {
  br: { down: 'left', right: 'up' },
  bl: { down: 'right', left: 'up' },
  tl: { up: 'right', left: 'down' },
  tr: { up: 'left', right: 'down' },
};

/**
 * Called after every committed rolling tick or at an elastic collision impact, and once
 * with 'loop' when a roll is cut off by the tick limit (an endless loop, Q-13).
 */
export type RollTickHook = (level: Level, phase?: 'movement' | 'impact' | 'loop') => boolean;

/**
 * One rolling snowball. Every ball carries its own direction: a train is not a rigid
 * object but a line of balls where each follows the one in front of it. That is what
 * lets a train bend around a triangle mirror one ball at a time (Q-04), lose its front
 * ball to a hole or a laser while the rest keep rolling (Q-05), and come out of a portal
 * still moving (Q-06).
 */
interface Ball {
  pos: Position;
  obj: GameObject;
  dir: Direction;
}

const keyOf = (p: Position): string => `${p.row},${p.col}`;

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

/**
 * Resolve the cell a ball has just arrived in. A hole swallows it (returns false). A
 * portal whose partner is free relocates it; the ball keeps its direction and rolls on
 * out of the partner portal on the next tick (Q-06). justTeleported stops the turn-level
 * portal pass from moving it a second time.
 */
function resolveArrival(level: Level, ball: Ball): boolean {
  const tile = level.tiles[ball.pos.row][ball.pos.col];
  // Rolling across a crack arms it like standing on it (Q-16 c); the arming itself is
  // applied at the end of the turn so it crumbles on the next turn, as usual.
  if (tile.isCrack) tile.crackRolled = true;
  if (tile.isHole) {
    if (level.objects[ball.pos.row][ball.pos.col] === ball.obj) level.objects[ball.pos.row][ball.pos.col] = null;
    return false;
  }
  if (!tile.isPortal) return true;
  const portals = findPortalsRoll(level);
  if (portals.length !== 2) return true;
  const other = portals.find(p => p.row !== ball.pos.row || p.col !== ball.pos.col);
  if (!other || level.objects[other.row][other.col]) return true; // occupied partner: roll straight over
  level.objects[ball.pos.row][ball.pos.col] = null;
  level.objects[other.row][other.col] = ball.obj;
  ball.obj.justTeleported = true;
  ball.pos = { ...other };
  return true;
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
  rollBalls(level, [{ pos: { ...fromPos }, obj, dir }], onTick);
}

export function rollSnowballGroup(
  level: Level, positions: Position[], dir: Direction, _turnCount: number, onTick?: RollTickHook,
): void {
  const balls: Ball[] = [];
  for (const pos of positions) {
    const obj = level.objects[pos.row][pos.col];
    if (obj?.type === 'snowball') balls.push({ pos: { ...pos }, obj, dir });
  }
  if (balls.length > 0) rollBalls(level, balls, onTick);
}

interface Segment {
  lead: Ball;
  // Lead first, then each follower in turn (the order in which they can be moved).
  balls: Ball[];
}

/**
 * Resolve rolling snowballs one simulation tick at a time.
 *
 * Every tick is judged against the tick-start board:
 *  1. A ball standing in a triangle cell turns (each ball on its own).
 *  2. Each ball checks its own terrain crossing. A ball may advance only when it can
 *     cross AND the ball in front of it (if any) advances too. A ball that cannot move
 *     loses its motion, and so does everything following it; balls already in front
 *     keep rolling (a height-limited arch or a closing wall splits the train).
 *  3. Moving balls are grouped into trains ("segments"): a lead plus the balls that
 *     follow it. Only the lead meets obstacles, using the whole train's mass.
 *  4. All accepted moves are committed together, then flakes, holes and portals are
 *     resolved for each ball that moved, then the tick hook runs buttons and lasers.
 */
function rollBalls(level: Level, initial: Ball[], onTick?: RollTickHook): void {
  let moving: Ball[] = initial;
  const maxTicks = level.width * level.height * 4 + 16;

  // The first tick is the position produced by the player's push. It is observable:
  // a ball may have landed on a button, beam, hole, or portal already.
  const firstTick = finishTick(level, moving.filter(ball => resolveArrival(level, ball)), onTick);
  if (firstTick === null) return;
  moving = firstTick;

  // Balls that received motion from an equal-mass impact start on the next tick.
  let pending: Ball[] = [];
  let guard = 0;

  while ((moving.length > 0 || pending.length > 0) && ++guard <= maxTicks) {
    moving = [...moving.filter(b => isBallPresent(level, b)), ...pending.filter(b => isBallPresent(level, b))];
    pending = [];
    if (moving.length === 0) return;

    // 1. Mirrors turn each ball independently.
    for (const ball of moving) {
      const triangle = level.tiles[ball.pos.row][ball.pos.col].triangle;
      const reflected = triangle ? TRI_DEFLECT[triangle][ball.dir] : undefined;
      if (reflected) ball.dir = reflected;
    }

    // 2. Terrain + "the ball ahead must move too", all against the tick-start board.
    const byCell = new Map<string, Ball>(moving.map(b => [keyOf(b.pos), b]));
    const decided = new Map<Ball, boolean>();
    const visiting = new Set<Ball>();
    const canAdvance = (ball: Ball): boolean => {
      const known = decided.get(ball);
      if (known !== undefined) return known;
      if (visiting.has(ball)) return false; // balls chasing each other in a closed loop
      visiting.add(ball);
      let ok = canMoveTo(level, ball.pos, ball.dir, ball.obj);
      if (ok) {
        const ahead = byCell.get(keyOf(getNextPos(ball.pos, ball.dir)));
        if (ahead) ok = canAdvance(ahead);
      }
      visiting.delete(ball);
      decided.set(ball, ok);
      return ok;
    };
    moving = moving.filter(canAdvance);
    if (moving.length === 0) return;

    // 3. Group into trains.
    const segments = buildSegments(moving);

    // 4. Obstacles, one train at a time in a fixed order (deterministic).
    const reserved = new Set<string>();
    const plannedMoves: Segment[] = [];
    const merges: { segment: Segment; obstacle: Ball[] }[] = [];
    const deflects: { ball: Ball; blockPos: Position }[] = [];
    let impact = false;
    const nextMoving: Ball[] = [];

    for (const segment of segments) {
      const lead = segment.lead;
      const target = getNextPos(lead.pos, lead.dir);
      if (!isInBounds(level, target) || reserved.has(keyOf(target))) continue; // stops
      const obstacle = level.objects[target.row][target.col];

      if (!obstacle) {
        reserved.add(keyOf(target));
        plannedMoves.push(segment);
        continue;
      }

      // A triangle block (legacy object) deflects only a lone rolling ball.
      if (obstacle.type === 'block' && obstacle.triangleCorner && segment.balls.length === 1) {
        const exit = triangleBlockExit(level, lead, target, obstacle.triangleCorner);
        if (exit && !reserved.has(keyOf(exit))) {
          reserved.add(keyOf(exit));
          deflects.push({ ball: lead, blockPos: target });
        }
        continue;
      }

      const obstacleGroup = getConsecutiveObjects(level, target, lead.dir);
      // Balls that are rolling, or that already received a handoff this tick, are not
      // stationary obstacles for a second train.
      const stationarySnow = obstacleGroup.every(m => m.obj.type === 'snowball'
        && !byCell.has(keyOf(m.pos)) && !pending.some(p => p.obj === m.obj));
      if (!stationarySnow) continue; // non-snow (or already moving) obstacle: the train stops

      const rollingMass = massOf(segment.balls);
      const obstacleMass = massOf(obstacleGroup);

      if (obstacleMass < rollingMass) {
        // A stationary obstacle has no momentum of its own, so it must move as a whole.
        if (!obstacleGroup.every(m => canMoveTo(level, m.pos, lead.dir, m.obj))) continue;
        const front = obstacleGroup[obstacleGroup.length - 1];
        const beyond = getNextPos(front.pos, lead.dir);
        if (!isInBounds(level, beyond) || level.objects[beyond.row][beyond.col] || reserved.has(keyOf(beyond))) continue;
        reserved.add(keyOf(beyond));
        merges.push({ segment, obstacle: obstacleGroup.map(m => ({ pos: { ...m.pos }, obj: m.obj, dir: lead.dir })) });
        continue;
      }

      if (obstacleMass === rollingMass) {
        // Equal mass transfers motion: this train stops at the contact state and the
        // stationary group starts rolling on its next real movement tick.
        impact = true;
        for (const m of obstacleGroup) pending.push({ pos: { ...m.pos }, obj: m.obj, dir: lead.dir });
      }
      // Heavier obstacle (or equal-mass handoff): the train stops here.
    }

    if (impact && onTick && !onTick(level, 'impact')) return;
    if (plannedMoves.length === 0 && merges.length === 0 && deflects.length === 0) {
      moving = [];
      continue; // only an impact handoff (or nothing) happened this tick
    }

    // 5. Commit every accepted move together.
    const moved: Ball[] = [];
    for (const { segment, obstacle } of merges) {
      moveBalls(level, obstacle);
      moveBalls(level, segment.balls);
      moved.push(...obstacle, ...segment.balls);
    }
    for (const segment of plannedMoves) {
      moveBalls(level, segment.balls);
      moved.push(...segment.balls);
    }
    for (const { ball, blockPos } of deflects) {
      deflectThroughTriangleBlock(level, ball, blockPos);
      moved.push(ball);
    }

    // 6. Flakes, then holes/portals, for every ball that moved.
    for (const ball of moved) absorbRollFlake(level, ball);
    for (const ball of moved) if (resolveArrival(level, ball)) nextMoving.push(ball);

    const survivors = finishTick(level, nextMoving, onTick);
    if (survivors === null) return;
    moving = survivors;
  }
  // Still rolling at the tick limit: an endless loop. The balls stop where they are (the
  // rule is unchanged); the turn reports it so the UI can mark the moment (Q-13).
  if (guard > maxTicks && onTick) onTick(level, 'loop');
}

function buildSegments(moving: Ball[]): Segment[] {
  const byCell = new Map<string, Ball>(moving.map(b => [keyOf(b.pos), b]));
  const follower = new Map<Ball, Ball>(); // ball ahead → the ball right behind it
  const hasAhead = new Set<Ball>();
  for (const ball of moving) {
    const ahead = byCell.get(keyOf(getNextPos(ball.pos, ball.dir)));
    if (ahead && ahead !== ball) {
      follower.set(ahead, ball);
      hasAhead.add(ball);
    }
  }
  const leads = moving.filter(b => !hasAhead.has(b));
  leads.sort((a, b) => a.pos.row - b.pos.row || a.pos.col - b.pos.col);
  return leads.map(lead => {
    const balls: Ball[] = [lead];
    let cur = follower.get(lead);
    while (cur && !balls.includes(cur)) {
      balls.push(cur);
      cur = follower.get(cur);
    }
    return { lead, balls };
  });
}

/** Move balls one cell along their own directions, front first (no overwrites). */
function moveBalls(level: Level, balls: Ball[]): void {
  // Callers pass the lead first; an obstacle group arrives rear → front, so sort by
  // "the cell I enter is not occupied by a ball still to move".
  const pending = [...balls];
  let safety = pending.length * pending.length + 1;
  while (pending.length > 0 && safety-- > 0) {
    for (let i = 0; i < pending.length; i++) {
      const ball = pending[i];
      const next = getNextPos(ball.pos, ball.dir);
      if (pending.some(other => other !== ball && other.pos.row === next.row && other.pos.col === next.col)) continue;
      level.objects[next.row][next.col] = ball.obj;
      if (level.objects[ball.pos.row][ball.pos.col] === ball.obj) level.objects[ball.pos.row][ball.pos.col] = null;
      ball.pos = next;
      pending.splice(i, 1);
      i--;
    }
  }
}

function triangleBlockExit(level: Level, ball: Ball, blockPos: Position, corner: TriangleCorner): Position | null {
  const nextDir = TRI_DEFLECT[corner][ball.dir];
  if (!nextDir) return null;
  if (!canMoveTo(level, blockPos, nextDir, ball.obj)) return null;
  const exit = getNextPos(blockPos, nextDir);
  if (level.objects[exit.row][exit.col]) return null;
  return exit;
}

// A triangle block turns a single ball at the block cell. The ball never rests in it;
// it exits on the reflected side in the same simulation tick.
function deflectThroughTriangleBlock(level: Level, ball: Ball, blockPos: Position): void {
  const block = level.objects[blockPos.row][blockPos.col];
  const nextDir = block?.triangleCorner ? TRI_DEFLECT[block.triangleCorner][ball.dir] : undefined;
  if (!nextDir) return;
  const exit = getNextPos(blockPos, nextDir);
  level.objects[exit.row][exit.col] = ball.obj;
  level.objects[ball.pos.row][ball.pos.col] = null;
  ball.pos = exit;
  ball.dir = nextDir;
}

function isBallPresent(level: Level, ball: Ball): boolean {
  return level.objects[ball.pos.row]?.[ball.pos.col] === ball.obj && ball.obj.type === 'snowball' && ball.obj.size > 0;
}

/**
 * The stationary objects directly ahead, up to the first empty cell. The run also ends
 * where terrain stops a member from moving on (a triangle leg, a tunnel side, an arch it
 * cannot pass): an object beyond such a wall is not pressed by this collision (B-06).
 */
function getConsecutiveObjects(level: Level, startPos: Position, dir: Direction): Ball[] {
  const result: Ball[] = [];
  let pos = startPos;
  while (isInBounds(level, pos)) {
    const obj = level.objects[pos.row][pos.col];
    if (!obj) break;
    result.push({ pos: { ...pos }, obj, dir });
    if (!canMoveTo(level, pos, dir, obj)) break;
    pos = getNextPos(pos, dir);
  }
  return result;
}

function massOf(balls: { obj: GameObject }[]): number {
  return balls.reduce((total, ball) => total + ball.obj.size, 0);
}

function absorbRollFlake(level: Level, ball: Ball): void {
  const tile = level.tiles[ball.pos.row][ball.pos.col];
  if (!tile.isFlake || ball.obj.type !== 'snowball' || ball.obj.size >= 2) return;
  ball.obj.size += 1;
  tile.isFlake = false;
  tile.isWarm = false;
}

// Fallback for callers without a turn-level hook. New turn resolution always supplies
// the hook, which performs the more complete whole-board laser calculation.
const BEAM_DIRS: Record<string, [number, number]> = {
  right: [0, 1], left: [0, -1], up: [-1, 0], down: [1, 0],
};
const BEAM_BLOCKERS = new Set(['wall', 'block', 'tree', 'laser']);

function killBallsOnBeam(level: Level, balls: Ball[]): void {
  const yellowSolid = yellowWallsSolid(level);
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
          if (balls.some(ball => ball.pos.row === cr && ball.pos.col === cc)) hit.size = 0;
          break;
        }
        if (level.tiles[cr][cc].triangle) break;
        if (yellowSolid && level.tiles[cr][cc].isYellowWall) break;
        cr += dr;
        cc += dc;
      }
    }
  }
}

/**
 * Run the per-tick reactions and return the balls that are still rolling, or null when
 * the hook asks to stop. A ball removed by a hole or a laser simply drops out; the rest
 * keep their momentum.
 */
function finishTick(level: Level, balls: Ball[], onTick?: RollTickHook): Ball[] | null {
  if (onTick) {
    if (!onTick(level)) return null;
  } else {
    killBallsOnBeam(level, balls);
  }
  return balls.filter(ball => isBallPresent(level, ball));
}
