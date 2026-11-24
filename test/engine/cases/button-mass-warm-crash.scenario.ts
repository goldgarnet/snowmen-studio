import type { Level } from '../../../src/types';
import { isButtonPressed, yellowWallsSolid } from '../../../src/engine/helpers';
import { isGoalActive } from '../../../src/engine/turn';
import { createLevel } from '../../../src/utils/level';
import { decodeLevelCode, encodeLevelCode, readLevelCodeTileFlags } from '../../../src/utils/levelCode';
import {
  defineScenario,
  expect,
  expectEmpty,
  expectObject,
  expectStatus,
  type ScenarioDefinition,
} from '../harness';

/**
 * 2026-11-13 team decisions (mechanic changes):
 *  1. Every green/yellow button shows a required mass (1–3). A button counts as pressed
 *     only while the object on it has mass ≥ that value. Mass = size: snowball 1·2,
 *     snowman/player 1·2·3, block/laser 1. Buttons from older maps need 1.
 *  2. A size-1 snowball crushed on a WARM cell leaves no flake and the cell turns cold at
 *     once, in sun or shade. On a cold cell it still leaves a flake. (Until the user's
 *     decision of 2026-11-25 a shaded warm cell kept the flake and stayed warm until the
 *     shade left — 정은후 2026-11-13.)
 */

function codeLevel(setup: (level: Level) => void): Level {
  const level = createLevel(5, 2);
  setup(level);
  return level;
}

