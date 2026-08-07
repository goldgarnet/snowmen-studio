// snowmen-adventure(Godot 출시 빌드)에 **그대로 붙여넣을 수 있는** 레벨 JSON 을 만든다.
//
// 게임은 `levels/L<번호>.json` 을 파일명으로 읽고, 그 안이 이 세 형식 중 하나면 된다:
//   ① adventure 네이티브  ② studio Level JSON  ③ { id, name, code } 맵 코드 래퍼
// 여기서는 ③ 을 만든다 — 한 줄짜리라 복붙 사고가 안 나고, 게임 쪽 디코더
// (game/rules/level_io.gd) 가 studio 의 levelCode.ts 와 **같은 비트 레이아웃**이라
// 코드 문자열 하나로 맵 전체가 재현된다.
//
// ⚠ 레벨 번호는 **제목에서 추측하지 않는다.** 챕터 순서가 아직 안 정해졌고 제목에
//   번호를 붙이는 규칙도 없다. 사용자가 모달에서 직접 지정한다.
//   (제목을 파싱하던 버전이 있었는데, "눈사람 만들기 - 12" 를 L2 로 읽는 등
//    조용히 틀리는 데다 애초에 근거 없는 추측이라 걷어냈다.)
//
// 관련: snowmen-adventure/levels/README.md

export interface GameLevelJson {
  id: string;
  name: string;
  code: string;
}

export function buildGameLevel(code: string, levelNumber: number, name: string): GameLevelJson {
  return { id: `L${levelNumber}`, name: (name ?? '').trim() || '이름 없음', code };
}

/** 파일에 그대로 쓸 수 있는 텍스트 (끝에 개행 포함 — 에디터가 붙이는 것과 맞춘다) */
export function gameLevelText(level: GameLevelJson): string {
  return JSON.stringify(level, null, 2) + '\n';
}

export function gameLevelFileName(levelNumber: number): string {
  return `levels/L${levelNumber}.json`;
}
