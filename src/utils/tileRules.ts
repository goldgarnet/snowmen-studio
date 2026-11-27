import type { Level, Tile } from '../types';

// Same-cell placement rules (2026-11-28 user request: a button, a soul footplate or the goal
// may not share its cell with a crack or a hole; red buttons/walls). The editor's brushes refuse a forbidden
// pair with a short notice, and the editor warns about pairs already in an opened map.
// Engine and decoder never strip them: old map codes and their saved solutions keep
// working exactly as before. Pure functions so the engine test runner can check them.

export type CellFeature =
  | 'greenButton'
  | 'yellowButton'
  | 'redButton'
  | 'yellowWall'
  | 'redWall'
  | 'crack'
  | 'hole'
  | 'triangle'
  | 'soulSwap'
  | 'goal';

const HAS: Record<CellFeature, (tile: Tile) => boolean> = {
  greenButton: (tile) => !!tile.isKeyTile,
  yellowButton: (tile) => !!tile.isYellowButton,
  redButton: (tile) => !!tile.isRedButton,
  yellowWall: (tile) => !!tile.isYellowWall,
  redWall: (tile) => !!tile.isRedWall,
  crack: (tile) => !!tile.isCrack,
  hole: (tile) => !!tile.isHole,
  triangle: (tile) => !!tile.triangle,
  soulSwap: (tile) => !!tile.isSoulSwap,
  goal: (tile) => !!tile.isGoal,
};

export const BUTTON_FLOOR_MSG = '버튼은 균열·구멍과 같은 칸에 둘 수 없습니다';
export const SOUL_PLATE_FLOOR_MSG = '영혼 발판은 균열·구멍과 같은 칸에 둘 수 없습니다';
export const GOAL_FLOOR_MSG = '목표는 균열·구멍과 같은 칸에 둘 수 없습니다';
export const RED_BUTTON_WALL_MSG = '빨간 버튼과 빨간 벽은 같은 칸에 둘 수 없습니다';
export const YELLOW_RED_WALL_MSG = '노란 벽과 빨간 벽은 같은 칸에 둘 수 없습니다';
export const RED_BUTTON_MIX_MSG = '빨간 버튼은 초록·노란 버튼과 같은 칸에 둘 수 없습니다';
// A triangle wall and a yellow button/wall cannot share a cell: the map code stores both
// in the same slot, so the yellow part would silently vanish on save (B-12). Red follows
// yellow so the two colors read the same.
export const TRIANGLE_YELLOW_MSG = '삼각 벽 칸에는 노란 버튼·노란 벽을 함께 둘 수 없습니다';
export const TRIANGLE_RED_MSG = '삼각 벽 칸에는 빨간 버튼·빨간 벽을 함께 둘 수 없습니다';
export const RED_WALL_NO_BUTTON_MSG = '빨간 버튼이 없어 빨간 벽이 열리지 않습니다';

/**
 * Unordered same-cell pairs the editor refuses, each with the notice it shows. Allowed on
 * purpose: a button of another color inside a red or yellow wall cell, a wall with a
 * crack/hole/goal/flake/warmth/footplate/arch, and the green + yellow button pair that
 * older maps already use. A soul footplate or the goal on a crack/hole is refused too (user
 * decision 2026-11-28 — waiting on the plate would drop the body, a goal would fall in).
 */
export const FORBIDDEN_PAIRS: readonly { a: CellFeature; b: CellFeature; message: string }[] = [
  { a: 'greenButton', b: 'crack', message: BUTTON_FLOOR_MSG },
  { a: 'greenButton', b: 'hole', message: BUTTON_FLOOR_MSG },
  { a: 'yellowButton', b: 'crack', message: BUTTON_FLOOR_MSG },
  { a: 'yellowButton', b: 'hole', message: BUTTON_FLOOR_MSG },
  { a: 'redButton', b: 'crack', message: BUTTON_FLOOR_MSG },
  { a: 'redButton', b: 'hole', message: BUTTON_FLOOR_MSG },
  { a: 'soulSwap', b: 'crack', message: SOUL_PLATE_FLOOR_MSG },
  { a: 'soulSwap', b: 'hole', message: SOUL_PLATE_FLOOR_MSG },
  { a: 'goal', b: 'crack', message: GOAL_FLOOR_MSG },
  { a: 'goal', b: 'hole', message: GOAL_FLOOR_MSG },
  { a: 'redButton', b: 'redWall', message: RED_BUTTON_WALL_MSG },
  { a: 'yellowWall', b: 'redWall', message: YELLOW_RED_WALL_MSG },
  { a: 'redButton', b: 'greenButton', message: RED_BUTTON_MIX_MSG },
  { a: 'redButton', b: 'yellowButton', message: RED_BUTTON_MIX_MSG },
  { a: 'triangle', b: 'yellowButton', message: TRIANGLE_YELLOW_MSG },
  { a: 'triangle', b: 'yellowWall', message: TRIANGLE_YELLOW_MSG },
  { a: 'triangle', b: 'redButton', message: TRIANGLE_RED_MSG },
  { a: 'triangle', b: 'redWall', message: TRIANGLE_RED_MSG },
];

/** The feature each editor brush adds to its cell. Brushes not listed add none of them. */
export const BRUSH_FEATURE: Readonly<Record<string, CellFeature>> = {
  keyTile: 'greenButton',
  yellowButton: 'yellowButton',
  redButton: 'redButton',
  yellowWall: 'yellowWall',
  redWall: 'redWall',
  hole: 'hole',
  crackWarm: 'crack',
  crackCool: 'crack',
  triangle: 'triangle',
  soulSwap: 'soulSwap',
  goal: 'goal',
};

/**
 * Why `brush` may not paint this cell, or null when it may. On a refusal the editor leaves
 * the cell as it was. A hole and a crack are not a forbidden pair — those brushes still
 * replace each other.
 */
export function brushRefusal(tile: Tile, brush: string): string | null {
  const feature = BRUSH_FEATURE[brush];
  if (!feature) return null;
  for (const pair of FORBIDDEN_PAIRS) {
    const other = pair.a === feature ? pair.b : pair.b === feature ? pair.a : null;
    if (other && HAS[other](tile)) return pair.message;
  }
  return null;
}

export interface CellConflict {
  row: number;
  col: number;
  message: string;
}

/**
 * Cells of a map that break the rules above, in row-major order: a forbidden pair already
 * on one cell (older maps, imported codes or JSON), and every red wall of a map without
 * any red button (such a wall can never open). One entry per cell and message. The editor
 * only shows these; saving is never blocked.
 */
export function cellConflicts(level: Level): CellConflict[] {
  const conflicts: CellConflict[] = [];
  const hasRedButton = level.tiles.some((row) => row.some((tile) => !tile.isVoid && !!tile.isRedButton));
  for (let row = 0; row < level.height; row++) {
    for (let col = 0; col < level.width; col++) {
      const tile = level.tiles[row][col];
      if (tile.isVoid) continue;
      const messages = new Set<string>();
      for (const pair of FORBIDDEN_PAIRS) {
        if (HAS[pair.a](tile) && HAS[pair.b](tile)) messages.add(pair.message);
      }
      if (tile.isRedWall && !hasRedButton) messages.add(RED_WALL_NO_BUTTON_MSG);
      for (const message of messages) conflicts.push({ row, col, message });
    }
  }
  return conflicts;
}
