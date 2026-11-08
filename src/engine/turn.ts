import { Level, Direction, GameStatus, Position } from '../types';
import { cloneLevel, findPlayer } from '../utils/level';
import { recalcShadows, clearShadows } from './shadow';
import { executePush } from './push';
import { yellowWallsSolid } from './helpers';

export interface TurnResult {
  level: Level;
  status: GameStatus;
  /** Ordered engine snapshots for replay/animation. UI may ignore these safely. */
  frames: TurnFrame[];
  /**
   * True when a roll this turn never came to rest and was cut off by the tick limit —
   * an endless loop (for example a ball circling a ring of triangle mirrors). The rules
   * keep the current behaviour (the ball stops where the limit hits); the UI may
   * celebrate it with a special event (Q-13).
   */
  infiniteLoop?: boolean;
}

export type TurnFramePhase = 'movement' | 'resolved' | 'impact' | 'turn-end';

export interface TurnFrame {
  level: Level;
  phase: TurnFramePhase;
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

/**
 * Every cell a laser beam currently passes through (the lasers' own cells excluded).
 * The beam melts every snow object it passes (Q-07: it pierces them) and stops at a
 * blocker object, a closed partition, or the board edge. It passes through triangle walls.
 */
export function laserBeamCells(level: Level): Position[] {
  const ySolid = yellowWallsSolid(level);
  const cells: Position[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (!obj || obj.type !== 'laser') continue;
      // A laser trapped inside a closed partition cannot fire out of it — the wall
      // encloses the whole cell, exactly as it blocks a beam coming from outside.
      if (ySolid && level.tiles[r][c].isYellowWall) continue;
      const [dr, dc] = DIR_DELTA[obj.laserDirection ?? 'right'];
      let cr = r + dr;
      let cc = c + dc;
      while (cr >= 0 && cc >= 0 && cr < level.height && cc < level.width) {
        if (level.tiles[cr][cc].isVoid) break;
        const hit = level.objects[cr][cc];
        if (hit && LASER_BLOCKERS.has(hit.type)) break;
        // A solid yellow wall blocks the beam BEFORE its cell, like a real wall (so it
        // also shields anything trapped inside that cell).
        if (ySolid && level.tiles[cr][cc].isYellowWall) break;
        cells.push({ row: cr, col: cc });
        cr += dr;
        cc += dc;
      }
    }
  }
  return cells;
}

/** True when the player stands in a laser beam — used by the editor to refuse a start position that dies at once. */
export function isPlayerInLaserBeam(level: Level): boolean {
  const p = findPlayer(level);
  if (!p) return false;
  return laserBeamCells(level).some(cell => cell.row === p.row && cell.col === p.col);
}

function applyLaserCheck(level: Level): void {
  const hits = laserBeamCells(level).filter(cell => !!level.objects[cell.row][cell.col]);
  // Q-08: a laser melts what it hits, so — like any object that disappears completely —
  // the cell it stood on becomes cool.
  removeObjects(level, hits, true);
}

/**
 * "Turn 0": effects that already hold when a level starts, resolved once before the
 * first input (Q-07). Lasers are firing from the start, so snow placed in a beam melts
 * immediately (the editor refuses a player start inside a beam). Mutates `level`.
 */
export function applyTurnZero(level: Level): GameStatus {
  applyLaserCheck(level);
  if (!findPlayer(level)) return 'gameover';
  return isLevelCleared(level) ? 'cleared' : 'playing';
}

/**
 * Remove every object at `positions` as ONE simultaneous event. All non-player bodies
 * are cleared first, and only then does a removed player look for a new body, so the
 * soul can never land in a snowman that is dying in the same event and then hop on from
 * there (the target is always the surviving snowman nearest the player).
 */
