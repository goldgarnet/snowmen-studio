import type { Direction, Level, TriangleCorner } from '../../../src/types';
import { cycleSoul, executeTurn } from '../../../src/engine/turn';
import { gameStateFromCode } from '../../../src/utils/game';
import { cloneLevel } from '../../../src/utils/level';
import { decodeSolution, playMoves } from '../../../src/utils/solution';
import {
  defineScenario,
  expect,
  expectEmpty,
  expectFrame,
  expectObject,
  expectStatus,
  type ScenarioBoard,
  type ScenarioDefinition,
  type ScenarioResult,
} from '../harness';

/**
 * B-013 — user decision ① (2026-11-03): a heavier roll that hits a lighter group resting
 * in a triangle cell rolls on together with it, as on a straight line. The group leaves
 * the way the equal-mass handoff sends it (the triangle ball out of its mirror exit, with
 * the balls touching that exit) and the train follows it into the triangle cell, bending
 * there one ball at a time (Q-04). Unchanged: an equal mass hands the motion on, a
 * heavier group stops the train, and a group that terrain stops (or that holds a non-ball)
 * stops it too.
 *
 * The boards of bugs/B-013 are loaded from their map codes. Where the move list starts
 * with `M`, the soul cycle is applied first, and every board is checked against the app's
 * replay (gameStateFromCode → playMoves). Small built boards cover the edges.
 */

// bugs/B-013 boards (label in the report, moves).
const HEAVY_FLAKE = 'BAg84PssA58fJAjojmGA2zQjyeN6aLSPHEAOPR63T4bmSegX8DEyzNrla5x92oPRMtN96dm06'; // 무거움 (위 판), R
const EQUAL_NO_FLAKE = 'BAg84PssArMGhWA5z3lsKx3uoy73DLCjfDDghQ6VIfVDcBb9xFR5yXMv0oSFHOQJgJNltWbKq'; // 대조: 같은 질량, R
const P2_S2 = 'g8y6dfoQ1YamVDo1ysuJuJjLkfplgYGsilP1Dd3Jt1GQEPV29Xua'; // s2 가 굴러 ◥ 공을 침, R
const P2_S1 = 'g8y6dfoQWD06EzYolaEFIysXnkmxLdQZhm6F30IJcpq9Cqd2j5ZY'; // 대조 s1, R
const S2_ALONE = 'CmG9lI45vUjNGOy1GY6UCnJHqSJyzLfSuqR8qPGQtkqfiv7tmGR0CUHRWbGIXIHbCkrHknmMP778Jf4cVB1h8sRMqoPJUYgc6Qp2O0S'; // s2 → ◥ 공 혼자, MR
const S2_PAIR = 'CmG9lI45vUjNGOy1GY6UCnJHqSJyzLfXgBq1fH7tNqkS3cqHcpbjV9zbTcc3LH4RPmEUiATsWOd7yYpotYSQSacA4ez7MlMoVf4eYgy'; // s2 → ◥ 공 + 출구 공, MR
const TRAIN_ALONE = 'CmG9lI45s1USGuzpKcM19tHgmo3FdLhdCpky5iLvNYMjGd0LrLS45URuyFScRIpNpLgpPUmXiExo0EutIAkaNTUNaD6LP2oGV92rzDU'; // s1+s1 열차 → ◥ 공 혼자, MR
const TRAIN_PAIR = 'CmG9lI45s1USGuzpKcM19tHgmo3FdLhhyA9rubDNreGWbKijhucoO994vGpNFIcD2M32MrT3oVToe7f5gXBIhBfBn4g9IFURvPHT8t0'; // s1+s1 열차 → ◥ 공 + 출구 공, MR

/** The app's start board for a map code, with the leading `M` applied when asked. */
function startFromCode(code: string, soulFirst: boolean): Level {
  const state = gameStateFromCode(code);
  expect(!!state, 'the repro map code must decode');
  if (!soulFirst) return state.level;
  const swapped = cycleSoul(state.level);
  expect(!!swapped, 'M must move the soul into the S3');
  return swapped;
}

function loadCode(board: ScenarioBoard, code: string, soulFirst = false): void {
  Object.assign(board.level, startFromCode(code, soulFirst));
}

function snapshot(level: Level): string {
  return level.objects.map(row => row.map(o => (o ? `${o.type[0]}${o.size}` : '.')).join(' ')).join('\n');
}

