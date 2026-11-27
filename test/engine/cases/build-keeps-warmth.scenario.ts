import {
  defineScenario,
  expect,
  expectEmpty,
  expectObject,
  type ScenarioDefinition,
} from '../harness';

/**
 * Building a snowman leaves the cell's warmth alone (user decision 2026-11-28). Until then
 * the build turned B's cell cold — and two split halves compacting into a size-1 snowman
 * cooled their cell too — so a snowman built on a warm cell in shade stayed safe after the
 * shade left, and one built in the sun never melted (an unintended way through maps).
 */
export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    // The reported case: a size-2 ball on a warm cell in shade. Sun from the left: P2 pushes
    // the size-1 ball onto it (the wall backs it), and P2 then stands at (0,1) and shades
    // (0,2). When P2 steps away the new snowman is in the sun and melts.
    name: 'a snowman built on a warm cell in shade keeps the cell warm and melts once the shade leaves',
    width: 4,
    height: 2,
    setup: (board) => {
      board.level.hasShadow = true;
      board
        .player(0, 0, 2)
        .snowball(0, 1, 1)
        .snowball(0, 2, 2).tile(0, 2, { isWarm: true })
        .object(0, 3, 'wall', 100);
    },
    actions: ['right', 'down'],
    verify: (result) => {
      const built = result.turns[0].level;
      expectObject(built, 0, 2, 'snowman', 2);
      expect(!!built.tiles[0][2].isShade, 'the new snowman stands in the player\'s shadow');
      expect(!!built.tiles[0][2].isWarm, 'the build does not cool the warm cell');
      expectObject(result.level, 0, 2, 'snowman', 1);
      expect(!result.level.tiles[0][2].isShade, 'the player stepped away: the sun reaches it');
      expect(!!result.level.tiles[0][2].isWarm, 'it only shrank, so the cell stays warm');
    },
  }),
  defineScenario({
    name: 'a snowman built on a warm cell in the sun melts there at the end of the turn',
    width: 4,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(0, 1, 1)
        .snowball(0, 2, 2).tile(0, 2, { isWarm: true })
        .object(0, 3, 'wall', 100);
    },
    actions: ['right'],
    verify: (result) => {
      const built = result.turns[0].frames.find(f => f.phase === 'movement')!.level;
      expectObject(built, 0, 2, 'snowman', 2);
      expect(!!built.tiles[0][2].isWarm, 'right after the build the cell is still warm');
      expectObject(result.level, 0, 2, 'snowman', 1);
      expect(!!result.level.tiles[0][2].isWarm, 'it only shrank, so the cell stays warm');
      expect(result.level.objects[0][2]!.isMelting === true, 'a snowman shrinking in the sun is already melting');
    },
  }),
  defineScenario({
    // Both sides of the split are walled in, so the halves compact into a size-1 snowman on
    // the warm cell — which then melts away in the sun like any snowman.
    name: 'split halves that compact into a size-1 snowman leave the warm cell warm',
    width: 3,
    height: 3,
    setup: (board) => {
      board
        .object(0, 1, 'wall', 100)
        .object(2, 1, 'wall', 100)
        .object(1, 2, 'wall', 100)
        .snowball(1, 1, 2).tile(1, 1, { isWarm: true })
        .player(1, 0, 2);
    },
    actions: ['right'],
    verify: (result) => {
      const compacted = result.turns[0].frames.find(f => f.phase === 'movement')!.level;
      expectObject(compacted, 1, 1, 'snowman', 1);
      expect(!!compacted.tiles[1][1].isWarm, 'the compaction does not cool the warm cell');
      expectEmpty(result.level, 1, 1);
      expect(!result.level.tiles[1][1].isWarm, 'it melted away in the sun, and only that cools the cell');
    },
  }),
];
