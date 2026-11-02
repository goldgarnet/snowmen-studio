# B-006 P2 가 s2+s1 을 밀 때 s1 이 지형(삼각 다리·터널 옆면)에만 받쳐지면 무반응

- **심각도**: medium
- **분류**: **FIX** — 기대 동작이 분명하고 고쳐도 위험이 작다. Studio 에서 고친 뒤 포트
- **어느 엔진**: studio · JS · GDScript (셋 다 같은 결과 — Studio 분기를 그대로 포팅)
- **상태**: 고침 — Studio · adventure JS · GDScript (브랜치 `fix/engine-bugs-2026-11-02`). 골든 `b006-*` 6케이스
- **출처**: mapmaker `RULES.md` §16 버그 의심 1 · 옛 번호 `found/R-01-p2-s2s1-terrain-backed-noop`
- **줄 번호 기준**: 본 트리(현재 배포) — studio `fff5e12`, adventure `a2dd0e9`. 재현 스크립트(세 엔진 대조): `/tmp/claude-1000/bugfix/R-known/run3.sh <specs.txt>`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.

## 증상

크기 2 플레이어가 큰 눈덩이(s2) 너머의 작은 눈덩이(s1)를 민다. s1 이 그 방향으로 못 가는 이유가

- 벽·상자·맵 끝·void·닫힌 노랑/주황 칸이면 → s1 이 부서져 눈꽃이 된다(1턴 흐름).
- **삼각 벽의 막힌 다리(s1 칸 자기 변이든 다음 칸 변이든)·터널 옆면**이면 → 아무 일도 없다(막힌 입력).

같은 배치를 크기 3 플레이어가 밀면 지형 받침에서도 s1 이 부서진다. 받침의 종류에 따라 P2 결과만 갈린다.

## 재현

판 글(mapmaker `tools/grid.ts` compose 문법) — 수열 `R`:

```text
r01a (s1 이 ◥ 칸 안 — 오른쪽 변이 막힘)          r01c (s1 다음 칸이 상하 통로 터널 — 옆면이 막힘)
5 3 sun=left shadow=off soul=off                  5 3 sun=left shadow=off soul=off
.    .    .    .    .                             .    .    .    .    .
. P2 . o2 .◥o1 .    .                             . P2 . o2 . o1 ."   .
.    .    .    .    .                             .    .    .    .    .
```

| 판 | 맵 코드 | 수열 | 지금(studio·JS·GD 같음) | 기대 |
|---|---|---|---|---|
| r01a B 칸 ◥ 다리 | `D2a0ctrf1DW44R4tJwhAqvj2thG5oOVS35MZ5OQcXkEAXsUhXc` | R | 막힘: 변화 없음 (JS·GD turn 0) | (1,2) s1 → 눈꽃, o2·P2 제자리, 1턴 |
| r01c C 칸 터널 옆면 | `XTZGO3f4W5vCA0kziJgQv9NcYza5SG4O8GVFX6POg` | R | 막힘 | 같음 |
| r01e C 칸 ◣ 다리 (`. o1 .◣  `) | `BfPmY7kDndtCIDYXUMmFFF61wMGCzFDgSdju7Xvuj2` | R | 막힘 | 같음 |
| 대조 r01b C 칸 벽 `##` | `XTZGO3f4W5vCA0kziJgQv9NbhullL0leeyWJOya9i` | R | (1,2) 눈꽃 생김 | — |
| 대조 r01f C 칸 void | `Du5Ab0Bc5M7A2g1BHhcGdx7fuJOPcMCiDzYKapBytZK19dPzq` | R | (1,2) 눈꽃 생김 | — |
| 대조 r01d P3, B 칸 ◥ 다리 (`(1,0)` 눈꽃으로 P3) | `D2a0cuM0atnJKfIB5im8fSxNYlmdnh0l6dnYaBU8Pcig1YZAJs` | DR | (1,2) 눈꽃 생김 | — |

지금 엔진 출력(`mm.ts trace <r01a> R --boards`):

