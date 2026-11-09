import type { Direction, TriangleCorner } from '../../../src/types';
import { cycleSoul } from '../../../src/engine/turn';
import { gameStateFromCode } from '../../../src/utils/game';
import { decodeLevelCode } from '../../../src/utils/levelCode';
import { createSolutionState, playMoves } from '../../../src/utils/solution';
import {
  defineScenario,
  expect,
  expectEmpty,
  expectNoPlayer,
  expectObject,
  expectStatus,
  type ScenarioBoard,
  type ScenarioDefinition,
} from '../harness';

/**
 * Team decisions of 2026-11-05.
 *
 * B-013: a triangle links its two open edges. A ball resting in one is pushed around the
 *        mirror, never crushed against the cell's own leg.
 * B-015: a flake cell is always cold.
 * B-016: unchanged. A soul that reaches the goal through a crack or a soul plate is judged
 *        after the melt.
 * B-017: a beam opened by a crack collapse hits in that same turn.
 * B-024: starting on an open goal clears at once, unless a laser kills first.
 * B-027: a clear during a roll stands, and the map stops at that moment.
 */

// The team's own map, 「B-013」(김정훈): 6×6, ◥ s1 at (0,4), P2 at (5,5).
const TEAM_B013 = 'CmG9lF1SSG2jPwAul7PnMd59s27CQmHnwQGMhEYV8IH3w2L1vTHIa8G9yOXY0ZXpBGli5g4vA4PjzBAAT3EMhPpYPu47Ip00W9NwtN4';
const WARM_FLAKE = 'B9aarraKDucRSxE5A0SuOMwGdjClK';
const B016_PLATE = 'XTZGO3gFwAb5pM9tHkbentzLMVwfVfbWEmwfgGIcv';
const B016_CRACK = 'OGWLmK3BgZj8iUHGs1mvfuYNYOYgFOQytUZnuYet42tqSO2';
const B016_CRACK_COLD = 'OGWLmK3BgZj8iUHGs1mvfuYNYOYgFOQytRYQ5BkWxvwi5MG';
const B017_MOVE = 'OGWbRtQn9SJEajc9YJsR3j0NbwyEtV74YIy3cuROizzcqdE';
const B017_FALL = 'D2a0cyuz4PY4UrNjdL75s82cO0RMWLLhRz0VUs0vRskytXIXgW';
const B024_START = 'I8NAaI84MeM';
const B027_NO_GREEN = 'GcjF2ccd485rihEzWq3z1veNghemj8l4hClObjApkBj8k3POqPoo9frVsbpqm842MA';

function loadCode(board: ScenarioBoard, code: string): void {
  const level = decodeLevelCode(code);
  expect(!!level, 'the repro map code must decode');
  Object.assign(board.level, level);
}

const DELTA: Record<Direction, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

// Each triangle's two open approaches: the push and the way the ball leaves.
const PUSHES: { corner: TriangleCorner; dir: Direction; exit: Direction }[] = [
  { corner: 'tr', dir: 'right', exit: 'down' },
  { corner: 'tr', dir: 'up', exit: 'left' },
  { corner: 'tl', dir: 'left', exit: 'down' },
  { corner: 'tl', dir: 'up', exit: 'right' },
  { corner: 'br', dir: 'right', exit: 'up' },
  { corner: 'br', dir: 'down', exit: 'left' },
  { corner: 'bl', dir: 'left', exit: 'up' },
  { corner: 'bl', dir: 'down', exit: 'right' },
];

