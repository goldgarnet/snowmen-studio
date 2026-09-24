import {
  defineScenario,
  expect,
  expectEmpty,
  expectNoPlayer,
  expectObject,
  expectStatus,
  type ScenarioDefinition,
} from '../harness';
import { orangeWallsSolid, yellowWallsSolid } from '../../../src/engine/helpers';

/**
 * Portable behavioral specifications for a second implementation of the game.
 * Each board is intentionally small and isolates one rule. Coordinates are
 * zero-based (row, col), and actions run in order through the normal turn loop.
 */
export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    name: 'P1 crushes a size-1 snowball against a wall into a flake',
    width: 4,
    height: 1,
    setup: (board) => {
      board
        .object(0, 0, 'wall', 100)
        .snowball(0, 1, 1)
        .player(0, 2, 1);
    },
    actions: ['left'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectEmpty(result.level, 0, 1);
      expect(result.level.tiles[0][1].isFlake, 'the crushed ball must leave a flake');
      expectObject(result.level, 0, 2, 'player', 1);
    },
  }),
  defineScenario({
    name: 'P2 rolls a size-1 snowball, consuming a flake and capping it at size 2',
    width: 6,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(0, 1, 1)
        .tile(0, 2, { isFlake: true })
        .object(0, 5, 'wall', 100);
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 1, 'player', 2);
      expectObject(result.level, 0, 4, 'snowball', 2);
      expect(!result.level.tiles[0][2].isFlake, 'the rolling ball must consume the flake');
    },
  }),
  defineScenario({
    name: 'P3 moves a three-object size-1 chain when the laser has escape space',
    width: 5,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 3)
        .snowball(0, 1, 1)
        .object(0, 2, 'block', 1)
        .laser(0, 3, 'right');
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 1, 'player', 3);
      expectObject(result.level, 0, 2, 'snowball', 1);
      expectObject(result.level, 0, 3, 'block', 1);
      expectObject(result.level, 0, 4, 'laser', 1);
    },
  }),
  defineScenario({
    name: 'P2 splits a size-2 ball from a yellow button while the wall stays open for both halves',
    width: 3,
    height: 2,
    setup: (board) => {
      board
        .tile(0, 0, { isYellowWall: true })
        .tile(0, 1, { isYellowButton: true })
        .snowball(0, 1, 2)
        .player(1, 1, 2);
    },
    actions: ['up'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 0, 'snowball', 1);
      expectEmpty(result.level, 0, 1);
      expectObject(result.level, 0, 2, 'snowball', 1);
      expect(yellowWallsSolid(result.level), 'the wall must close after the split releases the button');
    },
  }),
  defineScenario({
    name: 'a laser kills a player who steps onto a goal before the goal can clear',
    width: 3,
    height: 1,
    setup: (board) => {
      board
        .laser(0, 0, 'right')
        .player(0, 1, 1)
        .tile(0, 2, { isGoal: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'gameover');
      expectNoPlayer(result.level);
    },
  }),
  defineScenario({
    name: 'a block shields a player from a laser beam',
    width: 4,
    height: 1,
    setup: (board) => {
      board
        .laser(0, 0, 'right')
        .object(0, 1, 'block', 1)
        .player(0, 2, 1);
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 3, 'player', 1);
    },
  }),
  defineScenario({
    name: 'a yellow wall closes around a player after the only button is released',
    width: 3,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isYellowButton: true })
        .tile(0, 2, { isYellowWall: true });
    },
    actions: ['right', 'right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 2, 'player', 1);
      expect(yellowWallsSolid(result.level), 'the yellow wall must re-solidify after the player leaves its button');
    },
  }),
  defineScenario({
    name: 'an orange wall remains open after its button has been latched once',
    width: 3,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isOrangeButton: true })
        .tile(0, 2, { isOrangeWall: true });
    },
    actions: ['right', 'right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 2, 'player', 1);
      expect(result.level.tiles[0][1].orangePressed === true, 'the orange button must latch when first covered');
      expect(!orangeWallsSolid(result.level), 'the orange wall must remain open after the player leaves');
    },
  }),
  defineScenario({
    name: 'an object entering one portal relocates once to the paired portal',
    width: 4,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isPortal: true })
        .tile(0, 3, { isPortal: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectEmpty(result.level, 0, 1);
      expectObject(result.level, 0, 3, 'player', 1);
    },
  }),
  defineScenario({
    name: 'a rolling snowball falls into a hole while the player remains behind',
    width: 4,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(0, 1, 1)
        .tile(0, 2, { isHole: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 1, 'player', 2);
      expectEmpty(result.level, 0, 2);
    },
  }),
  defineScenario({
    name: 'a cracked tile arms on entry then crumbles beneath a waiting player next turn',
    width: 2,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isCrack: true });
    },
    actions: ['right', 'wait'],
    verify: (result) => {
      expectStatus(result, 'gameover');
      expectNoPlayer(result.level);
      expect(result.level.tiles[0][1].isHole, 'the armed crack must turn into a hole on the following turn');
    },
  }),
  defineScenario({
    name: 'a covered green key activates a goal for the arriving player',
    width: 3,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isGoal: true })
        .tile(0, 2, { isKeyTile: true })
        .snowball(0, 2, 1);
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'cleared');
      expectObject(result.level, 0, 1, 'player', 1);
    },
  }),
  defineScenario({
    name: 'a soul footplate transfers the soul to the nearest snowman after one turn of delay',
    width: 4,
    height: 1,
    setup: (board) => {
      board.level.soulSwapEnabled = true;
      board
        .player(0, 0, 1)
        .tile(0, 1, { isSoulSwap: true })
        .snowman(0, 3, 2);
    },
    actions: ['right', 'wait'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 1, 'snowman', 1);
      expectObject(result.level, 0, 3, 'player', 2);
    },
  }),
  defineScenario({
    name: 'a lone rolling snowball reflects from the open face of a triangle tile',
    width: 3,
    height: 3,
    setup: (board) => {
      board
        .player(1, 0, 2)
        .snowball(1, 1, 1)
        .tile(1, 2, { triangle: 'br' });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 1, 1, 'player', 2);
      expectObject(result.level, 0, 2, 'snowball', 1);
    },
  }),
];
