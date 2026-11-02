# B-005 아치 너머 눈사람 만들기(Q-03) 검사가 눈꽃(Q-10)으로 커진 최종 크기를 보지 않아, 아치보다 큰 눈사람이 아치 너머에 생김

- **심각도**: medium
- **분류**: **FIX** — 기대 동작이 분명하고 고쳐도 위험이 작다. Studio 에서 고친 뒤 포트
- **어느 엔진**: studio · JS · GDScript (셋 다 같음)
- **상태**: 고침 — Studio · adventure JS · GDScript (브랜치 `fix/engine-bugs-2026-11-02`). 골든 `b005-*` 5케이스
- **출처**: 팀 결정 대조(Q-03 × Q-10) — 이번 작업에서 새로 찾음. 사용자 보고 B-003(미는 플레이어도 A→B 를 지나야 함)과 같은 함수지만 별개다. · 옛 번호 `found/R-09-q03-arch-check-ignores-flake-growth`
- **줄 번호 기준**: 본 트리(현재 배포) — studio `fff5e12`, adventure `a2dd0e9`. 재현 스크립트(세 엔진 대조): `/tmp/claude-1000/bugfix/R-known/run3.sh <specs.txt>`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.
- **참고**: q03e(P2·터널 칸 B)는 B-003 수정(작업 트리)으로 이미 무반응이다. P1 경우와 아치 경우는 남는다.

## 증상

B 칸(앞 눈덩이 칸)에 눈꽃이 깔려 있으면, 새 눈사람은 만들어진 직후 그 눈꽃을 먹고 한 단계 커진다(Q-10). 그런데 Q-03 아치 검사는 **눈꽃을 먹기 전 크기**로 한다. 그래서

- `s1 →(h2 아치)→ s2(눈꽃 위)` 를 P2 가 밀면 아치 너머에 **S3** 가 생긴다(S3 는 h2 아치를 못 지난다).
- `s1 →(h1 아치)→ s1(눈꽃 위)` 를 P1 이 밀면 아치 너머에 **S2** 가 생긴다(S2 는 h1 아치를 못 지난다).

B-003 수정(플레이어도 A→B 를 지나야 함)으로는 막히지 않는다 — 두 경우 모두 플레이어는 그 아치를 지난다(P2 ≤ h2, P1 ≤ h1).

## 재현

```text
q03a (P2, A→B 사이 h2 아치, B=s2 가 눈꽃 위)        q03d (P1, A→B 사이 h1 아치, B=s1 이 눈꽃 위; WW 로 P2→P1)
5 3 sun=left shadow=off soul=off                    6 3 sun=left shadow=off soul=off
.    .    .    .    .                               .    .    .    .    .    .
. P2 . o1 .*o2 . ## .                               ~ P2 . o1 .*o1 . ## .    .
.    .    .    .    .                               .    .    .    .    .    .
arch left 1 2 2                                     arch left 1 2 1
```

| 판 | 맵 코드 | 수열 | 지금(studio·JS·GD 같음) | 기대 |
|---|---|---|---|---|
| q03a | `XTZGO3f4W5vCA0kziJgQuj51GXkNB7zL9MsWpoNZu` | R | (1,2) 에 **S3** 생성, 플레이어 (1,1) | 무반응(막힌 입력) — S3 가 h2 아치를 못 지남 |
| q03d | `DvddI96DJ0aPoAcRyTH4g6obOCcUQURdC1Evbg4FNds11T0Ks` | WWR | (1,2) 에 **S2** 생성, P1 (1,1) | 무반응 — S2 가 h1 아치를 못 지남 |
| 대조 q03c 눈꽃 없음, h2 아치 | `XTZGO3f4W5vCA0kziJgQuGqddiVEN0ylZPpwC7B5m` | R | S2 생성(h2 통과 가능 — 맞음) | — |
| 대조 q03b 눈꽃 있음, 아치 없음 | `XTZGO3f4W5vCA0kziJgQujdgYLJyp14BtI280pdrq` | R | S3 생성(맞음) | — |

지금 엔진 출력(`mm.ts trace <q03a> R --boards`):

```text
 1 . P2 . o1 .*o2 . ## .
arch left 1 2 2
#1 → → 턴 1
   눈사람 -→(1,2) 크기 -→3
   타일: 눈꽃 소비 (1,2)
 1 .    . P2 . S3 . ## .
```

