# B-003 플레이어가 못 지나는 아치 너머로 눈사람이 만들어짐 (크기 2 플레이어 · 높이 1 아치)

- **심각도**: medium (채택 맵 1개의 등록 풀이가 더는 클리어하지 않는다 — 아래 '영향')
- **어느 엔진**: studio · JS · GDScript (셋 다 같은 결과 — JS 는 같은 맵 코드로 실행해 확인, GDScript 는 같은 코드 구조)
- **상태**: 고침 — Studio · adventure JS · GDScript (브랜치 `fix/engine-bugs-2026-11-02`). 게임 연출은 Q-03 의 "팔이 막혀 원상복구" 를 그대로 쓴다(갤러리 #39). 채택 맵 1개의 풀이 재등록이 남음(아래 '영향')
- **출처**: 사용자 보고 2026-11-02 세 번째·네 번째 사진 ("원래 게임 애니메이션에서, 플레이어가 눈사람을 만들 때, 한 칸 뒤에서 눈사람을 다듬어서 만드는거거든. 근데 크기 2 플레이어는 크기 1 아치를 못 통과하니까, 눈사람이 생기면 안돼.")

## 증상

플레이어가 눈덩이 A 를 밀어, 받쳐진 눈덩이 B 위에 올려 눈사람을 만든다. A→B 경계에 높이 제한 아치가 있다.

- 완성될 눈사람이 그 아치를 못 지나면 이미 막혀 있었다(Q-03, 장면 3 — 크기 3 눈사람 · 높이 2 아치 → 무반응, 맞음).
- 그런데 완성 눈사람(S1)은 지나가고 **미는 플레이어(크기 2)는 못 지나는** 경우에는 눈사람이 생겼다(장면 4).

플레이어는 A 칸, 곧 눈사람 한 칸 뒤에서 B 의 눈사람을 다듬어 만든다. 따라서 플레이어가 못 지나는 경계 너머에는 만들 수 없어야 한다.

## 재현

장면 4 — `repro/screenshot4-snowman-h1-p2.txt`, 수열 `D`:

```text
8 8 sun=left shadow=off soul=off
.    .    .    .    .    .    .    .
.    .    .    .    .    .    .    .
.    .*   . P2 .    .    .    .    .
.    .    . o1 .    .    .    .    .
.    .    . o1 .    .    .    .    .
.    .    . ## .    .    .    .    .
.    .    .    .    .    .    .    .
.    .    .    .    .    .    .    .
arch top 4 2 1
arch top 5 2 1
```

맵 코드: `CVw6OrorD0NvXu6EOrzDobpIVCbn9latyHwpwFE0vmCxrhegUuyKx3bdKqUITbpm277N48hNUv2KKcvwSURlOwUVt5CYlpntd6v5JF89vx2ZQIj1TTEYaCfTcT3mBwDEAiIXGDIsR7rfnvnONx35G7yfyi2dSTC1jagPe`

장면 3(대조, 이미 맞던 경우) — `repro/screenshot3-snowman-h2-p3.txt`, 수열 `RD`(R 은 눈꽃을 먹어 P3):

```text
3 5 sun=left shadow=off soul=off
. P2 .*   . ##
.    . o2 . ##
.    . o2 . ##
.    . [] . ##
.    .    . ##
arch top 2 1 2
arch top 3 1 1
```

맵 코드: `XMst99XngKM15Tsl1LLg6mlnd3zOVj0PkIHe2UkTa`

| 장면 | 고치기 전 (studio fff5e12 · adventure JS 같음) | 고친 뒤 (studio) |
|---|---|---|
| 4 `D` | P2 가 (3,2)로 들어가고 (4,2)에 **S1 생김** (턴 흐름) | **무반응** — P2 (2,2), s1 (3,2)·(4,2) 그대로, 턴 효과 없음 |
| 3 `RD` | D 무반응 | 같음(무반응) |

## 원인

`src/engine/push.ts:589-601`(고치기 전 `fff5e12`) `doBuildSnowman` 은 **완성된 눈사람**이 A→B 경계를 지날 수 있는지만 봤다(`:599`, Q-03). 미는 플레이어의 크기는 보지 않았다.

포트도 같다: adventure `editor/src/rules/engine.js:1187-1195`(`doBuild`), `game/rules/engine.gd:1315-1322`(`do_build`).

## 기대 동작과 근거

- 사용자 결정(2026-11-02): 장면 4 에서 눈사람이 생기면 안 된다. 장면 3 과 같이 무반응이다.
- 팀 결정 **Q-03**(adventure `CLAUDE.md` '규칙 감사 결정'): 완성 눈사람이 못 지나는 아치 너머로는 못 만든다. 게임은 이때 "팔이 막혀 원상복구" 연출을 보여 준다. 이번 결정은 Q-03 의 확장이고, 새로 막히는 경우에도 같은 연출을 쓴다.

## 고친 내용 (Studio)

`src/engine/push.ts` `doBuildSnowman`: 완성 눈사람 검사 다음에 `canMoveTo(level, posA, dir, 플레이어)` 를 본다. 플레이어가 A 칸에서 B 칸으로 지형상 넘어갈 수 없으면 무반응이다.

| 플레이어 | 막히는 A→B 경계 |
|---|---|
| 크기 2 | 높이 1 아치, B 가 터널 칸(높이 1.5 > 1) |
| 크기 3 | 높이 1·2 아치, 터널 칸 B |
| 크기 1 | 예전과 같다(완성 눈사람 검사만) |

다른 생성 경로는 손대지 않았다.

- `force.ts` 쪼개기가 양쪽 막혀 만드는 S1 은 플레이어 바로 앞 A 칸에 생긴다. 플레이어가 A 로 못 넘어가면 애초에 밀 수 없으므로(`executePush` 첫 검사) 같은 조건이 이미 성립한다.
- `roll.ts` 굴림과 블록을 통한 간접 힘은 눈사람을 만들지 않는다.

문서: `ENGINE_ALGORITHMS.md` §3.3·§6, `test/GAME_IMPLEMENTATION_CASES.md` P0-07·P0-28.

## 검증

- 시나리오 `user-bugs-2026-11.scenario.ts` 의 `B-003 …` 7개는 다음과 같다.
  - 장면 3·4(맵 코드 그대로)
  - P1 은 높이 1 아치 너머 S1 을 만든다
  - P2 는 같은 판에서 무반응
  - P3 는 높이 2 아치 너머 S2 도 무반응
  - P1 은 터널 칸 B 에 S1 을 만든다
  - P2 는 터널 칸 B 에 무반응
- 고치기 전 엔진에서는 무반응을 기대하는 4개가 실패한다.
- 테스트 워크벤치 사례 P0-28.
- 무작위 대조(scratch): 아치·터널 경계에서 만드는 판 6000개(서로 다른 판 5998개) 중 406개가 달라졌다. 모두 push.ts 수정 하나로만 설명되고, 표본을 직접 보니 위 표대로였다.
- 넓은 무작위 대조 2종(서로 다른 판 15000개씩)에서 push.ts 때문에 달라진 50개 중 표본 45개를 자동으로 확인했다. 모두 처음 갈린 수가 '고치기 전엔 눈사람을 만들고, 고친 뒤엔 무반응' 이었다. 1개는 만든 눈사람이 B 칸 구멍에 바로 빠진 경우다.

## 영향 — 채택 맵 1개의 풀이가 바뀜 (확인 필요)

팀 맵 스냅샷(mapmaker `data/maps-2026-11-02.json`, 등록 풀이 281개 재생)에서 결과가 바뀐 풀이는 **1개**다.

- **채택 맵 `82d18363`(김정훈, 6×4, 제목 없음)**
  - 맵 코드: `Cg4TatfaJIUBNrIvDu0f16Nooz8OEaMp0WM24jXEGqer6WLWAqT4zgze`
  - 등록 풀이 `UURRULDLLLDDRWRRRDDLLDRRRRR`(27수): 6수째 `L` 에서 P2 가 높이 1 아치 너머로 S1 을 만드는데, 이제 무반응이다. 그래서 끝까지 두어도 클리어하지 않는다(`playing`).
  - 새 규칙에서도 맵은 풀린다. 턴 최적(BFS)은 25 → 31 이다. 새 최적 `UUDLLDRWUURRRULDLDLDRRRDDLDRRRR` 은 볕에서 P1 로 줄어든 뒤 같은 자리에 S1 을 만든다.
  - 검토 단계에서 앱 풀이 재생 경로(`gameStateFromCode` → `createSolutionState` → `advanceSolutionState`)로 다시 확인했다(2026-11-02). 등록 풀이 27수와 옛 최적 25수(`UURRULDLDLLDRWRRRDDLDRRRR`)는 본 트리 세 엔진(studio `fff5e12` · JS·GD `a2dd0e9`)에서 클리어하고, 작업 트리 세 엔진에서는 둘 다 6수째 `L` 부터 갈려 끝까지 `playing` 이다. 새 31수는 본 트리·작업 트리 세 엔진 모두 31수째 클리어한다.
  - 관리자 댓글(2026-07-05, '임시 관리자'): "아치들 지워도 됨 / '기다리기' 튜토리얼로 사용".
  - 아치 다섯 개를 모두 지운 판(맵 코드 `GD5JjlH2AzuBDugcVowyQki4p2NSpaKHtLUStBULckQ7tywydVQXEsLJtUNh6nyo`)에서는 등록 27수와 옛 25수가 작업 트리 세 엔진에서도 그대로 클리어한다. 그 판의 턴 최적은 재지 않았다.
  - **할 일**(엔진 코드는 그대로 둔다): 출제자 김정훈이 배포 뒤 풀이를 직접 다시 등록하기로 했다(2026-11-02). 31수 풀이로 다시 등록하거나, 댓글대로 아치를 지운 판으로 고친다. 그 뒤 mapmaker `CORPUS.md` 의 최적 턴·난이도를 갱신한다(로컬 전용이라 메인 세션 몫).

아치·터널이 있는 다른 채택 맵 중 BFS 가 끝나는 작은 맵 4개는 턴 최적이 그대로다(scratch BFS, 고치기 전 = mapmaker `CORPUS.md` 값):

| 맵 | 최적 |
|---|---|
| `298d2291` Mini Maze II | 15 |
| `5ab6f992` Tunnel | 30 |
| `d59ca76f` Castle | 45 |
| `15c2ca09` Prisoners | 26 |

더 큰 맵(BFS 시간 초과)은 재지 못했다. 아치·터널 경계에서 P2·P3 가 만드는 수를 쓰는 맵은 다시 풀어 보는 것이 안전하다.

## 포트 (adventure, 2026-11-02)

- JS `editor/src/rules/engine.js` `doBuild`, GDScript `game/rules/engine.gd` `do_build`: 완성 눈사람 검사(B-005 로 눈꽃을 먹은 크기) 다음에 `canMoveTo(st, posA, dir, p)` / 같은 GD 검사.
- 골든 `bugs-2026-11.json` 의 `b003-*` 7케이스(장면 3·4 맵 코드 포함).
- 게임 연출: 새로 막히는 경우도 막힌 입력 + 앞 눈덩이 둘이라 기존 `_front_is_buildable` → `buildfail`("팔이 막혀 원상복구")이 그대로 뜬다. 갤러리 #39 '아치 너머로 손이 안 닿음 (크기 2)', 검증 `game/test/test_main_contract.gd` `_test_rolled_button_clear_and_arch_build_presentation`(높이 1 아치·터널 칸).
- 문서: `test/GAME_IMPLEMENTATION_CASES.md` P0-08 이 아직 'P3 로 `M1` 합성 가능'이라 적고 있어 P0-28 과 어긋났다(검토 지적). 미는 플레이어를 P1 으로 바꾸고 P2·P3 무반응 변형을 적었다.