```text
#1 → → 턴 1 (막힘: 변화 없음)
 1 . P2 . o2 .◥o1 .    .
```

대조 r01b:

```text
#1 → → 턴 1
   눈덩이 (1,2)→소멸 크기 1→-
   타일: 눈꽃 생김 (1,2)
 1 . P2 . o2 .*   . ## .
```

## 원인

`push.ts` 의 P2 분기가 C 존재 여부로만 갈린다.

- C 가 '물체'(벽 취급 칸 포함)로 있으면 `src/engine/push.ts:268-272` — `a=s2, b=s1, backedAtB` → `doMoveThenForceB`(B 부서짐).
- C 칸이 비어 있으면(삼각 다리·터널 옆면은 칸이 아니라 변이라 `getObjAt` 이 '빈 칸'으로 본다) `src/engine/push.ts:203-245` 로 가고, 여기엔 s2+s1 에 대한 받침 검사가 없어 `:238-240` `a.size === 2 && (b.isSnowball || …)` → 무반응.
- P3 는 C 빈칸 분기에도 `:317-324` 에 `backedAtB → doMoveThenForceB` 가 있다.
- 포트도 같다: adventure `editor/src/rules/engine.js:1356-1357`(C 빈칸 분기 끝 `return no`), `game/rules/engine.gd:1482-1483`.

## 기대 동작과 근거

C 빈칸 분기에서도 `a=s2, b=s1, backedAtB` 면 B 에 힘(s1 → 눈꽃, A·플레이어 제자리, 턴 흐름) — C 가 벽일 때·P3 일 때와 같게.

- 팀 결정 B-01~B-08(adventure `CLAUDE.md` '규칙 감사 결정'): "지형(터널 옆·삼각 다리·못 지나는 아치·닫힌 파티션)도 벽처럼 받침이 된다". B-05: 받침은 지형 경계를 먼저 본다.
- Studio `ENGINE_ALGORITHMS.md` §5.7: 받침 = "`pos`의 오브젝트가 다음 칸으로 넘어갈 수 없게 하는 모든 지형 … 벽, 블록, 나무, 레이저". §5.5 는 `눈덩이 2 + 눈덩이 1` 의 B 힘을 C 가 찬 경우에만 적었다(받침 정의와 어긋나는 서술).
- RULES §15-9: "s2+s1을 밀면 만들기가 아니라 앞 s1이 부서진다".

## 영향

- 팀 맵 스냅샷(mapmaker `data/maps-2026-11-02.json`, 맵 283·풀이 281 재생)에서 이 배치를 밟는 풀이 입력은 0개다. 비슷하게 잡힌 1건('key' / NHY 302번째 수)은 s1 이 닫힌 노랑 칸 안에 있어 `getObjAt` 이 B 를 벽으로 보고 A 를 쪼개는 경우라 해당 없다. 고쳐도 기존 풀이는 안 바뀐다.
- 고칠 때 세 엔진을 함께 바꾸고 골든(`shared/test-cases/`)·Studio 시나리오에 r01a·r01c 를 넣는다.

## 고칠 방향 (분류 단계 시제품으로 확인)

- **Studio**: `src/engine/push.ts:238`(작업 트리 줄, P2 의 'A+B, C 빈칸' 분기) 앞에 `a = s2 눈덩이 && b = s1 눈덩이 && backedAtB → doMoveThenForceB(level, posB, dir, turnCount)` 를 넣는다. C 가 있는 분기(`:269-271`)·P3(`:317-323`)와 같은 규칙이다. 받침이 아니면 지금처럼 무반응.
- **포트**: adventure JS `editor/src/rules/engine.js:1356-1357`(C 빈칸 분기 끝, `doMoveThenForceB` 는 `:1181`), GDScript `game/rules/engine.gd:1482-1483`(`do_move_then_force_b` 는 `:1310`).
- **문서**: `ENGINE_ALGORITHMS.md` §5.5 의 `눈덩이 2 + 눈덩이 1` B 힘 조건을 "C 가 차 있거나 B 가 지형에 받쳐질 때"로 고친다(§5.7 받침 정의와 맞춤).