/** The scenario must end exactly where the app's replay of the same move string ends. */
function expectSameAsReplay(result: ScenarioResult, code: string, moves: string): void {
  const state = gameStateFromCode(code);
  const parsed = decodeSolution(moves);
  expect(!!state && !!parsed, 'the map code and the moves must parse');
  const replay = playMoves(state.level, parsed);
  expect(replay.status === result.status, `the replay of ${moves} ends ${replay.status}, the scenario ${result.status}`);
  expect(snapshot(replay.level) === snapshot(result.level),
    `the replay of ${moves} ends on another board:\n${snapshot(replay.level)}\n--- scenario:\n${snapshot(result.level)}`);
}

function hasImpact(result: ScenarioResult, turnIndex = 0): boolean {
  return result.turns[turnIndex].frames.some(frame => frame.phase === 'impact');
}

function ball(level: Level, row: number, col: number, size: number): boolean {
  const object = level.objects[row]?.[col];
  return object?.type === 'snowball' && object.size === size;
}

// ===== Four triangles × four roll directions =====

const STEP: Record<Direction, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
// roll.ts TRI_DEFLECT: the exit for each open edge; an entry with no exit meets a solid leg.
const MIRROR: Record<TriangleCorner, Partial<Record<Direction, Direction>>> = {
  br: { down: 'left', right: 'up' },
  bl: { down: 'right', left: 'up' },
  tl: { up: 'right', left: 'down' },
  tr: { up: 'left', right: 'down' },
};
const SYMBOL: Record<TriangleCorner, string> = { tl: '◤', tr: '◥', bl: '◣', br: '◢' };
const MID = 4; // the triangle sits in the middle of a 9×9 board, four cells from every edge

/**
 * A P3 starts a heavier roll toward the triangle ball from four cells away: an s2, or an
 * s1 + s1 train. Through an open edge the triangle ball leaves by its mirror exit and the
 * roll follows it to the edge of the board; against a solid leg the roll stops at the leg.
 */
function symmetryScenario(corner: TriangleCorner, dir: Direction, roller: 's2' | 'train'): ScenarioDefinition {
  const [dr, dc] = STEP[dir];
  const behind = (k: number): [number, number] => [MID - dr * k, MID - dc * k];
  const exit = MIRROR[corner][dir];
  const what = roller === 's2' ? 'an s2' : 'an s1 + s1 train';
  return defineScenario({
    name: exit
      ? `B-013 ${SYMBOL[corner]} (${corner}) hit moving ${dir} by ${what}: the triangle ball leaves ${exit} and the roll follows it round the mirror`
      : `B-013 ${SYMBOL[corner]} (${corner}) hit moving ${dir} by ${what}: a solid leg stops the roll and the triangle ball stays`,
    width: 9,
    height: 9,
    setup: (board) => {
      board.tile(MID, MID, { triangle: corner }).snowball(MID, MID, 1).player(...behind(4), 3);
      if (roller === 's2') board.snowball(...behind(3), 2);
      else board.snowball(...behind(3), 1).snowball(...behind(2), 1);
    },
    actions: [dir],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, ...behind(3), 'player', 3);
      expect(!hasImpact(result), 'a heavier hit hands no motion on');
      if (!exit) {
        expectObject(level, MID, MID, 'snowball', 1);
        expectObject(level, ...behind(1), 'snowball', roller === 's2' ? 2 : 1);
        if (roller === 'train') expectObject(level, ...behind(2), 'snowball', 1);
        return;
      }
      const [er, ec] = STEP[exit];
      const ahead = (k: number): [number, number] => [MID + er * k, MID + ec * k];
      expectEmpty(level, MID, MID);
      expectEmpty(level, ...behind(1));
      expectObject(level, ...ahead(4), 'snowball', 1);
      if (roller === 's2') {
        expectObject(level, ...ahead(3), 'snowball', 2);
        expectEmpty(level, ...ahead(2));
        expectFrame(result, 0, 'movement',
          (frame) => ball(frame, MID, MID, 2) && ball(frame, ...ahead(1), 1),
          'on the hit tick the triangle ball steps out of its exit and the s2 enters the triangle cell');
      } else {
        expectObject(level, ...ahead(3), 'snowball', 1);
        expectObject(level, ...ahead(2), 'snowball', 1);
        expectEmpty(level, ...ahead(1));
      }
    },
  });
}

