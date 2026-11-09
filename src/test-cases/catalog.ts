import type { Direction, GameObject, Level, Tile } from '../types';
import { executeSkipTurn, executeTurn, type TurnResult } from '../engine/turn';
import { cloneLevel, createLevel } from '../utils/level';
import { decodeLevelCode } from '../utils/levelCode';

export type TestAction = Direction | 'wait';
export type TestPriority = 'P0' | 'P1' | 'P2';

export interface TestCaseDefinition {
  id: string;
  priority: TestPriority;
  category: string;
  title: string;
  summary: string;
  expected: string;
  actions?: TestAction[];
  build?: () => Level;
}

export interface TestFrame {
  turnIndex: number;
  phase: TurnResult['frames'][number]['phase'];
  level: Level;
}

export interface TestRun {
  initialLevel: Level;
  finalLevel: Level;
  status: 'playing' | 'cleared' | 'gameover';
  turns: TurnResult[];
  frames: TestFrame[];
}

function object(level: Level, row: number, col: number, type: GameObject['type'], size: number, patch: Partial<GameObject> = {}): void {
  level.objects[row][col] = { type, size, isMelting: false, createdAt: 0, ...patch };
}

function tile(level: Level, row: number, col: number, patch: Partial<Tile>): void {
  Object.assign(level.tiles[row][col], patch);
}

function basicLevel(width = 10, height = 5): Level {
  return createLevel(width, height);
}

function buildBasicMove(): Level {
  const level = basicLevel();
  object(level, 2, 1, 'player', 1);
  return level;
}

function buildRolling(): Level {
  const level = basicLevel(12, 5);
  object(level, 2, 0, 'player', 3);
  object(level, 2, 1, 'snowball', 1);
  return level;
}

function buildSplit(): Level {
  const level = basicLevel(7, 5);
  object(level, 2, 0, 'player', 2);
  object(level, 2, 1, 'snowball', 2);
  object(level, 2, 2, 'wall', 1);
  return level;
}

function buildArchSplit(): Level {
  const level = basicLevel(12, 5);
  const row = 2;
  object(level, row, 0, 'player', 3);
  object(level, row, 1, 'snowball', 2);
  object(level, row, 3, 'snowball', 1);
  object(level, row, 5, 'snowball', 1);
  object(level, row, 7, 'snowball', 2);
  level.tiles[row][6].edgeArchLeft = 1;
  level.tiles[row][10].edgeArchLeft = 1;
  return level;
}

function buildYellowLaser(): Level {
  const level = basicLevel(8, 7);
  const row = 3;
  object(level, row, 1, 'player', 2);
  object(level, row, 2, 'snowball', 1);
  tile(level, row, 2, { isYellowButton: true });
  tile(level, row, 4, { isYellowButton: true });
  tile(level, 4, 2, { isYellowWall: true });
  object(level, 5, 2, 'laser', 1, { laserDirection: 'up' });
  return level;
}

function buildClosingWall(): Level {
  const level = basicLevel(12, 5);
  const row = 2;
  object(level, row, 0, 'player', 3);
  object(level, row, 1, 'snowball', 1);
  object(level, row, 2, 'snowball', 1);
  object(level, row, 4, 'snowball', 1);
  tile(level, row, 5, { isYellowButton: true });
  tile(level, row, 7, { isYellowWall: true });
  return level;
}

function buildImpact(): Level {
  const level = basicLevel(12, 5);
  const row = 2;
  object(level, row, 0, 'player', 3);
  object(level, row, 1, 'snowball', 1);
  object(level, row, 2, 'snowball', 1);
  object(level, row, 4, 'snowball', 2);
  return level;
}

function buildHole(): Level {
  const level = basicLevel(8, 5);
  object(level, 2, 0, 'player', 3);
  object(level, 2, 1, 'snowball', 1);
  tile(level, 2, 3, { isHole: true });
  return level;
}

function buildTriangleReflection(): Level {
  const level = basicLevel(8, 6);
  object(level, 4, 1, 'player', 3);
  object(level, 4, 2, 'snowball', 1);
  tile(level, 4, 4, { triangle: 'br' });
  return level;
}

