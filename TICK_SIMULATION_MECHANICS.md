# Tick 기반 이동 시뮬레이션 메커니즘

이 문서는 Snowmen Studio의 tick 기반 굴림 처리 구현을 설명한다. React 화면을 위한 설명에 그치지 않고, Godot 등 다른 엔진에서 같은 퍼즐 규칙을 재현할 수 있도록 상태·시간·충돌·환경 효과의 경계를 명시한다.

## 1. 핵심 모델

게임에는 두 시간 단위가 있다.

| 단위 | 의미 | 예 |
| --- | --- | --- |
| Turn | 플레이어의 입력 한 번 | 오른쪽 키, 대기 키 |
| Tick | 한 turn 안에서 움직이는 물체가 최대 한 칸 진행하는 내부 시간 | 굴러가는 눈덩이의 한 칸 전진 |

한 번의 입력은 여러 tick을 낳을 수 있다. tick은 실제 1초를 기다린다는 뜻이 아니며, 엔진은 모든 tick을 동기적으로 즉시 계산한다. UI는 필요할 때 그 결과를 프레임으로 재생할 뿐이다.

```text
입력 turn 1회
  ├─ 최초 밀기 / 최초 한 칸 이동
  ├─ tick 0
  ├─ tick 1
  ├─ ...
  └─ 모든 운동이 멈춘 뒤 turn 종료 효과 1회
```

이 구분이 필요한 이유는 다음 두 가지다.

- 눈덩이가 여러 칸 굴러가는 중간에도 버튼, 벽, 레이저, 구멍은 실제 상태 변화를 만들어야 한다.
- 녹기, 그림자, 턴 수, 금 간 타일 붕괴처럼 “시간이 한 turn 지남”을 뜻하는 효과는 굴림 한 칸마다 반복되면 안 된다.

## 2. 구현 진입점과 프레임 API

`executeTurn()`은 레벨을 복제한 뒤 `executePush()`를 호출한다. 굴림이 시작되면 `push.ts`가 `roll.ts`에 tick 훅을 전달한다. 굴림이 아닌 일반 한 칸 밀기·강제 이동도 같은 `movement`/`resolved` 프레임 쌍을 남긴다.

```text
turn.ts executeTurn()
  └─ push.ts executePush(..., onRollTick)
       └─ roll.ts rollSnowball()/rollSnowballGroup()
            └─ 매 tick 뒤 onRollTick(level)
```

`TurnResult`에는 최종 `level`과 `status` 외에 프레임이 포함된다.

```ts
interface TurnFrame {
  level: Level;
  phase: 'movement' | 'resolved' | 'turn-end';
}

interface TurnResult {
  level: Level;
  status: GameStatus;
  frames: TurnFrame[];
}
```

각 프레임은 `cloneLevel()`로 복제된 독립 스냅샷이다. 이후 tick이 원래 레벨을 변경해도 과거 프레임은 바뀌지 않는다.

| `phase` | 시점 | 애니메이션 용도 |
| --- | --- | --- |
| `movement` | 한 tick 또는 일반 한 칸 이동의 위치 변경 직후, 전역 위험 처리 전 | 눈덩이가 버튼에 닿고 벽이 열리는 순간 표시 |
| `resolved` | 같은 이동 단위의 구멍·주황 버튼·레이저 처리 후 | 피격, 소멸, 영혼 이전 결과 표시 |
| `turn-end` | 모든 움직임이 멈춘 뒤 턴 종료 효과까지 적용한 최종 상태 | 다음 입력의 기준 상태 |

현재 UI는 프레임을 소비하지 않고 최종 `level`만 표시한다. 따라서 프레임 추가는 기존 즉시 표시 동작을 바꾸지 않으며, 이후 애니메이션 토글은 `TurnResult.frames`를 순서대로 재생하면 된다.

## 3. 굴림 그룹 데이터

굴림 그룹은 진행 방향 기준으로 뒤에서 앞 순서로 유지한다.

```text
오른쪽으로 굴림

rear                                      front
 [2] [1] [1] [2]  →
  0   1   2   3       group[3]이 선두
```

각 구성원에는 다음이 필요하다.

```text
RollingMember
  - pos: 현재 격자 좌표
  - obj: 해당 눈덩이 오브젝트 참조
```

그룹 질량은 모든 구성원의 `size` 합이다. 눈송이 흡수, 장애물 그룹 흡수, 아치 분리 뒤에는 다음 충돌 전에 항상 다시 계산한다.

