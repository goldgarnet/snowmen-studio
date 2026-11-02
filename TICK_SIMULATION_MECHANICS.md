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
  - 굴러 지나간 금 간 타일(Q-16 (c))도 같다: 틱에서는 `crackRolled` 표시만 남기고, 무장은 턴 종료에서 한 번 한다. 그래서 다음 turn에 무너진다.

## 2. 구현 진입점과 프레임 API

`executeTurn()`은 레벨을 복제한 뒤 `executePush()`를 호출한다. 굴림이 시작되면 `push.ts`가 `roll.ts`에 tick 훅을 전달한다. 굴림이 아닌 일반 한 칸 밀기·강제 이동도 같은 `movement`/`resolved` 프레임 쌍을 남긴다. 같은 질량 충돌로 운동이 전달될 때는 `impact` 프레임을 추가해 접촉 순간을 짧게 표시한다.

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
  phase: 'movement' | 'resolved' | 'impact' | 'turn-end';
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
| `impact` | 같은 질량 충돌로 운동이 전달되기 직전의 접촉 상태 | 짧은 탄성 충돌 정지 연출 |
| `turn-end` | 모든 움직임이 멈춘 뒤 턴 종료 효과까지 적용한 최종 상태 | 다음 입력의 기준 상태 |

애니메이션이 꺼진 UI는 프레임을 소비하지 않고 최종 `level`만 표시한다. 따라서 프레임 추가는 즉시 표시 동작을 바꾸지 않는다. 애니메이션이 켜지면 `TurnResult.frames`를 순서대로 재생하며, `impact`는 80ms의 짧은 접촉 정지로 표시한다.

## 3. 굴림 그룹 데이터

굴림 그룹은 진행 방향 기준으로 뒤에서 앞 순서로 유지한다.

```text
오른쪽으로 굴림

rear                                      front
 [2] [1] [1] [2]  →
  0   1   2   3       group[3]이 선두
```

각 공에는 다음이 필요하다.

```text
Ball
  - pos: 현재 격자 좌표
  - obj: 해당 눈덩이 오브젝트 참조
  - dir: 이 공의 진행 방향 (공마다 따로 가진다)
```

열차는 따로 저장하지 않는다. 매 틱 "어떤 공의 다음 칸에 다른 굴러가는 공이 있으면 그 공을 따라간다"는 관계로 **선두 + 따라오는 공들**을 다시 묶는다. 공마다 방향이 따로라서 열차가 삼각 벽에서 한 공씩 꺾이고(Q-04), 앞 공이 구멍·레이저로 사라지거나 포털로 이동해도 나머지는 계속 굴러간다(Q-05, Q-06).

그룹 질량은 열차에 속한 모든 공의 `size` 합이다. 눈송이 흡수, 장애물 그룹 흡수, 아치 분리 뒤에는 다음 충돌 전에 항상 다시 계산한다.

```text
mass(group) = Σ member.obj.size
```

Godot에서는 오브젝트 참조 대신 안정적인 entity ID를 쓰고, 별도의 `entities[id]` 저장소에서 크기와 위치를 읽는 편이 안전하다.

## 4. 굴림 tick 알고리즘

다음은 현재 엔진의 굴림 tick을 구현 독립적으로 표현한 의사 코드다.