function removeObjects(level: Level, positions: Position[], coolTiles: boolean): void {
  const deadPlayers: Position[] = [];
  const seen = new Set<string>();
  for (const pos of positions) {
    const key = `${pos.row},${pos.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const obj = level.objects[pos.row][pos.col];
    if (!obj) continue;
    if (coolTiles) level.tiles[pos.row][pos.col].isWarm = false;
    level.objects[pos.row][pos.col] = null;
    if (obj.type === 'player') deadPlayers.push(pos);
  }
  for (const pos of deadPlayers) soulTransfer(level, pos);
}

// === v5 mechanics: holes, cracked tiles ===
// (The orange latch and portals of v5 were removed from the game on 2026-11-03 by team
// decision. Old map codes still carry their bits; the decoder drops them.)

// Any object resting on a hole falls in and disappears. A player that ends up on a
// hole (it walked in, or a cracked tile crumbled beneath it) dies — the soul jumps to
// the nearest snowman, mirroring a full melt. The hole stays, and its tile does not cool.
export function applyHoles(level: Level): void {
  const fallen: Position[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (level.tiles[r][c].isHole && level.objects[r][c]) fallen.push({ row: r, col: c });
    }
  }
  removeObjects(level, fallen, false);
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

// Arm any cracked tile that is currently covered — or that a snowball rolled across
// during this turn (Q-16 c) — so it crumbles on the NEXT turn (whether or not the object
// is still there then).
function armCoveredCracks(level: Level): void {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const tile = level.tiles[r][c];
      if (tile.isCrack && (level.objects[r][c] || tile.crackRolled)) {
        tile.crackArmed = true;
      }
      if (tile.crackRolled) delete tile.crackRolled;
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
  const motionIds = new Set<string>();
  ensureMotionIds(newLevel, motionIds);
  const frames: TurnFrame[] = [];
  const playerPos = findPlayer(newLevel);
  if (!playerPos) return { level: newLevel, status: 'gameover', frames };

  const turnCount = nextAge();
  // Waiting on an armed soul footplate fires the delayed transfer.
  resolveSoulFootplate(newLevel, playerPos, turnCount);
  applyLaserCheck(newLevel);
  endOfTurn(newLevel);

  const finalPlayerPos = findPlayer(newLevel);
  if (!finalPlayerPos) {
    recordFrame(frames, newLevel, 'turn-end', motionIds);
    return { level: newLevel, status: 'gameover', frames };
  }

  const finalTile = newLevel.tiles[finalPlayerPos.row][finalPlayerPos.col];
  recordFrame(frames, newLevel, 'turn-end', motionIds);
  if (finalTile.isGoal && isGoalActive(newLevel)) return { level: newLevel, status: 'cleared', frames };

  return { level: newLevel, status: 'playing', frames };
}

export function executeTurn(level: Level, dir: Direction): TurnResult {
  const newLevel = cloneLevel(level);
  const motionIds = new Set<string>();
  ensureMotionIds(newLevel, motionIds);
  const frames: TurnFrame[] = [];
  const playerPos = findPlayer(newLevel);

  if (!playerPos) {
    return { level: newLevel, status: 'gameover', frames };
  }

  const turnCount = nextAge();
  let hadRollingTick = false;
  let infiniteLoop = false;
  let clearedWhileRolling = false;
  const { playerMoved } = executePush(newLevel, playerPos, dir, turnCount, (tickLevel, phase = 'movement') => {
    if (phase === 'impact') {
      recordFrame(frames, tickLevel, 'impact', motionIds);
      return true;
    }
    if (phase === 'loop') {
      infiniteLoop = true;
      return true;
    }
    hadRollingTick = true;
    // A rolling tick is a real, observable game state. Preserve the pre-reaction
    // state for animation, then resolve board-wide hazards before another cell moves.
    recordFrame(frames, tickLevel, 'movement', motionIds);
    applyHoles(tickLevel);
    applyLaserCheck(tickLevel);
    recordFrame(frames, tickLevel, 'resolved', motionIds);
    // A green button pressed only while a ball rolls across it counts (B-002, user
    // decision 2026-11-02 — as a cover that will melt at the end of the turn counts). The
    // goal is judged on this tick's resolved state, after its holes and lasers, as the
    // end-of-move check is: a death in the same tick comes first, and a soul that moves
    // onto a snowman standing on an active goal clears (Q-14). The map stops the moment
    // the clear is decided (B-027, team decision 2026-11-05): the balls stay where they
    // are, so nothing later in the roll can touch the winner.
    if (isLevelCleared(tickLevel)) {
      clearedWhileRolling = true;
      return false;
    }
    // A laser death ends player control, not inertia. The rolling group keeps its
    // already-committed motion until a terrain/collision rule stops it. `roll.ts`
    // separately verifies that the moving group still exists (for example it may
    // have fallen into a hole), so this hook need not stop for player game over.
    return true;
  });

  if (!playerMoved) {
    return { level: newLevel, status: 'playing', frames };
  }
  // Cleared during the roll: the turn ends there, like the end-of-move clear (no
  // end-of-turn melt).
  if (clearedWhileRolling) {
    recordFrame(frames, newLevel, 'turn-end', motionIds);
    return { level: newLevel, status: 'cleared', frames, ...(infiniteLoop ? { infiniteLoop: true } : {}) };
  }
  const result = finishMovedTurn(newLevel, frames, motionIds, turnCount, hadRollingTick);
  if (infiniteLoop) result.infiniteLoop = true;
  return result;
}

function finishMovedTurn(
  newLevel: Level, frames: TurnFrame[], motionIds: Set<string>, turnCount: number,
  hadRollingTick: boolean,
): TurnResult {
  // A non-rolling push is still an observable one-cell movement. Keeping the same
  // movement/resolved pair as rolling ticks lets the presentation layer animate all
  // object movement with one API, rather than treating player/forced moves specially.
  if (!hadRollingTick) recordFrame(frames, newLevel, 'movement', motionIds);

  const newPlayerPos = findPlayer(newLevel);

  // Soul-swap footplate (delayed one turn — see resolveSoulFootplate).
  if (newPlayerPos) {
    resolveSoulFootplate(newLevel, newPlayerPos, turnCount);
  }

  // Holes swallow anything that landed on one — a player who walked into a hole too,
  // so its soul moves on before the end-of-turn melt.
  applyHoles(newLevel);

  // Lasers fire before the goal is evaluated: stepping onto a goal that sits on a
  // laser beam kills the player (death takes priority over clearing).
  applyLaserCheck(newLevel);
  if (!hadRollingTick) recordFrame(frames, newLevel, 'resolved', motionIds);

  const afterLaserPos = findPlayer(newLevel);
  if (!afterLaserPos) {
    recordFrame(frames, newLevel, 'turn-end', motionIds);
    return { level: newLevel, status: 'gameover', frames };
  }

  // Survived the laser and standing on an active goal → cleared.
  const goalTile = newLevel.tiles[afterLaserPos.row][afterLaserPos.col];
  if (goalTile.isGoal && isGoalActive(newLevel)) {
    recordFrame(frames, newLevel, 'turn-end', motionIds);
    return { level: newLevel, status: 'cleared', frames };
  }

  endOfTurn(newLevel);

  const finalPlayerPos = findPlayer(newLevel);
  if (!finalPlayerPos) {
    recordFrame(frames, newLevel, 'turn-end', motionIds);
    return { level: newLevel, status: 'gameover', frames };
  }

  const finalTile = newLevel.tiles[finalPlayerPos.row][finalPlayerPos.col];
  recordFrame(frames, newLevel, 'turn-end', motionIds);
  if (finalTile.isGoal && isGoalActive(newLevel)) return { level: newLevel, status: 'cleared', frames };

  return { level: newLevel, status: 'playing', frames };
}

function recordFrame(frames: TurnFrame[], level: Level, phase: TurnFramePhase, motionIds: Set<string>): void {
  ensureMotionIds(level, motionIds);
  frames.push({ level: cloneLevel(level), phase });
}

// Object references are cloned for engine safety, so the renderer needs a transient
// identity that survives those clones to interpolate the same object between frames.
// The initial position makes an ID deterministic for objects decoded from a map; newly
// created objects receive an ID at the first frame in which they exist.
//
// Only an object that keeps existing keeps an ID (B-009). `turnIds` holds every ID of
// this turn: the turn-start board's and each one given out since. A new object whose
// positional ID is taken — by an object on the board, or by one that was there earlier in
// the turn — gets a deterministic tail (`~2`, `~3`, …). Without it a split half took the
// ID of the ball it shoved out of its cell, and the body the soul moved into took the old
// body's ID when it stood where that ID was made (soulChangedBody missed the change).
function ensureMotionIds(level: Level, turnIds: Set<string>): void {
  const onBoard = new Set<string>();
  for (const row of level.objects) {
    for (const object of row) if (object?.motionId) onBoard.add(object.motionId);
  }
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const object = level.objects[r][c];
      if (!object) continue;
      if (!object.motionId) {
        const base = `${object.type}:${r}:${c}`;
        let id = base;
        for (let n = 2; turnIds.has(id) || onBoard.has(id); n++) id = `${base}~${n}`;
        object.motionId = id;
        onBoard.add(id);
      }
      turnIds.add(object.motionId);
    }
  }
}

function endOfTurn(level: Level): void {
  // 0. Cracked tiles armed on a previous turn crumble into holes now; anything still
  //    sitting on them falls in (a player there dies → soul transfer).
  convertArmedCracks(level);
  applyHoles(level);
  // A block that fell in may have been holding back a beam. It hits now, before the goal
  // is judged and before the soul that moved here is treated as safe (B-017, team
  // decision 2026-11-05). Everything else on a beam was removed earlier in the turn.
  applyLaserCheck(level);

  // 0b. Arm cracks covered right now (crumble next turn). This must run BEFORE melting:
  //     a small snowball that ends the turn on a warm crack melts away below, and the
  //     crack must still remember it was stepped on.
  armCoveredCracks(level);

  // 1. Recalculate shadows (if shadow mechanic is enabled). With shadows off there is no
  //    shade at all — not even inside a closed partition, which is drawn as a border and
  //    lets the sun in (B-11 decision, 9/29), nor in a tunnel cell (B-007).
  if (level.hasShadow) recalcShadows(level);
  else clearShadows(level);

  // 2. Melting / growing
  const sizesBefore = snapshotSizes(level);
  processMelting(level);

  // 3. Check for dead objects (size 0): only on full disappearance, mark tile cool
  processDeadObjects(level);

  // 4. If sizes changed, recalc shadows
  if (level.hasShadow && sizesChanged(level, sizesBefore)) {
    recalcShadows(level);
  }
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
        } else if (obj.isMelting) {
          // "Melting" belongs to the body. A vacated body that rests out of the sun cools
          // down just as a possessed one would, so when the soul returns it gets the
          // usual one-turn sweat warning instead of shrinking at once (Q-17).
          obj.isMelting = false;
        }
      }
    }
  }
}

function processDeadObjects(level: Level): void {
  // Full melt: every body worn down to 0 disappears at once and its tile becomes cool.
  const dead: Position[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (obj && obj.size <= 0) dead.push({ row: r, col: c });
    }
  }
  removeObjects(level, dead, true);
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
    // Melting is a property of the body, not the soul: preserve whatever the
    // target body had so re-entering it doesn't reset its melt progress.
    isMelting: snowman.isMelting,
    createdAt: 0,
  };
}

// Swap which body holds the soul: the body at `fromPos` becomes a snowman, and the
// snowman at `targetPos` becomes the player. Sizes are preserved.
function doSoulSwap(level: Level, fromPos: Position, targetPos: Position, ts: number): void {
  const body = level.objects[fromPos.row][fromPos.col];
  const target = level.objects[targetPos.row][targetPos.col];
  if (!body || !target) return;
  // Melting is a property of the body, not the soul. Carry each body's melt state
  // across the swap so leaving a body and returning to it (even within one turn via
  // the M-key soul cycle) keeps its "melting" progress instead of resetting it.
  level.objects[fromPos.row][fromPos.col] = {
    type: 'snowman',
    size: body.size,
    isMelting: body.isMelting,
    createdAt: ts,
  };
  level.objects[targetPos.row][targetPos.col] = {
    type: 'player',
    size: target.size,
    isMelting: target.isMelting,
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
 * null if the swap can't happen (the map has the soul cycle off, no player, or no
 * snowmen to move into).
 * This is a free action — it does not advance the turn.
 */
export function cycleSoul(level: Level): Level | null {
  // The map's own setting, checked here and not only by the play screens: a replayed
  // solution string with an M on a soul-off map does nothing, as in the game (B-008).
  if (!level.soulSwapEnabled) return null;
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
