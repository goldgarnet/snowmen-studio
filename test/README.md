# 엔진 시나리오 테스트 작성 가이드

`test/engine/cases/`의 테스트는 작은 퍼즐 보드 하나에 **하나의 규칙 또는 버그 재현 상황**을 담는다. 실제 `src/engine`을 실행하므로, 엔진 동작을 바꿀 때 회귀를 막는 용도다. 별도 테스트 라이브러리는 사용하지 않는다.

## 실행하기

```bash
npm run test:engine
```

러너는 `test/engine/cases/` 아래의 모든 `*.scenario.ts` 파일을 재귀적으로 찾아 실행한다. 새 파일을 목록에 등록할 필요는 없다. 실패하면 시나리오 이름과 `expect...`에 전달한 오류 메시지가 출력된다.

## 새 테스트 작성 순서

1. 재현할 규칙을 하나만 정한다. 여러 상호작용이 필요해도, 기대 결과는 한 가지 문제를 설명하도록 작게 유지한다.
2. `test/engine/cases/`에 `kebab-case.scenario.ts` 파일을 만든다. 관련 기능이 있으면 하위 폴더를 사용해도 된다.
3. 아래 템플릿을 복사하여 초기 보드, 입력, 기대 결과를 채운다.
4. `npm run test:engine`을 실행한다.

좌표는 `(row, col)`이며 좌상단이 `(0, 0)`이다. 아래로 갈수록 `row`, 오른쪽으로 갈수록 `col`이 증가한다. 입력은 `up`, `down`, `left`, `right`, `wait`만 쓴다.

## 복사해서 쓰는 템플릿

```ts
import {
  defineScenario,
  expectEmpty,
  expectObject,
  expectStatus,
  type ScenarioDefinition,
} from '../harness';

export const scenarios: ScenarioDefinition[] = [
  defineScenario({
    // 어떤 규칙을 보장하는지 드러나는, 구체적인 문장으로 작성한다.
    name: 'a size-1 snowball stops at a wall',
    width: 4,
    height: 1,
    setup: (board) => {
      board
        .player(0, 0, 2)
        .snowball(0, 1, 1)
        .object(0, 3, 'wall', 100);
    },
    // 위에서부터 차례로 한 턴씩 실행된다.
    actions: ['right'],
    verify: (result) => {
      expectStatus(result, 'playing');
      expectObject(result.level, 0, 1, 'player', 2);
      expectObject(result.level, 0, 2, 'snowball', 1);
      expectEmpty(result.level, 0, 0);
    },
  }),
];
```

한 파일에는 `scenarios` 배열로 관련된 여러 케이스를 넣을 수 있다. 각 케이스는 반드시 `defineScenario({ ... })`로 감싸고, 파일에서 `scenarios`라는 이름으로 export한다.

## 구성 요소

| 필드 | 역할 |
| --- | --- |
| `name` | 실패 로그에 출력되는 설명. “조건 + 기대 동작”이 드러나게 작성한다. |
| `width`, `height` | 보드 크기. 필요한 최소 크기를 사용한다. |
| `setup` | 초기 오브젝트·타일·레벨 옵션을 배치한다. |
| `actions` | 실행할 입력 순서. `wait`도 하나의 유효 턴이다. |
| `verify` | 모든 입력 후의 최종 보드와 상태를 검증한다. |

`result.initialLevel`에는 실행 전 보드, `result.level`에는 최종 보드, `result.status`에는 최종 게임 상태, `result.turns`에는 입력별 엔진 결과와 프레임이 있다.

## 초기 보드 만들기

`setup`의 `board` 메서드는 체이닝할 수 있다.

```ts
setup: (board) => {
  board
    .player(2, 0, 3)
    .snowball(2, 1, 1)
    .snowman(1, 3, 2)
    .laser(0, 2, 'down')
    .object(2, 5, 'wall', 100)
    .tile(2, 3, { isFlake: true })
    .tile(1, 1, { isYellowButton: true })
    .edgeArch(2, 3, 'right', 1);
},
```

