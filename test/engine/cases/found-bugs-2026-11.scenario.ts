import type { Level } from '../../../src/types';
import { cycleSoul } from '../../../src/engine/turn';
import { newGameState } from '../../../src/utils/game';
import { soulChangedBody } from '../../../src/utils/level';
import { decodeLevelCode } from '../../../src/utils/levelCode';
import { playMoves } from '../../../src/utils/solution';
import {
  defineScenario,
  expect,
  expectEmpty,
  expectObject,
  type ScenarioBoard,
  type ScenarioDefinition,
  type ScenarioResult,
} from '../harness';

/**
 * Engine bugs found by the 2026-11-02 review agents and fixed in Studio (bugs/B-004 …
 * B-009). Each report's boards are loaded from its map code exactly as reported (the
 * report has the board text), followed by small boards for the edges of the rule.
 * Scenario names start with the bug number.
 *
 * B-004 (two trains absorbing one ball in the same tick) is no longer here: only a portal
 * could split a roll into two trains, and portals were removed from the game on
 * 2026-11-03. Its boards now play without portals (legacy-portal-orange-codes.scenario.ts).
 */

const Q03A = 'XTZGO3f4W5vCA0kziJgQuj51GXkNB7zL9MsWpoNZu';
const Q03B = 'XTZGO3f4W5vCA0kziJgQujdgYLJyp14BtI280pdrq';
const Q03C = 'XTZGO3f4W5vCA0kziJgQuGqddiVEN0ylZPpwC7B5m';
const Q03D = 'DvddI96DJ0aPoAcRyTH4g6obOCcUQURdC1Evbg4FNds11T0Ks';
const R01A = 'D2a0ctrf1DW44R4tJwhAqvj2thG5oOVS35MZ5OQcXkEAXsUhXc';
const R01B = 'XTZGO3f4W5vCA0kziJgQv9NbhullL0leeyWJOya9i';
const R01C = 'XTZGO3f4W5vCA0kziJgQv9NcYza5SG4O8GVFX6POg';
const R01E = 'BfPmY7kDndtCIDYXUMmFFF61wMGCzFDgSdju7Xvuj2';
const R01F = 'Du5Ab0Bc5M7A2g1BHhcGdx7fuJOPcMCiDzYKapBytZK19dPzq';
const TUNNEL_OFF = 'BrDkZ1EQvAxVLiG1VwZH7IUQ';
const SOUL_OFF = 'I8M9KsTrQST';
const SPLIT_SHOVE = 'EZAo8sQYmmn06i6PT1gcGk05SdUTrbsnsmHNjNcXasFbwc5QujsPh2';
const SOUL_ON_START_CELL = 'OGWLmJDFJ1rvmirDeAzQgmwFKdl2Q988KCpYNaqOji7EwoE';

function decode(code: string): Level {
  const level = decodeLevelCode(code);
  expect(!!level, 'the repro map code must decode');
  return level;
}

/** Replace the scenario board with a decoded map code (the board of the report). */
function loadCode(board: ScenarioBoard, code: string): void {
  Object.assign(board.level, decode(code));
}

/** No object in two cells of a turn result, and no motionId on two objects of a frame. */
function expectNoDuplicates(result: ScenarioResult): void {
  result.turns.forEach((turn, turnIndex) => {
    const cells = new Map<object, string>();
    turn.level.objects.forEach((row, r) => row.forEach((object, c) => {
      if (!object) return;
      const other = cells.get(object);
      expect(!other, `turn ${turnIndex + 1}: one ${object.type} is in ${other} and (${r}, ${c})`);
      cells.set(object, `(${r}, ${c})`);
    }));
    turn.frames.forEach((frame, frameIndex) => {
      const ids = new Map<string, string>();
      frame.level.objects.forEach((row, r) => row.forEach((object, c) => {
        if (!object?.motionId) return;
        const other = ids.get(object.motionId);
        expect(!other, `turn ${turnIndex + 1} frame ${frameIndex} (${frame.phase}): motionId ${object.motionId} at ${other} and (${r}, ${c})`);
        ids.set(object.motionId, `(${r}, ${c})`);
      }));
    });
  });
}

function expectNoOp(result: ScenarioResult, turnIndex: number): void {
  expect(result.turns[turnIndex].frames.length === 0, `turn ${turnIndex + 1} must be a no-op (no turn effects)`);
}