```text
initial tick (the cell the push produced):
    resolve hole/portal for every ball
    emit movement + resolved frames through tick hook; drop balls that vanished

while some ball is moving (or was handed motion) and tickCount < safetyLimit:
    for each ball on a triangle tile: ball.dir = reflect(ball.dir)

    for each ball: canAdvance = can cross its own terrain boundary
                   AND (the ball in its next cell, if rolling, also advances)
    balls that cannot advance lose their motion (and so do the balls following them)

    group the remaining balls into trains: lead + followers

    for each train (fixed order):
        inspect cell in front of the lead
        if empty (and not claimed by another train this tick):
            plan shift of the whole train
        else if it is a triangle block and the train is one ball:
            plan deflect through the block to its reflected exit cell
        else if every consecutive obstacle (cut at terrain that stops a member; the run
                turns with the mirror of a member resting in a triangle cell) is a
                stationary snowball (not rolling, not handed motion this tick, not
                taken by an earlier train this tick):
            compare train mass with obstacle mass
            if train > obstacle and obstacle can shift one cell:
                plan shift of obstacle + train; obstacle balls join with the lead's dir
            else if train == obstacle:
                impact: this train stops, obstacle balls start rolling next tick,
                        each in the direction the run takes through its cell
            else:
                stop
        else:
            stop

    emit an impact frame if any equal-mass handoff happened
    commit every planned shift together
    absorb snowflakes, then resolve hole/portal, for every ball that moved
    emit movement + resolved frames through tick hook; drop balls that vanished
    (the hook also judges the goal: the turn is cleared if the player now stands on an
     active goal — the roll still runs to rest)
```

`safetyLimit`은 현재 `width × height × 4 + 16`이다. 포털과 반사판이 만드는 무한 순환으로부터 엔진을 보호한다.

열차는 선두의 읽기 순서(fixed order)로 하나씩 정한다. 앞 열차가 이번 tick에 차지한 칸, 흡수하기로 한 공, 같은 질량으로 운동을 넘긴 공은 뒤 열차에게 빈 칸이나 멈춘 공이 아니다. 그래서 두 열차가 같은 공을 치면 앞 열차만 그 공을 흡수하거나 운동을 넘기고, 뒤 열차는 그 자리에서 멈춘다(B-004, 2026-11-02). 예전에는 두 열차가 같은 공을 둘 다 흡수해 공을 두 번 옮겼고, 그 공이 두 칸에 복제되며 한 열차의 선두 공이 덮어써져 사라졌다.

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

1. 같은 tick 시작 상태에서 모든 구성원이 자기 지형·경계를 통과할 수 있는지 개별 검사한다(`canCross`).
2. 선두부터 뒤쪽으로 보면서 `willMove = canCross && 앞 칸의 구성원이 이동함`을 계산한다. 선두의 앞 칸은 이후 장애물 충돌 단계에서 별도로 검사한다.
3. `willMove = false`인 구성원과 그 뒤쪽은 현재 위치에 정지한다. 앞 구성원이 멈춰 칸을 비우지 않으면 뒤 구성원도 통과 가능 여부와 무관하게 점유 충돌로 멈춘다.
4. `willMove = true`인 앞쪽 suffix가 남으면 새 굴림 그룹으로 유지한다.
5. 새 굴림 그룹은 같은 tick에 한 칸 이동한다.
6. 다음 충돌 때 새 suffix의 질량만 사용한다.

선두가 막혔다면 앞쪽 suffix가 없으므로 전체가 정지한다. 이 규칙은 아치뿐 아니라 터널, 삼각 벽의 막힌 변, 닫힌 색상 벽, 맵 경계와 void에도 적용된다.

버튼을 떠나면서 노란/주황 벽이 굴림 그룹의 구성원을 감싸 다시 닫으면, 그 갇힌 구성원과 그 뒤쪽 prefix는 멈춘다. 이미 벽의 진행 방향 앞에 있던 suffix는 아치 분리와 동일하게 독립적인 굴림 그룹으로 남아 계속 진행한다.

이때 벽 바로 뒤의 공은 닫힌 벽에 **진입할 수 없고**, 벽 안의 공은 **이탈할 수 없으므로** 각자의 `canCross`가 모두 거짓이다. 벽보다 앞에 있는 공은 `canCross`가 참이고 앞 칸도 비므로 계속 이동한다. 이렇게 색상 벽만을 위한 별도 예외 없이 구성원별 판정과 점유 전파만으로 결과를 결정한다.

## 6. 충돌과 질량 전달

진행 방향 앞의 연속 오브젝트를 하나의 장애물 그룹으로 수집한다.

