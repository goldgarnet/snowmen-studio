import {
  defineScenario,
  expect,
  expectEmpty,
  expectObject,
  type ScenarioDefinition,
} from '../harness';

export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    // A raised yellow wall no longer shades its own cell: the sun still gets in, so a
    // snowball trapped on a warm tile inside it melts. (An orange wall still shades.)
    name: 'a raised yellow wall does not shade its cell, a raised orange wall still does',
    width: 6,
    height: 1,
    setup: (board) => {
      board.level.hasShadow = true;
      board
        .player(0, 0, 1)
        .tile(0, 3, { isYellowWall: true, isWarm: true })
        .snowball(0, 3, 2)
        .tile(0, 5, { isOrangeWall: true, isWarm: true })
        .snowball(0, 5, 2);
    },
    actions: ['wait'],
    verify: (result) => {
      expect(!result.level.tiles[0][3].isShade, 'the raised yellow wall cell must not be shaded');
      expectObject(result.level, 0, 3, 'snowball', 1);
      expect(!!result.level.tiles[0][5].isShade, 'the raised orange wall cell must stay shaded');
      expectObject(result.level, 0, 5, 'snowball', 2);
    },
  }),
  defineScenario({
    // A small snowball pushed onto a warm crack melts away at the end of the same turn.
    // The crack must still be armed (it was stepped on) and crumble on the next turn.
    name: 'a small snowball that melts on a warm crack still arms the crack',
    width: 4,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .snowball(0, 1, 1)
        .tile(0, 2, { isCrack: true, isWarm: true });
    },
    actions: ['right', 'wait'],
    verify: (result) => {
      const afterPush = result.turns[0].level;
      expectEmpty(afterPush, 0, 2);
      expect(!!afterPush.tiles[0][2].isCrack && !!afterPush.tiles[0][2].crackArmed,
        'the crack under the melted snowball must be armed this turn');
      expect(!!result.level.tiles[0][2].isHole, 'the armed crack must crumble into a hole on the next turn');
    },
  }),
];
