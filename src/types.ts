export type SunDirection = 'left' | 'right' | 'up' | 'down';
export type ObjectType = 'player' | 'snowball' | 'snowman' | 'block' | 'wall' | 'tree' | 'laser';
export type Direction = 'left' | 'right' | 'up' | 'down';

// Triangle wall orientation: which corner holds the right angle (the two solid legs
// meet there). The opposite diagonal (hypotenuse) is the reflective mirror face.
// The triangle occupies ~half the cell as a corner wedge; objects/players may share
// the cell. A rolling snowball that enters across an open edge reflects 90°; the two
// solid leg edges block crossing.
//   tl = ◤ (solid top+left)   tr = ◥ (solid top+right)
//   bl = ◣ (solid bottom+left) br = ◢ (solid bottom+right)
export type TriangleCorner = 'tl' | 'tr' | 'bl' | 'br';

export interface Tile {
  isWarm: boolean;
  isShade: boolean;
  isFlake: boolean;
  isRowArch: boolean;        // legacy: now called "row tunnel" (가로 터널)
  isColumnArch: boolean;     // legacy: now called "column tunnel" (세로 터널)
  isGoal: boolean;
  // Edge arches: stored only on top/left edges of a tile to avoid duplication.
  // Value is the maximum object size that can pass: 1 = height-1 arch, 2 = height-2 arch.
  // Undefined / 0 = no arch.
  // - edgeArchTop: arch on the edge between this tile and the tile above (blocks vertical movement)
  // - edgeArchLeft: arch on the edge between this tile and the tile to the left (blocks horizontal movement)
  edgeArchTop?: number;
  edgeArchLeft?: number;
  // Soul-swap footplate: when the player steps onto it, the soul moves to another
  // snowman (nearest rule); the old body is left behind as a snowman.
  isSoulSwap?: boolean;
  // Green button (formerly "key footplate"): while any green button exists on the
  // map, the goal is only active when every green button is covered by an object.
  isKeyTile?: boolean;
  // Yellow button: while ALL yellow buttons are covered, every yellow wall
  // disappears (toggles back when any yellow button becomes uncovered).
  isYellowButton?: boolean;
  // Yellow wall: acts like a solid wall unless all yellow buttons are pressed.
  isYellowWall?: boolean;
  // Orange button: like a yellow button, but LATCHING — once pressed (covered by an
  // object) it stays pressed forever, even after the object leaves. Orange walls
  // vanish permanently once every orange button has been pressed at least once.
  isOrangeButton?: boolean;
  // Orange wall: acts like a solid wall until all orange buttons have latched.
  isOrangeWall?: boolean;
  // Runtime-only latch for an orange button: set true the first time it is covered
  // and never reset. NOT saved in the map code (initial state = unpressed); cloneLevel
  // propagates it during play.
  orangePressed?: boolean;
  // Hole: any object that moves onto this tile falls in and disappears. The player
  // cannot move onto a hole. No object can be placed on a hole in the editor.
  isHole?: boolean;
  // Cracked tile: when an object or player steps onto it, the tile turns into a hole
  // one turn later (whether or not the stepper is still there). Warm/cold variants use
  // the existing isWarm flag. Runtime-only crackArmed marks it as "will become a hole
  // next turn"; not saved in the map code.
  isCrack?: boolean;
  crackArmed?: boolean;
  // Portal: a map must have exactly 0 or 2. An object/player that moves onto a portal
  // (from a non-portal cell) is instantly relocated to the other portal, unless the
  // destination portal already holds an object. Stored as a tile flag (objects rest
  // on top of it), like the soul-swap footplate.
  isPortal?: boolean;
  // Triangle wall (half-cell corner mirror). Undefined = none.
  triangle?: TriangleCorner;
}

export interface GameObject {
  type: ObjectType;
  size: number;
  isMelting: boolean;
  treeHeight?: number;
  laserDirection?: SunDirection;
  createdAt: number;
  // Triangle block: a normal block (same size / shadow / push / backing / laser rules)
  // that additionally deflects a rolling snowball like a triangle wall of this corner.
  // Undefined = an ordinary block.
  triangleCorner?: TriangleCorner;
  // Runtime-only: set when this object was relocated by a portal during the current
  // turn, so the post-push portal pass does not teleport it a second time. Cleared at
  // end of turn; not saved in the map code.
  justTeleported?: boolean;
}

export interface Position {
  row: number;
  col: number;
}

export interface Level {
  width: number;
  height: number;
  sunDirection: SunDirection;
  hasShadow: boolean;
  // When true, the player may press M to cycle the soul through the snowman queue.
  soulSwapEnabled: boolean;
  // Transient (not saved in the map code): the soul-swap footplate the player is
  // "armed" on. The swap fires one turn after stepping on, if still on that plate.
  soulSwapArmedAt?: Position | null;
  tiles: Tile[][];
  objects: (GameObject | null)[][];
}

export type GameStatus = 'playing' | 'cleared' | 'gameover';

export interface GameState {
  level: Level;
  status: GameStatus;
  turnCount: number;
  history: Level[];
}
