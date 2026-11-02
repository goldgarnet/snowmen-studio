# B-009 턴 도중 새로 생긴 물체가 이미 쓰인 motionId 를 받는다 — 쪼개진 반쪽 = 밀려난 공, 영혼이 옮겨 간 새 몸 = 옛 몸

- **심각도**: low (판 결과·풀이 판정은 맞다. 이동 애니메이션, 플레이 화면의 키 반복 막기, mapmaker trace 도구만 틀린다)
- **분류**: **FIX** — 기대 동작이 분명하고 고쳐도 위험이 작다. Studio 만 고치면 된다
- **어느 엔진**: studio 만 (`src/engine/turn.ts` `ensureMotionIds` + UI 보조. adventure JS·GDScript 는 물체마다 증가하는 id 를 써서 해당 없음)
- **상태**: 고침 — Studio (브랜치 `fix/engine-bugs-2026-11-02`). 포트 없음(adventure 는 물체 id 사용)
- **출처**: 옛 번호 `found/SYM-03-split-shove-duplicate-motion-id`(대칭 검사의 불변식 "한 프레임 안에서 motionId 는 물체마다 하나") + `found/C-04-soul-body-motion-id-reuse`(엔진 정독 — `fff5e12` 'stop key auto-repeat after the soul changes body' 가 기대는 id 규칙 추적). 뿌리가 같은 함수 하나라 합쳤다.
- **기준**: 줄 번호·출력은 배포 엔진(studio main `fff5e12`). 작업 트리 줄은 따로 적었다.
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진을 직접 불러 두 판의 motionId 와 `soulChangedBody` 를 다시 찍어 아래와 같음을 확인했다(scratch `/tmp/claude-1000/bugfix/triage/mid.mts`). 작업 트리에서도 같다.

## 증상

`ensureMotionIds` 는 id 가 없는 물체에 `${type}:${행}:${열}`(지금 칸)을 준다. 맵에서 읽은 물체에 결정적인 id 를 주려는 설계인데, **턴 도중 새로 생긴 물체**에도 같은 규칙을 써서 이미 쓰인 id 와 겹칠 수 있다. 실제로 겹치는 경우는 둘이다.

1. **쪼개진 반쪽이 이웃 s1 을 밀어냄(Q-02)** — 새 반쪽이 밀려난 공의 id 를 그대로 받는다(같은 종류가 같은 칸에서 턴을 시작해 살아 있음). 그 턴의 모든 프레임과 이후 턴에서 두 공이 같은 id 를 갖는다.
   - 그 턴: 밀려난 공의 한 칸 이동이 애니메이션되지 않는다(순간 이동처럼 보임).
   - 이후 턴: 두 공 중 하나만 움직여도 `Grid` 가 id 하나로 두 공의 위치를 묶어 엉뚱한 공이 미끄러지거나 움직인 공이 순간 이동할 수 있다(`Grid.tsx` 코드로 확인, 브라우저 재생은 안 해 봄).
2. **영혼 이동으로 생긴 새 몸이 옛 몸의 id 가 만들어진 칸(보통 시작 칸)에 서 있음** — 새 player 객체(`soulTransfer`·`doSoulSwap`)는 id 가 없다가 그 칸으로 id 를 받아 옛 몸 id 와 같아진다.
   - `soulChangedBody(before, after)` 가 **false** → `Simulator.tsx:140·147`·`SolutionRecorder.tsx:165` 가 키 반복을 막지 않는다. 구멍으로 걸어 들어가며 방향키를 누르고 있으면 새 몸이 그 방향으로 계속 걷는다 — `fff5e12` 가 막으려던 바로 그 상황.
   - 이동 애니메이션(`Grid.tsx:70-83·306-317`)이 옛 몸과 새 몸을 한 물체의 이동으로 잇는다.

두 경우 모두 mapmaker `trace` 의 물체 이동 목록도 틀린다(밀려난 공의 이동·새 반쪽 생성을 놓침, 영혼 이동을 걸음으로 읽음 — RULES §17 의 도구 주의).

## 재현

**(1) 쪼개진 반쪽** — P2 가 벽에 붙은 s2 (2,1) 를 민다 → 위아래로 쪼개짐. 위 반쪽은 (1,1) 의 s1 을 (0,1) 로 밀어내고 (1,1) 에, 아래 반쪽은 (3,1) 에.

```text
5 4 sun=left shadow=off soul=off
.    .    .    .    .G
.    . o1 .    .    .
. P2 . o2 . ## .    .
.    .    .    .    .
```