```text
mass(group) = Σ member.obj.size
```

Godot에서는 오브젝트 참조 대신 안정적인 entity ID를 쓰고, 별도의 `entities[id]` 저장소에서 크기와 위치를 읽는 편이 안전하다.

## 4. 굴림 tick 알고리즘

다음은 현재 엔진의 굴림 tick을 구현 독립적으로 표현한 의사 코드다.

```text
while activeGroup is not empty and tickCount < safetyLimit:
    if this is the initial rolling tick:
        resolve lead hole/portal
        emit movement + resolved frames through tick hook
        continue or stop

    apply triangle reflection only when activeGroup has one ball

    blockedIndex = first member, scanning rear → front,
                   that cannot cross its own outgoing terrain boundary

    if blockedIndex exists:
        stoppedPrefix = members[0 .. blockedIndex]
        activeGroup = members[blockedIndex + 1 .. end]
        if activeGroup is empty: stop

    inspect cell in front of activeGroup.front

    if empty:
        shift activeGroup one cell
    else if it is a triangle block and activeGroup has one ball:
        deflect through the block to its reflected exit cell
    else if every consecutive obstacle is a snowball:
        compare active mass with obstacle mass
        if active > obstacle and obstacle can shift one cell:
            shift obstacle group one cell
            shift active group one cell
            merge them
        else if active == obstacle:
            stop this group and start the obstacle group rolling
        else:
            stop
    else:
        stop

    absorb snowflakes at the newly occupied cells
    resolve rolling lead hole/portal
    emit movement + resolved frames through tick hook
```

`safetyLimit`은 현재 `width × height × 4 + 16`이다. 포털과 반사판이 만드는 무한 순환으로부터 엔진을 보호한다.

## 5. 가장자리 아치에서의 그룹 분리

가장자리 아치는 오브젝트 크기별로 통과 여부를 결정한다. 높이 1 아치는 크기 1 이하만 통과시킨다.

중요한 규칙은 “한 구성원이 막혔다고 전체 굴림 열차가 멈추지 않는다”는 것이다.

```text
tick 시작

[2] | [1][1][2][_] |
     ^ 높이 1 아치

뒤쪽 2는 아치를 통과하지 못한다.
앞쪽 1, 1, 2는 이미 아치 반대편에 있으므로 운동을 유지한다.

tick 결과

[2] | [_][1][1][2] |
```

분리 규칙은 다음과 같다.

1. 진행 방향에서 뒤쪽부터 각 구성원이 자기 칸에서 다음 칸으로 갈 수 있는지 검사한다.
2. 처음 막힌 구성원과 그보다 뒤쪽 prefix는 현재 위치에 정지한다.
3. 막힌 구성원보다 앞쪽 suffix가 하나라도 남으면 새 굴림 그룹으로 유지한다.
4. 새 굴림 그룹은 같은 tick에 한 칸 이동한다.
5. 다음 충돌 때 새 suffix의 질량만 사용한다.

선두가 막혔다면 앞쪽 suffix가 없으므로 전체가 정지한다. 이 규칙은 아치뿐 아니라 터널, 삼각 벽의 막힌 변, 닫힌 색상 벽, 맵 경계와 void에도 적용된다.

## 6. 충돌과 질량 전달

진행 방향 앞의 연속 오브젝트를 하나의 장애물 그룹으로 수집한다.

| 조건 | 결과 |
| --- | --- |
| 장애물 중 눈덩이가 아닌 것이 있음 | 현재 굴림 그룹 정지 |
| 장애물 질량이 더 큼 | 현재 굴림 그룹 정지 |
| 질량이 같음 | 현재 그룹 정지, 장애물 그룹이 운동을 이어받음 |
| 현재 질량이 더 큼 + 장애물 전체가 한 칸 이동 가능 | 양 그룹이 한 칸 이동한 뒤 하나의 굴림 그룹으로 병합 |
| 현재 질량이 더 큼 + 장애물 이동 불가 | 현재 굴림 그룹 정지 |

장애물 그룹은 원래 정지해 있던 물체이므로, 더 무거운 굴림 그룹이 밀 때 하나의 단위로 한 칸 이동할 수 있어야 한다. 반대로 이미 운동 중인 그룹은 5절의 규칙에 따라 경계에서 suffix로 분리될 수 있다.

## 7. 한 tick의 환경 반응

굴림이 한 칸을 커밋하면 `turn.ts`의 tick 훅이 호출된다. 이 훅은 다음 순서로 실행된다.

