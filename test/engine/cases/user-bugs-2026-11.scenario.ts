import {
  defineScenario,
  expect,
  expectEmpty,
  expectFrame,
  expectNoPlayer,
  expectObject,
  expectStatus,
  type ScenarioBoard,
  type ScenarioDefinition,
  type ScenarioResult,
} from '../harness';
import { decodeLevelCode } from '../../../src/utils/levelCode';

/**
 * User bug reports of 2026-11-02 (bugs/B-001 … B-003). Each report starts with the
 * user's own board, loaded from its map code exactly as reported (bugs/repro), followed
 * by small boards for the rule and its edges. Scenario names start with the bug number.
 */

// bugs/repro/CODES.txt
const SCENE_1 = 'D806VOTGJWbyoY63oAdJ9yVuK1iQCpPojzZbXCPVALxq1BkGpcO88HH9LhqWDWBXjY21Rte2d47j4lps3sdh4Gf5s0KlwUHC1URojMVqKFtyGvMNwpxmm6z1vHyYKYrgfpxawMwRjk';
const SCENE_2 = 'o6K54Ki5fYv38Iz1NiEY9q55cshEu281GoZNGsQ7wWPDdqfS8nLGmCSrXMoupM0zb1bUlRtmZIQVkyavCrCsaDiTDCYjXSfBRTU884p8Iz3wB176FMgEIPOsWNby';
const SCENE_3 = 'XMst99XngKM15Tsl1LLg6mlnd3zOVj0PkIHe2UkTa';
const SCENE_4 = 'CVw6OrorD0NvXu6EOrzDobpIVCbn9latyHwpwFE0vmCxrhegUuyKx3bdKqUITbpm277N48hNUv2KKcvwSURlOwUVt5CYlpntd6v5JF89vx2ZQIj1TTEYaCfTcT3mBwDEAiIXGDIsR7rfnvnONx35G7yfyi2dSTC1jagPe';

/** Replace the scenario board with a decoded map code (the user's board as reported). */
function loadCode(board: ScenarioBoard, code: string): void {
  const level = decodeLevelCode(code);
  expect(!!level, 'the repro map code must decode');
  Object.assign(board.level, level);
}

function hasImpact(result: ScenarioResult, turnIndex: number): boolean {
  return result.turns[turnIndex].frames.some(frame => frame.phase === 'impact');
}