## 원인

- `src/engine/push.ts:589-615` `doBuildSnowman`: `:596-601` 에서 `snowmanSize`(눈꽃 전 크기)로 `canMoveTo(level, posA, dir, completedSnowman)` 를 본 뒤, `:609` `pickFlake(level, posB)` 가 크기를 +1 한다.
- 포트: adventure `editor/src/rules/engine.js:1187-1195` `doBuild`(`:1191` 같은 검사 → `buildSnowman` 이 눈꽃을 먹음), `game/rules/engine.gd:1315-1322` `do_build`.

## 기대 동작과 근거

- Q-03(adventure `CLAUDE.md` '규칙 감사 결정'): "**완성 눈사람이** 못 지나는 아치 너머로는 못 만든다(+게임에서 '팔이 막혀 원상복구' 연출)". Q-10: "새로 생긴 눈사람도 발밑 눈꽃을 먹는다" — 먹는 것까지가 만들기의 결과다.
- Studio `ENGINE_ALGORITHMS.md` §6: "A→B 경계는 **완성될 눈사람 크기**로 통과 가능해야 한다. 작은 눈덩이가 낮은 가장자리 아치를 통과한 직후 아치보다 큰 눈사람으로 합쳐지는 것은 금지된다." 코드 주석(`push.ts:593-595`)도 같은 취지.
- 설계자 이해도 같다: mapmaker `training/SOLVING.md` "h1 아치·터널 경계 … 너머에 세울 수 있는 눈사람은 S1뿐이다(Q-03)".

고칠 방향: 검사 크기 = `snowmanSize + (B 칸 눈꽃이 있고 snowmanSize < 3 ? 1 : 0)`. 같은 `canMoveTo` 가 터널 높이도 보므로 터널 칸도 함께 맞춰진다 — 지금은 눈꽃 위 s1 이 있는 터널 칸에 S2 가 생겨 그대로 갇힌다(q03e `. P2 . o1 .=o1 . ##` + `flag 0 2 flake`, 코드 `BOos9d3hOTFQHK`, R → `S2@(0,2)`; s1 이 눈꽃 위에 서 있으려면 시작 배치여야 해서 드묾. 이 P2 경우는 B-003 수정으로도 막히지만 P1 이면 남는다). B-003 수정과 같은 함수이므로 함께 고치는 것이 좋다.

## 영향

팀 맵 스냅샷 281 풀이에서 '아치보다 큰 새 눈사람이 아치 너머에 생긴' 수는 0개. 고쳐도 기존 풀이는 안 바뀐다.

## 고칠 방향 (분류 단계 시제품으로 확인)

- **Studio**: `src/engine/push.ts:596-601`(작업 트리 줄) `doBuildSnowman` — 아치·터널 검사에 쓰는 크기를 **눈꽃을 먹은 뒤 크기**로 한다.
  검사 크기 = `snowmanSize + (B 칸 isFlake && snowmanSize < 3 ? 1 : 0)`. 못 지나면 지금과 같은 무반응(`playerMoved: false`). B-003 검사(플레이어 크기)는 그대로 둔다.
- **포트**: adventure JS `editor/src/rules/engine.js:1187-1195` `doBuild`(:1191 검사 크기), GDScript `game/rules/engine.gd:1315-1322` `do_build`(:1319).
- **게임 연출**: Q-03 의 "팔이 막혀 원상복구"를 그대로 쓴다(B-003 과 같음).
- **문서**: `ENGINE_ALGORITHMS.md` §6 "완성될 눈사람 크기"에 "B 칸 눈꽃을 먹은 뒤 크기(Q-10)"를 덧붙인다. `test/GAME_IMPLEMENTATION_CASES.md` P0-07·P0-28 옆에 사례 추가.

시제품 결과(Studio):

| 판 | 수열 | 지금 | 고친 뒤 |
|---|---|---|---|
| q03a | R | S3 (1,2) | 무반응 — P2 (1,0), o1 (1,1), o2 (1,2), 눈꽃 (1,2) 그대로 |
| q03d | WWR | S2 (1,2) | 무반응 — P1 (1,0), o1 (1,1)·(1,2), 눈꽃 그대로 |
| 대조 q03c·q03b | R | S2·S3 | 같음 |