export const scenarios: ScenarioDefinition[] = [
  // ===== B-013 =====
  defineScenario({
    name: 'team B-013: on the team map a ball pushed right out of ◥ rolls down, and no flake appears',
    width: 6,
    height: 6,
    setup: (board) => loadCode(board, TEAM_B013),
    actions: ['left', 'left', 'up', 'up', 'up', 'up', 'up', 'right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 4, 'player', 2);
      expectObject(level, 5, 4, 'snowball', 1);
      expect(!level.tiles[0][4].isFlake, 'no flake is left in the triangle cell');
    },
  }),
  defineScenario({
    name: 'team B-013: on the team map a ball pushed up out of ◥ rolls left',
    width: 6,
    height: 6,
    setup: (board) => loadCode(board, TEAM_B013),
    actions: ['left', 'up', 'up', 'up', 'up', 'up'],
    verify: (result) => {
      expectObject(result.level, 0, 4, 'player', 2);
      expectObject(result.level, 0, 0, 'snowball', 1);
    },
  }),
  ...PUSHES.map(({ corner, dir, exit }) => defineScenario({
    name: `team B-013: ${corner} pushed ${dir} leaves ${exit} and the player steps into the cell`,
    width: 5,
    height: 5,
    setup: (board) => {
      board
        .tile(2, 2, { triangle: corner })
        .snowball(2, 2, 1)
        .player(2 - DELTA[dir][0], 2 - DELTA[dir][1], 2);
    },
    actions: [dir],
    verify: (result) => {
      const [dr, dc] = DELTA[exit];
      expectObject(result.level, 2, 2, 'player', 2);
      expectObject(result.level, 2 + dr * 2, 2 + dc * 2, 'snowball', 1);
      expect(!result.level.tiles[2][2].isFlake, 'no flake');
    },
  })),
  defineScenario({
    name: 'team B-013: P1 moves s1 one cell around the mirror, as on a straight line',
    width: 5,
    height: 5,
    setup: (board) => { board.tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 1).player(1, 1, 1); },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'player', 1);
      expectObject(result.level, 2, 2, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'team B-013: P2 moves s2 one cell around the mirror',
    width: 5,
    height: 5,
    setup: (board) => { board.tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 2).player(1, 1, 2); },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'player', 2);
      expectObject(result.level, 2, 2, 'snowball', 2);
    },
  }),
  defineScenario({
    name: 'team B-013: P3 rolls s2 around the mirror',
    width: 5,
    height: 5,
    setup: (board) => { board.tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 2).player(1, 1, 3); },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'player', 3);
      expectObject(result.level, 4, 2, 'snowball', 2);
    },
  }),
  defineScenario({
    name: 'team B-013: P1 cannot move s2 around the mirror either',
    width: 5,
    height: 5,
    setup: (board) => { board.tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 2).player(1, 1, 1); },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 1, 'player', 1);
      expectObject(result.level, 1, 2, 'snowball', 2);
    },
  }),
  defineScenario({
    name: 'team B-013: a wall right after the exit presses the ball like any wall, so it crushes',
    width: 5,
    height: 5,
    setup: (board) => {
      board.tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 1).player(1, 1, 2).object(2, 2, 'wall', 100);
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 1, 'player', 2);
      expectEmpty(result.level, 1, 2);
      expect(result.level.tiles[1][2].isFlake, 'the ball is crushed against the wall past the exit');
    },
  }),
  defineScenario({
    name: 'team B-013: the board edge right after the exit crushes the ball too',
    width: 5,
    height: 3,
    setup: (board) => { board.tile(2, 2, { triangle: 'tr' }).snowball(2, 2, 1).player(2, 1, 2); },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 2, 1, 'player', 2);
      expect(result.level.tiles[2][2].isFlake, 'the ball is crushed against the board edge');
    },
  }),
  defineScenario({
    name: 'team B-013: the line bends too: P3 rolls two balls around the mirror',
    width: 5,
    height: 6,
    setup: (board) => {
      board.tile(1, 2, { triangle: 'tr' }).snowball(1, 2, 1).snowball(2, 2, 1).player(1, 1, 3);
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'player', 3);
      expectObject(result.level, 4, 2, 'snowball', 1);
      expectObject(result.level, 5, 2, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'team B-013: a block in a triangle cell still does not turn',
    width: 5,
    height: 5,
    setup: (board) => { board.tile(1, 2, { triangle: 'tr' }).object(1, 2, 'block', 1).player(1, 1, 2); },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 1, 'player', 2);
      expectObject(result.level, 1, 2, 'block', 1);
    },
  }),
  defineScenario({
    name: 'team B-013: a ball pressed against a triangle leg from outside still crushes, the leg is a wall',
    width: 5,
    height: 3,
    setup: (board) => { board.tile(1, 3, { triangle: 'tl' }).snowball(1, 2, 1).player(1, 1, 2); },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 1, 'player', 2);
      expect(result.level.tiles[1][2].isFlake, 'crushed against the solid leg');
    },
  }),

  // ===== B-015 =====
  defineScenario({
    name: 'team B-015: a warm-flake cell from a map code is cold, nothing melts on it',
    width: 5,
    height: 2,
    setup: (board) => loadCode(board, WARM_FLAKE),
    actions: ['right', 'right', 'wait', 'wait'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 2, 'player', 3);
      expectObject(result.level, 1, 2, 'snowball', 2);
      expect(!result.initialLevel.tiles[0][2].isWarm && !result.initialLevel.tiles[1][2].isWarm, 'both flake cells are cold');
    },
  }),

  // ===== B-016 (kept as it was) =====
  defineScenario({
    name: 'team B-016: a soul plate on a wait turn is still judged after the melt',
    width: 5,
    height: 3,
    setup: (board) => loadCode(board, B016_PLATE),
    actions: ['up', 'wait'],
    verify: (result) => expectStatus(result, 'playing'),
  }),
  defineScenario({
    name: 'team B-016: a crack fall is still judged after the melt',
    width: 5,
    height: 3,
    setup: (board) => loadCode(board, B016_CRACK),
    actions: ['right', 'wait'],
    verify: (result) => expectStatus(result, 'playing'),
  }),
  defineScenario({
    name: 'team B-016: with a cover that does not melt the soul still clears there (Q-14)',
    width: 5,
    height: 3,
    setup: (board) => loadCode(board, B016_CRACK_COLD),
    actions: ['right', 'wait'],
    verify: (result) => expectStatus(result, 'cleared'),
  }),

  // ===== B-017 =====
  defineScenario({
    name: 'team B-017: a block falling through a crack opens the beam and the snowman melts that turn, so M has nowhere to go',
    width: 5,
    height: 3,
    setup: (board) => loadCode(board, B017_MOVE),
    actions: ['right', 'right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectEmpty(result.level, 0, 3);
      expect(cycleSoul(result.level) === null, 'no snowman is left to move into');
    },
  }),
  defineScenario({
    name: 'team B-017: a soul that falls with the block onto a goal in the new beam melts there: no clear',
    width: 5,
    height: 3,
    setup: (board) => loadCode(board, B017_FALL),
    actions: ['wait', 'wait'],
    verify: (result) => {
      expectStatus(result, 'gameover');
      expectNoPlayer(result.level);
    },
  }),
  defineScenario({
    name: 'team B-017: the same fall moves on to another snowman outside the beam',
    width: 5,
    height: 3,
    setup: (board) => {
      board
        .laser(0, 0, 'right')
        .tile(0, 1, { isCrack: true })
        .object(0, 1, 'block', 1)
        .tile(0, 3, { isGoal: true })
        .snowman(0, 3, 1)
        .tile(2, 0, { isCrack: true })
        .player(2, 0, 2)
        .snowman(2, 4, 1);
    },
    actions: ['wait', 'wait'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 2, 4, 'player', 1);
    },
  }),

  // ===== B-024 =====
  defineScenario({
    name: 'team B-024: starting on an open goal clears on every play path',
    width: 3,
    height: 1,
    setup: (board) => loadCode(board, B024_START),
    actions: [],
    verify: (result) => {
      expect(gameStateFromCode(B024_START)?.status === 'cleared', 'the play screen clears at the start');
      expect(createSolutionState(result.initialLevel).status === 'cleared', 'the recorder clears at the start');
      const replay = playMoves(result.initialLevel, ['right']);
      expect(replay.status === 'cleared' && replay.turnCount === 0, 'a replay takes no moves after the clear');
    },
  }),
  defineScenario({
    name: 'team B-024: a laser comes first, starting on a goal in a beam is no clear',
    width: 3,
    height: 1,
    setup: (board) => { board.laser(0, 0, 'right').tile(0, 1, { isGoal: true }).player(0, 1, 2); },
    actions: [],
    verify: (result) => {
      expect(createSolutionState(result.initialLevel).status === 'gameover', 'the beam melts the player at turn 0');
    },
  }),
  defineScenario({
    name: 'team B-024: a locked goal under the start does not clear',
    width: 3,
    height: 1,
    setup: (board) => { board.tile(0, 0, { isGoal: true }).player(0, 0, 2).tile(0, 2, { isKeyTile: true }); },
    actions: [],
    verify: (result) => {
      expect(createSolutionState(result.initialLevel).status === 'playing', 'the green button is not covered');
    },
  }),

  // ===== B-027 =====
  defineScenario({
    name: 'team B-027: the map stops the moment the clear is decided, the ball never reaches the yellow button',
    width: 6,
    height: 4,
    setup: (board) => loadCode(board, B027_NO_GREEN),
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'cleared');
      expectObject(result.level, 1, 1, 'player', 2);
      expectObject(result.level, 1, 2, 'snowball', 1);
      const frames = result.turns[0].frames;
      expect(frames[frames.length - 1].phase === 'turn-end', 'the turn ends with a turn-end frame');
    },
  }),
];
