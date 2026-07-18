import { Level, Direction, GameStatus, Position } from '../types';
import { cloneLevel, findPlayer } from '../utils/level';
import { recalcShadows } from './shadow';
import { executePush } from './push';
import { yellowWallsSolid, orangeWallsSolid } from './helpers';

export interface TurnResult {
  level: Level;
  status: GameStatus;
}

const DIR_DELTA: Record<string, [number, number]> = {
  right: [0, 1], left: [0, -1], up: [-1, 0], down: [1, 0],
};
const LASER_BLOCKERS = new Set(['wall', 'block', 'tree', 'laser']);

// Monotonic "age" used to timestamp objects created during a turn (createdAt) and to
// order soul transfers (nearest, tie-broken by oldest). We use a strictly-increasing
// counter instead of Date.now() so turn resolution is DETERMINISTIC: replaying a
// recorded 풀이 reproduces the exact same states. (Date.now() returns equal values
// when many turns run within the same millisecond — as during fast replay — which
// scrambled soul/roll ordering and made playback diverge from the recording.)
let ageClock = 0;
function nextAge(): number { return ++ageClock; }

/**
 * The goal is "active" (clearable) unless the level uses key footplates and one or
 * more of them is not currently covered by an object (the player counts too). When
 * no key tiles exist this is always true.
 */
export function isGoalActive(level: Level): boolean {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (!level.tiles[r][c].isKeyTile) continue;
      if (!level.objects[r][c]) return false;
    }
  }
  return true;
}

/**
 * True when the level is already in a winning state: the possessed player is
 * standing on an active goal tile. Turn-based moves detect this themselves, but
 * the free M-key soul cycle does not advance a turn — so the caller uses this to
 * clear immediately the moment the soul lands on the goal.
 */
export function isLevelCleared(level: Level): boolean {
  const p = findPlayer(level);
  if (!p) return false;
  const tile = level.tiles[p.row][p.col];
  return !!tile.isGoal && isGoalActive(level);
}

function applyLaserCheck(level: Level): void {
  const ySolid = yellowWallsSolid(level);
  const oSolid = orangeWallsSolid(level);
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (!obj || obj.type !== 'laser') continue;
      const [dr, dc] = DIR_DELTA[obj.laserDirection ?? 'right'];
      let cr = r + dr;
      let cc = c + dc;
      while (cr >= 0 && cc >= 0 && cr < level.height && cc < level.width) {
        const hit = level.objects[cr][cc];
        if (hit && LASER_BLOCKERS.has(hit.type)) break;
        // A solid yellow/orange wall blocks the beam BEFORE its cell, like a real wall
        // (so it also shields anything trapped inside that cell).
        if (ySolid && level.tiles[cr][cc].isYellowWall) break;
        if (oSolid && level.tiles[cr][cc].isOrangeWall) break;
        if (hit) hit.size = 0; // kill a non-blocker object the beam passes through
        if (level.tiles[cr][cc].triangle) break; // triangle stops the beam at this cell
        cr += dr;
        cc += dc;
      }
    }
  }
  processDeadObjects(level);
}

// === v5 mechanics: orange latch, holes, portals, cracked tiles ===

// Latch orange buttons: once an orange button is covered, mark it pressed forever.
export function latchOrangeButtons(level: Level): void {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.tiles[r][c].isOrangeButton && level.objects[r][c]) {
        level.tiles[r][c].orangePressed = true;
      }
    }
  }
}

// Any object resting on a hole falls in and disappears. A player that ends up on a
// hole (e.g. a cracked tile crumbling beneath it) dies — the soul jumps to the nearest
// snowman, mirroring a full melt.
export function applyHoles(level: Level): void {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (!level.tiles[r][c].isHole) continue;
      const obj = level.objects[r][c];
      if (!obj) continue;
      level.objects[r][c] = null;
      if (obj.type === 'player') soulTransfer(level, { row: r, col: c });
    }
  }
}