시제품: 작업 트리 사본(scratch `/tmp/claude-1000/bugfix/triage/proto/`, 고친 내용 `proto.patch`)에 FIX 후보 6개(B-004~B-009)를 함께 넣어 확인했다. 코드는 작업 트리에 아직 넣지 않았다.
- Studio 엔진 테스트 `node test/engine/run.cjs` 77/77 통과(작업 트리 시나리오 그대로).
- 팀 맵 스냅샷(mapmaker `data/maps-2026-11-02.json`, 읽기만) 등록 풀이 281개 재생: 작업 트리 대비 결과·끝나는 수·매 수 판이 바뀐 풀이 0개(`impact.cjs`).
- 무작위 차분 4만 판(작업 트리 vs 시제품, `rdiff.cjs` 시드 7·11): 갈린 판은 모두 B-006·B-005·B-007·B-008 유형으로 분류되고 설명 안 되는 차이는 0이다.

## 테스트 아이디어

- Studio 시나리오(`test/engine/cases/` 새 파일 또는 `user-bugs-2026-11.scenario.ts` 옆): q03a·q03d 무반응, 대조 q03c(S2)·q03b(S3) 생성, P1 터널 칸 B + 눈꽃(S2 가 갇히는 경우) 무반응.
- 골든(`shared/test-cases/`)에 같은 4케이스를 박제해 JS·GDScript 를 잠근다.

## 고친 내용 (Studio, 2026-11-02)

`src/engine/push.ts` `doBuildSnowman`: 아치·터널 검사(Q-03)에 쓰는 크기를 **B 칸 눈꽃을 먹은 뒤 크기**로 한다.

- 검사 크기 = `snowmanSize + (B 칸 isFlake && snowmanSize < 3 ? 1 : 0)`.
- 못 지나면 지금과 같은 무반응이다(`playerMoved: false`, 턴 효과 없음).
- 바로 뒤의 B-003 검사(미는 플레이어 크기)는 그대로다.
- 게임은 Q-03 의 "팔이 막혀 원상복구" 연출을 그대로 쓴다.

문서: `ENGINE_ALGORITHMS.md` §3.3·§6·§17, `test/GAME_IMPLEMENTATION_CASES.md` P0-07·P0-08·P0-30, 테스트 워크벤치 사례 P0-30.

## 검증

- 시나리오 `test/engine/cases/found-bugs-2026-11.scenario.ts` 의 `B-005 …` 5개.
  - q03a `R`·q03d `WWR`: 무반응. 프레임 0, 판·눈꽃 그대로(q03d 의 플레이어는 대기 두 번으로 녹은 P1).
  - 대조 q03c `R` → S2, q03b `R` → S3(눈꽃을 먹음). 고치기 전후 같다.
  - P1 이 눈꽃 위 s1 이 있는 터널 칸 B 에 만들기 → 무반응(눈꽃 없이는 S1 을 만드는 B-003 시나리오가 대조).
- 고치기 전 엔진에서는 무반응 3개가 실패하고, push.ts 의 이 검사만 넣으면 통과한다.
- 무작위 차분(고치기 전 vs 고친 뒤, 서로 다른 판 6만 개 = 시드 3개 × 2만): 이 유형으로 갈린 판 2개, 둘 다 '눈꽃 위 B 만들기'.
- 팀 맵 등록 풀이 281개 재생: 바뀐 풀이 0개.

## 포트 (adventure, 2026-11-02)

- JS `editor/src/rules/engine.js` `doBuild`, GDScript `game/rules/engine.gd` `do_build`: 검사 크기 = B 칸 눈꽃을 먹은 뒤 크기. 바로 뒤에 B-003 의 플레이어 검사가 온다.
- 골든 `bugs-2026-11.json` 의 `b005-q03a-p2-h2-arch-flake`·`b005-q03d-p1-h1-arch-flake`·`b005-q03c-control-no-flake`·`b005-q03b-control-no-arch`·`b005-p1-tunnel-flake-noop`.
- 게임 연출: 새 무반응도 막힌 입력 + 앞 눈덩이 둘이라 Q-03 의 "팔이 막혀 원상복구"(`buildfail`)가 그대로 뜬다.