export const scenarios: ScenarioDefinition[] = [
  // ===== B-001: a ball resting in a triangle is one group with the balls at its exit =====
  defineScenario({
    name: 'B-001 scene 1: a ball rolling into a triangle ball whose exit touches another ball stops, and the pair stays',
    width: 7,
    height: 7,
    setup: (board) => loadCode(board, SCENE_1),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 2, 4, 'player', 2);
      // The pushed ball turned down at the ◥ (2,6) and stopped against the ◢ ball.
      expectObject(level, 3, 6, 'snowball', 1);
      expectObject(level, 4, 6, 'snowball', 1);
      expectObject(level, 4, 5, 'snowball', 1);
      // The old cradle sent (4,5) around the ring up to (2,3).
      expectEmpty(level, 2, 3);
      expect(!hasImpact(result, 0), 'a heavier group takes no motion, so there is no impact frame');
    },
  }),
  defineScenario({
    name: 'B-001 a triangle ball with a ball against its exit is mass 2: a mass-1 hit stops and nothing else moves',
    width: 4,
    height: 4,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(0, 1, 1)
        .tile(0, 3, { triangle: 'tr' }) // right → down
        .snowball(0, 3, 1)
        .snowball(1, 3, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 0, 1, 'player', 2);
      expectObject(level, 0, 2, 'snowball', 1);
      expectObject(level, 0, 3, 'snowball', 1);
      expectObject(level, 1, 3, 'snowball', 1);
      expectEmpty(level, 3, 3);
      expect(!hasImpact(result, 0), 'no motion is handed on');
    },
  }),
  defineScenario({
    name: 'B-001 a lone triangle ball still takes an equal-mass hit and leaves by its mirror exit next tick',
    width: 4,
    height: 4,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(0, 1, 1)
        .tile(0, 3, { triangle: 'tr' })
        .snowball(0, 3, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 0, 2, 'snowball', 1);
      expectEmpty(level, 0, 3);
      expectObject(level, 3, 3, 'snowball', 1);
      expect(hasImpact(result, 0), 'the equal-mass handoff keeps its impact frame');
      expectFrame(
        result,
        0,
        'movement',
        (frame) => frame.objects[1][3]?.type === 'snowball' && !frame.objects[0][3],
        'the triangle ball must leave downward (its mirror exit) on the tick after the impact',
      );
    },
  }),
  defineScenario({
    name: 'B-001 an equal-mass hit moves the whole bent group out of the mirror exit together',
    width: 4,
    height: 5,
    setup: (board) => {
      board
        .player(0, 0, 3)
        .snowball(0, 1, 2)
        .tile(0, 3, { triangle: 'tr' })
        .snowball(0, 3, 1)
        .snowball(1, 3, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 0, 1, 'player', 3);
      expectObject(level, 0, 2, 'snowball', 2);
      expectEmpty(level, 0, 3);
      expectEmpty(level, 1, 3);
      expectObject(level, 3, 3, 'snowball', 1);
      expectObject(level, 4, 3, 'snowball', 1);
      expect(hasImpact(result, 0), 'the handoff is an impact');
      expectFrame(
        result,
        0,
        'movement',
        (frame) => frame.objects[1][3]?.type === 'snowball' && frame.objects[2][3]?.type === 'snowball' && !frame.objects[0][3],
        'the triangle ball and the exit ball must roll on as one train on the same tick',
      );
    },
  }),
  defineScenario({
    name: 'B-001 the group runs straight into the triangle and around it: a mass-2 hit on ball + triangle ball + exit ball (mass 3) stops',
    width: 5,
    height: 5,
    setup: (board) => {
      board
        .player(0, 0, 3)
        .snowball(0, 1, 2)
        .snowball(0, 3, 1)
        .tile(0, 4, { triangle: 'tr' })
        .snowball(0, 4, 1)
        .snowball(1, 4, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 0, 2, 'snowball', 2);
      expectObject(level, 0, 3, 'snowball', 1);
      expectObject(level, 0, 4, 'snowball', 1);
      expectObject(level, 1, 4, 'snowball', 1);
      expectEmpty(level, 4, 4);
      expect(!hasImpact(result, 0), 'a heavier bent group takes no motion');
    },
  }),
  defineScenario({
    name: 'B-001 a snowman against the triangle exit stops the hit like a straight line (no impact)',
    width: 4,
    height: 4,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(0, 1, 1)
        .tile(0, 3, { triangle: 'tr' })
        .snowball(0, 3, 1)
        .snowman(1, 3, 1);
    },
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectObject(level, 0, 2, 'snowball', 1);
      expectObject(level, 0, 3, 'snowball', 1);
      expectObject(level, 1, 3, 'snowman', 1);
      expect(!hasImpact(result, 0), 'a group holding a non-ball is not stationary snow, so the train just stops');
    },
  }),

  // ===== B-002: a green button pressed for a moment during a roll counts =====
  defineScenario({
    name: 'B-002 scene 2: a ball rolling across the only green button clears while the player stands on the goal',
    width: 8,
    height: 6,
    setup: (board) => loadCode(board, SCENE_2),
    actions: ['right'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'cleared');
      expectObject(level, 3, 2, 'player', 2);
      // The map stops at the clear (B-027): the ball stays on the button.
      expectObject(level, 3, 5, 'snowball', 1);
      expectEmpty(level, 3, 7);
      expectFrame(
        result,
        0,
        'resolved',
        (frame) => frame.objects[3][5]?.type === 'snowball',
        'the clear comes from the tick with the ball on the green button',
      );
      const frames = result.turns[0].frames;
      expect(frames[frames.length - 1].phase === 'turn-end', 'the turn still ends with a turn-end frame');
    },
  }),
  defineScenario({
    name: 'B-002 a single ball crossing two green buttons never covers both at once and does not clear',
    width: 7,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .tile(0, 1, { isGoal: true })
        .snowball(0, 1, 1)
        .tile(0, 3, { isKeyTile: true })
        .tile(0, 4, { isKeyTile: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 1, 'player', 2);
      expectObject(result.level, 0, 6, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-002 a roll across a green button does not clear while another green button is uncovered in that tick',
    width: 7,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .tile(0, 1, { isGoal: true })
        .snowball(0, 1, 1)
        .tile(0, 3, { isKeyTile: true })
        .tile(1, 5, { isKeyTile: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 6, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-002 a two-ball train covering both green buttons in the same tick clears',
    width: 8,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 3)
        .tile(0, 1, { isGoal: true })
        .snowball(0, 1, 1)
        .snowball(0, 2, 1)
        .tile(0, 4, { isKeyTile: true })
        .tile(0, 5, { isKeyTile: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'cleared');
      expectObject(result.level, 0, 1, 'player', 3);
      expectObject(result.level, 0, 4, 'snowball', 1);
      expectObject(result.level, 0, 5, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-002 death in the same tick comes first: the press that opens the goal also opens a laser on the player',
    width: 6,
    height: 4,
    setup: (board) => {
      board
        .player(1, 0, 2)
        .tile(1, 1, { isGoal: true })
        .snowball(1, 1, 1)
        // One cell is both the green button and the only yellow button.
        .tile(1, 3, { isKeyTile: true, isYellowButton: true })
        .tile(2, 1, { isYellowWall: true })
        .laser(3, 1, 'up');
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'gameover');
      expectNoPlayer(result.level);
      expectObject(result.level, 1, 5, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-002 a cover melted by a beam on the green button in the same tick does not count',
    width: 6,
    height: 3,
    setup: (board) => {
      board
        .player(1, 0, 2)
        .tile(1, 1, { isGoal: true })
        .snowball(1, 1, 1)
        .tile(1, 3, { isKeyTile: true })
        .laser(2, 3, 'up');
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 1, 1, 'player', 2);
      expectEmpty(result.level, 1, 3);
      expectEmpty(result.level, 1, 4);
      expectEmpty(result.level, 1, 5);
    },
  }),
  defineScenario({
    name: 'B-027 the map stops at a clear during the roll, so the laser the ball would open never fires',
    width: 6,
    height: 4,
    setup: (board) => {
      board
        .player(1, 0, 2)
        .tile(1, 1, { isGoal: true })
        .snowball(1, 1, 1)
        .tile(1, 3, { isKeyTile: true })
        .tile(1, 4, { isYellowButton: true })
        .tile(2, 1, { isYellowWall: true })
        .laser(3, 1, 'up');
    },
    actions: ['right'],
    verify: (result) => {
      // The goal is satisfied one tick before the ball would reach the yellow button:
      // the turn is won there and the ball stops on the green button.
      expectStatus(result, 'cleared');
      expectObject(result.level, 1, 1, 'player', 2);
      expectObject(result.level, 1, 3, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'B-027 with no green button the goal is open from the first roll tick: the map stops there',
    width: 6,
    height: 4,
    setup: (board) => {
      // The last case's board with its green button taken out and the yellow button moved
      // onto that cell (the map code in bugs/B-027).
      board
        .player(1, 0, 2)
        .tile(1, 1, { isGoal: true })
        .snowball(1, 1, 1)
        .tile(1, 3, { isYellowButton: true })
        .tile(2, 1, { isYellowWall: true })
        .laser(3, 1, 'up');
    },
    actions: ['right'],
    verify: (result) => {
      // The tick clear applies to every map, not only to green-button maps (bugs/B-027).
      expectStatus(result, 'cleared');
      expectObject(result.level, 1, 1, 'player', 2);
      expectObject(result.level, 1, 2, 'snowball', 1);
    },
  }),

  // ===== B-003: the pushing player must also fit through the A→B boundary to build =====
  defineScenario({
    name: 'B-003 scene 3: P3 cannot build a size-3 snowman across a height-2 arch (unchanged no-op)',
    width: 3,
    height: 5,
    setup: (board) => loadCode(board, SCENE_3),
    actions: ['right', 'down'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 0, 1, 'player', 3);
      expectObject(level, 1, 1, 'snowball', 2);
      expectObject(level, 2, 1, 'snowball', 2);
      expectObject(level, 3, 1, 'block', 1);
      expect(result.turns[1].frames.length === 0, 'the build push must be a no-op');
    },
  }),
  defineScenario({
    name: 'B-003 scene 4: P2 cannot build a size-1 snowman across a height-1 arch it cannot pass itself',
    width: 8,
    height: 8,
    setup: (board) => loadCode(board, SCENE_4),
    actions: ['down'],
    verify: (result) => {
      const { level } = result;
      expectStatus(result, 'playing');
      expectObject(level, 2, 2, 'player', 2);
      expectObject(level, 3, 2, 'snowball', 1);
      expectObject(level, 4, 2, 'snowball', 1);
      expect(result.turns[0].frames.length === 0, 'the build push must be a no-op');
    },
  }),
  defineScenario({
    name: 'B-003 P1 builds a size-1 snowman across a height-1 arch',
    width: 1,
    height: 3,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .snowball(1, 0, 1)
        .snowball(2, 0, 1)
        .edgeArch(1, 0, 'down', 1);
    },
    actions: ['down'],
    verify: (result) => {
      expectObject(result.level, 1, 0, 'player', 1);
      expectObject(result.level, 2, 0, 'snowman', 1);
      expectEmpty(result.level, 0, 0);
    },
  }),
  defineScenario({
    name: 'B-003 P2 cannot build across the same height-1 arch',
    width: 1,
    height: 3,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(1, 0, 1)
        .snowball(2, 0, 1)
        .edgeArch(1, 0, 'down', 1);
    },
    actions: ['down'],
    verify: (result) => {
      expectObject(result.level, 0, 0, 'player', 2);
      expectObject(result.level, 1, 0, 'snowball', 1);
      expectObject(result.level, 2, 0, 'snowball', 1);
      expect(result.turns[0].frames.length === 0, 'a refused build is a no-op (no turn effects)');
    },
  }),
  defineScenario({
    name: 'B-003 P3 cannot build even a size-2 snowman across a height-2 arch',
    width: 1,
    height: 3,
    setup: (board) => {
      board
        .player(0, 0, 3)
        .snowball(1, 0, 1)
        .snowball(2, 0, 2)
        .edgeArch(1, 0, 'down', 2);
    },
    actions: ['down'],
    verify: (result) => {
      expectObject(result.level, 0, 0, 'player', 3);
      expectObject(result.level, 1, 0, 'snowball', 1);
      expectObject(result.level, 2, 0, 'snowball', 2);
    },
  }),
  defineScenario({
    name: 'B-003 P1 builds a size-1 snowman in a tunnel cell B (along its passage)',
    width: 1,
    height: 3,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .snowball(1, 0, 1)
        .tile(2, 0, { isRowArch: true }) // passage up/down, height ≤ 1
        .snowball(2, 0, 1);
    },
    actions: ['down'],
    verify: (result) => {
      expectObject(result.level, 1, 0, 'player', 1);
      expectObject(result.level, 2, 0, 'snowman', 1);
    },
  }),
  defineScenario({
    name: 'B-003 P2 cannot reach into a tunnel cell B to build there',
    width: 1,
    height: 3,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(1, 0, 1)
        .tile(2, 0, { isRowArch: true })
        .snowball(2, 0, 1);
    },
    actions: ['down'],
    verify: (result) => {
      expectObject(result.level, 0, 0, 'player', 2);
      expectObject(result.level, 1, 0, 'snowball', 1);
      expectObject(result.level, 2, 0, 'snowball', 1);
    },
  }),
];