| 조건 | 결과 |
| --- | --- |
| 장애물 중 눈덩이가 아닌 것이 있음 | 현재 굴림 그룹 정지 |
| 장애물 중 이번 tick에 이미 움직이는 공이 있음(굴러가는 공, 운동을 넘겨받은 공, 앞 열차가 흡수하는 공) | 현재 굴림 그룹 정지, `impact` 없음(B-004) |
| 장애물 질량이 더 큼 | 현재 굴림 그룹 정지 |
| 질량이 같음 | 현재 그룹 정지, 장애물 그룹이 운동을 이어받음 |
| 현재 질량이 더 큼 + 장애물 전체가 한 칸 이동 가능 | 양 그룹이 한 칸 이동한 뒤 하나의 굴림 그룹으로 병합 |
| 현재 질량이 더 큼 + 장애물 이동 불가 | 현재 굴림 그룹 정지 |

장애물 그룹은 원래 정지해 있던 물체이므로, 더 무거운 굴림 그룹이 밀 때 하나의 단위로 한 칸 이동할 수 있어야 한다. 반대로 이미 운동 중인 그룹은 5절의 규칙에 따라 경계에서 suffix로 분리될 수 있다.

### 삼각 칸에서 꺾이는 장애물 그룹 (B-001, 2026-11-02)

삼각 벽 칸에 멈춰 있는 공은 열린 변으로 맞는다. 그 공이 나갈 길은 곧은 방향(막힌 변)이 아니라 거울 출구다. 그래서 장애물 그룹은 그 칸에서 반사표대로 방향을 바꿔 출구 쪽으로 이어서 수집한다. 출구에 붙은 공까지 한 묶음이고, 구성원마다 자기 칸을 지나는 방향을 가진다.

```text
→ 공(1) 이 ◥ 칸의 공을 친다. ◥ 는 오른쪽 → 아래로 꺾는다.

 [1] → [◥1]          그룹 = [◥1, 1]  질량 2
        [1]          → 질량 1 굴림은 멈추고 아무것도 움직이지 않는다

 [2] → [◥1]          그룹 질량 2 = 2
        [1]          → 묶음 전체가 다음 tick 아래로 함께 굴러간다
```

- 출구가 비어 있으면 그룹은 삼각 칸 공 하나이고, 같은 질량이면 그 공이 다음 tick 거울 방향으로 나간다(예전과 같다).
- 꺾인 묶음은 진행 방향으로 한꺼번에 밀릴 수 없다(삼각 칸 공의 곧은 길이 막힌 변). 그래서 굴림 그룹이 더 무거워도 흡수하지 못하고 멈춘다(예전과 같다).
- 그 결과 더 무거운 굴림은 삼각 칸 공 혼자는 못 움직이지만, 출구에 공이 붙어 묶음 질량이 같아지면 묶음을 함께 내보낸다. 공을 더 붙이면 오히려 움직이는 셈이라, 더 무거운 굴림의 규칙과 함께 팀 결정을 기다린다(`bugs/B-013`).
- 출구 쪽에 눈덩이가 아닌 물체가 붙어 있으면 곧은 줄과 같이 굴림 그룹이 그냥 멈춘다(`impact` 없음).
- 예전에는 곧은 방향으로만 세었다. 그래서 삼각 칸 공 하나(질량 1)가 운동을 받았고, 다음 tick에 꺾여 출구의 공과 다시 같은 질량 충돌을 하면서 붙어 있던 두 공이 요람처럼 운동을 넘겼다. 이 tick 연쇄를 옮긴 구현은 그룹 수집 단계에서 같은 꺾임을 따라야 한다.

## 7. 한 tick의 환경 반응

굴림이 한 칸을 커밋하면 `turn.ts`의 tick 훅이 호출된다. 이 훅은 다음 순서로 실행된다.

```text
1. movement 프레임 복제
2. 구멍 위의 오브젝트 제거 및 플레이어 영혼 이전
3. 주황 버튼 래치
4. 현재 버튼/벽 상태를 사용한 전역 레이저 발사
5. resolved 프레임 복제
6. 목표 판정 — 영혼을 가진 플레이어가 활성 목표 위면 이 turn은 클리어 (상태 변경 없음)
```

