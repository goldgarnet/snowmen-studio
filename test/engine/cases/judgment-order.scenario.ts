import {
  defineScenario,
  expect,
  expectEmpty,
  expectObject,
  expectStatus,
  type ScenarioDefinition,
} from '../harness';

/**
 * Judgment order of a turn (user decision 2026-11-25):
 *   즉사 판정 (holes → lasers) → 클리어 판정 → 이동 판정 (every object until it stops,
 *   with buttons and cracks) → 따뜻한 칸 판정 → 즉사 재판정 → 영혼 이동 처리.
 * The soul moves last — after melting — whether the player died or stays on an armed soul
 * footplate. Until then the soul moved the moment the body died (before the melt) and the
 * footplate fired before the melt. A soul that lands on a snowman standing on an active
 * goal still clears in that same turn (Q-14).
 */
export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    // The laser at (1,1) fires up through (0,1). The nearest snowman stands in the sun at
    // size 1: it melts away before the soul moves, so the soul takes the farther one.
    name: 'a player killed by a laser hands its soul on after the melt: a nearest snowman that melts away is skipped',
    width: 5,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .laser(1, 1, 'up')
        .snowman(0, 3, 1).tile(0, 3, { isWarm: true })
        .snowman(0, 4, 2);
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectEmpty(result.level, 0, 1);
      expectEmpty(result.level, 0, 3);
      expect(!result.level.tiles[0][3].isWarm, 'the snowman melted away and cooled its cell');
      expectObject(result.level, 0, 4, 'player', 2);
    },
  }),
  defineScenario({
    name: 'with no snowman left after the melt, a dead player is game over',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .laser(1, 1, 'up')
        .snowman(0, 3, 1).tile(0, 3, { isWarm: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'gameover');
      expectEmpty(result.level, 0, 3);
    },
  }),
  defineScenario({
    name: 'a soul that moves last onto a snowman on the active goal still clears that turn (Q-14)',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .laser(1, 1, 'up')
        .snowman(0, 3, 2).tile(0, 3, { isGoal: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'cleared');
      expectObject(result.level, 0, 3, 'player', 2);
    },
  }),
  defineScenario({
    // Both bodies stand in the sun. The player body only gets its melting warning; the
    // snowman shrinks at once. Then the armed footplate swaps them.
    name: 'an armed soul footplate fires after the melt: each body melted as what it was before the swap',
    width: 3,
    height: 1,
    setup: (board) => {
      board
        .player(0, 1, 2).tile(0, 1, { isSoulSwap: true, isWarm: true })
        .snowman(0, 2, 2).tile(0, 2, { isWarm: true });
      board.level.soulSwapArmedAt = { row: 0, col: 1 };
    },
    actions: ['wait'],
    verify: (result) => {
      expectObject(result.level, 0, 1, 'snowman', 2);
      expect(result.level.objects[0][1]!.isMelting === true, 'the old body keeps the warning it got as the player');
      expectObject(result.level, 0, 2, 'player', 1);
      expect(!result.level.soulSwapArmedAt, 'the plate is spent');
    },
  }),
];