function findPortals(level: Level): Position[] {
  const ps: Position[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.tiles[r][c].isPortal) ps.push({ row: r, col: c });
    }
  }
  return ps;
}

// Immediately relocate an object that just moved ONTO a portal (from a non-portal
// cell this turn) to the other portal, unless that portal is occupied. Runs as a
// post-movement pass over the two portal cells; `startOccupied` records which portal
// cells already held an object at the start of the turn (those are "already on the
// portal" and do not re-teleport). Balls that teleported mid-roll carry justTeleported
// and are skipped here so they are not relocated twice.
export function applyPortals(level: Level, portals: Position[], startOccupied: boolean[]): void {
  if (portals.length !== 2) return;
  const pairs: [number, number][] = [[0, 1], [1, 0]];
  for (const [si, di] of pairs) {
    const src = portals[si];
    const dst = portals[di];
    const obj = level.objects[src.row][src.col];
    if (!obj) continue;
    if (startOccupied[si]) continue;      // was resting on this portal at turn start
    if (obj.justTeleported) continue;     // already relocated this turn
    if (level.objects[dst.row][dst.col]) continue; // destination portal occupied → no-op
    level.objects[dst.row][dst.col] = obj;
    level.objects[src.row][src.col] = null;
    obj.justTeleported = true;
  }
}

// Cracked tiles that were armed on a previous turn crumble into holes now.
function convertArmedCracks(level: Level): void {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const tile = level.tiles[r][c];
      if (tile.isCrack && tile.crackArmed) {
        tile.isCrack = false;
        tile.crackArmed = false;
        tile.isHole = true;
      }
    }
  }
}

// Arm any cracked tile that is currently covered so it crumbles on the NEXT turn
// (whether or not the object is still there then).
function armCoveredCracks(level: Level): void {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.tiles[r][c].isCrack && level.objects[r][c]) {
        level.tiles[r][c].crackArmed = true;
      }
    }
  }
}

function clearTeleportFlags(level: Level): void {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (obj?.justTeleported) obj.justTeleported = false;
    }
  }
}

// Resolve the soul-swap footplate with a one-turn delay: stepping onto it arms it;
// the transfer only fires on a later turn when the player is still on the SAME plate
// that was armed. Returns the (possibly changed) player position.
function resolveSoulFootplate(level: Level, pos: Position, ts: number): Position | null {
  const tile = level.tiles[pos.row][pos.col];
  if (!tile.isSoulSwap) {
    level.soulSwapArmedAt = null;
    return pos;
  }
  const armed = level.soulSwapArmedAt;
  if (armed && armed.row === pos.row && armed.col === pos.col) {
    soulSwapNearest(level, pos, ts);
    level.soulSwapArmedAt = null;
    return findPlayer(level);
  }
  // just stepped on (or moved to a different plate) → arm and wait a turn
  level.soulSwapArmedAt = { row: pos.row, col: pos.col };
  return pos;
}

export function executeSkipTurn(level: Level): TurnResult {
  const newLevel = cloneLevel(level);
  const playerPos = findPlayer(newLevel);
  if (!playerPos) return { level: newLevel, status: 'gameover' };

  const turnCount = nextAge();
  // Waiting on an armed soul footplate fires the delayed transfer.
  resolveSoulFootplate(newLevel, playerPos, turnCount);
  applyLaserCheck(newLevel);
  endOfTurn(newLevel, turnCount);

  const finalPlayerPos = findPlayer(newLevel);
  if (!finalPlayerPos) return { level: newLevel, status: 'gameover' };

  const finalTile = newLevel.tiles[finalPlayerPos.row][finalPlayerPos.col];
  if (finalTile.isGoal && isGoalActive(newLevel)) return { level: newLevel, status: 'cleared' };

  return { level: newLevel, status: 'playing' };
}