6번은 2026-11-02 사용자 결정이다(B-002). 굴러 지나가며 잠시 눌린 초록 버튼도 인정된다. turn 끝에 녹을 눈덩이가 덮은 버튼이 인정되는 것과 같은 원리다. 판정이 2~4번 뒤라서 같은 tick에 레이저·구멍으로 플레이어가 죽으면 죽음이 먼저이고, 버튼을 덮은 공이 그 tick 빔에 녹으면 인정되지 않는다. 클리어가 정해져도 굴림은 자체 정지 조건까지 계속 tick을 진행하고 프레임을 남긴다. 그 turn의 결과는 `cleared`이고, turn 종료 효과(녹기 등)는 없다. 그 뒤 같은 굴림에서 일어난 일은 결과를 바꾸지 않는다.

이 판정은 초록 버튼이 없는 맵에도 적용된다. 그런 맵은 목표가 늘 열려 있어서, 목표 위 공을 밀고 목표로 들어선 turn은 첫 tick에 클리어가 정해진다. 공이 이어서 노란 버튼을 눌러 연 레이저에 플레이어가 맞아도 `cleared`다(B-002 전에는 `gameover`). 같은 순간이 아닌 뒤 tick의 사망까지 클리어보다 먼저로 볼지는 팀 결정을 기다린다(`bugs/B-027`).

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

플레이어가 이 피격으로 최종 사망해 `gameover`가 되더라도, 이미 시작된 눈덩이 굴림은 멈추지 않는다. 게임오버는 다음 플레이어 입력을 막는 최종 상태이며, 활성 굴림 그룹은 아치·벽·질량 충돌·구멍·포털·맵 경계 같은 자체 정지 조건까지 계속 tick을 진행한다. 화면 애니메이션도 이후 `movement`/`resolved` 프레임을 모두 재생한 뒤 최종 게임오버를 표시한다.

## 8. 즉시 효과와 turn 종료 효과의 구분

| 매 tick | 한 turn이 완전히 끝난 뒤 한 번 |
| --- | --- |
| 굴림 위치 변경 | 그림자 재계산 |
| 눈송이 흡수 | 녹기 |
| 구멍·굴림 포털 | 이전 turn에 무장된 금 간 타일 붕괴 |
| 노란 버튼·노란 벽 | 다음 turn용 금 간 타일 무장 |
| 주황 버튼 래치·주황 벽 | 최종 클리어 판정 |
| 레이저·사망·영혼 이전 | UI/풀이 turn 수 처리 |
| 목표 판정(잠시 눌린 초록 버튼, B-002) | |

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

한 tick에 열차가 여럿이면 의도를 정해진 순서(선두의 읽기 순서)로 계산하되, 같은 칸이나 같은 공을 두 열차에 배정하지 않는다. 앞 열차가 예약한 칸, 흡수하기로 한 공, 운동을 넘긴 공은 뒤 열차에게 막힌 것으로 본다(4절, B-004). commit 단계에서 한 공을 두 번 옮기면 공이 두 칸에 생기고 다른 공이 덮어써진다. 물체가 자기 좌표를 들고 있는 구현(Godot 등)에서는 같은 공이 한 tick에 두 칸을 대각선으로 가는 모습으로 나타난다.

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

에디터의 일반 플레이 `Simulator`와 저장 가능한 풀이 녹화 `SolutionRecorder`는 모두 상단의 `이동 애니메이션` 체크 토글로 이 재생을 제어한다. 즉, 저장된 맵의 풀이 등록 화면과 수정 중인 맵의 일반 플레이 화면 사이에 표시·동작 차이가 없어야 한다. 기본값은 꺼짐이므로 기존처럼 최종 상태를 즉시 표시한다. 켜면 입력 하나를 하나의 turn/undo 기록으로 먼저 확정한 뒤 프레임을 차례로 표시하고, 재생 중에는 방향 입력·대기·되돌리기·초기화·영혼 이동을 비활성화한다. 토글을 켜면 옆의 속도 슬라이더가 나타나며 0.1배(느리게)부터 5배(빠르게)까지 조절할 수 있다. 기본 1배는 movement 150ms, impact 80ms이고, 속도 변경은 다음 프레임부터 적용된다.