export const scenarios: ScenarioDefinition[] = [
  // ---------------------------------------------------------------- 따뜻한 칸 부서짐
  defineScenario({
    name: 'a size-1 snowball crushed on a warm cell in the sun leaves no flake; the cell turns cold',
    width: 4,
    height: 1,
    setup: (board) => {
      board.player(0, 0, 1).snowball(0, 1, 1).tile(0, 1, { isWarm: true }).object(0, 2, 'wall', 100);
    },
    actions: ['right'],
    verify: (result) => {
      expectEmpty(result.level, 0, 1);
      expect(!result.level.tiles[0][1].isFlake, 'no flake may be made on a warm cell');
      expect(!result.level.tiles[0][1].isWarm, 'the warm cell must turn cold');
      expectObject(result.level, 0, 0, 'player', 1);
      for (const frame of result.turns[0].frames) {
        const cell = frame.level.tiles[0][1];
        expect(!cell.isFlake && !cell.isWarm, `${frame.phase}: the cell is cold from the crush on, never a flake`);
      }
    },
  }),
  defineScenario({
    // Sun from the left, so a block casts its shadow one cell to the right.
    name: 'crushed on a shaded warm cell: no flake either, the cell turns cold at once',
    width: 3,
    height: 2,
    setup: (board) => {
      board.level.hasShadow = true;
      board.object(0, 0, 'block', 1).snowball(0, 1, 1).tile(0, 1, { isWarm: true }).player(1, 1, 1);
    },
    actions: ['up'],
    verify: (result) => {
      const cell = result.level.tiles[0][1];
      expectEmpty(result.level, 0, 1);
      expect(!!cell.isShade, 'the cell is in the block\'s shadow');
      expect(!cell.isFlake, 'a shaded warm cell gets no flake');
      expect(!cell.isWarm, 'the shaded warm cell turns cold');
      for (const frame of result.turns[0].frames) {
        const shown = frame.level.tiles[0][1];
        expect(!shown.isFlake && !shown.isWarm, `${frame.phase}: the cell is cold from the crush on, never a flake`);
      }
    },
  }),
  defineScenario({
    name: 'after a crush in shade the cell stays cold with no flake when the shade leaves',
    width: 3,
    height: 3,
    setup: (board) => {
      board.level.hasShadow = true;
      board
        .object(0, 1, 'wall', 100)
        .object(1, 0, 'block', 1)
        .snowball(1, 1, 1).tile(1, 1, { isWarm: true })
        .player(2, 1, 1);
    },
    // crush the ball against the wall, step left, push the block (its shadow) away
    actions: ['up', 'left', 'up'],
    verify: (result) => {
      for (const i of [0, 1]) {
        const cell = result.turns[i].level.tiles[1][1];
        expect(!!cell.isShade, `turn ${i + 1}: the cell is still in the block's shadow`);
        expect(!cell.isFlake && !cell.isWarm, `turn ${i + 1}: shaded, yet already a cold cell with no flake`);
      }
      expectObject(result.level, 0, 0, 'block', 1);
      const cell = result.level.tiles[1][1];
      expect(!cell.isShade, 'the shade has left the cell');
      expect(!cell.isFlake && !cell.isWarm, 'still a cold cell with no flake');
    },
  }),
  defineScenario({
    name: 'nothing to eat after a crush in shade: the player stepping onto the cell keeps its size',
    width: 3,
    height: 3,
    setup: (board) => {
      board.level.hasShadow = true;
      board
        .object(0, 1, 'wall', 100)
        .object(1, 0, 'block', 1)
        .snowball(1, 1, 1).tile(1, 1, { isWarm: true })
        .player(2, 1, 1);
    },
    actions: ['up', 'up'],
    verify: (result) => {
      expectObject(result.level, 1, 1, 'player', 1);
      const cell = result.level.tiles[1][1];
      expect(!cell.isFlake && !cell.isWarm, 'the cell is cold with no flake');
    },
  }),
  defineScenario({
    // The size-2 ball shades the crushed cell, then melts down in the sun and the shade
    // leaves; the crushed cell was already cold, so the P3 standing on it never melts.
    name: 'an object standing on the cell cooled by a crush in shade does not melt when the shade leaves',
    width: 3,
    height: 3,
    setup: (board) => {
      board.level.hasShadow = true;
      board
        .object(0, 1, 'wall', 100)
        .snowball(1, 0, 2).tile(1, 0, { isWarm: true })
        .snowball(1, 1, 1).tile(1, 1, { isWarm: true })
        .player(2, 1, 3);
    },
    actions: ['up', 'up', 'wait'],
    verify: (result) => {
      const afterCrush = result.turns[0].level.tiles[1][1];
      expect(!afterCrush.isFlake && !afterCrush.isWarm, 'the crush left a cold cell with no flake');
      expect(!result.level.tiles[1][1].isShade, 'the shade has left the cell');
      expectObject(result.level, 1, 1, 'player', 3);
      expect(!result.level.objects[1][1]!.isMelting, 'the P3 on it never started melting');
    },
  }),
  defineScenario({
    name: 'a size-1 snowball crushed on a cold cell still leaves a flake',
    width: 4,
    height: 1,
    setup: (board) => {
      board.player(0, 0, 1).snowball(0, 1, 1).object(0, 2, 'wall', 100);
    },
    actions: ['right'],
    verify: (result) => {
      expectEmpty(result.level, 0, 1);
      expect(!!result.level.tiles[0][1].isFlake, 'a cold cell keeps the flake');
      expect(!result.level.tiles[0][1].isWarm, 'the cell stays cold');
    },
  }),

  // ---------------------------------------------------------------- 초록 버튼 요구 질량
  defineScenario({
    name: 'a green button that needs mass 2 ignores a size-1 snowball: the goal stays locked',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .tile(0, 0, { isKeyTile: true, buttonMass: 2 })
        .snowball(0, 0, 1)
        .player(1, 0, 1)
        .tile(1, 1, { isGoal: true });
    },
    actions: ['right'],
    verify: (result) => {
      expect(!isButtonPressed(result.level, 0, 0), 'a size-1 snowball must not press a mass-2 button');
      expect(!isGoalActive(result.level), 'the goal must stay locked');
      expectStatus(result, 'playing');
    },
  }),
  defineScenario({
    name: 'a size-2 snowball presses a mass-2 green button: the player clears',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .tile(0, 0, { isKeyTile: true, buttonMass: 2 })
        .snowball(0, 0, 2)
        .player(1, 0, 1)
        .tile(1, 1, { isGoal: true });
    },
    actions: ['right'],
    verify: (result) => {
      expect(isButtonPressed(result.level, 0, 0), 'a size-2 snowball presses a mass-2 button');
      expectStatus(result, 'cleared');
    },
  }),
  defineScenario({
    name: 'a green button that needs mass 3 is pressed only by a size-3 snowman',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .tile(0, 0, { isKeyTile: true, buttonMass: 3 })
        .snowman(0, 0, 3)
        .tile(0, 2, { isKeyTile: true, buttonMass: 3 })
        .snowman(0, 2, 2)
        .player(1, 0, 1)
        .tile(1, 1, { isGoal: true });
    },
    actions: ['right'],
    verify: (result) => {
      expect(isButtonPressed(result.level, 0, 0), 'a size-3 snowman presses a mass-3 button');
      expect(!isButtonPressed(result.level, 0, 2), 'a size-2 snowman does not');
      expectStatus(result, 'playing');
    },
  }),
  defineScenario({
    name: 'buttons without a required mass need 1, as before: a block presses them',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .tile(0, 0, { isKeyTile: true })
        .object(0, 0, 'block', 1)
        .player(1, 0, 1)
        .tile(1, 1, { isGoal: true });
    },
    actions: ['right'],
    verify: (result) => {
      expect(isButtonPressed(result.level, 0, 0), 'a block (mass 1) presses a mass-1 button');
      expectStatus(result, 'cleared');
    },
  }),

  // ---------------------------------------------------------------- 노랑 버튼 요구 질량
  defineScenario({
    name: 'a mass-2 yellow button opens the walls under a size-2 player, not under a size-1 player',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .tile(0, 1, { isYellowButton: true, buttonMass: 2 })
        .tile(1, 3, { isYellowWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      expect(yellowWallsSolid(result.initialLevel), 'the walls start closed');
      expectObject(result.level, 0, 1, 'player', 2);
      expect(!yellowWallsSolid(result.level), 'a size-2 player on a mass-2 button opens the walls');
    },
  }),
  defineScenario({
    name: 'a size-1 player on a mass-2 yellow button keeps the walls closed',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isYellowButton: true, buttonMass: 2 })
        .tile(1, 3, { isYellowWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 0, 1, 'player', 1);
      expect(yellowWallsSolid(result.level), 'mass 1 on a mass-2 button must not open the walls');
    },
  }),
  defineScenario({
    name: 'a closed mass-2 yellow wall still blocks the player who stands on a mass-1-only button set',
    width: 5,
    height: 1,
    setup: (board) => {
      // Two yellow buttons: (0,1) needs 1, (0,3) needs 2 and holds a block (mass 1).
      board
        .player(0, 0, 1)
        .tile(0, 1, { isYellowButton: true })
        .tile(0, 3, { isYellowButton: true, buttonMass: 2 })
        .object(0, 3, 'block', 1)
        .tile(0, 2, { isYellowWall: true });
    },
    actions: ['right', 'right'],
    verify: (result) => {
      expectObject(result.level, 0, 1, 'player', 1);
      expect(yellowWallsSolid(result.level), 'every yellow button must be pressed — the block is too light');
      expectEmpty(result.level, 0, 2);
    },
  }),

  // ---------------------------------------------------------------- 맵 코드
  defineScenario({
    name: 'map code: button masses round-trip; mass-1 buttons stay byte-identical',
    width: 1,
    height: 1,
    setup: () => {},
    actions: [],
    verify: () => {
      const plain = codeLevel((lv) => {
        lv.tiles[0][0].isKeyTile = true;
        lv.tiles[0][1].isYellowButton = true;
        lv.tiles[1][4].isYellowWall = true;
        lv.objects[1][0] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
      });
      const plainCode = encodeLevelCode(plain);
      const plainBack = decodeLevelCode(plainCode)!;
      expect(plainBack.tiles[0][0].buttonMass === undefined && plainBack.tiles[0][1].buttonMass === undefined,
        'mass-1 buttons carry no mass field');
      expect(readLevelCodeTileFlags(plainCode)!.length === 0, 'a mass-1 map writes no extension section');

      // Writing mass 1 explicitly changes nothing.
      const explicitOne = codeLevel((lv) => {
        Object.assign(lv.tiles[0][0], { isKeyTile: true, buttonMass: 1 });
        Object.assign(lv.tiles[0][1], { isYellowButton: true, buttonMass: 1 });
        lv.tiles[1][4].isYellowWall = true;
        lv.objects[1][0] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
      });
      expect(encodeLevelCode(explicitOne) === plainCode, 'mass 1 encodes exactly like a button without mass');

      const heavy = codeLevel((lv) => {
        Object.assign(lv.tiles[0][0], { isKeyTile: true, buttonMass: 3 });
        Object.assign(lv.tiles[0][1], { isYellowButton: true, buttonMass: 2 });
        lv.tiles[1][4].isYellowWall = true;
        lv.tiles[0][3].buttonMass = 3;   // not a button: must not be saved
        lv.objects[1][0] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
      });
      const heavyCode = encodeLevelCode(heavy);
      expect(heavyCode !== plainCode, 'masses change the code');
      const back = decodeLevelCode(heavyCode)!;
      expect(back.tiles[0][0].buttonMass === 3, `green mass 3 round-trips (got ${back.tiles[0][0].buttonMass})`);
      expect(back.tiles[0][1].buttonMass === 2, `yellow mass 2 round-trips (got ${back.tiles[0][1].buttonMass})`);
      expect(back.tiles[0][3].buttonMass === undefined, 'a mass on a non-button cell is dropped');
      expect(encodeLevelCode(back) === heavyCode, 'decode → encode is stable');
    },
  }),
  defineScenario({
    name: 'map code: button masses live after holes, triangle blocks and void cells',
    width: 1,
    height: 1,
    setup: () => {},
    actions: [],
    verify: () => {
      const level = codeLevel((lv) => {
        lv.tiles[0][2].isHole = true;
        lv.tiles[1][1].isCrack = true;
        lv.tiles[1][4] = { ...lv.tiles[1][4], isVoid: true };
        lv.objects[1][2] = { type: 'block', size: 1, isMelting: false, createdAt: 0, triangleCorner: 'br' };
        Object.assign(lv.tiles[0][4], { isKeyTile: true, buttonMass: 2 });
        lv.objects[0][0] = { type: 'player', size: 1, isMelting: false, createdAt: 0 };
      });
      const code = encodeLevelCode(level);
      const back = decodeLevelCode(code)!;
      expect(!!back.tiles[0][2].isHole && !!back.tiles[1][1].isCrack, 'hole and crack survive');
      expect(!!back.tiles[1][4].isVoid, 'void survives');
      expect(back.objects[1][2]?.triangleCorner === 'br', 'triangle block survives');
      expect(back.tiles[0][4].buttonMass === 2, 'button mass survives after the other sections');
      expect(readLevelCodeTileFlags(code)!.length === 2, 'the tile-flag list still reads the hole and crack');
    },
  }),
];
