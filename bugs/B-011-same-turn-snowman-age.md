# B-011 같은 턴에 생긴 두 눈사람의 '나이' — Studio 는 동갑(읽기 순서), adventure 는 생성 순서

- **심각도**: low
- **분류**: **PORT** — Studio(정본)가 맞고 adventure JS·GDScript 를 맞춘다
- **어느 엔진**: adventure JS · GDScript 가 Studio 와 다름 (JS·GD 끼리는 같음)
- **상태**: 고침 — adventure JS · GDScript (브랜치 `fix/engine-bugs-2026-11-02`). Studio 는 원래 맞음. 골든 `b011-same-turn-snowmen-same-age`
- **출처**: 엔진 간 대조(접두 X) — 나이 규칙을 코드로 대조해 찾은 뒤 판을 만들어 재현 · 옛 번호 `found/X-03-same-turn-snowman-age-tie`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.

## 증상

영혼 이동 대상은 거리 → 나이(오래된 것) → 읽기 순서로 고른다. 두 엔진은 나이를 매기는 방식이 다르다.

- Studio: 새 눈사람의 `createdAt` = **그 턴 번호**(`turnCount`). 같은 턴에 생긴 몸은 동갑이고, 동률이면 읽기 순서로 고른다.
- adventure: 새 눈사람마다 `ageCounter++`. 같은 턴이어도 먼저 생긴 몸이 더 '오래됐다'.

한 턴에 눈사람이 둘 생기는 경우는 하나다. **무장된 영혼 발판 위에서 s2 를 직접 밀었는데 양옆이 다 막혀 가운데 S1 이 생기고, 같은 턴에 발판이 발동해 옛 몸이 눈사람으로 남는 경우.**
나중에 두 몸이 같은 거리에 놓이고 영혼이 옮겨 가면 두 엔진이 다른 몸을 고른다.

## 재현

판 글(compose 문법):

```text
5 5 sun=left shadow=off soul=off
.G   .    .    .    .
.    .    . P2 .    .
.    . S2 .@   .    .
.    . ## . o2 . ## .
.    .    . ## .    .
```

- 맵 코드: `zjIp2s6OwvDmDeydfw8quxm2b0fJpuxV2gGMJIVSbv9SdzCCtGUjz0vZqSBx6dch12`
- 수열: `DDRW`
  1. `D` 발판 (2,2) 에 올라 무장.
  2. `D` (3,2) o2 를 민다. 아래는 벽, 양옆도 벽 → 가운데 S1 (턴 T 에 생김). 플레이어는 제자리라 같은 턴에 발판 발동 → 거리 1 동률(S1 · 저작 S2 (2,1)) 중 나이 0 인 (2,1) 로 옮겨 감. 옛 몸 (2,2) 는 눈사람 S2 (턴 T).
  3. `R` (2,1) 에서 옛 몸 S2 를 (2,3) 으로 밀고 발판 (2,2) 에 올라 다시 무장.
  4. `W` 발판 발동. 거리 1 동률: 옛 몸 (2,3) · S1 (3,2) — 둘 다 턴 T 에 생김.

지금 엔진 출력(`W` 뒤):

| | Studio (`mm.ts trace <코드> DDRW --boards`) | adventure JS (`advcheck.mjs --each`) · GDScript |
|---|---|---|
| 영혼이 간 곳 | **(2,3)** 옛 몸 — P2 | **(3,2)** S1 — P1 |
| 판 | `S2@(2,2) P2@(2,3) S1@(3,2)` | `S2@(2,2) S2@(2,3) P1@(3,2)` |

Studio 는 동갑이라 읽기 순서((2,3) 이 (3,2) 보다 앞)로, adventure 는 S1 의 age(1) < 옛 몸 age(2) 로 골랐다.
GDScript 는 본 트리 `game/rules/engine.gd` 사본을 headless 로 돌려 JS 와 같은 결과를 확인했다.

## 원인

- Studio: S1 `src/engine/force.ts:62-64` `createdAt: turnCount` · 발판 교체 `src/engine/turn.ts:262` `soulSwapNearest(level, pos, ts)` → `:571` 옛 몸 `createdAt: ts`(같은 `turnCount`).
  정렬 `:540-543`·`:595` 은 거리 → `createdAt` 이고, 안정 정렬이라 같으면 읽기 순서.