```text
1. movement 프레임 복제
2. 구멍 위의 오브젝트 제거 및 플레이어 영혼 이전
3. 주황 버튼 래치
4. 현재 버튼/벽 상태를 사용한 전역 레이저 발사
5. resolved 프레임 복제
```

노란 벽은 별도 변경 명령이 필요 없는 파생 상태다. 레이저가 실행될 때 `yellowWallsSolid()`가 현재 점유 상태를 읽으므로, 해당 tick에 버튼을 밟은 오브젝트가 바로 벽을 열 수 있다.

레이저 판정은 굴러가는 공만 확인하지 않고 보드 전체를 검사한다. 모든 레이저의 경로를 현재 tick의 상태에서 계산하고, 피격된 플레이어·눈덩이·눈사람을 제거한다. 플레이어가 사라지면 가장 가까운 눈사람으로 영혼 이전을 시도한다.

### 버튼과 레이저 사례

```text
tick t의 이동 직후

왼쪽 노란 버튼: 플레이어가 점유
오른쪽 노란 버튼: 굴러온 눈덩이가 점유
→ 노란 벽 열림
→ 상향 레이저가 플레이어에 도달
→ resolved 프레임에서 플레이어 사망/영혼 이전
```

다음 tick에 눈덩이가 오른쪽 버튼을 떠나 벽이 다시 닫혀도, 같은 tick에 확정된 레이저 피격은 취소되지 않는다.

## 8. 즉시 효과와 turn 종료 효과의 구분

| 매 tick | 한 turn이 완전히 끝난 뒤 한 번 |
| --- | --- |
| 굴림 위치 변경 | 그림자 재계산 |
| 눈송이 흡수 | 녹기 |
| 구멍·굴림 포털 | 이전 turn에 무장된 금 간 타일 붕괴 |
| 노란 버튼·노란 벽 | 다음 turn용 금 간 타일 무장 |
| 주황 버튼 래치·주황 벽 | 최종 클리어 판정 |
| 레이저·사망·영혼 이전 | UI/풀이 turn 수 처리 |

일반 이동 뒤 포털 처리, 영혼 발판, 최종 레이저/목표 판정은 기존 `executeTurn()`의 turn 종료 경로에서도 한 번 더 적용된다. 이 보조 처리는 굴림이 아닌 플레이어 이동의 기존 규칙을 보존한다. `justTeleported` 플래그가 굴림 중 포털 이동한 오브젝트의 중복 이동을 막는다.

## 9. 동시성 규칙

Godot 등 다른 엔진에서 이 규칙을 구현할 때 가장 중요한 원칙은 격자를 순회하면서 즉시 덮어쓰지 않는 것이다.

```text
S(t)에서 모든 이동 의도 계산
→ 충돌·경계 해결
→ 허용된 위치 변경을 한 번에 commit
→ commit된 상태의 버튼/벽/레이저 반응 계산
→ S(t+1)
```

이동 가능한지 여부는 tick 시작 상태에서 판정한다. 버튼을 막 밟아 열린 벽은 현재 tick의 다른 이동 의도에는 소급 적용하지 않고, 환경 반응과 다음 tick의 이동 판정부터 반영하는 것이 결정적이고 순서 의존성이 적다.

레이저는 위치 commit 뒤 확정된 버튼·벽 상태를 스냅샷으로 사용한다. 피격 결과 때문에 버튼이 풀려 벽이 다시 닫혀도, 이미 수집한 해당 tick의 피격은 취소하지 않는다.

## 10. 애니메이션 연결 방법

엔진은 시간을 기다리지 않는다. UI는 `frames`만 재생한다.

```text
입력 시 executeTurn() 호출
→ result.frames 보관
→ animation toggle이 켜져 있으면 프레임을 순서대로 표시
→ 마지막 turn-end 프레임에서 입력 다시 허용

toggle이 꺼져 있으면
→ result.level을 즉시 표시
```

권장 재생 방법:

- `movement` 프레임: 공·플레이어·강제 이동 오브젝트가 새 칸에 도착하는 장면을 100~200ms 정도 표시
- `resolved` 프레임: 레이저 피격·영혼 이전·구멍 낙하 같은 결과를 다음 이동 전에 즉시 반영
- `turn-end` 프레임: 최종 정착 상태로 유지

UI는 프레임을 수정하면 안 된다. 프레임은 엔진 출력이며, 재생 중 새 입력은 막거나 큐에 넣어야 한다.