재생 중에도 두 화면의 토글은 끌 수 있다. 끄는 순간 남은 프레임 타이머를 취소하고, 같은 입력으로 이미 계산해 둔 최종 `level`·승패 상태로 즉시 이동한다. 풀이 녹화 화면에서는 기록할 이동 문자열도 이미 한 번만 추가된 상태다. turn 수와 undo 기록은 추가하거나 되돌리지 않는다.

재생은 셀마다 멈춰 보이지 않도록 FLIP(First, Last, Invert, Play) 방식으로 그린다. 엔진이 `motionId`라는 저장되지 않는 런타임 ID를 프레임 오브젝트에 유지하면, Grid는 다음 칸에 그려진 같은 오브젝트를 이전 칸만큼 역방향으로 잠시 옮긴 뒤 `movement` 프레임의 기본 150ms(선택한 속도에 따라 변함) 동안 선형 보간으로 제자리까지 이동시킨다. 브라우저가 초기 역방향 transform을 첫 paint 전에 합쳐 버리지 않도록 레이아웃을 한 번 확정한 뒤 transition을 시작한다. 따라서 논리적으로는 여전히 “한 tick = 최대 한 칸”이지만 화면에서는 연속적으로 굴러간다. 포털처럼 한 칸보다 큰 이동과 삼각 블록을 통한 특수 이동은 통과하지 않은 타일을 가로질러 보이지 않도록 즉시 전환한다.

`motionId`는 한 turn의 프레임 안에서 물체마다 하나다. 계속 존재하는 물체만 같은 id를 유지한다. 맵에서 읽은 물체는 첫 turn에 `${type}:${row}:${col}`(처음 칸)을 받고, turn 도중 새로 생긴 물체(쪼개진 반쪽, 새 눈사람, 영혼이 옮겨 간 새 몸)는 처음 기록되는 프레임에서 같은 꼴의 id를 받는다. 그 id가 지금 판의 다른 물체나 그 turn에 이미 쓰인 id와 겹치면 결정적인 꼬리 `~2`, `~3`, …을 붙인다(B-009, 2026-11-02). 예전에는 이웃 공을 밀어낸 쪼개진 반쪽이 밀려난 공의 id를 받아 그 공의 이동이 애니메이션되지 않았다. 또 옛 몸의 id가 만들어진 칸(보통 시작 칸)에 선 눈사람으로 영혼이 옮겨 가면 새 몸이 옛 몸의 id를 받아, `soulChangedBody()`가 몸 바뀜을 놓치고 누르고 있던 방향키가 새 몸을 계속 걷게 했다.

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
8. 삼각 칸에 멈춘 공과 그 거울 출구에 붙은 공을 한 묶음으로 세는가(같은 질량이면 묶음 전체가 출구로, 더 무거우면 굴러온 공이 멈춤 — B-001).
9. 굴림이 마지막 초록 버튼을 지나는 tick에 플레이어가 활성 목표 위면 그 turn이 `cleared`인가. 같은 tick 레이저 사망은 클리어보다 먼저인가(B-002).
10. 두 열차가 같은 tick에 같은 멈춘 공을 치면 한 열차만 그 공을 흡수하는가. 공이 두 칸에 생기거나 선두 공이 사라지지 않고 눈 질량이 보존되는가(B-004).
11. 모든 프레임에서 `motionId`가 물체마다 다른가. 쪼개진 반쪽·영혼이 옮겨 간 새 몸이 새 id를 받는가(B-009).

이 문서의 규칙을 변경할 때는 `src/engine/roll.ts`, `src/engine/turn.ts`, 자동 테스트, 그리고 사용자용 알고리즘 문서를 함께 갱신해야 한다.