- adventure JS: `editor/src/rules/engine.js:326` `addObj` 가 눈사람마다 `ageCounter++`, `:615` `doSoulSwap` 옛 몸도 `ageCounter++`.
- GDScript: `game/rules/engine.gd:454` `add_obj`, `:688` `do_soul_swap` — JS 와 같다.

## 기대 동작과 근거

Studio 대로: 같은 턴에 생긴 눈사람은 동갑이고, 거리도 같으면 읽기 순서로 고른다.

- 정본은 Studio 엔진(adventure `CLAUDE.md` §1·§9).
- mapmaker `RULES.md` §6 "새 눈사람의 나이 = 엔진 전역 증가 카운터", §11 "동률이면 나이 최소 → 그래도 같으면 읽기 순서". Studio 의 카운터는 턴마다 한 번 오른다(`turn.ts:39-40` `nextAge`, `executeTurn`·`executeSkipTurn`·`cycleSoul` 마다 1회).
- 고치는 방법: adventure 의 나이를 '턴 도장'으로 바꾼다. 턴 처리 시작에 한 번 올린 값을 그 턴에 생기는 모든 눈사람(S1·만들기·발판 옛 몸)에 쓰고, M 은 따로 한 번 올린다. JS·GD 를 같이 바꾼다.

## 영향

- 조건(발판 + 양옆 막힌 쪼개기 + 거리 1 저작 눈사람 + 이후 같은 거리)이 겹쳐야 나서 실제 맵에서는 드물다.
  팀 맵 스냅샷 풀이 281개 중 이 경우를 밟는 풀이는 없다(두 엔진이 갈리는 2개는 B-007·B-024 때문).
- 골든에 위 판(`DDRW`)을 넣으면 고친 뒤 회귀를 막을 수 있다.

## 고칠 방향 (포트)

- Studio 의 나이는 '행동 도장'이다: `executeTurn`·`executeSkipTurn`·`cycleSoul` 마다 `nextAge()` 를 한 번 부르고(`src/engine/turn.ts:39-40`), 그 행동에서 생기는 모든 눈사람이 같은 값을 받는다. `ENGINE_ALGORITHMS.md` §6 "새 눈사람의 `createdAt`은 현재 행동의 단조 증가 시각이다", §14 동률 → 읽기 순서.
- adventure JS: `editor/src/rules/engine.js:326` `addObj`(`o.age = st.ageCounter++`)·`:615` `doSoulSwap`(`fromObj.age = st.ageCounter++`) → 행동 시작(`applyMove`·`applySkipTurn`·`applySoulCycle`)에 한 번 올린 값을 그 행동의 모든 새 눈사람·옛 몸에 쓴다.
- GDScript: `game/rules/engine.gd:458-459` `add_obj`·`:692-693` `do_soul_swap` 같은 변경.
- 저작 눈사람 나이 0, 새 눈사람 ≥ 1 은 그대로라 다른 판의 결과는 바뀌지 않아야 한다.

## 테스트 아이디어

- 골든에 위 판 `DDRW` 를 넣는다: 기대 = Studio 결과(영혼 (2,3) 옛 몸 → `S2@(2,2) P2@(2,3) S1@(3,2)`).
- `diff-vs-studio.mjs`(PRODUCTION_AGE=1) 0% 와 JS↔GD 일치를 다시 확인한다.

## 포트 (adventure, 2026-11-02)

- JS `editor/src/rules/engine.js`: `ageCounter` 를 행동 도장으로 바꿨다. `applyMoveWithTrace`·`applySkipTurnWithTrace`·`applySoulCycle` 가 행동마다 한 번 올리고, `addObj`·`doSoulSwap` 은 올리지 않고 그 값을 쓴다. 막힌 입력은 원래 상태를 돌려주므로 시계도 그대로다.
- GDScript `game/rules/engine.gd` `add_obj`·`do_soul_swap`·`apply_soul_cycle`·`apply_skip_turn_with_trace`·`apply_move_with_trace` 같은 변경.
- 골든 `bugs-2026-11.json` `b011-same-turn-snowmen-same-age`(위 판 `DDRW` — 영혼이 (2,3) 옛 몸으로). 본 트리에서 Studio 와 갈리던 JS·GD 가 작업 트리에서는 같다.
- `editor/test/solver.mjs` 상태 키는 나이 값 대신 순위를 쓴다. 행동 도장이라 같은 판이 다른 키가 되지 않게 하려는 것이다.