// B-001: the ball resting in the ◥ and the ball against its exit are one mass-2 group.
function buildTriangleGroup(): Level {
  const level = basicLevel(6, 5);
  object(level, 1, 0, 'player', 2);
  object(level, 1, 1, 'snowball', 1);
  tile(level, 1, 4, { triangle: 'tr' });
  object(level, 1, 4, 'snowball', 1);
  object(level, 2, 4, 'snowball', 1);
  return level;
}

// B-002: the ball reaches the only green button while the player is on the goal, and the map stops.
function buildRollOverGreenButton(): Level {
  const level = basicLevel(8, 3);
  object(level, 1, 0, 'player', 2);
  tile(level, 1, 1, { isGoal: true });
  object(level, 1, 1, 'snowball', 1);
  tile(level, 1, 4, { isKeyTile: true });
  return level;
}

// B-013 (team decision 2026-11-05): a ball in a triangle is pushed around the mirror.
function buildPushInTriangle(): Level {
  const level = basicLevel(5, 4);
  object(level, 1, 0, 'player', 2);
  tile(level, 1, 1, { triangle: 'tr' });
  object(level, 1, 1, 'snowball', 1);
  return level;
}

// B-017 (team decision 2026-11-05): the block falling through the crack opens the beam that turn.
function buildCrackOpensBeam(): Level {
  const level = basicLevel(5, 3);
  object(level, 0, 0, 'laser', 1, { laserDirection: 'right' });
  tile(level, 0, 1, { isCrack: true });
  object(level, 0, 1, 'block', 1);
  object(level, 0, 3, 'snowman', 1);
  object(level, 2, 1, 'player', 2);
  return level;
}

// B-003: a P2 cannot reach through the height-1 arch between A and B.
function buildSnowmanPastArch(): Level {
  const level = basicLevel(3, 5);
  object(level, 0, 1, 'player', 2);
  object(level, 1, 1, 'snowball', 1);
  object(level, 2, 1, 'snowball', 1);
  level.tiles[2][1].edgeArchTop = 1;
  object(level, 3, 1, 'wall', 100);
  return level;
}

// B-005: the new snowman eats the flake under B and becomes an S3, too big for the height-2 arch.
function buildSnowmanFlakePastArch(): Level {
  const level = basicLevel(5, 3);
  object(level, 1, 0, 'player', 2);
  object(level, 1, 1, 'snowball', 1);
  object(level, 1, 2, 'snowball', 2);
  tile(level, 1, 2, { isFlake: true, edgeArchLeft: 2 });
  object(level, 1, 3, 'wall', 100);
  return level;
}

// B-006: the s1 rests in a ◥ whose right leg backs it; C is empty.
function buildTerrainBackedS2S1(): Level {
  const level = basicLevel(5, 3);
  object(level, 1, 0, 'player', 2);
  object(level, 1, 1, 'snowball', 2);
  tile(level, 1, 2, { triangle: 'tr' });
  object(level, 1, 2, 'snowball', 1);
  return level;
}

// B-013: the rolling s2 hits the lighter ball resting in the ◥. The ball leaves by the
// mirror exit (down) and the s2 follows it into the ◥, bends and rolls down with it.
function buildHeavierRollIntoTriangle(): Level {
  const level = basicLevel(6, 5);
  object(level, 0, 0, 'player', 3);
  object(level, 0, 1, 'snowball', 2);
  tile(level, 0, 4, { triangle: 'tr' });
  object(level, 0, 4, 'snowball', 1);
  return level;
}

// B-028 (user decision 2026-11-09, 「세 모퉁이」): the upper half of the split shoves the
// ◥ ball toward its solid leg, so the ball turns with the mirror to (1,4).
function buildSplitShoveIntoTriangle(): Level {
  const level = basicLevel(7, 5);
  object(level, 2, 4, 'player', 2);
  tile(level, 2, 5, { isKeyTile: true });
  object(level, 2, 5, 'snowball', 2);
  tile(level, 1, 5, { triangle: 'tr' });
  object(level, 1, 5, 'snowball', 1);
  tile(level, 3, 5, { triangle: 'br' });
  object(level, 2, 6, 'wall', 100);
  return level;
}

// B-028: P2 presses a ball against the left leg of a ◤ from outside the triangle.
function buildPressOnTriangleLeg(): Level {
  const level = basicLevel(5, 3);
  object(level, 1, 0, 'player', 2);
  object(level, 1, 1, 'snowball', 1);
  tile(level, 1, 2, { triangle: 'tl' });
  return level;
}