맵 코드 `EZAo8sQYmmn06i6PT1gcGk05SdUTrbsnsmHNjNcXasFbwc5QujsPh2`, 수열 `R`. 판은 맞다(`o1 (0,1) · o1 (1,1) · o1 (3,1)`). `executeTurn(…, 'right')` 의 모든 프레임에서:

```text
snowball:1:1@(0,1)  snowball:1:1@(1,1)  player:2:0@(2,0)  snowball:3:1@(3,1)   ← 같은 id 둘
```

**(2) 영혼 새 몸** — 플레이어 시작 칸 (1,1) 에 눈사람을 밀어 넣고, 구멍 (2,2) 로 걸어 들어가 영혼이 그 눈사람(가장 가까움)으로 가게 한다.

```text
5 3 sun=left shadow=off soul=off
.    .    .    .    .
. S1 . P2 .    . S1 .
.    .    .H   .    .
```

맵 코드 `OGWLmJDFJ1rvmirDeAzQgmwFKdl2Q988KCpYNaqOji7EwoE`, 수열 `URRRDLLD`. 마지막 `D`: 플레이어 (1,2) → 구멍 (2,2) 에 빠짐 → 영혼이 (1,1) S1 로(거리 √2, (1,0) S1 은 √5). 판은 맞다(`S1 (1,0) · P1 (1,1) · 구멍 (2,2)`).

```text
D playing  player {row:1,col:2} -> {row:1,col:1}  id player:1:1 -> player:1:1  soulChangedBody = false
```

`mm.ts trace <code> URRRDLLD --boards` 마지막 수도 "플레이어 (1,2)→(1,1) 크기 2→1" 로 읽는다(실제로는 (2,2) 구멍에 빠지고 영혼이 (1,1) 몸으로).

## 원인

- `src/engine/turn.ts:411-418`(작업 트리 `:425-432`) `ensureMotionIds` — 새 물체의 기본 id 가 이미 판 위에 있거나 이번 턴 시작 판에 있던 id 와 겹치는지 보지 않는다. 호출: 턴 시작(`executeSkipTurn`·`executeTurn`, 작업 트리 `:273`·`:299`)과 매 프레임 기록(`recordFrame`, 작업 트리 `:416-419`).
- (1) `src/engine/force.ts:123-134` `applySplitShove` 가 이웃 s1 을 한 칸 밀고 그 칸에 새 눈덩이 객체(id 없음)를 놓는다.
- (2) 새 player 객체를 만드는 곳(모두 id 없음): `turn.ts` `soulTransfer`(작업 트리 `:537`), `doSoulSwap`(작업 트리 `:574`).
- 받는 쪽: `src/utils/level.ts:110-122` `playerBodyId`·`soulChangedBody`(id 가 다르면 몸이 바뀌었다고 봄), `src/components/editor/Grid.tsx:70-83` `collectMotionPositions`(id → 칸 Map 이라 뒤쪽 공이 앞쪽을 덮음)·`:306-317` FLIP(그 id 의 첫 DOM 요소를 움직임).

## 기대 동작과 근거

- `src/test-cases/catalog.ts` P1-15 'motion ID 연속성': "계속 존재하는 entity만 같은 motionId를 유지한다." 새 반쪽·새 player 객체는 계속 존재하던 물체가 아니다.
- `TICK_SIMULATION_MECHANICS.md` §10: Grid 는 "다음 칸에 그려진 같은 오브젝트"를 id 로 찾아 보간한다 — id 가 물체마다 하나라는 전제.
- `fff5e12` 의 의도: "ignore the held key's auto-repeat after a turn that moved the soul into another body".

## 고칠 방향 (분류 단계 시제품으로 확인)

- **Studio** `src/engine/turn.ts` `ensureMotionIds`(작업 트리 `:425-432`): 턴 시작 때 판 위 id 를 모아 두고(턴 안에서만 쓰는 집합), id 없는 물체의 기본 id `${type}:${r}:${c}` 가 그 집합이나 지금 판 위 다른 물체의 id 와 겹치면 결정적인 꼬리(`~2`, `~3`, …)를 붙인다. 맵에서 읽은 물체의 첫 id 규칙(`Grid` 대체 id 와 같음)은 겹치지 않는 한 그대로라 첫 턴 애니메이션이 바뀌지 않는다.
  - 시제품은 모듈 변수로 집합을 들고 있었다. 실제 수정은 `executeTurn`·`executeSkipTurn` 안에서 만든 집합을 `recordFrame` 으로 넘기는 쪽이 깔끔하다.
  - 옛 몸 id 를 새 몸에 물려주는 방법(정독 에이전트의 제안 2)은 '옛 몸이 눈사람으로 남는' 발판 교체에서 다시 겹칠 수 있어 쓰지 않았다.