- `.player(row, col, size)`, `.snowball(row, col, size)`, `.snowman(row, col, size)`, `.laser(row, col, direction)`로 자주 쓰는 오브젝트를 놓는다.
- `.object(row, col, type, size, patch?)`는 `wall`, `block`, `tree`, `triangleBlock` 등 모든 오브젝트에 사용한다. 일반 벽처럼 크기가 의미 없는 단단한 물체는 기존 케이스처럼 `100`을 쓴다.
- `.tile(row, col, patch)`는 타일 속성을 덮어쓴다. 예: `{ isFlake: true }`, `{ isHole: true }`, `{ isPortal: true }`, `{ isYellowButton: true }`, `{ isYellowWall: true }`, `{ triangle: 'br' }`.
- `.edgeArch(row, col, direction, height)`는 그 칸에서 `direction`으로 나갈 때 넘는 경계에 높이 1 또는 2 아치를 둔다.
- 레벨 옵션이 필요하면 기존 케이스처럼 `board.level.soulSwapEnabled = true`로 설정한다.

사용 가능한 정확한 오브젝트·타일 속성 이름은 [`src/types.ts`](../src/types.ts), 실전 예시는 [`engine/cases`](./engine/cases)를 기준으로 한다.

## 결과 검증하기

대부분은 최종 상태를 아래 헬퍼로 확인한다.

아래에서 추가로 쓰는 `expect`, `expectNoPlayer`는 템플릿의 import 목록에 함께 추가한다.

```ts
verify: (result) => {
  expectStatus(result, 'playing'); // 'playing' | 'cleared' | 'gameover'
  expectObject(result.level, 2, 3, 'snowball', 2);
  expectEmpty(result.level, 2, 1);
  expectNoPlayer(result.level);
  expect(result.level.tiles[2][3].orangePressed === true, 'button must latch');
},
```

- `expectStatus(result, status)` — 최종 게임 상태를 확인한다.
- `expectObject(level, row, col, type, size?)` — 특정 칸의 오브젝트 종류와 선택적으로 크기를 확인한다.
- `expectEmpty(level, row, col)` — 특정 칸이 비었는지 확인한다.
- `expectNoPlayer(level)` — 생존 플레이어가 없는지 확인한다.
- `expect(condition, message)` — 타일 상태, 레벨 옵션 등 위 헬퍼로 표현할 수 없는 값을 확인한다. 실패 원인을 알 수 있는 메시지를 작성한다.

### 굴림 중간 tick 검증

굴림, 버튼/벽 변화, 레이저처럼 **최종 위치만으로 순서를 보장할 수 없는 규칙**은 `expectFrame`을 추가한다. 첫 입력의 인덱스는 `0`이며 phase는 `movement`, `resolved`, `impact`, `turn-end` 중 하나다.

```ts
expectFrame(
  result,
  0,
  'movement',
  (level) => level.objects[3][4]?.type === 'snowball',
  'expected the snowball to reach the second button during movement',
);
```

`predicate`는 해당 phase의 프레임 중 하나가 조건을 만족하면 통과한다. 같은 phase의 정확한 발생 횟수나 전체 프레임 순서를 검증해야 한다면 `result.turns[turnIndex].frames`를 직접 검사한다.

## 작성 기준

- 기존 케이스와 같은 영어 설명식 `name`을 사용하고, 조건과 결과를 구체적으로 쓴다.
- 버그 재현은 원래 맵을 통째로 옮기지 말고, 실패를 재현하는 최소 보드로 줄인다.
- 한 케이스는 가능한 한 하나의 규칙만 검증한다. 변형은 별도 `defineScenario`로 만든다.
- 기대 결과는 관련 위치·크기·타일 상태·게임 상태를 모두 명시한다. 우연히 통과하는 느슨한 검증은 피한다.
- 입력이 막히는 경우에는 위치뿐 아니라 `turnCount`, 녹기, 균열처럼 턴 종료 효과가 진행되지 않는지도 필요에 따라 확인한다.
- 새 버그가 발견되면 기존 기대값을 바꾸기보다, 그 차이를 드러내는 회귀 시나리오를 추가한다.

## 버그 제보를 테스트로 옮길 때 필요한 정보

1. 격자 크기와 오브젝트/타일의 좌표
2. 입력 순서
3. 기대 최종 위치·크기·승패
4. 굴림이 있다면, 어떤 tick에서 어떤 순서로 일어나야 하는지

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