// B-009: the upper half of the split shoves the (1,1) ball to (0,1) and takes its cell.
function buildSplitShoveMotionIds(): Level {
  const level = basicLevel(5, 4);
  object(level, 1, 1, 'snowball', 1);
  object(level, 2, 0, 'player', 2);
  object(level, 2, 1, 'snowball', 2);
  object(level, 2, 2, 'wall', 100);
  return level;
}

// B-009: the S1 is pushed onto the player's start cell (1,1); the last `down` drops the
// player into the hole and the soul moves into that S1.
function buildSoulBodyMotionIds(): Level {
  const level = basicLevel(5, 3);
  object(level, 1, 0, 'snowman', 1);
  object(level, 1, 1, 'player', 2);
  object(level, 1, 3, 'snowman', 1);
  tile(level, 2, 2, { isHole: true });
  return level;
}

// P2-06: a map code saved before portals and orange buttons/walls were removed
// (2026-11-03). Row 1 holds P2 · portal · orange button · orange wall · floor · portal ·
// goal. The decoder drops those bits, so the player walks the whole row to the goal.
const LEGACY_PORTAL_ORANGE_CODE = 'dZaSFMGW0LEGjbWPDVECGEbaXOjgXdGW12KGxHF1FayWOSiF2aotky7lr3oiedInikKYbn';

function buildLegacyPortalOrangeCode(): Level {
  return decodeLevelCode(LEGACY_PORTAL_ORANGE_CODE) ?? basicLevel();
}

const visualCases: Record<string, Pick<TestCaseDefinition, 'actions' | 'build'>> = {
  'P0-01': { actions: ['right'], build: buildBasicMove },
  'P0-05': { actions: ['right'], build: buildRolling },
  'P0-10': { actions: ['right'], build: buildSplit },
  'P0-17': { actions: ['right'], build: buildArchSplit },
  'P0-18': { actions: ['right'], build: buildClosingWall },
  'P0-21': { actions: ['right'], build: buildYellowLaser },
  'P0-22': { actions: ['right'], build: buildYellowLaser },
  'P0-23': { actions: ['right'], build: buildHole },
  'P0-14': { actions: ['right'], build: buildImpact },
  'P1-11': { actions: ['right'], build: buildImpact },
  'P1-12': { actions: ['right'], build: buildRolling },
  'P1-13': { actions: ['right'], build: buildRolling },
  'P1-14': { actions: ['right'], build: buildRolling },
  'P1-15': { actions: ['right'], build: buildRolling },
  'P1-16': { actions: ['right'], build: buildTriangleReflection },
  'P0-26': { actions: ['right'], build: buildTriangleGroup },
  'P0-27': { actions: ['right'], build: buildRollOverGreenButton },
  'P0-28': { actions: ['down'], build: buildSnowmanPastArch },
  'P0-30': { actions: ['right'], build: buildSnowmanFlakePastArch },
  'P0-31': { actions: ['right'], build: buildTerrainBackedS2S1 },
  'P0-32': { actions: ['right'], build: buildHeavierRollIntoTriangle },
  'P0-33': { actions: ['right'], build: buildPushInTriangle },
  'P0-34': { actions: ['wait', 'wait'], build: buildCrackOpensBeam },
  'P0-37': { actions: ['right'], build: buildSplitShoveIntoTriangle },
  'P0-38': { actions: ['right'], build: buildPressOnTriangleLeg },
  'P1-15a': { actions: ['right'], build: buildSplitShoveMotionIds },
  'P1-15b': { actions: ['up', 'right', 'right', 'right', 'down', 'left', 'left', 'down'], build: buildSoulBodyMotionIds },
  'P2-06': { actions: ['right', 'right', 'right', 'right', 'right', 'right'], build: buildLegacyPortalOrangeCode },
};

