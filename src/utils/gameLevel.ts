// snowmen-adventure(Godot 출시 빌드)에 **그대로 붙여넣을 수 있는** 레벨 JSON 을 만든다.
//
// 게임은 `levels/L<번호>.json` 을 파일명으로 읽고, 그 안이 이 세 형식 중 하나면 된다:
//   ① adventure 네이티브  ② studio Level JSON  ③ { id, name, code } 맵 코드 래퍼
// 여기서는 ③ 을 만든다 — 한 줄짜리라 복붙 사고가 안 나고, 게임 쪽 디코더
// (game/rules/level_io.gd) 가 studio 의 levelCode.ts 와 **같은 비트 레이아웃**이라
// 코드 문자열 하나로 맵 전체가 재현된다.
//
// 관련: snowmen-adventure/levels/README.md

export interface GameLevelJson {
  id: string;
  name: string;
  code: string;
}

/**
 * 맵 제목에서 레벨 번호를 추측한다.
 * 팀이 실제로 "2. 눈꽃과 크기 변화" 처럼 앞에 번호를 붙여 쓰고 있어서,
 * 그 번호를 그대로 레벨 번호로 쓰고 제목에서는 떼어낸다.
 *   "2. 눈꽃과 크기 변화" → { num: 2, name: "눈꽃과 크기 변화" }
 *   "튜토리얼"            → { num: null, name: "튜토리얼" }
 */
export function splitLeadingNumber(title: string): { num: number | null; name: string } {
  const t = (title ?? '').trim();
  const m = t.match(/^(\d{1,3})\s*[.)\-:]\s*(.*)$/);
  if (m) {
    const num = parseInt(m[1], 10);
    const rest = m[2].trim();
    if (num > 0 && rest.length > 0) return { num, name: rest };
  }
  return { num: null, name: t || '이름 없음' };
}

export function buildGameLevel(code: string, levelNumber: number, name: string): GameLevelJson {
  return { id: `L${levelNumber}`, name, code };
}

/** 파일에 그대로 쓸 수 있는 텍스트 (끝에 개행 포함 — 에디터가 붙이는 것과 맞춘다) */
export function gameLevelText(level: GameLevelJson): string {
  return JSON.stringify(level, null, 2) + '\n';
}

export function gameLevelFileName(levelNumber: number): string {
  return `levels/L${levelNumber}.json`;
}
