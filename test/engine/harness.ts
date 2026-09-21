import type { Direction, GameObject, GameStatus, Level, Tile } from '../../src/types';
import { executeSkipTurn, executeTurn, type TurnResult } from '../../src/engine/turn';
import { cloneLevel, createLevel, findPlayer } from '../../src/utils/level';

export type ScenarioAction = Direction | 'wait';

export interface ScenarioResult {
  initialLevel: Level;
  level: Level;
  status: GameStatus;
  turns: TurnResult[];
}

export interface ScenarioDefinition {
  name: string;
  width: number;
  height: number;
  setup: (board: ScenarioBoard) => void;
  actions: ScenarioAction[];
  verify: (result: ScenarioResult) => void;
}

/**
 * Small declarative board builder for engine regression cases. Coordinates are
 * zero-based: `row` increases downward and `col` increases to the right.
 */
export class ScenarioBoard {
  readonly level: Level;

  constructor(width: number, height: number) {
    this.level = createLevel(width, height);
  }

  tile(row: number, col: number, patch: Partial<Tile>): this {
    Object.assign(this.level.tiles[row][col], patch);
    return this;
  }

  object(row: number, col: number, type: GameObject['type'], size: number, patch: Partial<GameObject> = {}): this {
    this.level.objects[row][col] = {
      type,
      size,
      isMelting: false,
      createdAt: 0,
      ...patch,
    };
    return this;
  }

  player(row: number, col: number, size: number): this {
    return this.object(row, col, 'player', size);
  }

  snowball(row: number, col: number, size: 1 | 2): this {
    return this.object(row, col, 'snowball', size);
  }

  snowman(row: number, col: number, size: 1 | 2 | 3): this {
    return this.object(row, col, 'snowman', size);
  }

  laser(row: number, col: number, direction: Direction): this {
    return this.object(row, col, 'laser', 1, { laserDirection: direction });
  }

  /** Add an edge arch on the boundary that is crossed when leaving this cell. */
  edgeArch(row: number, col: number, direction: Direction, height: 1 | 2): this {
    switch (direction) {
      case 'right': this.level.tiles[row][col + 1].edgeArchLeft = height; break;
      case 'left': this.level.tiles[row][col].edgeArchLeft = height; break;
      case 'down': this.level.tiles[row + 1][col].edgeArchTop = height; break;
      case 'up': this.level.tiles[row][col].edgeArchTop = height; break;
    }
    return this;
  }
}

export function defineScenario(definition: ScenarioDefinition): ScenarioDefinition {
  return definition;
}

export function runScenario(definition: ScenarioDefinition): ScenarioResult {
  const board = new ScenarioBoard(definition.width, definition.height);
  definition.setup(board);

  const initialLevel = cloneLevel(board.level);
  let level = board.level;
  let status: GameStatus = 'playing';
  const turns: TurnResult[] = [];

  for (const action of definition.actions) {
    const result = action === 'wait' ? executeSkipTurn(level) : executeTurn(level, action);
    turns.push(result);
    level = result.level;
    status = result.status;
  }

  const result = { initialLevel, level, status, turns };
  definition.verify(result);
  return result;
}

export function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function expectStatus(result: ScenarioResult, expected: GameStatus): void {
  expect(result.status === expected, `expected status ${expected}, received ${result.status}`);
}

export function expectEmpty(level: Level, row: number, col: number): void {
  const actual = level.objects[row][col];
  expect(!actual, `expected (${row}, ${col}) to be empty, found ${describeObject(actual)}`);
}

export function expectObject(
  level: Level, row: number, col: number, type: GameObject['type'], size?: number,
): void {
  const actual = level.objects[row][col];
  expect(!!actual, `expected ${type} at (${row}, ${col}), found empty`);
  expect(actual.type === type, `expected ${type} at (${row}, ${col}), found ${describeObject(actual)}`);
  if (size !== undefined) {
    expect(actual.size === size, `expected ${type} size ${size} at (${row}, ${col}), found ${actual.size}`);
  }
}

export function expectNoPlayer(level: Level): void {
  expect(!findPlayer(level), 'expected no surviving player');
}

export function expectFrame(
  result: ScenarioResult,
  turnIndex: number,
  phase: TurnResult['frames'][number]['phase'],
  predicate: (level: Level) => boolean,
  message: string,
): void {
  const turn = result.turns[turnIndex];
  expect(!!turn, `turn ${turnIndex + 1} was not executed`);
  const frame = turn.frames.find(candidate => candidate.phase === phase && predicate(candidate.level));
  expect(!!frame, message);
}

function describeObject(object: GameObject | null): string {
  return object ? `${object.type} size ${object.size}` : 'empty';
}