시제품 결과(Studio): r01a·r01c·r01e `R` → (1,2) s1 이 눈꽃이 되고 o2 (1,1)·P2 (1,0) 제자리, 턴 1. 대조 r01b·r01f·r01d 는 그대로.

시제품: 작업 트리 사본(scratch `/tmp/claude-1000/bugfix/triage/proto/`, 고친 내용 `proto.patch`)에 FIX 후보 6개(B-004~B-009)를 함께 넣어 확인했다. 코드는 작업 트리에 아직 넣지 않았다.
- Studio 엔진 테스트 `node test/engine/run.cjs` 77/77 통과(작업 트리 시나리오 그대로).
- 팀 맵 스냅샷(mapmaker `data/maps-2026-11-02.json`, 읽기만) 등록 풀이 281개 재생: 작업 트리 대비 결과·끝나는 수·매 수 판이 바뀐 풀이 0개(`impact.cjs`).
- 무작위 차분 4만 판(작업 트리 vs 시제품, `rdiff.cjs` 시드 7·11): 갈린 판은 모두 B-006·B-005·B-007·B-008 유형으로 분류되고 설명 안 되는 차이는 0이다.

## 테스트 아이디어

- Studio 시나리오: r01a(B 칸 ◥ 다리)·r01c(C 칸 터널 옆면)·r01e(C 칸 ◣ 다리) → B 눈꽃·A 제자리·턴 흐름, 대조 r01b(벽)·r01f(void) 같은 결과.
- 받침이 아닌 경우(C 빈칸이고 B 가 지나갈 수 있음)는 지금처럼 무반응인지도 한 케이스.
- 골든에 r01a·r01c 박제.

## 고친 내용 (Studio, 2026-11-02)

`src/engine/push.ts` P2 의 'A+B, C 빈칸' 분기에 규칙 하나를 더했다. `a = s2 눈덩이`, `b = s1 눈덩이`, `backedAtB` 이면 `doMoveThenForceB` 를 부른다.

- B 에 힘이 가서 s1 이 눈꽃이 된다. A(s2)와 플레이어는 제자리이고 턴이 흐른다.
- C 가 차 있는 분기(벽·void·닫힌 벽)와 P3 의 같은 규칙과 같다.
- 받침이 아니면 지금처럼 무반응이다.

문서: `ENGINE_ALGORITHMS.md` §5.5·§17, `test/GAME_IMPLEMENTATION_CASES.md` P0-31, 테스트 워크벤치 사례 P0-31.

## 검증

- 시나리오 `test/engine/cases/found-bugs-2026-11.scenario.ts` 의 `B-006 …` 6개.
  - r01a·r01c·r01e(지형 받침)와 대조 r01b(벽)·r01f(void)를 `R` 로 민다. 다섯 판 모두 (1,2) 눈꽃, o2 (1,1), P2 (1,0) 이고 턴이 흐른다(프레임 있음).
  - 받침 없는 `P2 → s2 → s1 → 빈칸` 은 무반응이다.
- 고치기 전에는 지형 받침 3개가 실패하고, 이 분기만 넣으면 통과한다.
- 무작위 차분 6만 판: 이 유형으로 갈린 판 10개, 모두 'P2 s2+s1, C 빈칸, 지형 받침'.
- 팀 맵 등록 풀이 281개 재생: 바뀐 풀이 0개.

## 포트 (adventure, 2026-11-02)

- JS `editor/src/rules/engine.js` `resolvePush` P2 의 'C 빈칸' 분기, GDScript `game/rules/engine.gd` `resolve_push` 같은 분기: `a = s2`, `b = s1`, `backedAtB` 이면 `doMoveThenForceB` / `do_move_then_force_b`.
- 골든 `bugs-2026-11.json` 의 `b006-r01a-triangle-leg-at-b`·`b006-r01c-tunnel-side-at-c`·`b006-r01e-triangle-leg-at-c`·대조 `b006-r01b-control-wall`·`b006-r01f-control-void`·`b006-unbacked-noop`.