export const scenarios: ScenarioDefinition[] = [
  // ===== B-005: the arch check of a build uses the size after the flake under B =====
  defineScenario({
    name: 'B-005 q03a: P2 cannot build beyond a height-2 arch when the flake under B makes the snowman an S3',
    width: 5,
    height: 3,
    setup: (board) => loadCode(board, Q03A),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectNoOp(result, 0);
      expectObject(level, 1, 0, 'player', 2);
      expectObject(level, 1, 1, 'snowball', 1);
      expectObject(level, 1, 2, 'snowball', 2);
      expect(!!level.tiles[1][2].isFlake, 'the flake under B stays');
    },
  }),
  defineScenario({
    name: 'B-005 q03d: P1 cannot build beyond a height-1 arch when the flake under B makes the snowman an S2',
    width: 6,
    height: 3,
    setup: (board) => loadCode(board, Q03D),
    actions: ['wait', 'wait', 'right'],
    verify: (result) => {
      const { level } = result;
      expectNoOp(result, 2);
      expectObject(level, 1, 0, 'player', 1);
      expectObject(level, 1, 1, 'snowball', 1);
      expectObject(level, 1, 2, 'snowball', 1);
      expect(!!level.tiles[1][2].isFlake, 'the flake under B stays');
    },
  }),
  defineScenario({
    name: 'B-005 q03c (control): without the flake P2 still builds an S2 beyond the height-2 arch',
    width: 5,
    height: 3,
    setup: (board) => loadCode(board, Q03C),
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 1, 'player', 2);
      expectObject(result.level, 1, 2, 'snowman', 2);
    },
  }),
  defineScenario({
    name: 'B-005 q03b (control): without the arch P2 still builds an S3 that eats the flake',
    width: 5,
    height: 3,
    setup: (board) => loadCode(board, Q03B),
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 1, 'player', 2);
      expectObject(result.level, 1, 2, 'snowman', 3);
      expect(!result.level.tiles[1][2].isFlake, 'the new snowman eats the flake (Q-10)');
    },
  }),
  defineScenario({
    name: 'B-005 P1 cannot build in a tunnel cell B whose ball rests on a flake (the S2 would not fit)',
    width: 1,
    height: 3,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .snowball(1, 0, 1)
        .tile(2, 0, { isRowArch: true, isFlake: true }) // passage up/down, height ≤ 1
        .snowball(2, 0, 1);
    },
    actions: ['down'],
    verify: (result) => {
      expectNoOp(result, 0);
      expectObject(result.level, 0, 0, 'player', 1);
      expectObject(result.level, 1, 0, 'snowball', 1);
      expectObject(result.level, 2, 0, 'snowball', 1);
    },
  }),

  // ===== B-006, 2026-11-05: only the ball touching the player takes force, so a big ball
  // no longer crushes the small ball behind it, whatever holds that small ball =====
  ...([
    ['r01a, B in a ◥ (its right leg is solid)', R01A],
    ['r01c, C is a tunnel turned across the push', R01C],
    ['r01e, C is a ◣ whose left leg faces the push', R01E],
    ['r01b (control), C is a wall', R01B],
    ['r01f (control), C is void', R01F],
  ] as const).map(([label, code]) => defineScenario({
    name: `B-006 ${label}: P2 pushing s2 + s1 is a no-op`,
    width: 5,
    height: 3,
    setup: (board) => loadCode(board, code),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectNoOp(result, 0);
      expectObject(level, 1, 0, 'player', 2);
      expectObject(level, 1, 1, 'snowball', 2);
      expectObject(level, 1, 2, 'snowball', 1);
    },
  })),
  defineScenario({
    name: 'B-006 P2 pushing s2 + s1 with nothing behind the s1 is still a no-op',
    width: 5,
    height: 1,
    setup: (board) => {
      board.player(0, 0, 2).snowball(0, 1, 2).snowball(0, 2, 1);
    },
    actions: ['right'],
    verify: (result) => {
      expectNoOp(result, 0);
      expectObject(result.level, 0, 0, 'player', 2);
      expectObject(result.level, 0, 1, 'snowball', 2);
      expectObject(result.level, 0, 2, 'snowball', 1);
    },
  }),

  // ===== B-007: a map with shadows off has no shade, tunnel cells included =====
  defineScenario({
    name: 'B-007 a ball in a warm tunnel cell melts on a map with shadows off (decoded, no newGameState)',
    width: 4,
    height: 2,
    setup: (board) => loadCode(board, TUNNEL_OFF),
    actions: ['wait'],
    verify: (result) => {
      expectEmpty(result.level, 0, 2);
      expect(!result.level.tiles[0][2].isShade, 'no shade on a map with shadows off');
      expect(!result.level.tiles[0][2].isWarm, 'the cell cools when the ball melts away');
    },
  }),
  defineScenario({
    name: 'B-007 (control) the same tunnel cell shades the ball when the map has shadows on',
    width: 4,
    height: 2,
    setup: (board) => {
      loadCode(board, TUNNEL_OFF);
      board.level.hasShadow = true;
    },
    actions: ['wait'],
    verify: (result) => {
      expectObject(result.level, 0, 2, 'snowball', 1);
      expect(!!result.level.tiles[0][2].isShade, 'a tunnel is a fixed shelter with shadows on');
    },
  }),
  defineScenario({
    name: 'B-007 newGameState shows no tunnel shade on a map with shadows off (and keeps it with shadows on)',
    width: 4,
    height: 2,
    setup: (board) => loadCode(board, TUNNEL_OFF),
    actions: [],
    verify: (result) => {
      const start = result.initialLevel;
      expect(!!start.tiles[0][2].isShade, 'the decoder stores the tunnel as shaded');
      expect(!newGameState(start).level.tiles[0][2].isShade, 'shadows off: no shade at the start');
      expect(!!newGameState({ ...start, hasShadow: true }).level.tiles[0][2].isShade, 'shadows on: the tunnel is shaded');
    },
  }),

  // ===== B-008: M does nothing on a map with the soul cycle off =====
  defineScenario({
    name: 'B-008 cycleSoul and a replayed M do nothing on a soul-off map; the soul-on control clears',
    width: 3,
    height: 1,
    setup: (board) => loadCode(board, SOUL_OFF),
    actions: [],
    verify: (result) => {
      const start = result.initialLevel;
      expect(!start.soulSwapEnabled, 'the repro map has the soul cycle off');
      expect(cycleSoul(start) === null, 'cycleSoul refuses a soul-off map');
      const replay = playMoves(start, ['soul']);
      expect(replay.status === 'playing', `a replayed M must not clear, received ${replay.status}`);
      expect(replay.turnCount === 0, 'M is not a turn');
      expectObject(replay.level, 0, 0, 'player', 2);
      expectObject(replay.level, 0, 2, 'snowman', 1);
      const soulOn = playMoves({ ...start, soulSwapEnabled: true }, ['soul']);
      expect(soulOn.status === 'cleared', `with the soul cycle on, M moves onto the goal snowman (received ${soulOn.status})`);
      expectObject(soulOn.level, 0, 2, 'player', 1);
    },
  }),

  // ===== B-009: only an object that keeps existing keeps its motionId =====
  defineScenario({
    name: 'B-009 a split half that shoves a ball out of its cell gets its own motionId; the shoved ball keeps its own',
    width: 5,
    height: 4,
    setup: (board) => loadCode(board, SPLIT_SHOVE),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 1, 'snowball', 1);
      expectObject(level, 1, 1, 'snowball', 1);
      expectObject(level, 3, 1, 'snowball', 1);
      expectNoDuplicates(result);
      for (const frame of result.turns[0].frames) {
        expect(frame.level.objects[0][1]?.motionId === 'snowball:1:1',
          `the shoved ball keeps its map id in the ${frame.phase} frame, found ${frame.level.objects[0][1]?.motionId}`);
      }
      expect(level.objects[1][1]?.motionId !== 'snowball:1:1', 'the new half has an id of its own');
    },
  }),
  defineScenario({
    name: 'B-009 the body the soul moves into gets a new motionId even on the old body’s start cell (soulChangedBody)',
    width: 5,
    height: 3,
    setup: (board) => loadCode(board, SOUL_ON_START_CELL),
    actions: ['up', 'right', 'right', 'right', 'down', 'left', 'left', 'down'],
    verify: (result) => {
      // The last D walks into the hole at (2,2); the soul moves to the S1 pushed onto the
      // player's start cell (1,1), where the old body's id player:1:1 was made.
      expectObject(result.level, 1, 1, 'player', 1);
      expectObject(result.level, 1, 0, 'snowman', 1);
      const levels = [result.initialLevel, ...result.turns.map(turn => turn.level)];
      const before = levels[7];
      const after = levels[8];
      const oldId = before.objects[1][2]?.motionId;
      const newId = after.objects[1][1]?.motionId;
      expect(oldId === 'player:1:1', `the old body keeps its map id, found ${oldId}`);
      expect(!!newId && newId !== oldId, `the new body needs an id of its own, found ${newId}`);
      expect(soulChangedBody(before, after), 'soulChangedBody must see the soul change bodies');
      for (let turn = 1; turn <= 7; turn++) {
        expect(!soulChangedBody(levels[turn - 1], levels[turn]), `turn ${turn} is a plain step, not a body change`);
      }
      expectNoDuplicates(result);
    },
  }),
];
