import { Level, Direction, GameStatus, Position } from '../types';
import { cloneLevel, findPlayer } from '../utils/level';
import { recalcShadows, clearShadows } from './shadow';
import { executePush } from './push';
import { isButtonPressed, closedWallJudge } from './helpers';

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
 * The goal is "active" (clearable) unless the level uses green buttons and one or
 * more of them is not currently pressed — an object (the player counts too) whose
 * mass (= size) is at least the button's required mass must stand on it (2026-11-13).
 * When no green buttons exist this is always true.
 */
export function isGoalActive(level: Level): boolean {
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      if (!level.tiles[r][c].isKeyTile) continue;
      if (!isButtonPressed(level, r, c)) return false;
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
 * blocker object, a closed partition (yellow or red wall), or the board edge. It passes
 * through triangle walls. One call is one snapshot: each color's wall state is judged
 * once, on the board as it stands when the check starts, and the hits are removed only
 * afterwards (a hit that unpresses a red button closes the walls from the next check on).
 */
export function laserBeamCells(level: Level): Position[] {
  const closed = closedWallJudge(level);
  const cells: Position[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const obj = level.objects[r][c];
      if (!obj || obj.type !== 'laser') continue;
      // A laser trapped inside a closed partition cannot fire out of it — the wall
      // encloses the whole cell, exactly as it blocks a beam coming from outside.
      if (closed(level.tiles[r][c])) continue;
      const [dr, dc] = DIR_DELTA[obj.laserDirection ?? 'right'];
      let cr = r + dr;
      let cc = c + dc;
      while (cr >= 0 && cc >= 0 && cr < level.height && cc < level.width) {
        if (level.tiles[cr][cc].isVoid) break;
        const hit = level.objects[cr][cc];
        if (hit && LASER_BLOCKERS.has(hit.type)) break;
        // A closed yellow/red wall blocks the beam BEFORE its cell, like a real wall (so
        // it also shields anything trapped inside that cell).
        if (closed(level.tiles[cr][cc])) break;
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
  // The editor refuses a player start inside a beam; if one still dies here the soul
  // moves at once, as the last step of this turn-zero judgment.
  if (level.soulDiedAt) {
    const diedAt = level.soulDiedAt;
    level.soulDiedAt = null;
    soulTransfer(level, diedAt);
  }
  if (!findPlayer(level)) return 'gameover';
  return isLevelCleared(level) ? 'cleared' : 'playing';
}

/**
 * Remove every object at `positions` as ONE simultaneous event. A removed player only
 * marks where it died (`soulDiedAt`): the soul looks for a new body last in the turn,
 * after melting and the death re-check (moveSoul — judgment order, user 2026-11-25), so
 * it always lands in a snowman that survived the whole turn.
 */
function removeObjects(level: Level, positions: Position[], coolTiles: boolean): void {
  const seen = new Set<string>();
  for (const pos of positions) {
    const key = `${pos.row},${pos.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const obj = level.objects[pos.row][pos.col];
    if (!obj) continue;
    if (coolTiles) level.tiles[pos.row][pos.col].isWarm = false;
    level.objects[pos.row][pos.col] = null;
    if (obj.type === 'player') level.soulDiedAt = { row: pos.row, col: pos.col };
  }
}

/**
 * 영혼 이동 처리 — the last step of the turn (judgment order, user 2026-11-25). A player
 * that died this turn (hole, laser, melt) hands its soul to the nearest surviving
 * snowman; game over if none is left. Otherwise a soul footplate the player has stayed
 * on since last turn fires. Both happen after melting, so a body that receives the soul
 * has already melted this turn as a snowman.
 */
function moveSoul(level: Level, ts: number): void {
  const diedAt = level.soulDiedAt;
  if (diedAt) {
    level.soulDiedAt = null;
    // The dead body has left any footplate it was waiting on: the arming goes with it, so a
    // new body that steps on that plate waits its turn like any other (regression from the
    // 2026-11-25 order change — the death branch skipped resolveSoulFootplate's reset).
    level.soulSwapArmedAt = null;
    if (!findPlayer(level)) soulTransfer(level, diedAt);
    return;
  }
  const pos = findPlayer(level);
  if (pos) resolveSoulFootplate(level, pos, ts);
}

// === v5 mechanics: holes, cracked tiles ===
// (The orange latch and portals of v5 were removed from the game on 2026-11-03 by team
// decision. Old map codes still carry their bits; the decoder drops them.)

// Any object resting on a hole falls in and disappears. A player that ends up on a
// hole (it walked in, or a cracked tile crumbled beneath it) dies — its soul moves to the
// nearest snowman at the end of the turn (moveSoul). The hole stays, and its tile does
// not cool.
export function applyHoles(level: Level): void {
  const fallen: Position[] = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      // A wall stays put even over a hole (user decision 2026-11-28); a tree, box or laser falls.
      const obj = level.objects[r][c];
      if (level.tiles[r][c].isHole && obj && obj.type !== 'wall') fallen.push({ row: r, col: c });
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
      // A wall standing on a crack does not arm it: the wall stays and so does the crack
      // (user decision 2026-11-28 — a tree on a crack still falls in two turns later).
      const obj = level.objects[r][c];
      if (tile.isCrack && ((obj && obj.type !== 'wall') || tile.crackRolled)) {
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
  // 즉사 판정(레이저 — 대기는 구멍 위로 가지 않는다). 대기 턴에는 클리어 판정이 녹기 뒤 한 번뿐이다(B-016).
  // Waiting on an armed soul footplate fires the delayed transfer at the end of the turn (moveSoul).
  applyLaserCheck(newLevel);
  endOfTurn(newLevel, turnCount);

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

  // 1. 즉사 판정 — holes swallow anything that landed on one (a player who walked into a
  //    hole too), then lasers fire. A player killed here hands on its soul only at the end
  //    of the turn (moveSoul).
  applyHoles(newLevel);
  applyLaserCheck(newLevel);
  if (!hadRollingTick) recordFrame(frames, newLevel, 'resolved', motionIds);

  // 2. 클리어 판정 — a living player on an active goal clears (death takes priority).
  const afterLaserPos = findPlayer(newLevel);
  if (afterLaserPos) {
    const goalTile = newLevel.tiles[afterLaserPos.row][afterLaserPos.col];
    if (goalTile.isGoal && isGoalActive(newLevel)) {
      recordFrame(frames, newLevel, 'turn-end', motionIds);
      return { level: newLevel, status: 'cleared', frames };
    }
  }

  // 3.–6. the rest of the turn, ending with the soul (endOfTurn).
  endOfTurn(newLevel, turnCount);

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

/**
 * The rest of a turn after the moves, in the judgment order the user set on 2026-11-25:
 * 즉사 판정 (holes → lasers) → 클리어 판정 → 이동 판정 (every object until it stops, with
 * buttons and cracks) → 따뜻한 칸 판정 → 즉사 재판정 → 영혼 이동 처리. The first three ran
 * during the move (each rolling tick and right after it); this finishes the cracks, then
 * melts, re-checks deaths and moves the soul. The caller judges the goal once more after it.
 */
function endOfTurn(level: Level, ts: number): void {
  // 3. 이동 판정, cracks: tiles armed on a previous turn crumble into holes now, and tiles
  //    covered now — or rolled across this turn (Q-16 c) — arm for the next turn. Arming
  //    comes before melting: a small snowball that ends the turn on a warm crack melts
  //    away below, and the crack must still remember it was stepped on.
  convertArmedCracks(level);
  armCoveredCracks(level);

  // 4. 따뜻한 칸 판정. Shadows first (only with the shadow mechanic on — with shadows off
  //    there is no shade at all, not even inside a closed partition (B-11, 9/29) or a
  //    tunnel cell (B-007)), then melting; a body worn down to 0 disappears and its tile
  //    becomes cool.
  if (level.hasShadow) recalcShadows(level);
  else clearShadows(level);
  const sizesBefore = snapshotSizes(level);
  processMelting(level);
  processDeadObjects(level);

  // 5. 즉사 재판정 — holes, then lasers: anything on a crack that crumbled this turn falls
  //    in, and a beam that the falling block was holding back hits now (B-017).
  applyHoles(level);
  applyLaserCheck(level);

  // 6. 영혼 이동 처리 — a dead player's soul, or a soul footplate (moveSoul).
  moveSoul(level, ts);

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
          // A snowman shrinking in the sun is already melting (user decision 2026-11-25):
          // a soul that enters it carries on melting on the next sunlit turn, without the
          // one-turn sweat warning a fresh body gets. (A snowball never takes a soul.)
          if (obj.type === 'snowman') obj.isMelting = true;
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
    // So is a map's character skin (presentation only, lib/mapSkins.ts).
    ...(snowman.skin ? { skin: snowman.skin } : {}),
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
    ...(body.skin ? { skin: body.skin } : {}),
  };
  level.objects[targetPos.row][targetPos.col] = {
    type: 'player',
    size: target.size,
    isMelting: target.isMelting,
    createdAt: 0,
    ...(target.skin ? { skin: target.skin } : {}),
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
