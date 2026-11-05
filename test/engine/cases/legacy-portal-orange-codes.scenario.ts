import type { Level } from '../../../src/types';
import { gameStateFromCode, newGameState } from '../../../src/utils/game';
import { createLevel, deserializeLevel, serializeLevel } from '../../../src/utils/level';
import { decodeLevelCode, encodeLevelCode, readLevelCodeTileFlags } from '../../../src/utils/levelCode';
import { decodeSolution, playMoves } from '../../../src/utils/solution';
import {
  defineScenario,
  expect,
  expectEmpty,
  expectObject,
  expectStatus,
  type ScenarioBoard,
  type ScenarioDefinition,
} from '../harness';

/**
 * Portals and orange buttons/walls were removed from the game on 2026-11-03 (team
 * decision). The map-code layout did not change, so codes saved before then still open:
 * the decoder reads the orange-button (bit 4), orange-wall (bit 3) and portal (bit 0)
 * flags of the v5 tile list and drops them — such a cell is plain ground and keeps the
 * rest of its tile data — and the encoder writes those bits as 0. Studio JSON and levels
 * handed to newGameState drop the same fields.
 *
 * Boards: the team maps 「Maze」 (orange) and 「one way」 (portals) from the 2026-11-02 map
 * snapshot, the B-004 repro board dup-a (portals), and a small board written with the
 * old encoder.
 */

const ORANGE_BUTTON = 1 << 4;
const ORANGE_WALL = 1 << 3;
const CRACK = 1 << 1;
const PORTAL = 1;
const REMOVED_BITS = ORANGE_BUTTON | ORANGE_WALL | PORTAL;
const REMOVED_TILE_FIELDS = ['isPortal', 'isOrangeButton', 'isOrangeWall', 'orangePressed'];

// 「Maze」 (정은후, 9×9, shadow off): a crack maze with six orange buttons and the goal
// under the orange wall at (0,8). Registered solution: 48 moves.
const MAZE = '8tayGT4A8NPUep9FSUWPh1qebHiIStc5xAP94CBYMeX5x8dULjBMvCrZCs0cAK8mI85GjH6Bpx7rOhRhTbxKSpAuHpc0TLR5HOHrv1TEvIGL5rFZkTeqczuqjN5GFDC8PUNUYXrS3lbbQJlcdTAQt9NtwunxbgH9etg1TULteXBCskF4nGVrvyeCGAbWDA8MZ3nww7wLgrHG00fwSOy4nuNn69bwm9TfyLPpbGWCqHv8uFEK3Y8nKnZfdHL0FBXBtdzPiWy4yuHvQe61hZPeox0G6A9XxY8R1JEIYlkPwsnIOn4oYnzMYfw';
const MAZE_SOLUTION = 'UUUURRUULLUURRRRDDDDDDLLDDRRRRRRUULLUURRUULLUURR';
// 「one way」 (정은후, 16×1): the two ends (0,0) and (0,15) were portals. Height-1 arches
// stand on the left edges of (0,1) and (0,15), so only size-1 things reach the portals.
const ONE_WAY = 'kOMX9rNDkc3ba5HrDAMHMp47wXyE1tlS7DaK0Tl0LfeAiazDOOrw2F';
// bugs/B-004 dup-a (8×6): portals at (2,2) and (4,1) split the s1 + s1 train in two.
const DUP_A = 'bOzi0u4CVT438eGybeTH4HYtRhM0rzFcrdnT6MwiMPIPWaEmYtp1CcMCpYhhgsohYNPmWgMFvzo9gkHDq35IORl6rRthpvsYrvCznTg84J7F3fxWmVl3fVznV7HU3WOA1U6tj';
// 7×3, old encoder: row 1 is P2 · portal · orange button · orange wall · floor · portal ·
// goal. With portals the player reached the goal in two moves (the catalog's P2-06).
const SMALL = 'dZaSFMGW0LEGjbWPDVECGEbaXOjgXdGW12KGxHF1FayWOSiF2aotky7lr3oiedInikKYbn';

function loadCode(board: ScenarioBoard, code: string): void {
  const level = decodeLevelCode(code);
  expect(!!level, 'the old map code must still decode');
  Object.assign(board.level, level);
}

function tileFlags(code: string): { index: number; flags: number }[] {
  const flags = readLevelCodeTileFlags(code);
  expect(!!flags, 'the map code must decode');
  return flags;
}

/** No tile or object of the board keeps a field of a removed feature. */
function expectNoRemovedFields(level: Level, where: string): void {
  level.tiles.forEach((row, r) => row.forEach((tile, c) => {
    for (const field of REMOVED_TILE_FIELDS) {
      expect(!(field in tile), `${where}: tile (${r}, ${c}) keeps ${field}`);
    }
  }));
  level.objects.forEach((row, r) => row.forEach((object, c) => {
    expect(!object || !('justTeleported' in object), `${where}: the object at (${r}, ${c}) keeps justTeleported`);
  }));
}