const rawCases: Omit<TestCaseDefinition, 'actions' | 'build'>[] = [
  ['P0-01', 'P0', '기본 이동', '빈 칸 한 칸 이동', '플레이어가 빈 칸으로 한 칸 이동한다.', '플레이어 위치가 한 칸 바뀌고 턴이 1 증가한다.'],
  ['P0-02', 'P0', '기본 이동', '맵 경계에서 막힌 입력', '경계 밖으로 이동하려는 입력이다.', '위치·턴 종료 효과·레이저 상태가 변하지 않는다.'],
  ['P0-03', 'P0', '기본 이동', 'void와 일반 벽 차단', 'void와 벽은 같은 이동 차단 경계를 만든다.', '플레이어가 어느 쪽도 통과하지 못한다.'],
  ['P0-04', 'P0', '기본 이동', '눈송이 흡수와 최대 크기', '눈송이를 밟을 때 크기가 증가한다.', '플레이어 크기는 최대 3이며 눈송이는 소비된다.'],
  ['P0-05', 'P0', '밀기', '단일 오브젝트 밀기', '플레이어가 눈덩이를 밀어 굴림을 시작한다.', '플레이어와 눈덩이가 이동하고 눈덩이가 계속 굴러간다.'],
  ['P0-06', 'P0', '밀기', '레이저 발사면에서 밀기 금지', '레이저 발사면 쪽에서는 레이저를 밀 수 없다.', '입력이 실패하고 레이저·플레이어가 그대로다.'],
  ['P0-07', 'P0', '합성', '눈사람 합성 3종', '1+1, 1+2, 2+2 눈덩이 합성이다.', '각각 크기 1, 2, 3 눈사람이 된다.'],
  ['P0-08', 'P0', '합성', '낮은 아치에서 큰 눈사람 합성 금지', '완성 크기와 미는 플레이어 크기로 합성 경계를 다시 검사한다.', '완성 눈사람이나 미는 플레이어가 통과할 수 없는 경계 너머 합성은 실패한다(P0-28).'],
  ['P0-09', 'P0', '직접 힘', '크기 1 눈덩이 압착', '막힌 크기 1 눈덩이에 직접 힘을 준다.', '눈덩이가 눈송이로 부서지고 입력은 유효하다.'],
  ['P0-10', 'P0', '직접 힘', '크기 2 눈덩이 양방향 분할', '크기 2 눈덩이가 수직 방향으로 갈라진다.', '양쪽·한쪽·완전 차단 결과가 원자적으로 결정된다.'],
  ['P0-11', 'P0', '직접 힘', '힘은 직접 닿은 눈덩이에만', '플레이어와 눈덩이 사이에 블록이 있다.', '블록 너머의 눈덩이는 부서지지도 쪼개지지도 않는다.'],
  ['P0-12', 'P0', '굴림', '굴림은 한 tick에 최대 한 칸', '한 입력이 여러 내부 tick으로 나뉜다.', '각 movement frame의 논리 이동은 최대 한 칸이다.'],
  ['P0-13', 'P0', '질량', '더 무거운 굴림 그룹의 흡수', '더 무거운 그룹이 가벼운 그룹을 민다.', '두 그룹이 전진 후 하나의 그룹으로 병합된다. 삼각 칸에서 꺾인 묶음은 P0-32.'],
  ['P0-14', 'P0', '질량', '같은 질량 탄성 충돌', '같은 질량 충돌에서 운동이 전달된다.', 'impact 뒤 정지 그룹이 굴러간다.'],
  ['P0-15', 'P0', '질량', '더 무거운 장애물 그룹', '진행 그룹보다 장애물이 무겁다.', '진행 그룹이 충돌 위치에서 정지한다.'],
  ['P0-16', 'P0', '질량', '굴림 중 눈송이로 질량 변화', '열차 구성원이 굴러가며 눈송이를 먹는다.', '다음 충돌 전에 총질량이 갱신된다.'],
  ['P0-17', 'P0', '그룹 분리', '열차의 뒤쪽 큰 공만 아치에 막힘', '모든 구성원의 경계를 독립적으로 검사한다.', '막힌 prefix는 정지하고 앞 suffix는 계속 굴러간다.'],
  ['P0-18', 'P0', '그룹 분리', '닫히는 노란 벽 안의 공 정지', '벽 뒤·벽 안·벽 앞 공을 구분한다.', '갇힌 공과 뒤쪽은 정지하고 앞 suffix만 진행한다.'],
  ['P0-19', 'P0', '색상 벽', '닫힌 색상 벽은 받침이 됨', '닫힌 벽은 이동 차단과 단단한 받침으로 동작한다.', '압착·분할과 일반 굴림이 같은 판정을 사용한다.'],
  ['P0-20', 'P0', '지형', '터널·삼각 벽·void 혼합 분리', '한 열차가 서로 다른 지형을 동시에 만난다.', '공별 canCross와 점유 전파로 suffix가 결정된다.'],
  ['P0-21', 'P0', '버튼·레이저', '마지막 노란 버튼과 레이저의 같은 tick', '눈덩이가 마지막 버튼을 누른다.', 'movement에서 버튼을 누르고 resolved에서 레이저가 반응한다.'],
  ['P0-22', 'P0', '버튼·레이저', '게임 오버 후 활성 굴림 유지', '레이저로 플레이어가 먼저 사망한다.', 'gameover여도 이미 시작된 눈덩이는 계속 굴러간다.'],
  ['P0-23', 'P0', '특수 타일', '굴림 중 구멍', '눈덩이가 구멍으로 들어간다.', '눈덩이가 제거되고 굴림이 종료된다.'],
  ['P0-25', 'P0', '레이저', '레이저 차단 순서', '벽·삼각 벽·닫힌 노란 벽이 빔 경로에 있다.', '빔은 삼각 벽을 통과하고 일반 벽과 닫힌 노란 벽에서 멈춘다.'],
  ['P0-26', 'P0', '질량', '삼각 칸 공의 꺾인 묶음', '굴러온 공이 삼각 칸에 멈춘 공을 친다. 그 공의 거울 출구에 다른 공이 붙어 있다.', '두 공을 한 묶음(질량 2)으로 센다. 질량 1이 맞으면 굴러온 공만 멈춘다. 출구가 비면 예전처럼 거울 방향으로 나가고, 질량이 같으면 묶음 전체가 나간다(B-001). 더 무거우면 함께 굴러간다(P0-32).'],
  ['P0-27', 'P0', '클리어', '굴림 중 초록 버튼 클리어', '플레이어가 목표에 선 채 민 공이 마지막 초록 버튼으로 굴러간다.', '공이 버튼 위에 있는 tick에 목표가 열리므로 그 턴은 클리어이고, 판이 거기서 멈춰 공은 버튼 위에 남는다. 같은 tick의 사망이 먼저다(B-002, B-027).'],
  ['P0-28', 'P0', '합성', '아치 너머 눈사람 — 플레이어도 통과', 'P2가 높이 1 아치 너머의 눈덩이 쪽으로 크기 1 눈덩이를 민다.', '플레이어가 A→B 경계를 지날 수 없으므로 합성하지 않는다(무반응). P1은 같은 자리에서 합성한다(B-003).'],
  ['P0-30', 'P0', '합성', '눈송이 위 B로 만드는 눈사람과 합성 경계', 'P2가 높이 2 아치 너머, 눈송이 위의 크기 2 눈덩이 쪽으로 크기 1 눈덩이를 민다.', '새 눈사람은 눈송이를 먹어 크기 3이 되므로 아치를 지나지 못해 합성하지 않는다(무반응, B-005).'],
  ['P0-31', 'P0', '직접 힘', '지형에만 받쳐진 B1을 B2 너머로 밈', 'P2가 크기 2 눈덩이 너머, 삼각 벽의 막힌 변에 받쳐진 크기 1 눈덩이를 민다.', '아무 일도 없다(무반응). 힘은 플레이어에 닿은 공에만 가고, 삼각 벽의 막힌 변은 부숨·쪼갬의 받침이 아니다(B-006, B-028).'],
  ['P0-32', 'P0', '질량', '더 무거운 굴림이 삼각 칸 공을 데리고 꺾임', '굴러온 B2가 삼각 칸에 멈춘 더 가벼운 B1을 친다.', '친 tick에 B1이 거울 출구로 한 칸 나가고 B2가 삼각 칸으로 따라 들어와 다음 tick에 꺾인다. 둘이 한 열차로 맵 끝까지 굴러가고 impact는 없다. 출구가 막히면 아무것도 안 움직이고, 같은 질량이면 예전처럼 넘긴다(B-013, 사용자 결정 ①).'],
  ['P0-33', 'P0', '직접 힘', '삼각 칸 공을 막힌 변 쪽으로 밀기', 'P2가 삼각 칸에 멈춘 B1을 막힌 변 쪽으로 민다.', '눈꽃 없이 공이 거울을 따라 굴러가고 플레이어는 삼각 칸으로 들어간다. 출구 바로 앞이 벽·맵 끝이면 곧은 줄처럼 부서지고, 다른 삼각 칸의 막힌 변이면 아무 일도 없다(B-013, B-028).'],
  ['P0-34', 'P0', '레이저', '금 붕괴로 열린 빔', '빔을 막던 상자가 금 간 칸으로 떨어진다.', '빔이 그 턴에 열려 빔 위 눈사람이 그 턴에 녹는다(B-017).'],
  ['P0-37', 'P0', '직접 힘', '쪼개진 반쪽이 삼각 칸 공을 밀기', '크기 2 눈덩이가 쪼개지며 위쪽 반쪽이 ◥ 칸의 B1을 막힌 변 쪽으로 민다.', 'B1이 거울을 따라 꺾여 한 칸 밀리고 반쪽이 ◥ 칸에 들어간다. 꺾인 칸이 막혔으면 반쪽은 가운데에 남는다. 상자·레이저는 꺾이지 않는다(B-028).'],
  ['P0-38', 'P0', '직접 힘', '삼각 벽 다리에 눌린 눈덩이', 'P2가 삼각 칸 밖의 B1을 그 칸의 막힌 변 쪽으로 민다.', '부서지지 않는다(무반응). 크기 2는 쪼개지지 않는다. 다리에 받쳐 눈사람 만들기는 그대로다(B-028).'],
  ['P1-02', 'P1', '턴 종료', '금 간 타일의 두 턴 붕괴', '균열 타일은 다음 턴 종료에 붕괴한다.', '막힌 입력은 붕괴를 진행시키지 않는다.'],
  ['P1-03', 'P1', '턴 종료', '햇빛과 녹기', '따뜻한 타일에서 오브젝트가 녹는다.', '플레이어와 눈덩이의 녹기 시점이 다르다.'],
  ['P1-04', 'P1', '턴 종료', '그림자 갱신', '이동·성장·벽 상태 변경 후 그림자를 계산한다.', 'void에는 그림자를 만들지 않는다.'],
  ['P1-05', 'P1', '영혼', '레이저 사망 후 영혼 이전', '플레이어가 사망하면 눈사람 후보를 찾는다.', '거리와 createdAt 순서로 새 플레이어를 선택한다.'],
  ['P1-06', 'P1', '영혼', '영혼 순환은 턴을 소비하지 않음', 'M 입력으로 영혼을 순환한다.', '이동·녹기·레이저·턴 수가 진행되지 않는다.'],
  ['P1-07', 'P1', '영혼', '영혼 발판의 지연 발동', '같은 발판에 머문 다음 유효 턴에 발동한다.', '진입 즉시 영혼이 바뀌지 않는다.'],
  ['P1-08', 'P1', '클리어', '레이저보다 클리어 판정이 늦음', '목표 위 플레이어가 레이저에 노출된다.', '같은 순간(이동 직후, 굴림의 같은 tick)의 레이저 사망이 클리어보다 먼저 처리된다. 굴림은 클리어가 정해진 tick에서 끝나므로 뒤 tick의 빔은 없다(B-027).'],
  ['P1-09', 'P1', '클리어', '클리어 조건의 초록 버튼', '모든 초록 버튼을 덮어야 목표가 활성화된다.', '버튼 조건과 목표 점유를 모두 만족해야 클리어된다.'],
  ['P1-10', 'P1', '결정성', '동일 입력 결정성', '같은 보드와 입력을 두 번 실행한다.', '최종 상태와 frame 순서가 완전히 같다.'],
  ['P1-11', 'P1', '프레임', '프레임 phase 순서', '한 입력에서 이동·환경 반응·충돌이 발생한다.', 'movement, resolved, impact, turn-end 순서가 보존된다.'],
  ['P1-12', 'P1', '프레임', '애니메이션 끄기와 켜기 결과 동등성', '같은 입력을 두 표시 모드로 실행한다.', '최종 상태와 undo 기록이 같다.'],
  ['P1-13', 'P1', '프레임', '재생 중 토글 끄기', 'transition 도중 애니메이션을 끈다.', '타이머를 취소하고 최종 상태로 즉시 이동한다.'],
  ['P1-14', 'P1', '프레임', '속도 슬라이더', '0.1배·1배·5배로 재생한다.', '논리 결과는 같고 프레임 시간만 달라진다.'],
  ['P1-15', 'P1', '프레임', 'motion ID 연속성', '같은 공의 여러 frame을 비교한다.', '계속 존재하는 entity만 같은 motionId를 유지한다.'],
  ['P1-15a', 'P1', '프레임', 'motion ID — 쪼개진 반쪽이 밀어낸 공', '크기 2 눈덩이가 쪼개지며 위쪽 반쪽이 이웃 공을 한 칸 밀어내고 그 칸에 들어간다.', '밀려난 공은 원래 motionId를 유지하고 새 반쪽은 새 ID를 받는다. 한 frame 안에서 ID는 물체마다 하나다(B-009).'],
  ['P1-15b', 'P1', '프레임', 'motion ID — 영혼이 옮겨 간 새 몸', '플레이어 시작 칸에 눈사람을 밀어 넣고 구멍에 빠져 영혼이 그 눈사람으로 옮겨 간다.', '새 몸은 옛 몸과 다른 motionId를 받아 몸이 바뀐 것으로 인식된다(soulChangedBody, B-009).'],
  ['P1-16', 'P1', '프레임', '특수 이동은 가짜 경로를 보이지 않음', '삼각 블록 반사처럼 여러 칸을 건너뛰는 이동을 애니메이션으로 재생한다.', '여러 칸 특수 이동은 즉시 전환한다.'],
  ['P2-01', 'P2', '안전성', '삼각 반사 무한 루프', '반복 경로를 만드는 삼각 반사판이다.', '안전 한도 안에서 게임이 멈추지 않고 종료된다.'],
  ['P2-02', 'P2', '안전성', '동시 이동 덮어쓰기 방지', '세 오브젝트 연쇄 이동이다.', '앞 오브젝트부터 이동해 중복·소실이 없다.'],
  ['P2-03', 'P2', '안전성', '입력 잠금', '애니메이션 재생 중 여러 입력을 보낸다.', '추가 turn·undo·영혼 이동이 생성되지 않는다.'],
  ['P2-04', 'P2', '안전성', '프레임 스냅샷 불변성', '이전 frame을 참조한 채 다음 frame을 계산한다.', '과거 frame의 상태가 변하지 않는다.'],
  ['P2-05', 'P2', '저장', '저장된 풀이 재현', '맵 코드와 입력 문자열을 새 인스턴스에서 재생한다.', '최종 상태가 같고 맵 변경 시 풀이가 무효화된다.'],
  ['P2-06', 'P2', '저장', '포털·주황 비트가 남은 예전 맵 코드', '포털과 주황 버튼·벽은 2026-11-03 팀 결정으로 게임에서 뺐다. 그 전에 만든 맵 코드에는 그 비트가 남아 있다.', '코드는 그대로 열리고 그 칸은 평범한 바닥이다(다른 타일 정보는 유지). 다시 저장하면 그 비트는 0이다. 플레이어는 순간이동 없이 줄 끝 목표까지 걸어간다.'],
].map(([id, priority, category, title, summary, expected]) => ({
  id, priority, category, title, summary, expected,
} as Omit<TestCaseDefinition, 'actions' | 'build'>));

export const testCases: TestCaseDefinition[] = rawCases.map((testCase) => ({
  ...testCase,
  ...(visualCases[testCase.id] ?? {}),
}));

export function runTestCase(testCase: TestCaseDefinition): TestRun | null {
  if (!testCase.build || !testCase.actions) return null;
  const initialLevel = cloneLevel(testCase.build());
  let level = cloneLevel(initialLevel);
  let status: TestRun['status'] = 'playing';
  const turns: TurnResult[] = [];
  const frames: TestFrame[] = [];

  testCase.actions.forEach((action, turnIndex) => {
    const result = action === 'wait' ? executeSkipTurn(level) : executeTurn(level, action);
    turns.push(result);
    result.frames.forEach((frame) => frames.push({ turnIndex, phase: frame.phase, level: frame.level }));
    level = result.level;
    status = result.status;
  });

  return { initialLevel, finalLevel: level, status, turns, frames };
}
