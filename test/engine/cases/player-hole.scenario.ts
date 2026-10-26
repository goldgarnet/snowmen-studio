import {
  defineScenario,
  expect,
  expectEmpty,
  expectFrame,
  expectNoPlayer,
  expectObject,
  expectStatus,
  type ScenarioDefinition,
} from '../harness';

/**
 * Rule change (2026-10-26): the player may walk into a hole. The move is a valid turn;
 * the body falls in at the turn's hole step (soul footplate → portal → hole → orange
 * latch → laser → end of turn), so the soul jumps to the nearest snowman (distance →
 * age → reading order) BEFORE the end-of-turn melt, exactly as when a crack crumbles
 * beneath it or a laser hits it. No snowman left → game over. The hole stays a hole: it
 * does not cool, and it swallows the next body that walks in too.
 */
export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    name: 'a player who walks into a hole falls and the soul moves to the snowman nearest the hole, keeping its size',
    width: 4,
    height: 1,
    setup: (board) => {
      // From the hole (0,2) the right snowman is nearer; from the start cell (0,1) the
      // left one is. The left one is also older, so age must not outrank distance.
      board
        .snowman(0, 0, 1)
        .player(0, 1, 2)
        .tile(0, 2, { isHole: true })
        .object(0, 3, 'snowman', 3, { createdAt: 3 });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectFrame(
        result,
        0,
        'movement',
        (level) => level.objects[0][2]?.type === 'player',
        'the move into the hole must be a valid move that first puts the player on the hole',
      );
      expectEmpty(result.level, 0, 2);
      expect(!!result.level.tiles[0][2].isHole, 'the hole must stay a hole');
      expectObject(result.level, 0, 3, 'player', 3);
      expectObject(result.level, 0, 0, 'snowman', 1);
    },
  }),
  defineScenario({
    name: 'a player who walks into a hole with no snowman left is game over',
    width: 4,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isHole: true })
        .snowball(0, 3, 2);
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'gameover');
      expectNoPlayer(result.level);
      expectEmpty(result.level, 0, 1);
      expect(!!result.level.tiles[0][1].isHole, 'the hole must stay a hole');
      // A snowball is not a body the soul can take.
      expectObject(result.level, 0, 3, 'snowball', 2);
    },
  }),
  defineScenario({
    name: 'the soul of a player who walks into a hole lands in a snowman on the goal and clears the level (Q-14)',
    width: 4,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isHole: true })
        .snowman(0, 3, 2)
        .tile(0, 3, { isGoal: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'cleared');
      expectEmpty(result.level, 0, 1);
      expectObject(result.level, 0, 3, 'player', 2);
    },
  }),
  defineScenario({
    name: 'a sunlit snowman that takes the soul of a player who walked into a hole only starts melting that turn',
    width: 6,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isHole: true })
        .snowman(0, 3, 2)
        .tile(0, 3, { isWarm: true })
        // Control: a snowman left in the same sun shrinks at once.
        .snowman(0, 5, 2)
        .tile(0, 5, { isWarm: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectFrame(
        result,
        0,
        'resolved',
        (level) => level.objects[0][3]?.type === 'player' && level.objects[0][3]?.size === 2,
        'the soul must move at the hole step, before the end-of-turn melt',
      );
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 3, 'player', 2);
      expect(result.level.objects[0][3]?.isMelting === true, 'the new body must only get the melting warning this turn');
      expectObject(result.level, 0, 5, 'snowman', 1);
    },
  }),
  defineScenario({
    name: 'a hole the player fell into stays an uncooled hole and swallows the next body that walks in',
    width: 5,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .tile(0, 1, { isHole: true, isWarm: true })
        .snowman(0, 2, 1)
        .snowman(0, 4, 3);
    },
    actions: ['right', 'left'],
    verify: (result) => {
      const afterFirstFall = result.turns[0].level;
      expectObject(afterFirstFall, 0, 2, 'player', 1);
      expect(!!afterFirstFall.tiles[0][1].isHole, 'the hole must stay a hole after the first fall');
      expectStatus(result, 'playing');
      expectEmpty(result.level, 0, 1);
      expectEmpty(result.level, 0, 2);
      expectObject(result.level, 0, 4, 'player', 3);
      expect(!!result.level.tiles[0][1].isHole, 'the hole must stay a hole after the second fall');
      expect(!!result.level.tiles[0][1].isWarm, 'a body falling in must not cool the hole tile');
    },
  }),
  defineScenario({
    name: 'equidistant snowmen: the soul of a player who walked into a hole goes to the older one',
    width: 3,
    height: 3,
    setup: (board) => {
      // Both are √2 from the hole; (0,2) comes first in reading order but is younger.
      board
        .player(1, 0, 1)
        .tile(1, 1, { isHole: true })
        .object(0, 2, 'snowman', 1, { createdAt: 5 })
        .object(2, 0, 'snowman', 2, { createdAt: 2 });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 2, 0, 'player', 2);
      expectObject(result.level, 0, 2, 'snowman', 1);
    },
  }),
  defineScenario({
    name: 'equidistant snowmen of the same age: the soul goes to the first one in reading order',
    width: 3,
    height: 3,
    setup: (board) => {
      // Row-major reading order puts (0,2) before (2,0); a column-major scan would not.
      board
        .player(1, 0, 1)
        .tile(1, 1, { isHole: true })
        .snowman(0, 2, 1)
        .snowman(2, 0, 2);
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 2, 'player', 1);
      expectObject(result.level, 2, 0, 'snowman', 2);
    },
  }),
];