- adventure 는 해당 없음(포트 없음). mapmaker `RULES.md` §17 의 trace 주의는 고친 뒤 메인 세션이 정리한다.

시제품 결과(Studio):

| 판 | 고친 뒤 |
|---|---|
| (1) 쪼개진 반쪽 `R` | 밀려난 공 `snowball:1:1`(0,1) 그대로, 새 반쪽 `snowball:1:1~2`(1,1) — 모든 프레임에서 id 가 물체마다 하나 |
| (2) 영혼 새 몸 `URRRDLLD` | 마지막 `D` 뒤 새 몸 `player:1:1~2`, `soulChangedBody = true` |

시제품: 작업 트리 사본(scratch `/tmp/claude-1000/bugfix/triage/proto/`, 고친 내용 `proto.patch`)에 FIX 후보 6개(B-004~B-009)를 함께 넣어 확인했다. 코드는 작업 트리에 아직 넣지 않았다.
- Studio 엔진 테스트 `node test/engine/run.cjs` 77/77 통과.
- 팀 맵 등록 풀이 281개 재생: 판·결과 변화 0(motionId 는 판에 안 나타남).

## 테스트 아이디어

- Studio 시나리오 2개: (1) 판의 모든 프레임에서 `motionId` 가 물체마다 다름, 밀려난 공은 옛 id 를 유지. (2) 판 마지막 턴 `soulChangedBody(before, after) === true`, 새 몸 id ≠ 옛 몸 id.
- 테스트 워크벤치 P1-15 에 두 판을 사례로 더한다.

## 영향

- 판 상태·풀이 판정·저장에는 영향 없음(motionId 는 런타임 전용).
- 팀 맵 풀이 281개에서 '몸이 바뀐 턴' 166개 중 (2) 겹침이 실제로 난 경우는 확인되지 않음. 시작 칸 근처에서 눈사람을 쓰는 맵이면 생길 수 있다.

## 고친 내용 (Studio, 2026-11-02)

`src/engine/turn.ts` `ensureMotionIds` 를 고쳤다. 모듈 변수는 쓰지 않았다.

- 턴 시작(`executeSkipTurn`·`executeTurn`)에 그 턴의 id 집합을 만들어 `recordFrame`·`finishMovedTurn` 으로 넘긴다.
- id 없는 물체의 기본 id `${type}:${r}:${c}` 가 겹치면 결정적인 꼬리 `~2`, `~3`, … 을 붙인다. 겹침은 그 집합(턴 시작 판의 id + 그 턴에 준 id)이나 지금 판의 다른 id 와 같은 경우다.
- 맵에서 읽은 물체의 첫 id 는 겹치지 않으므로 그대로다. `Grid` 대체 id 와 같아 첫 턴 애니메이션도 같다.

문서: `TICK_SIMULATION_MECHANICS.md` §10·§12, `test/GAME_IMPLEMENTATION_CASES.md` P1-15, 테스트 워크벤치 사례 P1-15a(쪼개진 반쪽)·P1-15b(영혼 새 몸).

## 검증

- 시나리오 `test/engine/cases/found-bugs-2026-11.scenario.ts` 의 `B-009 …` 2개.
  - (1) `EZAo8…` `R`: 모든 프레임에서 motionId 가 물체마다 다르다. 밀려난 공 (0,1) 은 `snowball:1:1` 을 유지하고, 새 반쪽은 `snowball:1:1~2` 다.
  - (2) `OGWLm…` `URRRDLLD`: 마지막 턴 `soulChangedBody(before, after) === true` 다. 새 몸은 `player:1:1~2`, 옛 몸은 `player:1:1` 이고, 앞 7턴은 모두 false 다.
- 고치기 전에는 둘 다 실패한다.
- 무작위 4만 판(시드 2개, 약 36.6만 턴)으로 고치기 전후를 비교했다.
  - 프레임 안 motionId 겹침이 있는 턴: 812개 → 0개.
  - `soulChangedBody` 가 참인 턴: 1347개 → 1394개. 늘어난 47개는 겹침 때문에 놓치던 몸 바뀜이다.
  - 판 결과는 바뀌지 않는다(무작위 차분에서 이 유형의 갈림 0).
- 팀 맵 등록 풀이 281개 재생: 판·결과 변화 0.

## 남은 일

- mapmaker `RULES.md` §17 의 trace 주의(motionId 로 묶어서 놓치는 이동)는 메인 세션이 정리한다.
- 브라우저에서 애니메이션을 직접 재생해 보지는 않았다(엔진 프레임의 id 만 확인).