const CORNERS: TriangleCorner[] = ['tl', 'tr', 'bl', 'br'];
const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const symmetryScenarios: ScenarioDefinition[] = [
  ...CORNERS.flatMap(corner => DIRECTIONS.map(dir => symmetryScenario(corner, dir, 's2'))),
  ...CORNERS.flatMap(corner => DIRECTIONS.filter(dir => MIRROR[corner][dir]).map(dir => symmetryScenario(corner, dir, 'train'))),
];

export const scenarios: ScenarioDefinition[] = [
  // ===== The two boards the user called bugs =====
  defineScenario({
    name: 'B-013 무거움 (위 판): an s1 grown to s2 on a flake hits a lone ◥ ball — the ball turns down and the s2 follows it to the wall',
    width: 6,
    height: 4,
    setup: (board) => loadCode(board, HEAVY_FLAKE),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 0, 1, 'player', 2);
      expectEmpty(level, 0, 3);
      expectEmpty(level, 0, 4);
      expect(level.tiles[0][4].triangle === 'tr', 'the ◥ stays');
      expectObject(level, 2, 4, 'snowball', 2);
      expectObject(level, 3, 4, 'snowball', 1);
      expect(!hasImpact(result), 'the heavier roll takes the ball along; it hands no motion on');
      expectFrame(result, 0, 'movement',
        (frame) => ball(frame, 0, 4, 2) && ball(frame, 1, 4, 1) && !frame.objects[0][3],
        'on the hit tick the ◥ ball steps out of its exit and the s2 enters the ◥ cell');
      expectSameAsReplay(result, HEAVY_FLAKE, 'R');
    },
  }),
  defineScenario({
    name: 'B-013 s1+s1 열차 → ◥ 공 혼자: a two-ball train hits a lone ◥ ball — the three balls turn one at a time and roll down together',
    width: 6,
    height: 6,
    setup: (board) => loadCode(board, TRAIN_ALONE, true),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 0, 1, 'player', 3);
      expectEmpty(level, 0, 2);
      expectEmpty(level, 0, 3);
      expectEmpty(level, 0, 4);
      expectObject(level, 3, 4, 'snowball', 1);
      expectObject(level, 4, 4, 'snowball', 1);
      expectObject(level, 5, 4, 'snowball', 1);
      expectObject(level, 5, 5, 'snowman', 2);
      expect(!hasImpact(result), 'the heavier train takes the ball along; it hands no motion on');
      expectFrame(result, 0, 'movement',
        (frame) => ball(frame, 0, 3, 1) && ball(frame, 0, 4, 1) && ball(frame, 1, 4, 1),
        'on the hit tick the ◥ ball steps out and the train lead enters the ◥ cell');
      expectFrame(result, 0, 'movement',
        (frame) => !frame.objects[0][3] && ball(frame, 0, 4, 1) && ball(frame, 1, 4, 1) && ball(frame, 2, 4, 1),
        'the second train ball enters the ◥ cell on the next tick while the lead has turned down (Q-04)');
      expectSameAsReplay(result, TRAIN_ALONE, 'MR');
    },
  }),

  // ===== The same case on the other boards of the report =====
  defineScenario({
    name: 'B-013 s2 → ◥ 공 혼자: a rolling s2 hits a lone ◥ ball — the pair rolls down together',
    width: 6,
    height: 6,
    setup: (board) => loadCode(board, S2_ALONE, true),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 0, 1, 'player', 3);
      expectEmpty(level, 0, 3);
      expectEmpty(level, 0, 4);
      expectObject(level, 4, 4, 'snowball', 2);
      expectObject(level, 5, 4, 'snowball', 1);
      expectObject(level, 5, 5, 'snowman', 2);
      expect(!hasImpact(result), 'no handoff');
      expectSameAsReplay(result, S2_ALONE, 'MR');
    },
  }),
  defineScenario({
    name: "B-013 's2 가 굴러 ◥ 공을 침' is not a roll: a P2 shoves an s2 one cell, so nothing hits the ◥ ball and the board stays as before",
    width: 4,
    height: 4,
    setup: (board) => loadCode(board, P2_S2),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 1, 'player', 2);
      expectObject(level, 0, 2, 'snowball', 2);
      expectObject(level, 0, 3, 'snowball', 1);
      expectEmpty(level, 3, 3);
      expect(!hasImpact(result), 'nothing is hit');
      // Without the ◥ ball the same push still moves the s2 exactly one cell: a P2 pushes
      // an s2 like a block (push table, PLAYER SIZE 2), it never starts a roll.
      const open = cloneLevel(result.initialLevel);
      open.objects[0][3] = null;
      const pushed = executeTurn(open, 'right').level;
      expectObject(pushed, 0, 2, 'snowball', 2);
      expectEmpty(pushed, 0, 3);
      expectSameAsReplay(result, P2_S2, 'R');
    },
  }),
  defineScenario({
    name: "B-013 the 's2 가 굴러 ◥ 공을 침' board with a P3: the s2 now rolls, and the pair turns down to the wall",
    width: 4,
    height: 4,
    setup: (board) => {
      loadCode(board, P2_S2);
      board.player(0, 0, 3);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 1, 'player', 3);
      expectEmpty(level, 0, 2);
      expectEmpty(level, 0, 3);
      expectObject(level, 2, 3, 'snowball', 2);
      expectObject(level, 3, 3, 'snowball', 1);
      expect(!hasImpact(result), 'no handoff');
    },
  }),

  // ===== Controls of the report: these stay as they were =====
  defineScenario({
    name: 'B-013 control 대조: 같은 질량 — an equal-mass hit still hands the motion on; the ◥ ball leaves alone',
    width: 6,
    height: 4,
    setup: (board) => loadCode(board, EQUAL_NO_FLAKE),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 1, 'player', 2);
      expectObject(level, 0, 3, 'snowball', 1);
      expectEmpty(level, 0, 4);
      expectObject(level, 3, 4, 'snowball', 1);
      expect(hasImpact(result), 'the equal-mass handoff keeps its impact frame');
      expectSameAsReplay(result, EQUAL_NO_FLAKE, 'R');
    },
  }),
  defineScenario({
    name: 'B-013 control 대조 s1 — an equal-mass hit on the 4×4 board hands the motion on',
    width: 4,
    height: 4,
    setup: (board) => loadCode(board, P2_S1),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 1, 'player', 2);
      expectObject(level, 0, 2, 'snowball', 1);
      expectEmpty(level, 0, 3);
      expectObject(level, 3, 3, 'snowball', 1);
      expect(hasImpact(result), 'impact');
      expectSameAsReplay(result, P2_S1, 'R');
    },
  }),
  defineScenario({
    name: 'B-013 control s2 → ◥ 공 + 출구 공 — the ◥ ball and its exit ball (mass 2) take an equal-mass hit and leave together; the s2 stops',
    width: 6,
    height: 6,
    setup: (board) => loadCode(board, S2_PAIR, true),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 1, 'player', 3);
      expectObject(level, 0, 3, 'snowball', 2);
      expectEmpty(level, 0, 4);
      expectEmpty(level, 1, 4);
      expectObject(level, 4, 4, 'snowball', 1);
      expectObject(level, 5, 4, 'snowball', 1);
      expect(hasImpact(result), 'impact');
      expectSameAsReplay(result, S2_PAIR, 'MR');
    },
  }),
  defineScenario({
    name: 'B-013 control s1+s1 열차 → ◥ 공 + 출구 공 — equal mass: the pair leaves, the train stops',
    width: 6,
    height: 6,
    setup: (board) => loadCode(board, TRAIN_PAIR, true),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 1, 'player', 3);
      expectObject(level, 0, 2, 'snowball', 1);
      expectObject(level, 0, 3, 'snowball', 1);
      expectEmpty(level, 0, 4);
      expectEmpty(level, 1, 4);
      expectObject(level, 4, 4, 'snowball', 1);
      expectObject(level, 5, 4, 'snowball', 1);
      expect(hasImpact(result), 'impact');
      expectSameAsReplay(result, TRAIN_PAIR, 'MR');
    },
  }),

  // ===== Four triangles × four directions =====
  ...symmetryScenarios,

  // ===== A blocked exit: nothing moves, as on a straight line =====
  defineScenario({
    name: 'B-013 exit off the board: a ◥ on the bottom row cannot let its ball out, so the s2 stops and nothing moves',
    width: 5,
    height: 2,
    setup: (board) => {
      board.player(1, 0, 3).snowball(1, 1, 2).tile(1, 4, { triangle: 'tr' }).snowball(1, 4, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 1, 3, 'snowball', 2);
      expectObject(level, 1, 4, 'snowball', 1);
      expect(!hasImpact(result), 'no impact');
    },
  }),
  defineScenario({
    name: 'B-013 exit into a tunnel that takes no vertical move: the s2 stops and nothing moves',
    width: 6,
    height: 4,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).tile(0, 4, { triangle: 'tr' }).snowball(0, 4, 1).tile(1, 4, { isColumnArch: true });
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 3, 'snowball', 2);
      expectObject(level, 0, 4, 'snowball', 1);
      expectEmpty(level, 1, 4);
      expect(!hasImpact(result), 'no impact');
    },
  }),
  defineScenario({
    name: 'B-013 exit through a height-1 arch the ◥ s2 cannot pass: the mass-3 train stops and nothing moves',
    width: 7,
    height: 5,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).snowball(0, 3, 1)
        .tile(0, 5, { triangle: 'tr' }).snowball(0, 5, 2)
        .edgeArch(0, 5, 'down', 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      // The s2 first takes the straight s1 along (mass 3), then meets the ◥ s2 (mass 2).
      expectObject(level, 0, 3, 'snowball', 2);
      expectObject(level, 0, 4, 'snowball', 1);
      expectObject(level, 0, 5, 'snowball', 2);
      expectEmpty(level, 1, 5);
      expect(!hasImpact(result), 'no impact');
    },
  }),
  defineScenario({
    name: 'B-013 exit cell is a triangle whose solid leg faces the ball: the s2 stops and nothing moves',
    width: 6,
    height: 5,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).tile(0, 4, { triangle: 'tr' }).snowball(0, 4, 1).tile(1, 4, { triangle: 'tl' });
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 3, 'snowball', 2);
      expectObject(level, 0, 4, 'snowball', 1);
      expectEmpty(level, 1, 4);
    },
  }),
  defineScenario({
    name: 'B-013 a snowman against the exit: the group is not all snow, so the s2 stops (no impact)',
    width: 6,
    height: 4,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).tile(0, 4, { triangle: 'tr' }).snowball(0, 4, 1).snowman(1, 4, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 3, 'snowball', 2);
      expectObject(level, 0, 4, 'snowball', 1);
      expectObject(level, 1, 4, 'snowman', 1);
      expect(!hasImpact(result), 'no impact');
    },
  }),
  defineScenario({
    name: 'B-013 a heavier group on the exit side (◥ s1 + exit s2 = 3) still stops an s2',
    width: 6,
    height: 5,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).tile(0, 4, { triangle: 'tr' }).snowball(0, 4, 1).snowball(1, 4, 2);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 3, 'snowball', 2);
      expectObject(level, 0, 4, 'snowball', 1);
      expectObject(level, 1, 4, 'snowball', 2);
      expectEmpty(level, 4, 4);
      expect(!hasImpact(result), 'no impact');
    },
  }),
  defineScenario({
    name: 'B-013 a height-1 arch on the exit: the ◥ s1 passes, the s2 that follows stops inside the ◥ cell (arch split, §5)',
    width: 6,
    height: 5,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).tile(0, 4, { triangle: 'tr' }).snowball(0, 4, 1).edgeArch(0, 4, 'down', 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectEmpty(level, 0, 3);
      expectObject(level, 0, 4, 'snowball', 2);
      expectObject(level, 4, 4, 'snowball', 1);
    },
  }),

  // ===== Trains and longer groups =====
  defineScenario({
    name: 'B-013 a mass-3 train hits ◥ s1 + exit s1 (mass 2): all four balls turn down together',
    width: 7,
    height: 7,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).snowball(0, 3, 1)
        .tile(0, 5, { triangle: 'tr' }).snowball(0, 5, 1).snowball(1, 5, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      for (let c = 2; c <= 5; c++) expectEmpty(level, 0, c);
      expectObject(level, 3, 5, 'snowball', 2);
      expectObject(level, 4, 5, 'snowball', 1);
      expectObject(level, 5, 5, 'snowball', 1);
      expectObject(level, 6, 5, 'snowball', 1);
      expect(!hasImpact(result), 'no handoff');
    },
  }),
  defineScenario({
    name: 'B-013 a mass-4 train hits ◥ s1 + two exit balls (mass 3): all six balls turn down together',
    width: 9,
    height: 9,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).snowball(0, 3, 1).snowball(0, 5, 1)
        .tile(0, 7, { triangle: 'tr' }).snowball(0, 7, 1).snowball(1, 7, 1).snowball(2, 7, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      for (let c = 2; c <= 7; c++) expectEmpty(level, 0, c);
      expectObject(level, 3, 7, 'snowball', 2);
      for (let r = 4; r <= 8; r++) expectObject(level, r, 7, 'snowball', 1);
      expect(!hasImpact(result), 'no handoff');
    },
  }),
  defineScenario({
    name: 'B-013 control: a mass-3 train hits ◥ s1 + two exit balls (mass 3) — equal mass still hands on; the train stops',
    width: 8,
    height: 8,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).snowball(0, 3, 1)
        .tile(0, 6, { triangle: 'tr' }).snowball(0, 6, 1).snowball(1, 6, 1).snowball(2, 6, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 4, 'snowball', 2);
      expectObject(level, 0, 5, 'snowball', 1);
      expectEmpty(level, 0, 6);
      for (let r = 5; r <= 7; r++) expectObject(level, r, 6, 'snowball', 1);
      expect(hasImpact(result), 'impact');
    },
  }),
  defineScenario({
    name: 'B-013 a mass-3 train hits a straight s1 + ◥ s1 (mass 2): the straight ball enters the ◥ and turns like a train ball',
    width: 8,
    height: 6,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).snowball(0, 3, 1).snowball(0, 5, 1)
        .tile(0, 6, { triangle: 'tr' }).snowball(0, 6, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      for (let c = 2; c <= 6; c++) expectEmpty(level, 0, c);
      expectObject(level, 2, 6, 'snowball', 2);
      expectObject(level, 3, 6, 'snowball', 1);
      expectObject(level, 4, 6, 'snowball', 1);
      expectObject(level, 5, 6, 'snowball', 1);
    },
  }),

  // ===== Tiles on the bent path =====
  defineScenario({
    name: 'B-013 a hole on the bent path swallows the ◥ ball and then the s2 that follows it',
    width: 6,
    height: 4,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).tile(0, 4, { triangle: 'tr' }).snowball(0, 4, 1).tile(2, 4, { isHole: true });
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      for (let r = 0; r < 4; r++) expectEmpty(level, r, 4);
      expectEmpty(level, 0, 3);
      expect(!!level.tiles[2][4].isHole, 'the hole stays');
    },
  }),
  defineScenario({
    name: 'B-013 a flake at the exit: the ◥ ball eats it on the hit tick and the two s2 roll down',
    width: 6,
    height: 4,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).tile(0, 4, { triangle: 'tr' }).snowball(0, 4, 1).tile(1, 4, { isFlake: true });
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 2, 4, 'snowball', 2);
      expectObject(level, 3, 4, 'snowball', 2);
      expect(!level.tiles[1][4].isFlake, 'the flake is eaten');
    },
  }),
  defineScenario({
    name: 'B-013 a crack on the bent path is armed by the balls rolling over it and crumbles next turn',
    width: 6,
    height: 4,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).tile(0, 4, { triangle: 'tr' }).snowball(0, 4, 1).tile(2, 4, { isCrack: true });
    },
    actions: ['right', 'wait'],
    verify: (result) => {
      const afterRoll = result.turns[0].level;
      expectObject(afterRoll, 2, 4, 'snowball', 2);
      expectObject(afterRoll, 3, 4, 'snowball', 1);
      const { level } = result;
      expect(!!level.tiles[2][4].isHole, 'the armed crack crumbles into a hole');
      expectEmpty(level, 2, 4);
      expectObject(level, 3, 4, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-013 a second mirror below the exit: the pair turns twice and rolls on together',
    width: 6,
    height: 5,
    setup: (board) => {
      board.player(0, 0, 3).snowball(0, 1, 2).tile(0, 4, { triangle: 'tr' }).snowball(0, 4, 1).tile(3, 4, { triangle: 'br' });
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectEmpty(level, 0, 4);
      expectEmpty(level, 3, 4);
      expectObject(level, 3, 0, 'snowball', 1);
      expectObject(level, 3, 1, 'snowball', 2);
    },
  }),
];
