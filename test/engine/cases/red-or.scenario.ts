import type { Direction, Level } from '../../../src/types';
import { isButtonPressed, isClosedPartition, redWallsSolid, yellowWallsSolid } from '../../../src/engine/helpers';
import { cycleSoul, executeTurn, isGoalActive } from '../../../src/engine/turn';
import { newGameState } from '../../../src/utils/game';
import { createLevel } from '../../../src/utils/level';
import { decodeLevelCode, encodeLevelCode, readLevelCodeTileFlags } from '../../../src/utils/levelCode';
import {
  BUTTON_FLOOR_MSG,
  GOAL_FLOOR_MSG,
  SOUL_PLATE_FLOOR_MSG,
  RED_BUTTON_MIX_MSG,
  RED_BUTTON_WALL_MSG,
  RED_WALL_NO_BUTTON_MSG,
  TRIANGLE_RED_MSG,
  TRIANGLE_YELLOW_MSG,
  YELLOW_RED_WALL_MSG,
  brushRefusal,
  cellConflicts,
} from '../../../src/utils/tileRules';
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
 * Red buttons and red walls (2026-11-28 user request): while ANY red button is pressed
 * (object mass ≥ its required mass, as for every button), every red wall is open; with no
 * red button pressed — or none on the map — they are closed. A closed red cell is the same
 * solid partition as a closed yellow cell and is judged at exactly the same moments (no
 * cache: the board as it stands when asked). Yellow (AND) and red (OR) are independent, and
 * red has nothing to do with the goal. Also: the red map-code section and the editor's
 * same-cell rules (a button never shares its cell with a crack or a hole).
 */

// The red section in a map code (levelCode.ts RED_MAGIC): appends entries to a code by
// hand, so the decoder's guards can be checked on entries the encoder never writes.
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function codeToBits(code: string): number[] {
  let n = 0n;
  for (const ch of code) n = n * 62n + BigInt(BASE62.indexOf(ch));
  return [...n.toString(2)].map(Number);
}
function bitsToCode(bits: number[]): string {
  let n = BigInt(`0b${bits.join('')}`);
  let out = '';
  while (n > 0n) { out = BASE62[Number(n % 62n)] + out; n /= 62n; }
  return out;
}
function push(bits: number[], value: number, count: number): void {
  for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
}
function withRedSection(code: string, entries: [index: number, code: number][], addExtHeader: boolean): string {
  const bits = codeToBits(code);
  if (addExtHeader) { push(bits, 0b10100101, 8); push(bits, 0, 11); }
  push(bits, 0b1100, 4);
  push(bits, entries.length, 11);
  for (const [index, value] of entries) { push(bits, index, 11); push(bits, value, 2); }
  return bitsToCode(bits);
}

// A board with every older map-code feature and no red: green/yellow buttons with
// masses, a yellow wall holding a snowman, a triangle with a ball, hole, warm crack,
// triangle block and a void cell.
function mixedLevel(): Level {
  const level = createLevel(6, 4);
  level.hasShadow = true;
  Object.assign(level.tiles[0][0], { isKeyTile: true, buttonMass: 3 });
  Object.assign(level.tiles[0][1], { isYellowButton: true, buttonMass: 2 });
  level.tiles[0][2].isYellowWall = true;
  level.tiles[1][0].triangle = 'tr';
  level.tiles[1][1].isHole = true;
  Object.assign(level.tiles[1][2], { isCrack: true, isWarm: true });
  level.tiles[3][5] = { ...level.tiles[3][5], isVoid: true };
  level.objects[2][0] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
  level.objects[1][0] = { type: 'snowball', size: 1, isMelting: false, createdAt: 0 };
  level.objects[2][3] = { type: 'block', size: 1, isMelting: false, createdAt: 0, triangleCorner: 'bl' };
  level.objects[0][2] = { type: 'snowman', size: 2, isMelting: false, createdAt: 0 };
  return level;
}
// encodeLevelCode(mixedLevel()) as written by the encoder before red existed (2026-11-28).
const MIXED_GOLDEN = 'ELjxJbh2FzQMPeJiBAdDq2mgiBbvjtuB8JB25arZyhF7PPCFqiDK5GCclRcSDdKIXCGriO5NQ0stgCLAscaBblHJF05DU0FQ';

function stripRed(level: Level): Level {
  for (const row of level.tiles) {
    for (const tile of row) { delete tile.isRedButton; delete tile.isRedWall; }
  }
  return level;
}

function executeTurnFrom(level: Level, dir: Direction): Level {
  return executeTurn(level, dir).level;
}

function resolvedBallCols(result: { turns: { frames: { phase: string; level: Level }[] }[] }, row: number) {
  return result.turns[0].frames
    .filter(frame => frame.phase === 'resolved')
    .map(frame => ({
      col: frame.level.objects[row].findIndex(obj => obj?.type === 'snowball'),
      open: !redWallsSolid(frame.level),
    }));
}

