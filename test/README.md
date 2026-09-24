# 엔진 시나리오 테스트

`npm run test:engine`은 `test/engine/cases/` 아래의 모든 `*.scenario.ts` 파일을 찾아 실제 `src/engine` 코드로 실행한다. 별도 테스트 라이브러리는 사용하지 않는다.

## 새 상황 추가하기

이미지로 버그를 제보할 때는 다음 세 정보를 함께 적는다.

1. 격자 크기와 각 오브젝트/타일의 좌표 (좌상단이 `(0, 0)`, 아래가 row 증가, 오른쪽이 col 증가)
2. 입력 순서 (`right`, `left`, `up`, `down`, `wait`)
3. 기대 최종 위치·크기·승패 또는 중간 tick에서 기대하는 현상

`test/engine/cases/example.scenario.ts` 같은 이름으로 다음 형태의 파일을 만든다. 러너가 자동으로 발견하므로 목록을 따로 등록할 필요가 없다.

```ts
import {
  defineScenario, expectEmpty, expectObject, expectStatus, type ScenarioDefinition,
} from '../harness';

export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    name: 'short Korean description of the rule',
    width: 6,
    height: 4,
    setup: (board) => {
      board
        .player(2, 0, 2)
        .snowball(2, 1, 1)
        .tile(2, 3, { isFlake: true })
        .edgeArch(2, 3, 'right', 1);
    },
    actions: ['right', 'wait'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 2, 3, 'snowball', 2);
      expectEmpty(result.level, 2, 1);
    },
  }),
];
```

## 제공하는 도구

`ScenarioBoard`는 다음을 지원한다.

- `.player(row, col, size)`, `.snowball(row, col, size)`, `.snowman(row, col, size)`, `.laser(row, col, direction)`
- `.object(row, col, type, size, extra)` — 벽, 블록, 나무, 삼각 블록 등 모든 오브젝트
- `.tile(row, col, partialTile)` — 버튼, 벽, 눈송이, 구멍, 포털, 삼각 타일 등 모든 타일 속성
- `.edgeArch(row, col, direction, height)` — 해당 칸에서 `direction`으로 나갈 때 통과하는 가장자리 아치

검증에는 `expectStatus`, `expectObject`, `expectEmpty`, `expectNoPlayer`를 쓴다. 굴림 중간 상태까지 확인하려면 `expectFrame(result, turnIndex, phase, predicate, message)`를 사용한다. `phase`는 `movement`, `resolved`, `impact`, `turn-end` 중 하나이고 `turnIndex`는 첫 입력이 `0`이다.

## 포함된 회귀 사례

- `core-mechanics.scenario.ts`에는 다른 구현체에서도 그대로 옮겨 쓸 수 있는 작은 규칙 명세를 담는다. 밀기/force, 눈꽃 성장, 크기 3 연쇄 밀기, 노랑·주황 벽, 레이저, 포털, 구멍·균열, 초록 키·골, 영혼 발판, 삼각 반사를 각각 독립된 보드로 검증한다.
- 높이 1 아치에서 뒤쪽 크기 2 눈덩이는 멈추고, 이미 앞쪽에 있던 `1, 1, 2` suffix는 계속 굴러가는 경우
- 굴러온 눈덩이가 마지막 노란 버튼을 누르는 동일 tick에 벽이 열리고 레이저가 플레이어를 제거하는 경우

## 다른 게임 구현체에 적용하기

각 시나리오의 `setup`은 초기 보드, `actions`는 입력 순서, `verify`는 최종 규칙 결과다. 다른 언어·엔진에서는 같은 좌표와 오브젝트/타일을 자신의 맵 형식으로 변환한 뒤, 같은 입력을 실행하여 `verify`의 위치·크기·타일 상태·승패가 일치하는지 확인하면 된다.

테스트는 의도적으로 하나의 규칙만 바꾸는 작은 보드를 사용한다. 새 게임에서 규칙 차이가 발견되면 기존 케이스를 바꾸기보다, 차이를 보여 주는 최소 보드를 새 시나리오로 추가하는 방식을 권장한다.

Godot 등 다른 게임 구현을 검증할 수 있는 전체 체크리스트는
[`GAME_IMPLEMENTATION_CASES.md`](./GAME_IMPLEMENTATION_CASES.md)에 있다. 기본 이동부터
굴림 질량 충돌, 색상 벽, 특수 타일, 영혼 이전, 프레임 재생, 속도 슬라이더, 결정성·무한루프까지
P0/P1/P2 우선순위로 정리되어 있다.