export function executeTurn(level: Level, dir: Direction): TurnResult {
  const newLevel = cloneLevel(level);
  const playerPos = findPlayer(newLevel);

  if (!playerPos) {
    return { level: newLevel, status: 'gameover' };
  }

  // Portals don't move; snapshot their occupancy before the push so applyPortals can
  // tell which objects were already resting on a portal (they don't re-teleport).
  const portals = findPortals(newLevel);
  const portalStartOccupied = portals.map(p => !!newLevel.objects[p.row][p.col]);

  const turnCount = nextAge();
  const { playerMoved } = executePush(newLevel, playerPos, dir, turnCount);

  if (!playerMoved) {
    return { level: newLevel, status: 'playing' };
  }

  let newPlayerPos = findPlayer(newLevel);

  // Soul-swap footplate (delayed one turn — see resolveSoulFootplate).
  if (newPlayerPos) {
    newPlayerPos = resolveSoulFootplate(newLevel, newPlayerPos, turnCount);
  }

  // Portal relocation, then holes swallow anything that landed on one.
  applyPortals(newLevel, portals, portalStartOccupied);
  applyHoles(newLevel);
  latchOrangeButtons(newLevel);

  // Lasers fire before the goal is evaluated: stepping onto a goal that sits on a
  // laser beam kills the player (death takes priority over clearing).
  applyLaserCheck(newLevel);

  const afterLaserPos = findPlayer(newLevel);
  if (!afterLaserPos) {
    return { level: newLevel, status: 'gameover' };
  }

  // Survived the laser and standing on an active goal → cleared.
  const goalTile = newLevel.tiles[afterLaserPos.row][afterLaserPos.col];
  if (goalTile.isGoal && isGoalActive(newLevel)) {
    return { level: newLevel, status: 'cleared' };
  }

  endOfTurn(newLevel, turnCount);

  const finalPlayerPos = findPlayer(newLevel);
  if (!finalPlayerPos) {
    return { level: newLevel, status: 'gameover' };
  }

  const finalTile = newLevel.tiles[finalPlayerPos.row][finalPlayerPos.col];
  if (finalTile.isGoal && isGoalActive(newLevel)) {
    return { level: newLevel, status: 'cleared' };
  }

  return { level: newLevel, status: 'playing' };
}

function endOfTurn(level: Level, _turnCount: number): void {
  // 0. Cracked tiles armed on a previous turn crumble into holes now; anything still
  //    sitting on them falls in (a player there dies → soul transfer).
  convertArmedCracks(level);
  applyHoles(level);

  // 1. Recalculate shadows (if shadow mechanic is enabled)
  if (level.hasShadow) recalcShadows(level);

  // 2. Melting / growing
  const sizesBefore = snapshotSizes(level);
  processMelting(level);

  // 3. Check for dead objects (size 0): only on full disappearance, mark tile cool
  processDeadObjects(level);

  // 4. If sizes changed, recalc shadows
  if (level.hasShadow && sizesChanged(level, sizesBefore)) {
    recalcShadows(level);
  }

  // 5. Arm cracks now covered (crumble next turn), latch orange buttons, and clear the
  //    per-turn portal marks.
  armCoveredCracks(level);
  latchOrangeButtons(level);
  clearTeleportFlags(level);
}

function snapshotSizes(level: Level): (number | null)[][] {
  const snap: (number | null)[][] = [];
  for (let r = 0; r < level.height; r++) {
    snap.push([]);
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      snap[r].push(obj ? obj.size : null);
    }
  }
  return snap;
}

function sizesChanged(level: Level, snap: (number | null)[][]): boolean {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      const prevSize = snap[r][c];
      const currSize = obj ? obj.size : null;
      if (prevSize !== currSize) return true;
    }
  }
  return false;
}

