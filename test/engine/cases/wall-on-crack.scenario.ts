import {
  defineScenario,
  expect,
  expectEmpty,
  expectObject,
  type ScenarioDefinition,
} from '../harness';

/**
 * A wall stays where it stands, even on a crack or a hole (user decision 2026-11-28): it does
 * not arm the crack under it and it never falls. A tree (like a box or a laser) still arms a
 * crack and falls in when the crack collapses two turns later.
 */
export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    name: 'a wall on a crack stays, and the crack under it never arms',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .object(0, 2, 'wall', 100).tile(0, 2, { isCrack: true })
        .snowman(1, 3, 1);
    },
    actions: ['wait', 'wait', 'wait'],
    verify: (result) => {
      expectObject(result.level, 0, 2, 'wall');
      const tile = result.level.tiles[0][2];
      expect(!!tile.isCrack && !tile.crackArmed && !tile.isHole, 'the crack under the wall stays a plain crack');
    },
  }),
  defineScenario({
    name: 'a tree on a crack still arms it and falls in when it collapses',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .object(0, 2, 'tree', 100, { treeHeight: 1 }).tile(0, 2, { isCrack: true })
        .snowman(1, 3, 1);
    },
    actions: ['wait', 'wait'],
    verify: (result) => {
      expect(!!result.turns[0].level.tiles[0][2].crackArmed, 'the tree arms the crack at the end of the first turn');
      expectEmpty(result.level, 0, 2);
      expect(!!result.level.tiles[0][2].isHole, 'the crack collapsed and the tree fell in');
    },
  }),
  defineScenario({
    name: 'a wall on a hole stays',
    width: 3,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .object(0, 2, 'wall', 100).tile(0, 2, { isHole: true });
    },
    actions: ['wait'],
    verify: (result) => {
      expectObject(result.level, 0, 2, 'wall');
      expect(!!result.level.tiles[0][2].isHole, 'the hole is still there under the wall');
    },
  }),
];
