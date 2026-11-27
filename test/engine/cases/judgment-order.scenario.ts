import { cycleSoul, executeSkipTurn } from '../../../src/engine/turn';
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
 * goal still clears in that same turn (Q-14), judged on the board after the melt — a green
 * button whose cover melted away that turn no longer counts.
 * A snowman that shrank in the sun is already melting: a soul that enters it shrinks on the
 * next sunlit turn, with no one-turn sweat warning (user decision 2026-11-25).
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
    // The green button is held by a size-1 ball in the sun. The player dies in the beam; the
    // ball melts away; only then does the soul reach the snowman on the goal — locked now.
    name: 'a soul that reaches the goal snowman after the melt does not clear on a button whose cover melted away',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .laser(1, 1, 'up')
        .snowman(0, 3, 2).tile(0, 3, { isGoal: true })
        .snowball(1, 3, 1).tile(1, 3, { isKeyTile: true, isWarm: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 3, 'player', 2);
      expectEmpty(result.level, 1, 3);
    },
  }),
  defineScenario({
    // The player walks into the hole; the size-3 snowman in the sun melts to 2 as a snowman,
    // then takes the soul. It is already melting, so the next sunlit turn shrinks it at once.
    name: 'a soul that enters a snowman melting in the sun keeps melting: no sweat warning first',
    width: 5,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .tile(0, 1, { isHole: true })
        .snowman(0, 3, 3).tile(0, 3, { isWarm: true })
        .tile(1, 4, { isGoal: true });
    },
    actions: ['right', 'wait', 'wait'],
    verify: (result) => {
      const first = result.turns[0].level.objects[0][3];
      expect(first?.type === 'player' && first.size === 2 && first.isMelting === true, 'the new body is size 2 and already melting');
      const second = result.turns[1].level.objects[0][3];
      expect(second?.type === 'player' && second.size === 1, 'the next sunlit turn shrinks it at once');
      expectStatus(result, 'gameover');
      expectEmpty(result.level, 0, 3);
    },
  }),
  defineScenario({
    // Before any turn the sunlit snowman has not melted yet, so it is not melting: the soul
    // that enters it with M gets the usual sweat warning first.
    name: 'at the start a sunlit snowman has not melted yet: M into it gives the sweat warning first',
    width: 4,
    height: 1,
    setup: (board) => {
      board.level.soulSwapEnabled = true;
      board.player(0, 0, 2).snowman(0, 2, 2).tile(0, 2, { isWarm: true }).tile(0, 3, { isGoal: true });
    },
    actions: [],
    verify: (result) => {
      const cycled = cycleSoul(result.level)!;
      expectObject(cycled, 0, 2, 'player', 2);
      expect(!cycled.objects[0][2]!.isMelting, 'not melting yet');
      const after = executeSkipTurn(cycled).level;
      expectObject(after, 0, 2, 'player', 2);
      expect(after.objects[0][2]!.isMelting === true, 'the first sunlit turn only warns');
      expectObject(executeSkipTurn(after).level, 0, 2, 'player', 1);
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
  defineScenario({
    // P2 steps on the footplate (armed), then walks into the hole and dies; the soul goes to
    // the S1 at (1,3). The arming goes with the dead body, so the new body that steps on the
    // plate only arms it and fires one turn later (regression found 2026-11-28: the death
    // branch kept the old arming and the new body fired the moment it stepped on).
    name: 'a player that dies leaves the footplate unarmed: the next body on it waits its turn',
    width: 5,
    height: 3,
    setup: (board) => {
      board
        .snowman(0, 0, 1)
        .player(1, 1, 2)
        .tile(1, 2, { isSoulSwap: true })
        .snowman(1, 3, 1)
        .tile(2, 2, { isHole: true });
    },
    actions: ['right', 'down', 'left', 'wait'],
    verify: (result) => {
      const armed = (turn: number) => result.turns[turn].level.soulSwapArmedAt;
      expect(armed(0)?.row === 1 && armed(0)?.col === 2, 'stepping on the plate arms it');
      expect(!armed(1), 'the player died in the hole: the arming goes with the dead body');
      expectObject(result.turns[2].level, 1, 2, 'player', 1);
      expect(armed(2)?.row === 1 && armed(2)?.col === 2, 'the new body stepping on the plate only arms it');
      expectObject(result.level, 0, 0, 'player', 1);
      expectObject(result.level, 1, 2, 'snowman', 1);
    },
  }),
];