function processMelting(level: Level): void {
  // Per V2 rule: tile becomes cool ONLY when an object fully melts away (size→0).
  // While an object is merely shrinking (size>0 after melt), the tile stays warm.
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (!obj) continue;

      const tile = level.tiles[r][c];
      const isHeated = tile.isWarm && !tile.isShade;

      if (obj.type === 'player') {
        if (isHeated) {
          if (obj.isMelting) {
            obj.size -= 1;
          } else {
            obj.isMelting = true;
          }
        } else {
          if (obj.isMelting) {
            obj.isMelting = false;
          }
        }
      } else if (obj.type === 'snowball' || obj.type === 'snowman') {
        if (isHeated) {
          obj.size -= 1;
        }
      }
    }
  }
}

function processDeadObjects(level: Level): void {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (!obj) continue;
      if (obj.size <= 0) {
        // Full melt: tile becomes cool
        level.tiles[r][c].isWarm = false;
        if (obj.type === 'player') {
          level.objects[r][c] = null;
          soulTransfer(level, { row: r, col: c });
        } else {
          level.objects[r][c] = null;
        }
      }
    }
  }
}

function soulTransfer(level: Level, playerPos: { row: number; col: number }): void {
  const snowmen: { row: number; col: number; dist: number; createdAt: number }[] = [];

  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (obj?.type === 'snowman') {
        const dist = Math.sqrt(
          (r - playerPos.row) ** 2 + (c - playerPos.col) ** 2
        );
        snowmen.push({ row: r, col: c, dist, createdAt: obj.createdAt });
      }
    }
  }

  if (snowmen.length === 0) return;

  snowmen.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    return a.createdAt - b.createdAt;
  });

  const target = snowmen[0];
  const snowman = level.objects[target.row][target.col]!;

  level.objects[target.row][target.col] = {
    type: 'player',
    size: snowman.size,
    isMelting: false,
    createdAt: 0,
  };
}

// Swap which body holds the soul: the body at `fromPos` becomes a snowman, and the
// snowman at `targetPos` becomes the player. Sizes are preserved.
function doSoulSwap(level: Level, fromPos: Position, targetPos: Position, ts: number): void {
  const body = level.objects[fromPos.row][fromPos.col];
  const target = level.objects[targetPos.row][targetPos.col];
  if (!body || !target) return;
  level.objects[fromPos.row][fromPos.col] = {
    type: 'snowman',
    size: body.size,
    isMelting: false,
    createdAt: ts,
  };
  level.objects[targetPos.row][targetPos.col] = {
    type: 'player',
    size: target.size,
    isMelting: false,
    createdAt: 0,
  };
}

// Voluntary transfer triggered by a soul-swap footplate: pick the nearest snowman
// (tie-break: oldest), leaving the current body behind as a snowman.
function soulSwapNearest(level: Level, fromPos: Position, ts: number): boolean {
  const snowmen: { row: number; col: number; dist: number; createdAt: number }[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (obj?.type === 'snowman') {
        const dist = Math.sqrt((r - fromPos.row) ** 2 + (c - fromPos.col) ** 2);
        snowmen.push({ row: r, col: c, dist, createdAt: obj.createdAt });
      }
    }
  }
  if (snowmen.length === 0) return false;
  snowmen.sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : a.createdAt - b.createdAt));
  const target = snowmen[0];
  doSoulSwap(level, fromPos, { row: target.row, col: target.col }, ts);
  return true;
}

/**
 * M-key soul cycle: move the soul to the next snowman in reading order (top-left →
 * bottom-right, wrapping). The old body becomes a snowman. Returns a new level, or
 * null if the swap can't happen (no player, or no snowmen to move into).
 * This is a free action — it does not advance the turn.
 */
export function cycleSoul(level: Level): Level | null {
  const playerPos = findPlayer(level);
  if (!playerPos) return null;

  const snowmen: Position[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.objects[r][c]?.type === 'snowman') snowmen.push({ row: r, col: c });
    }
  }
  if (snowmen.length === 0) return null;

  const playerKey = playerPos.row * level.width + playerPos.col;
  const next = snowmen.find(p => p.row * level.width + p.col > playerKey) ?? snowmen[0];

  const newLevel = cloneLevel(level);
  doSoulSwap(newLevel, playerPos, next, nextAge());
  return newLevel;
}