에디터의 일반 플레이 `Simulator`와 저장 가능한 풀이 녹화 `SolutionRecorder`는 모두 상단의 `이동 애니메이션` 체크 토글로 이 재생을 제어한다. 즉, 저장된 맵의 풀이 등록 화면과 수정 중인 맵의 일반 플레이 화면 사이에 표시·동작 차이가 없어야 한다. 기본값은 꺼짐이므로 기존처럼 최종 상태를 즉시 표시한다. 켜면 입력 하나를 하나의 turn/undo 기록으로 먼저 확정한 뒤 프레임을 차례로 표시하고, 재생 중에는 방향 입력·대기·되돌리기·초기화·영혼 이동을 비활성화한다.

재생 중에도 두 화면의 토글은 끌 수 있다. 끄는 순간 남은 프레임 타이머를 취소하고, 같은 입력으로 이미 계산해 둔 최종 `level`·승패 상태로 즉시 이동한다. 풀이 녹화 화면에서는 기록할 이동 문자열도 이미 한 번만 추가된 상태다. turn 수와 undo 기록은 추가하거나 되돌리지 않는다.

재생은 셀마다 멈춰 보이지 않도록 FLIP(First, Last, Invert, Play) 방식으로 그린다. 엔진이 `motionId`라는 저장되지 않는 런타임 ID를 프레임 오브젝트에 유지하면, Grid는 다음 칸에 그려진 같은 오브젝트를 이전 칸만큼 역방향으로 잠시 옮긴 뒤 `movement` 프레임의 150ms 동안 선형 보간으로 제자리까지 이동시킨다. 따라서 논리적으로는 여전히 “한 tick = 최대 한 칸”이지만 화면에서는 연속적으로 굴러간다. 포털처럼 한 칸보다 큰 이동과 삼각 블록을 통한 특수 이동은 통과하지 않은 타일을 가로질러 보이지 않도록 즉시 전환한다.

## 11. Godot 이식 제안

Godot에서는 다음처럼 책임을 나누면 된다.

```text
BoardState
  - tile grid
  - entity grid / entity registry
  - derived wall state

TurnResolver
  - 입력을 최초 이동 또는 힘 이벤트로 변환
  - tick loop 소유
  - turn 종료 효과 실행

TickResolver
  - motion intent 생성
  - 충돌, 질량, 그룹 분리, 위치 commit
  - immediate reaction 실행
  - TickSnapshot 반환

Presentation
  - TickSnapshot 배열을 Tween/AnimationPlayer로 재생
  - 시뮬레이션 상태를 변경하지 않음
```

`TickSnapshot`에는 적어도 다음을 저장하는 것이 좋다.

```text
- 모든 entity의 ID, 위치, 크기, 타입
- 타일의 동적 상태: 눈송이, 균열 무장, 주황 래치
- 파생 벽 상태 또는 재계산에 필요한 버튼 점유 상태
- 해당 tick의 이벤트: 이동, 그룹 분리, 흡수, 레이저 피격, 사망, 포털 이동
```

React 구현의 `TurnFrame`은 단순 레벨 스냅샷 중심이다. Godot에서는 이벤트 목록도 같이 기록하면 사운드, 이펙트, 카메라 흔들림을 재생하기 쉬워진다.

## 12. 검증 시나리오

반드시 자동 또는 수동 테스트로 확인할 시나리오다.

1. 높이 1 아치에서 `2 | 1 1 2` 열차가 `2 | _ 1 1 2`로 분리되는가.
2. 굴러가는 눈덩이가 두 번째 노란 버튼을 밟는 tick에 벽이 열리고 레이저가 플레이어를 죽이는가.
3. 크기가 작은·같은·큰 굴림 그룹 충돌이 각각 흡수·운동 전달·정지하는가.
4. 눈송이 흡수 직후 다음 충돌 질량이 바뀌는가.
5. 터널, 삼각 벽, 삼각 블록, 색상 벽, void, 맵 경계에서 tick 진행이 결정적인가.
6. 굴림 중 구멍, 포털, 레이저와 영혼 이전이 프레임에 정확히 기록되는가.
7. 애니메이션을 끈 상태도 마지막 프레임과 최종 `level`이 같은가.

이 문서의 규칙을 변경할 때는 `src/engine/roll.ts`, `src/engine/turn.ts`, 자동 테스트, 그리고 사용자용 알고리즘 문서를 함께 갱신해야 한다.