/**
 * Re-encoding the decoded board writes none of the removed bits and keeps every other
 * flag of the old list; a second round trip gives the same code. Returns the new code.
 */
function expectCleanReencode(code: string): string {
  const level = decodeLevelCode(code);
  expect(!!level, 'the old map code must decode');
  const again = encodeLevelCode(level);
  const after = tileFlags(again);
  expect(after.every(entry => (entry.flags & REMOVED_BITS) === 0),
    `the re-encoded code still carries a removed bit: ${JSON.stringify(after)}`);
  const kept = tileFlags(code)
    .map(entry => ({ index: entry.index, flags: entry.flags & ~REMOVED_BITS }))
    .filter(entry => entry.flags !== 0);
  expect(JSON.stringify(after) === JSON.stringify(kept),
    `the re-encoded flags must be the old ones without the removed bits:\n${JSON.stringify(after)}\n--- expected:\n${JSON.stringify(kept)}`);
  const third = decodeLevelCode(again);
  expect(!!third && encodeLevelCode(third) === again, 'the re-encoded code must be stable');
  return again;
}

function cellIndex(level: Level, row: number, col: number): number {
  return row * level.width + col;
}

export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    name: 'legacy 「Maze」: the six orange buttons and the orange wall over the goal decode as plain ground; re-encoding writes those bits as 0',
    width: 9,
    height: 9,
    setup: (board) => loadCode(board, MAZE),
    actions: [],
    verify: (result) => {
      const level = result.initialLevel;
      const flags = tileFlags(MAZE);
      const buttons = flags.filter(entry => entry.flags & ORANGE_BUTTON);
      const walls = flags.filter(entry => entry.flags & ORANGE_WALL);
      const cracks = flags.filter(entry => entry.flags & CRACK);
      expect(buttons.length === 6 && walls.length === 1, 'the old code carries six orange buttons and one orange wall');
      expect(walls[0].index === cellIndex(level, 0, 8), 'the orange wall stood on (0,8)');

      expectNoRemovedFields(level, 'decoded 「Maze」');
      expect(level.tiles[0][8].isGoal, 'the goal under the old orange wall stays');
      for (const { index } of buttons) {
        const tile = level.tiles[Math.floor(index / level.width)][index % level.width];
        expect(!tile.isHole && !tile.isCrack && !tile.isGoal, `the old button cell ${index} is plain ground`);
      }
      const decodedCracks = level.tiles.flat().filter(tile => tile.isCrack).length;
      expect(decodedCracks === cracks.length, `every crack stays (${decodedCracks} of ${cracks.length})`);

      expectCleanReencode(MAZE);
    },
  }),
  defineScenario({
    name: 'legacy 「Maze」: the old orange wall cell is open ground — the goal is 16 moves away, and the registered 48-move solution still clears',
    width: 9,
    height: 9,
    setup: (board) => loadCode(board, MAZE),
    actions: ['up', 'up', 'up', 'up', 'right', 'right', 'up', 'up', 'up', 'up', 'right', 'right', 'right', 'right', 'right', 'right'],
    verify: (result) => {
      expectStatus(result, 'cleared');
      expectObject(result.level, 0, 8, 'player');
      // The app's replay of the registered solution (gameStateFromCode → playMoves).
      const state = gameStateFromCode(MAZE);
      const moves = decodeSolution(MAZE_SOLUTION);
      expect(!!state && !!moves, 'the code and the solution must parse');
      expect(playMoves(state.level, moves).status === 'cleared', 'the registered 48-move solution still clears');
    },
  }),
  defineScenario({
    name: 'legacy 「one way」: both portal cells decode as plain ground (the right one keeps its height-1 arch); re-encoding drops the extension',
    width: 16,
    height: 1,
    setup: (board) => loadCode(board, ONE_WAY),
    actions: [],
    verify: (result) => {
      const level = result.initialLevel;
      const flags = tileFlags(ONE_WAY);
      expect(JSON.stringify(flags) === JSON.stringify([{ index: 0, flags: PORTAL }, { index: 15, flags: PORTAL }]),
        `the old code carries exactly the two portals, found ${JSON.stringify(flags)}`);
      expectNoRemovedFields(level, 'decoded 「one way」');
      expect(level.tiles[0][15].edgeArchLeft === 1, 'the height-1 arch on the old portal cell stays');
      const again = expectCleanReencode(ONE_WAY);
      // The portals were the only v5 flags, so the new code has no extension at all.
      expect(tileFlags(again).length === 0, 'no v5 tile list is written');
      expect(again.length < ONE_WAY.length, 'the re-encoded code is shorter');
    },
  }),
  defineScenario({
    name: 'legacy 「one way」 with a P1: the player passes the height-1 arch onto the old portal cell and stays there — nothing teleports',
    width: 16,
    height: 1,
    setup: (board) => {
      loadCode(board, ONE_WAY);
      // The map's P2 cannot pass the arch at (0,1); a P1 can.
      board.player(0, 1, 1);
    },
    actions: ['left'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 0, 'player', 1);
      expectEmpty(result.level, 0, 1);
      expectEmpty(result.level, 0, 15);
    },
  }),
  defineScenario({
    name: 'legacy B-004 dup-a: without its two portals the s1 + s1 push rolls as one train — no second train, nothing copied',
    width: 8,
    height: 6,
    setup: (board) => loadCode(board, DUP_A),
    actions: ['down', 'right'],
    verify: (result) => {
      expect(tileFlags(DUP_A).filter(entry => entry.flags & PORTAL).length === 2, 'the old code carries two portals');
      const { level } = result;
      expectObject(level, 2, 1, 'player', 3);
      // The lead eats the (2,4) flake, bends down at the ◥ and takes the (4,5) ball along.
      expectObject(level, 3, 5, 'snowball', 1);
      expectObject(level, 4, 5, 'snowball', 2);
      expectObject(level, 5, 5, 'snowball', 1);
      expect(level.tiles[4][2].isFlake, 'nothing reaches the (4,2) flake any more');
      const seen = new Set<object>();
      for (const row of level.objects) {
        for (const object of row) {
          if (!object) continue;
          expect(!seen.has(object), 'one object stands in two cells');
          seen.add(object);
        }
      }
    },
  }),
  defineScenario({
    name: 'legacy small board from the old encoder: re-encoded byte for byte as the same board without portal and orange tiles, and the player walks the row to the goal',
    width: 7,
    height: 3,
    setup: (board) => loadCode(board, SMALL),
    actions: ['right', 'right', 'right', 'right', 'right', 'right'],
    verify: (result) => {
      const clean = createLevel(7, 3);
      clean.objects[1][0] = { type: 'player', size: 2, isMelting: false, createdAt: 0 };
      clean.tiles[1][6].isGoal = true;
      expect(expectCleanReencode(SMALL) === encodeLevelCode(clean),
        'the re-encoded code must equal the code of the board built without the removed tiles');
      // The first step lands on the old portal cell and stays; the third enters the old
      // orange wall cell; the sixth reaches the goal.
      expectObject(result.turns[0].level, 1, 1, 'player', 2);
      expectEmpty(result.turns[0].level, 1, 5);
      expectObject(result.turns[2].level, 1, 3, 'player', 2);
      expect(result.turns.slice(0, 5).every(turn => turn.status === 'playing'), 'no early clear through a portal');
      expectStatus(result, 'cleared');
      expectObject(result.level, 1, 6, 'player', 2);
    },
  }),
  defineScenario({
    name: 'Studio JSON and levels built before the removal: deserializeLevel and newGameState drop the portal and orange fields, and the cells play as plain ground',
    width: 5,
    height: 1,
    setup: (board) => {
      board.player(0, 0, 1);
      // Fields the Tile and GameObject types no longer have, as an old level carried them.
      Object.assign(board.level.tiles[0][1], { isPortal: true });
      Object.assign(board.level.tiles[0][2], { isOrangeWall: true });
      Object.assign(board.level.tiles[0][3], { isOrangeButton: true, orangePressed: true });
      Object.assign(board.level.tiles[0][4], { isPortal: true });
      Object.assign(board.level.objects[0][0]!, { justTeleported: true });
    },
    actions: ['right', 'right'],
    verify: (result) => {
      // The engine reads none of them: no teleport, and the old orange wall lets the player in.
      expectObject(result.turns[0].level, 0, 1, 'player', 1);
      expectEmpty(result.turns[0].level, 0, 4);
      expectObject(result.level, 0, 2, 'player', 1);

      const old = result.initialLevel;
      expect('isPortal' in old.tiles[0][1], 'the hand-built level carries the old fields');
      const fromJson = deserializeLevel(serializeLevel(old));
      expect(!!fromJson, 'the old Studio JSON must load');
      expectNoRemovedFields(fromJson, 'deserializeLevel');
      const started = newGameState(old);
      expectNoRemovedFields(started.level, 'newGameState');
      expect('isPortal' in old.tiles[0][1], 'newGameState must not change the level it was given');
    },
  }),
];
