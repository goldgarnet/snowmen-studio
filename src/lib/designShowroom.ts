import type { GameObject, Level, ObjectType, Tile } from '../types';
import { encodeLevelCode } from '../utils/levelCode';

// '게임에서 보기' 의 전시 맵. 푸는 판이 아니라 요소를 한눈에 보는 판이다.
//   # 벽 · 1~4 나무 · o O 눈덩이 · s S Z 눈사람 · B 블록 · L 레이저 · P 플레이어
//   , 따뜻한 바닥 · h 구멍 · c 금 · f 눈꽃 · a 영혼 발판 · t 삼각 벽
//   y 노란 버튼 · Y 노란 벽 · g 초록 버튼 · G 목표
const ROWS = [
  '#1#2#3#4#1#2#',
  '1...........2',
  '#.o.O.s.S.Z.#',
  '3...........4',
  '#.,,,.P.B.t.#',
  '2.,,,.....L.1',
  '#.h.c.f.a...#',
  '4.y.Y.g...G.3',
  '1...........2',
  '#1#2#3#4#1#2#',
];

const TILES: Record<string, Partial<Tile>> = {
  ',': { isWarm: true },
  h: { isHole: true },
  c: { isCrack: true },
  f: { isFlake: true },
  a: { isSoulSwap: true },
  t: { triangle: 'bl' },
  y: { isYellowButton: true },
  Y: { isYellowWall: true },
  g: { isKeyTile: true },
  G: { isGoal: true },
};

const makeObject = (type: ObjectType, size = 1, extra: Partial<GameObject> = {}): GameObject =>
  ({ type, size, isMelting: false, createdAt: 0, ...extra });

function objectAt(mark: string, playerSize: number): GameObject | null {
  switch (mark) {
    case '#': return makeObject('wall');
    case '1': case '2': case '3': case '4': return makeObject('tree', 1, { treeHeight: Number(mark) });
    case 'o': return makeObject('snowball', 1);
    case 'O': return makeObject('snowball', 2);
    case 's': return makeObject('snowman', 1);
    case 'S': return makeObject('snowman', 2);
    case 'Z': return makeObject('snowman', 3);
    case 'B': return makeObject('block');
    case 'L': return makeObject('laser', 1, { laserDirection: 'right' });
    case 'P': return makeObject('player', playerSize);
    default: return null;
  }
}

export function showroomCode(playerSize: number): string {
  const tiles = ROWS.map((row) => [...row].map((mark): Tile => ({
    isWarm: false, isShade: false, isFlake: false, isRowArch: false, isColumnArch: false, isGoal: false,
    ...TILES[mark],
  })));
  tiles[1][4].edgeArchLeft = 1;
  tiles[1][8].edgeArchLeft = 2;
  tiles[3][5].edgeArchTop = 1;
  tiles[3][7].edgeArchTop = 2;
  tiles[3][2].isColumnArch = true;
  tiles[3][10].isRowArch = true;
  const level: Level = {
    width: ROWS[0].length,
    height: ROWS.length,
    sunDirection: 'left',
    hasShadow: false,
    soulSwapEnabled: false,
    tiles,
    objects: ROWS.map((row) => [...row].map((mark) => objectAt(mark, playerSize))),
  };
  return encodeLevelCode(level);
}