export const scenarios: ScenarioDefinition[] = [
  // ---------------------------------------------------------------- OR 규칙
  defineScenario({
    name: 'red OR: one pressed red button of two opens every red wall',
    width: 6,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isRedButton: true })
        .tile(0, 4, { isRedButton: true })
        .tile(1, 2, { isRedWall: true })
        .tile(1, 5, { isRedWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      expect(redWallsSolid(result.initialLevel), 'no red button pressed → the red walls start closed');
      expectObject(result.level, 0, 1, 'player', 1);
      expect(!isButtonPressed(result.level, 0, 4), 'the second red button is still free');
      expect(!redWallsSolid(result.level), 'one pressed red button opens the red walls');
      expect(!isClosedPartition(result.level, { row: 1, col: 2 }) && !isClosedPartition(result.level, { row: 1, col: 5 }),
        'every red wall is open');
    },
  }),
  defineScenario({
    name: 'red OR: both red buttons pressed keep the walls open (not XOR)',
    width: 6,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isRedButton: true })
        .tile(0, 4, { isRedButton: true })
        .object(0, 4, 'block', 1)
        .tile(1, 2, { isRedWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      expect(!redWallsSolid(result.initialLevel), 'the block alone opens the walls');
      expect(isButtonPressed(result.level, 0, 1) && isButtonPressed(result.level, 0, 4), 'both red buttons pressed');
      expect(!redWallsSolid(result.level), 'both pressed is still open');
    },
  }),
  defineScenario({
    name: 'red OR: the walls close again once no red button is pressed',
    width: 4,
    height: 2,
    setup: (board) => {
      board.player(0, 0, 1).tile(0, 1, { isRedButton: true }).tile(1, 3, { isRedWall: true });
    },
    actions: ['right', 'right'],
    verify: (result) => {
      expect(!redWallsSolid(result.turns[0].level), 'open while the player stands on the button');
      expectObject(result.level, 0, 2, 'player', 1);
      expect(redWallsSolid(result.level), 'closed after the last red button is released');
    },
  }),
  defineScenario({
    name: 'a red wall on a map without a red button never opens: it blocks like a wall',
    width: 4,
    height: 2,
    setup: (board) => {
      // Every yellow button is pressed: that opens yellow walls only.
      board
        .player(0, 0, 3)
        .tile(0, 1, { isRedWall: true })
        .tile(1, 0, { isYellowButton: true })
        .object(1, 0, 'block', 1);
    },
    actions: ['right'],
    verify: (result) => {
      expect(!yellowWallsSolid(result.level), 'all yellow buttons pressed → yellow is open');
      expect(redWallsSolid(result.level), 'no red button → red stays closed');
      expectObject(result.level, 0, 0, 'player', 3);
      expectEmpty(result.level, 0, 1);
    },
  }),
  defineScenario({
    name: 'red OR and yellow AND are independent: a ball passes the open red wall and stops at the closed yellow one',
    width: 7,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(0, 1, 1)
        .tile(0, 3, { isRedWall: true })
        .tile(0, 5, { isYellowWall: true })
        .tile(1, 0, { isRedButton: true })
        .object(1, 0, 'block', 1)
        .tile(1, 6, { isYellowButton: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 0, 4, 'snowball', 1);
      expectEmpty(result.level, 0, 5);
      expect(!redWallsSolid(result.level) && yellowWallsSolid(result.level), 'red open, yellow closed');
    },
  }),
  defineScenario({
    name: 'red OR and yellow AND are independent: a ball passes the open yellow wall and stops at the closed red one',
    width: 7,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(0, 1, 1)
        .tile(0, 3, { isYellowWall: true })
        .tile(0, 5, { isRedWall: true })
        .tile(1, 0, { isYellowButton: true })
        .object(1, 0, 'block', 1)
        .tile(1, 6, { isRedButton: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 0, 4, 'snowball', 1);
      expectEmpty(result.level, 0, 5);
      expect(redWallsSolid(result.level) && !yellowWallsSolid(result.level), 'yellow open, red closed');
    },
  }),
  defineScenario({
    name: 'red buttons do not lock the goal: the player clears with every red button free',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 2, { isGoal: true })
        .tile(1, 0, { isRedButton: true })
        .tile(1, 1, { isRedButton: true, buttonMass: 3 })
        .tile(1, 3, { isRedWall: true });
    },
    actions: ['right', 'right'],
    verify: (result) => {
      expect(isGoalActive(result.initialLevel), 'red buttons never count for the goal');
      expectStatus(result, 'cleared');
    },
  }),

  // ---------------------------------------------------------------- 굴림 tick
  defineScenario({
    name: 'a ball rolling over the only red button opens the wall for that tick: the beam kills the player, the ball rolls on',
    width: 8,
    height: 7,
    setup: (board) => {
      const row = 3;
      board
        .player(row, 1, 2)
        .snowball(row, 2, 1)
        .tile(row, 4, { isRedButton: true })
        .tile(4, 2, { isRedWall: true })
        .laser(5, 2, 'up');
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'gameover');
      expectNoPlayer(result.level);
      expectFrame(result, 0, 'resolved',
        (level) => level.objects[3][3]?.type === 'snowball' && level.objects[3][2]?.type === 'player',
        'the tick before the button the wall is closed and the player lives');
      expectFrame(result, 0, 'resolved',
        (level) => level.objects[3][4]?.type === 'snowball' && !level.objects[3][2],
        'the tick the ball presses the red button the beam passes the wall and kills the player');
      expectFrame(result, 0, 'movement',
        (level) => level.objects[3][5]?.type === 'snowball' && !level.objects[3][2],
        'the ball keeps rolling after the player dies');
      expectObject(result.level, 3, 7, 'snowball', 1);
      expect(redWallsSolid(result.level), 'closed again once the ball has left the button');
    },
  }),
  defineScenario({
    name: 'two red buttons one cell apart give a closed tick between them',
    width: 9,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 3)
        .snowball(0, 1, 1)
        .tile(0, 3, { isRedButton: true })
        .tile(0, 5, { isRedButton: true })
        .tile(1, 4, { isRedWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      const ticks = resolvedBallCols(result, 0);
      expect(ticks.length >= 6, `expected one resolved frame per rolling tick, got ${ticks.length}`);
      for (const { col, open } of ticks) {
        expect(open === (col === 3 || col === 5), `ball at column ${col}: the walls must be ${col === 3 || col === 5 ? 'open' : 'closed'}`);
      }
      expectObject(result.level, 0, 8, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'a red wall seals the rear ball that rolls off the only red button into it; the front ball rolls on',
    width: 8,
    height: 5,
    setup: (board) => {
      const row = 2;
      board
        .player(row, 0, 3)
        .snowball(row, 1, 1)
        .snowball(row, 2, 1)
        .tile(row, 2, { isRedButton: true })
        .tile(row, 3, { isRedWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 2, 3, 'snowball', 1);
      expectEmpty(result.level, 2, 4);
      expectObject(result.level, 2, 7, 'snowball', 1);
      expect(redWallsSolid(result.level), 'nothing presses a red button any more');
    },
  }),
  defineScenario({
    name: 'red OR: with another red button held down the same train rolls through the red wall',
    width: 8,
    height: 5,
    setup: (board) => {
      const row = 2;
      board
        .player(row, 0, 3)
        .snowball(row, 1, 1)
        .snowball(row, 2, 1)
        .tile(row, 2, { isRedButton: true })
        .tile(row, 3, { isRedWall: true })
        .tile(0, 0, { isRedButton: true })
        .object(0, 0, 'block', 1);
    },
    actions: ['right'],
    verify: (result) => {
      expectEmpty(result.level, 2, 3);
      expectObject(result.level, 2, 6, 'snowball', 1);
      expectObject(result.level, 2, 7, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'a closing red wall stops the balls behind and inside it but keeps the front ball rolling',
    width: 12,
    height: 5,
    setup: (board) => {
      const row = 2;
      board
        .player(row, 0, 3)
        .snowball(row, 1, 1)
        .snowball(row, 2, 1)
        .snowball(row, 4, 1)
        .tile(row, 5, { isRedButton: true })
        .tile(row, 7, { isRedWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 2, 6, 'snowball', 1);
      expectObject(result.level, 2, 7, 'snowball', 1);
      expectEmpty(result.level, 2, 8);
      expectObject(result.level, 2, 11, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'the player pushes a ball from the only red button into the red wall beside it: the ball is sealed in',
    width: 6,
    height: 1,
    setup: (board) => {
      board.player(0, 0, 2).tile(0, 0, { isRedButton: true }).snowball(0, 1, 1).tile(0, 2, { isRedWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 0, 1, 'player', 2);
      expectObject(result.level, 0, 2, 'snowball', 1);
      expectEmpty(result.level, 0, 5);
      expect(redWallsSolid(result.level), 'the player left the only red button');
    },
  }),
  defineScenario({
    name: 'stepping from one red button onto the next keeps the walls open: the pushed ball rolls through',
    width: 6,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .tile(0, 0, { isRedButton: true })
        .snowball(0, 1, 1)
        .tile(0, 1, { isRedButton: true })
        .tile(0, 2, { isRedWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 0, 1, 'player', 2);
      expectEmpty(result.level, 0, 2);
      expectObject(result.level, 0, 5, 'snowball', 1);
      expect(!redWallsSolid(result.level), 'the player now holds the second red button');
    },
  }),
  defineScenario({
    name: 'stepping from the only red button into the red wall next to it traps the player',
    width: 4,
    height: 1,
    setup: (board) => {
      board.player(0, 0, 1).tile(0, 1, { isRedButton: true }).tile(0, 2, { isRedWall: true });
    },
    actions: ['right', 'right', 'right'],
    verify: (result) => {
      expectObject(result.turns[1].level, 0, 2, 'player', 1);
      expect(redWallsSolid(result.turns[1].level), 'the wall closes the moment the player steps off the button');
      expectObject(result.level, 0, 2, 'player', 1);
      expectEmpty(result.level, 0, 3);
      expectStatus(result, 'playing');
    },
  }),
  defineScenario({
    name: 'red OR: with another red button held the player walks on through the red wall',
    width: 4,
    height: 2,
    setup: (board) => {
      board
        .player(0, 0, 1)
        .tile(0, 1, { isRedButton: true })
        .tile(0, 2, { isRedWall: true })
        .tile(1, 0, { isRedButton: true })
        .object(1, 0, 'block', 1);
    },
    actions: ['right', 'right', 'right'],
    verify: (result) => {
      expectObject(result.level, 0, 3, 'player', 1);
      expectEmpty(result.level, 0, 2);
    },
  }),

  // ---------------------------------------------------------------- 레이저
  defineScenario({
    name: 'one laser check is one snapshot: melting the ball on the only red button does not close the wall for that check',
    width: 5,
    height: 3,
    setup: (board) => {
      // The laser that unpresses the button (row 0) is checked before the one that needs
      // the open wall (row 1): a check that removed hits laser by laser would miss S1.
      board
        .laser(0, 0, 'right')
        .tile(0, 2, { isRedButton: true })
        .snowball(0, 2, 1)
        .laser(1, 0, 'right')
        .tile(1, 1, { isRedWall: true })
        .snowman(1, 2, 1)
        .player(2, 4, 2);
    },
    actions: ['wait'],
    verify: (result) => {
      expectEmpty(result.level, 0, 2);
      expectEmpty(result.level, 1, 2);
      expect(redWallsSolid(result.level), 'the button is free after the check');
      expectStatus(result, 'playing');
    },
  }),
  defineScenario({
    name: 'turn 0 is one snapshot too: the opening beam and the melting of the button ball happen together',
    width: 5,
    height: 3,
    setup: () => {},
    actions: [],
    verify: () => {
      const level = createLevel(5, 3);
      level.objects[0][0] = { type: 'laser', size: 1, isMelting: false, createdAt: 0, laserDirection: 'right' };
      Object.assign(level.tiles[0][2], { isRedButton: true });
      level.objects[0][2] = { type: 'snowball', size: 1, isMelting: false, createdAt: 0 };
      level.objects[1][0] = { type: 'laser', size: 1, isMelting: false, createdAt: 0, laserDirection: 'right' };
      level.tiles[1][1].isRedWall = true;
      level.objects[1][2] = { type: 'snowman', size: 1, isMelting: false, createdAt: 0 };
      level.objects[2][4] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
      const state = newGameState(level);
      expect(!state.level.objects[0][2] && !state.level.objects[1][2], 'both snow objects melt in the turn-0 check');
      expect(state.status === 'playing', `expected playing, got ${state.status}`);
    },
  }),
  defineScenario({
    name: 'turn 0: a player starting on a red button opens the walls; the beam melts the snowman behind them',
    width: 4,
    height: 2,
    setup: () => {},
    actions: [],
    verify: () => {
      const build = (playerOnButton: boolean) => {
        const level = createLevel(4, 2);
        level.tiles[0][playerOnButton ? 0 : 3].isRedButton = true;
        level.objects[0][0] = { type: 'player', size: 1, isMelting: false, createdAt: 0 };
        level.objects[1][0] = { type: 'laser', size: 1, isMelting: false, createdAt: 0, laserDirection: 'right' };
        level.tiles[1][1].isRedWall = true;
        level.objects[1][2] = { type: 'snowman', size: 2, isMelting: false, createdAt: 0 };
        return newGameState(level);
      };
      expect(!build(true).level.objects[1][2], 'a player on the red button at the start opens the wall: S2 melts in turn 0');
      expect(build(false).level.objects[1][2]?.type === 'snowman', 'with the red button free the closed wall shields S2');
    },
  }),
  defineScenario({
    name: 'a laser inside a closed red wall cannot fire until a red button is pressed',
    width: 5,
    height: 2,
    setup: (board) => {
      board
        .tile(0, 1, { isRedWall: true })
        .laser(0, 1, 'right')
        .snowman(0, 3, 1)
        .player(1, 0, 1)
        .tile(1, 1, { isRedButton: true });
    },
    actions: ['wait', 'right'],
    verify: (result) => {
      expectObject(result.turns[0].level, 0, 3, 'snowman', 1);
      expectEmpty(result.level, 0, 3);
      expectObject(result.level, 1, 1, 'player', 1);
    },
  }),
  defineScenario({
    name: 'a closed red wall stops the beam before its cell and shields what is trapped inside',
    width: 5,
    height: 2,
    setup: (board) => {
      board
        .laser(0, 0, 'right')
        .tile(0, 2, { isRedWall: true })
        .snowball(0, 2, 1)
        .snowman(0, 3, 1)
        .tile(1, 2, { isRedButton: true })
        .player(1, 4, 2);
    },
    actions: ['wait'],
    verify: (result) => {
      expectObject(result.level, 0, 2, 'snowball', 1);
      expectObject(result.level, 0, 3, 'snowman', 1);
    },
  }),
  defineScenario({
    name: 'an open red wall lets the beam through: it melts what is inside and beyond',
    width: 5,
    height: 2,
    setup: (board) => {
      board
        .laser(0, 0, 'right')
        .tile(0, 2, { isRedWall: true })
        .snowball(0, 2, 1)
        .snowman(0, 3, 1)
        .tile(1, 2, { isRedButton: true })
        .object(1, 2, 'block', 1)
        .player(1, 4, 2);
    },
    actions: ['wait'],
    verify: (result) => {
      expectEmpty(result.level, 0, 2);
      expectEmpty(result.level, 0, 3);
    },
  }),

  // ---------------------------------------------------------------- 쪼개기 (Q-01)
  defineScenario({
    name: 'P2 splits a size-2 ball from a red button while the red wall stays open for both halves',
    width: 3,
    height: 2,
    setup: (board) => {
      board
        .tile(0, 0, { isRedWall: true })
        .tile(0, 1, { isRedButton: true })
        .snowball(0, 1, 2)
        .player(1, 1, 2);
    },
    actions: ['up'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 0, 'snowball', 1);
      expectEmpty(result.level, 0, 1);
      expectObject(result.level, 0, 2, 'snowball', 1);
      expect(redWallsSolid(result.level), 'the wall closes after the split releases the button: the half is sealed in');
    },
  }),
  defineScenario({
    name: 'red B-07/Q-01 split judged on the pre-split board (red button left, closed red wall right)',
    width: 3, height: 3,
    setup: (b) => {
      b.object(0, 1, 'wall', 100).tile(1, 0, { isRedButton: true }).snowball(1, 1, 2)
        .tile(1, 2, { isRedWall: true }).player(2, 1, 2);
    },
    actions: ['up'],
    verify: (r) => {
      expectObject(r.level, 1, 0, 'snowball', 1);
      expectObject(r.level, 1, 1, 'snowball', 1);
      expectEmpty(r.level, 1, 2);
      expect(!redWallsSolid(r.level), 'the half that landed on the red button opens the wall after the split');
    },
  }),
  defineScenario({
    name: 'red B-07/Q-01 split judged on the pre-split board (closed red wall left, red button right)',
    width: 3, height: 3,
    setup: (b) => {
      b.object(0, 1, 'wall', 100).tile(1, 0, { isRedWall: true }).snowball(1, 1, 2)
        .tile(1, 2, { isRedButton: true }).player(2, 1, 2);
    },
    actions: ['up'],
    verify: (r) => {
      expectEmpty(r.level, 1, 0);
      expectObject(r.level, 1, 1, 'snowball', 1);
      expectObject(r.level, 1, 2, 'snowball', 1);
      expect(!redWallsSolid(r.level), 'the half that landed on the red button opens the wall after the split');
    },
  }),
  defineScenario({
    name: 'red OR split: with another red button held both halves leave into the red walls',
    width: 3, height: 3,
    setup: (b) => {
      b.object(0, 1, 'wall', 100).tile(1, 0, { isRedWall: true }).snowball(1, 1, 2)
        .tile(1, 2, { isRedWall: true }).player(2, 1, 2)
        .tile(2, 0, { isRedButton: true }).object(2, 0, 'block', 1);
    },
    actions: ['up'],
    verify: (r) => {
      expectObject(r.level, 1, 0, 'snowball', 1);
      expectEmpty(r.level, 1, 1);
      expectObject(r.level, 1, 2, 'snowball', 1);
    },
  }),

  // ---------------------------------------------------------------- 그림자
  defineScenario({
    name: 'a closed red wall does not shade its cell: the trapped snowball melts',
    width: 6,
    height: 1,
    setup: (board) => {
      board.level.hasShadow = true;
      board.player(0, 0, 1).tile(0, 3, { isRedWall: true, isWarm: true }).snowball(0, 3, 2);
    },
    actions: ['wait'],
    verify: (result) => {
      expect(!result.level.tiles[0][3].isShade, 'the closed red wall cell must not be shaded');
      expectObject(result.level, 0, 3, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'with shadows off a ball inside a closed red wall on a warm cell melts',
    width: 3, height: 2,
    setup: (b) => {
      b.level.hasShadow = false;
      b.tile(0, 1, { isRedWall: true, isWarm: true }).snowball(0, 1, 1).player(1, 0, 2).tile(1, 2, { isRedButton: true });
    },
    actions: ['wait'],
    verify: (r) => { expectEmpty(r.level, 0, 1); },
  }),
  defineScenario({
    name: 'an object trapped in a closed red wall casts no shadow outside it',
    width: 5,
    height: 2,
    setup: (board) => {
      // The sun shines from the left, so shadows fall to the right.
      board.level.hasShadow = true;
      board
        .tile(0, 1, { isRedWall: true })
        .snowman(0, 1, 3)
        .tile(0, 2, { isWarm: true })
        .snowball(0, 2, 2)
        .tile(1, 0, { isRedButton: true })
        .player(1, 4, 1);
    },
    actions: ['wait'],
    verify: (result) => {
      expect(!result.level.tiles[0][2].isShade, 'the trapped S3 must not shade the next cell');
      expectObject(result.level, 0, 2, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'an object in an open red wall casts its shadow as usual',
    width: 5,
    height: 2,
    setup: (board) => {
      board.level.hasShadow = true;
      board
        .tile(0, 1, { isRedWall: true })
        .snowman(0, 1, 3)
        .tile(0, 2, { isWarm: true })
        .snowball(0, 2, 2)
        .tile(1, 0, { isRedButton: true })
        .object(1, 0, 'block', 1)
        .player(1, 4, 1);
    },
    actions: ['wait'],
    verify: (result) => {
      expect(!!result.level.tiles[0][2].isShade, 'the S3 in the open wall shades the next cell');
      expectObject(result.level, 0, 2, 'snowball', 2);
    },
  }),

  // ---------------------------------------------------------------- 밀기 · 받침 · 갇힘
  defineScenario({
    name: 'a closed red wall crushes a size-1 snowball pushed against it',
    width: 5, height: 3,
    setup: (board) => {
      board.player(1, 1, 2).snowball(1, 2, 1).tile(1, 3, { isRedWall: true }).tile(0, 0, { isRedButton: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectEmpty(result.level, 1, 2);
      expect(!!result.level.tiles[1][2].isFlake, 'the crushed ball leaves a flake on the cold cell');
    },
  }),
  defineScenario({
    name: 'a closed red wall counts as a wall even with a ball trapped inside: the pushed ball is crushed',
    width: 6, height: 3,
    setup: (board) => {
      board.player(1, 1, 2).snowball(1, 2, 1).tile(1, 3, { isRedWall: true }).snowball(1, 3, 1)
        .tile(0, 0, { isRedButton: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectEmpty(result.level, 1, 2);
      expect(!!result.level.tiles[1][2].isFlake, 'crushed against the closed red cell, not built into a snowman');
      expectObject(result.level, 1, 3, 'snowball', 1);
    },
  }),
  defineScenario({
    name: 'a closed red wall backs a snowman build',
    width: 5, height: 3,
    setup: (board) => {
      board.player(1, 0, 1).snowball(1, 1, 1).snowball(1, 2, 1).tile(1, 3, { isRedWall: true }).tile(0, 0, { isRedButton: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 1, 2, 'snowman', 1);
      expectObject(result.level, 1, 1, 'player', 1);
    },
  }),
  defineScenario({
    name: 'a ball trapped in a closed red wall cannot be pushed from outside',
    width: 4, height: 2,
    setup: (board) => {
      board.player(0, 0, 3).tile(0, 1, { isRedWall: true }).snowball(0, 1, 1).tile(1, 3, { isRedButton: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 0, 0, 'player', 3);
      expectObject(result.level, 0, 1, 'snowball', 1);
      expectEmpty(result.level, 0, 2);
    },
  }),
  defineScenario({
    name: 'a player trapped in a closed red wall cannot move but still cycles the soul with M',
    width: 5, height: 1,
    setup: (board) => {
      board.level.soulSwapEnabled = true;
      board.tile(0, 1, { isRedWall: true }).player(0, 1, 2).tile(0, 3, { isRedButton: true }).snowman(0, 4, 1);
    },
    actions: ['right', 'left'],
    verify: (result) => {
      expectObject(result.level, 0, 1, 'player', 2);
      const cycled = cycleSoul(result.level);
      expect(!!cycled, 'M works while trapped');
      expectObject(cycled, 0, 1, 'snowman', 2);
      expectObject(cycled, 0, 4, 'player', 1);
      expect(redWallsSolid(cycled), 'M changes no size or position: the wall stays closed');
      const freed = executeTurnFrom(cycled, 'left');
      expectObject(freed, 0, 3, 'player', 1);
      expect(!redWallsSolid(freed), 'the new body on the red button opens the wall again');
    },
  }),

  // ---------------------------------------------------------------- 요구 질량 · 녹기
  defineScenario({
    name: 'a mass-2 red button: a size-1 player keeps the red walls closed',
    width: 4, height: 2,
    setup: (board) => {
      board.player(0, 0, 1).tile(0, 1, { isRedButton: true, buttonMass: 2 }).tile(1, 3, { isRedWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 0, 1, 'player', 1);
      expect(redWallsSolid(result.level), 'mass 1 on a mass-2 red button must not open the walls');
    },
  }),
  defineScenario({
    name: 'a mass-2 red button: a size-2 player opens the red walls',
    width: 4, height: 2,
    setup: (board) => {
      board.player(0, 0, 2).tile(0, 1, { isRedButton: true, buttonMass: 2 }).tile(1, 3, { isRedWall: true });
    },
    actions: ['right'],
    verify: (result) => {
      expectObject(result.level, 0, 1, 'player', 2);
      expect(!redWallsSolid(result.level), 'mass 2 on a mass-2 red button opens the walls');
    },
  }),
  defineScenario({
    name: 'a size-2 snowball melting on a mass-2 red button closes the walls at the end of the turn',
    width: 4, height: 1,
    setup: (board) => {
      board
        .tile(0, 0, { isRedButton: true, buttonMass: 2, isWarm: true })
        .snowball(0, 0, 2)
        .player(0, 1, 1)
        .tile(0, 2, { isRedWall: true });
    },
    actions: ['right', 'right'],
    verify: (result) => {
      const afterFirst = result.turns[0].level;
      expectObject(afterFirst, 0, 2, 'player', 1);
      expectObject(afterFirst, 0, 0, 'snowball', 1);
      expect(redWallsSolid(afterFirst), 'the melt at the end of the turn closes the wall');
      expectObject(result.level, 0, 2, 'player', 1);
      expectEmpty(result.level, 0, 3);
    },
  }),

  // ---------------------------------------------------------------- 맵 코드
  defineScenario({
    name: 'map code: a map without red encodes byte-for-byte as before the red section existed',
    width: 1, height: 1, setup: () => {}, actions: [],
    verify: () => {
      expect(encodeLevelCode(mixedLevel()) === MIXED_GOLDEN, 'every older section keeps its bytes');
      const back = decodeLevelCode(MIXED_GOLDEN)!;
      expect(back.tiles.every(row => row.every(tile => !tile.isRedButton && !tile.isRedWall)), 'no red appears');
      expect(encodeLevelCode(back) === MIXED_GOLDEN, 'decode → encode is unchanged');
      expect(readLevelCodeTileFlags(MIXED_GOLDEN)!.length === 2, 'the tile-flag list still holds the hole and the crack');
      const plain = createLevel(4, 2);
      plain.tiles[0][1].isKeyTile = true;
      plain.tiles[1][2].isYellowWall = true;
      plain.tiles[1][3].isYellowButton = true;
      plain.objects[0][0] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
      expect(encodeLevelCode(plain) === 'Bx6k92J8hpLW9mefD6ZPPxPyyE', 'a map with no extension still writes none');
    },
  }),
  defineScenario({
    name: 'map code: red walls and red buttons (mass 1·2·3) round-trip beside yellow, green, triangles, void and masses',
    width: 1, height: 1, setup: () => {}, actions: [],
    verify: () => {
      const level = mixedLevel();
      level.tiles[2][1].isRedWall = true;
      level.tiles[2][2].isRedButton = true;
      Object.assign(level.tiles[3][0], { isRedButton: true, buttonMass: 2 });
      Object.assign(level.tiles[2][0], { isRedButton: true, buttonMass: 3 });  // under the player
      Object.assign(level.tiles[0][2], { isRedButton: true, buttonMass: 2 }); // red button inside the yellow wall
      level.tiles[0][0].isRedWall = true;                                    // green mass-3 button inside a red wall
      level.tiles[3][5].isRedWall = true;                                    // on a void cell: never written
      const code = encodeLevelCode(level);
      expect(code !== MIXED_GOLDEN, 'red changes the code');
      const back = decodeLevelCode(code)!;
      const t = back.tiles;
      expect(!!t[2][1].isRedWall && !t[2][1].isRedButton, 'red wall');
      expect(!!t[2][2].isRedButton && t[2][2].buttonMass === undefined, 'mass-1 red button carries no mass field');
      expect(!!t[3][0].isRedButton && t[3][0].buttonMass === 2, `red mass 2 (got ${t[3][0].buttonMass})`);
      expect(!!t[2][0].isRedButton && t[2][0].buttonMass === 3, `red mass 3 (got ${t[2][0].buttonMass})`);
      expect(back.objects[2][0]?.type === 'player', 'the player on the red button stays');
      expect(!!t[0][2].isYellowWall && !!t[0][2].isRedButton && t[0][2].buttonMass === 2, 'red button inside a yellow wall');
      expect(back.objects[0][2]?.type === 'snowman', 'the snowman in the yellow wall stays');
      expect(!!t[0][0].isKeyTile && !!t[0][0].isRedWall && t[0][0].buttonMass === 3, 'green mass-3 button inside a red wall');
      expect(!!t[0][1].isYellowButton && t[0][1].buttonMass === 2, 'yellow mass 2 still reads');
      expect(!!t[3][5].isVoid && !t[3][5].isRedWall, 'a void cell takes no red');
      expect(t[1][0].triangle === 'tr' && back.objects[1][0]?.type === 'snowball', 'triangle and its ball');
      expect(back.objects[2][3]?.triangleCorner === 'bl', 'triangle block');
      expect(!!t[1][1].isHole && !!t[1][2].isCrack, 'hole and crack');
      expect(encodeLevelCode(back) === code, 'decode → encode is stable');
      expect(encodeLevelCode(stripRed(back)) === MIXED_GOLDEN, 'red lives only in its own section');
    },
  }),
  defineScenario({
    name: 'map code: a red-only map writes an empty flag list; the decoder skips red entries on void or out of range',
    width: 1, height: 1, setup: () => {}, actions: [],
    verify: () => {
      const level = createLevel(3, 2);
      level.objects[0][0] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
      level.tiles[1][1].isRedWall = true;
      Object.assign(level.tiles[1][2], { isRedButton: true, buttonMass: 3 });
      const code = encodeLevelCode(level);
      expect(readLevelCodeTileFlags(code)!.length === 0, 'red alone adds an extension with an empty flag list');
      const back = decodeLevelCode(code)!;
      expect(!!back.tiles[1][1].isRedWall && !!back.tiles[1][2].isRedButton && back.tiles[1][2].buttonMass === 3, 'red-only round trip');
      expect(encodeLevelCode(back) === code, 'stable');

      // Hand-made entries the encoder never writes: on a void cell, past the board, and fine.
      const voidLevel = createLevel(3, 2);
      voidLevel.objects[0][1] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
      voidLevel.tiles[1][0] = { ...voidLevel.tiles[1][0], isVoid: true };
      const base = encodeLevelCode(voidLevel);
      const crafted = decodeLevelCode(withRedSection(base, [[3, 0], [2047, 1], [0, 2]], false));
      expect(!!crafted, 'the crafted code decodes');
      expect(!!crafted.tiles[1][0].isVoid && !crafted.tiles[1][0].isRedWall, 'an entry on a void cell is skipped');
      expect(!!crafted.tiles[0][0].isRedButton && crafted.tiles[0][0].buttonMass === 2, 'the valid entry reads');
      const redCells = crafted.tiles.flat().filter(tile => tile.isRedButton || tile.isRedWall).length;
      expect(redCells === 1, `only the valid entry makes red (got ${redCells})`);

      // A red section on a code that had no extension at all.
      const plainCode = 'Bx6k92J8hpLW9mefD6ZPPxPyyE';
      const withRed = decodeLevelCode(withRedSection(plainCode, [[1, 0]], true))!;
      expect(!!withRed.tiles[0][1].isKeyTile && !!withRed.tiles[0][1].isRedWall, 'appended after an empty extension header');
    },
  }),

  // ---------------------------------------------------------------- 에디터 같은 칸 규칙
  defineScenario({
    name: 'brush rules: a button, a soul footplate or the goal never shares its cell with a crack or a hole, in either order',
    width: 1, height: 1, setup: () => {}, actions: [],
    verify: () => {
      const tile = (patch: object) => ({ ...createLevel(1, 1).tiles[0][0], ...patch });
      for (const brush of ['keyTile', 'yellowButton', 'redButton']) {
        for (const floor of [{ isCrack: true }, { isCrack: true, isWarm: true }, { isHole: true }]) {
          expect(brushRefusal(tile(floor), brush) === BUTTON_FLOOR_MSG, `${brush} on ${JSON.stringify(floor)} is refused`);
        }
      }
      for (const brush of ['hole', 'crackWarm', 'crackCool']) {
        for (const button of [{ isKeyTile: true }, { isYellowButton: true }, { isRedButton: true, buttonMass: 2 }]) {
          expect(brushRefusal(tile(button), brush) === BUTTON_FLOOR_MSG, `${brush} on ${JSON.stringify(button)} is refused`);
        }
      }
      // A soul footplate and the goal follow the same rule (user decision 2026-11-28).
      for (const [brush, flag, message] of [['soulSwap', 'isSoulSwap', SOUL_PLATE_FLOOR_MSG], ['goal', 'isGoal', GOAL_FLOOR_MSG]] as const) {
        for (const floor of [{ isCrack: true }, { isCrack: true, isWarm: true }, { isHole: true }]) {
          expect(brushRefusal(tile(floor), brush) === message, `${brush} on ${JSON.stringify(floor)} is refused`);
        }
        for (const floorBrush of ['hole', 'crackWarm', 'crackCool']) {
          expect(brushRefusal(tile({ [flag]: true }), floorBrush) === message, `${floorBrush} on ${flag} is refused`);
        }
      }
      expect(brushRefusal(tile({ isCrack: true }), 'hole') === null, 'a hole still replaces a crack');
      expect(brushRefusal(tile({ isHole: true }), 'crackWarm') === null, 'a crack still replaces a hole');
    },
  }),
  defineScenario({
    name: 'brush rules: red pairs and triangles are refused; mixed colors and walls on floor features are allowed',
    width: 1, height: 1, setup: () => {}, actions: [],
    verify: () => {
      const tile = (patch: object) => ({ ...createLevel(1, 1).tiles[0][0], ...patch });
      const refused: [object, string, string][] = [
        [{ isRedWall: true }, 'redButton', RED_BUTTON_WALL_MSG],
        [{ isRedButton: true }, 'redWall', RED_BUTTON_WALL_MSG],
        [{ isYellowWall: true }, 'redWall', YELLOW_RED_WALL_MSG],
        [{ isRedWall: true }, 'yellowWall', YELLOW_RED_WALL_MSG],
        [{ isKeyTile: true }, 'redButton', RED_BUTTON_MIX_MSG],
        [{ isYellowButton: true }, 'redButton', RED_BUTTON_MIX_MSG],
        [{ isRedButton: true }, 'keyTile', RED_BUTTON_MIX_MSG],
        [{ isRedButton: true }, 'yellowButton', RED_BUTTON_MIX_MSG],
        [{ triangle: 'tl' }, 'redButton', TRIANGLE_RED_MSG],
        [{ triangle: 'br' }, 'redWall', TRIANGLE_RED_MSG],
        [{ isRedButton: true }, 'triangle', TRIANGLE_RED_MSG],
        [{ isRedWall: true }, 'triangle', TRIANGLE_RED_MSG],
        [{ triangle: 'tr' }, 'yellowButton', TRIANGLE_YELLOW_MSG],
        [{ triangle: 'bl' }, 'yellowWall', TRIANGLE_YELLOW_MSG],
        [{ isYellowButton: true }, 'triangle', TRIANGLE_YELLOW_MSG],
        [{ isYellowWall: true }, 'triangle', TRIANGLE_YELLOW_MSG],
      ];
      for (const [patch, brush, message] of refused) {
        const got = brushRefusal(tile(patch), brush);
        expect(got === message, `${brush} on ${JSON.stringify(patch)}: expected "${message}", got "${got}"`);
      }
      const allowed: [object, string][] = [
        [{ isRedWall: true }, 'keyTile'],
        [{ isRedWall: true }, 'yellowButton'],
        [{ isYellowWall: true }, 'redButton'],
        [{ isKeyTile: true }, 'yellowButton'],
        [{ isYellowButton: true }, 'keyTile'],
        [{ isRedButton: true, buttonMass: 2 }, 'redButton'],
        [{ isRedWall: true }, 'redWall'],
        [{ triangle: 'tl' }, 'keyTile'],
        [{ isRedWall: true }, 'crackWarm'],
        [{ isRedWall: true }, 'hole'],
        [{ isYellowWall: true }, 'crackCool'],
        [{ isCrack: true }, 'redWall'],
        [{ isHole: true }, 'redWall'],
        [{ isHole: true }, 'yellowWall'],
        [{ isGoal: true }, 'redWall'],
        [{ isGoal: true }, 'redButton'],
        [{ isFlake: true }, 'redButton'],
        [{ isWarm: true }, 'redWall'],
        [{ isSoulSwap: true }, 'redButton'],
        [{ isSoulSwap: true }, 'redWall'],
        [{ edgeArchTop: 1 }, 'redWall'],
        [{ isRowArch: true }, 'redButton'],
        [{ isRedButton: true }, 'block'],
        [{ isRedButton: true }, 'eraser'],
        [{ isSoulSwap: true }, 'keyTile'],
        [{ isGoal: true }, 'keyTile'],
      ];
      for (const [patch, brush] of allowed) {
        const got = brushRefusal(tile(patch), brush);
        expect(got === null, `${brush} on ${JSON.stringify(patch)} must be allowed, got "${got}"`);
      }
    },
  }),
  defineScenario({
    name: 'cellConflicts: older maps with a button on a crack are pointed at, so are red walls without a red button',
    width: 1, height: 1, setup: () => {}, actions: [],
    verify: () => {
      // 「pushpushbaby」, 「three buttons 2」, 「three buttons 3」 (홍은기): a green button on a warm
      // crack. They still decode and re-encode unchanged; the editor only warns.
      const legacy: [string, number, number][] = [
        ['BaL3fz0ApV8l2AYpmtDBnltgqOaCHxwl7HJ0wTbuuX2TNnYC6rp31ZnbU18CIZXea9qoRNR7027guKQtXyH2I6JpeZHGywhIyyyawcmg38ej4dCX5N12xSJXqFepWkCwevjJBGXM1543GMWYCYASpEXJVisz6n9yH2quBjdEJma', 1, 0],
        ['NHm4e3hJMcCeQTW3ynNApKMsvYDF9mMSqFLZwou3MXwWE96yjVWGtBGbR8bow2AMDvqsmYYG2gDuw9OUgnF3U0jQj2hbT7ka8QdMiKy9jx03nk', 4, 6],
        ['MmBy3luIrHPRJtSm5sZSpi7gv7ZPJEBArg4vyBHirjFvtWT7z7jpxhoipF8z6PK8gLpKeGZPWQPb5IdbSb6bALEyp2Mn8SjAqoBjNMEOwi3jmCoWOo2JTYvhWKU4CPhqmlpRcNqOvIjH6Q4s4ehghysWqo4Kn8JamZqqJvevHA3kdElukzaA0Cesr2UtEf1FmGdE', 1, 0],
      ];
      for (const [code, row, col] of legacy) {
        const level = decodeLevelCode(code)!;
        expect(encodeLevelCode(level) === code, 'the legacy code round-trips unchanged');
        const found = cellConflicts(level);
        expect(found.length === 1 && found[0].row === row && found[0].col === col && found[0].message === BUTTON_FLOOR_MSG,
          `expected one button+crack warning at (${row}, ${col}), got ${JSON.stringify(found)}`);
      }

      const noButton = createLevel(4, 2);
      Object.assign(noButton.tiles[0][0], { isKeyTile: true, isCrack: true, isWarm: true });
      Object.assign(noButton.tiles[0][1], { isYellowButton: true, isHole: true });
      noButton.tiles[0][2].isRedWall = true;
      noButton.tiles[1][0] = { ...noButton.tiles[1][0], isVoid: true, isKeyTile: true, isCrack: true };
      const got = cellConflicts(noButton).map(({ row, col, message }) => `${row},${col}:${message}`);
      expect(JSON.stringify(got) === JSON.stringify([
        `0,0:${BUTTON_FLOOR_MSG}`, `0,1:${BUTTON_FLOOR_MSG}`, `0,2:${RED_WALL_NO_BUTTON_MSG}`,
      ]), `unexpected warnings ${JSON.stringify(got)}`);

      const pairs = createLevel(4, 1);
      Object.assign(pairs.tiles[0][0], { isRedButton: true, isRedWall: true });
      Object.assign(pairs.tiles[0][1], { isYellowWall: true, isRedWall: true });
      Object.assign(pairs.tiles[0][2], { isRedButton: true, isKeyTile: true });
      Object.assign(pairs.tiles[0][3], { isRedButton: true, triangle: 'tl' });
      const pairMessages = cellConflicts(pairs).map(({ col, message }) => `${col}:${message}`);
      expect(JSON.stringify(pairMessages) === JSON.stringify([
        `0:${RED_BUTTON_WALL_MSG}`, `1:${YELLOW_RED_WALL_MSG}`, `2:${RED_BUTTON_MIX_MSG}`, `3:${TRIANGLE_RED_MSG}`,
      ]), `unexpected pair warnings ${JSON.stringify(pairMessages)}`);

      const fine = createLevel(5, 1);
      Object.assign(fine.tiles[0][0], { isKeyTile: true, isYellowButton: true });
      Object.assign(fine.tiles[0][1], { isYellowWall: true, isCrack: true });
      Object.assign(fine.tiles[0][2], { isRedWall: true, isKeyTile: true });
      fine.tiles[0][3].isRedButton = true;
      Object.assign(fine.tiles[0][4], { isRedWall: true, isHole: true });
      expect(cellConflicts(fine).length === 0, `allowed combinations raise nothing, got ${JSON.stringify(cellConflicts(fine))}`);

      // A soul footplate or the goal on a crack/hole is pointed at too (user decision 2026-11-28).
      const floors = createLevel(2, 1);
      Object.assign(floors.tiles[0][0], { isSoulSwap: true, isHole: true });
      Object.assign(floors.tiles[0][1], { isGoal: true, isCrack: true, isWarm: true });
      const floorMessages = cellConflicts(floors).map(({ col, message }) => `${col}:${message}`);
      expect(JSON.stringify(floorMessages) === JSON.stringify([`0:${SOUL_PLATE_FLOOR_MSG}`, `1:${GOAL_FLOOR_MSG}`]),
        `unexpected footplate/goal warnings ${JSON.stringify(floorMessages)}`);
    },
  }),
];
