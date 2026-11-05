# B-002 굴러 지나가며 잠시 누른 초록 버튼을 클리어로 인정하지 않음

- **심각도**: high (클리어 판정 규칙이 바뀐다. 초록 버튼 맵의 최적 풀이가 짧아질 수 있지만, 잰 채택 맵 5개는 그대로였다)
- **어느 엔진**: studio · JS · GDScript (셋 다 같은 결과 — JS 는 같은 맵 코드로 실행해 확인, GDScript 는 같은 코드 구조)
- **상태**: 고침 — Studio · adventure JS · GDScript, 게임 연출(`Main.gd`)까지 (브랜치 `fix/engine-bugs-2026-11-02`). 초록 버튼이 없는 맵에도 적용되는 범위는 결정 필요(B-027)
- **출처**: 사용자 보고 2026-11-02 두 번째 사진 ("지금은 여기서 오른쪽으로 가도 클리어가 아닌 판정인데, 따뜻한 칸에 녹기 전의 눈덩이가 누르는 것도 인정이 되면 이것처럼 잠시 눌리는 것도 인정이 되어야 함")

## 증상

플레이어가 목표 위의 공을 밀어 목표로 들어간다. 공은 굴러가면서 하나뿐인 초록 버튼 위를 지나간다.
공이 버튼 위에 있는 순간에는 버튼이 다 눌렸고 플레이어도 목표 위에 있다. 그런데 클리어가 아니다.
엔진이 굴림이 다 끝난 뒤에만 목표를 판정해서, 그때는 이미 버튼이 비어 있기 때문이다.

## 재현

판 글 — `repro/screenshot2-roll-over-button.txt`, 수열 `R`:

```text
8 6 sun=left shadow=off soul=off
.    .    .    .    .    .    .    .
.    .    .    .    .    .    .    .
.    .    .    .    .    .    .    .
.    . P2 .Go1 .    .    .g   .    .
.    .    .    .    .    .    .    .
.    .    .    .    .    .    .    .
```

맵 코드: `o6K54Ki5fYv38Iz1NiEY9q55cshEu281GoZNGsQ7wWPDdqfS8nLGmCSrXMoupM0zb1bUlRtmZIQVkyavCrCsaDiTDCYjXSfBRTU884p8Iz3wB176FMgEIPOsWNby`

| | 상태 | 판 |
|---|---|---|
| 고치기 전 (studio fff5e12 · adventure JS 같음) | `playing` | 플레이어 (3,2) 목표, 공 (3,7) — 버튼 (3,5)를 지나 맵 끝에서 멈춤 |
| 고친 뒤 (studio) | `cleared` | 같은 판(굴림은 끝까지 진행). 공이 (3,5)에 있던 틱에 클리어 |

## 원인

목표 판정이 굴림이 끝난 뒤에만 있었다(줄 번호는 고치기 전 `fff5e12` 기준).

- `src/engine/turn.ts:315-337` — 굴림 틱 훅은 구멍·주황 래치·레이저만 풀고 목표를 보지 않는다.
- `src/engine/turn.ts:381-382`·`:397` — 목표는 굴림이 다 끝난 판에서만 판정한다.

포트도 같다: adventure `editor/src/rules/engine.js:1551-1567`(`makeTickRecorder` 의 `onTick`), `game/rules/engine.gd:1701-1714`(`on_tick`).

## 기대 동작과 근거

- 사용자 결정(2026-11-02): 굴림 중 잠시 눌린 초록 버튼도 인정한다.
- 근거로 든 기존 규칙: 이동 턴의 목표 판정은 턴 끝 녹기 **전**이다. 그래서 그 턴 끝에 녹을 눈덩이가 덮은 버튼도 클리어로 인정된다(mapmaker `RULES.md` §12, Studio `ENGINE_ALGORITHMS.md` §15).
- 같은 순간의 죽음이 먼저라는 기존 순서는 유지한다(레이저가 목표 판정보다 먼저 — `ENGINE_ALGORITHMS.md` §12, P1-08). 사망 뒤 목표 위 눈사람으로 영혼이 옮겨 가면 클리어다(Q-14).

## 고친 내용 (Studio)

`src/engine/turn.ts` `executeTurn` 의 굴림 틱 훅:

- 매 이동 틱에서 구멍 → 주황 래치 → 레이저를 처리한 **뒤** `isLevelCleared(tickLevel)` 를 본다. 영혼을 가진 플레이어가 목표 위에 있고 초록 버튼이 다 덮여 있으면 그 턴은 클리어다.
- 같은 틱에 레이저·구멍으로 플레이어가 죽으면 죽음이 먼저다. 버튼을 덮은 공이 그 틱 빔에 녹아도 인정하지 않는다.
- 굴림은 멈추지 않는다. 공은 자체 정지 조건까지 굴러가고, 프레임도 끝까지 기록한다(연출).
- 턴 결과는 `cleared` 이고 마지막에 `turn-end` 프레임이 붙는다. 이동 뒤 처리(영혼 발판·포털·구멍·래치·레이저·녹기)는 하지 않는다. 기존 '이동 직후 클리어'가 녹기를 건너뛰는 것과 같다.
- 클리어 뒤 같은 굴림에서 일어난 일은 결과를 바꾸지 않는다. 예를 들어 이어서 노란 버튼을 밟아 열린 레이저가 플레이어를 맞혀도 `cleared` 다(테스트로 고정).

문서: `ENGINE_ALGORITHMS.md` §4.1·§9.2·§15, `TICK_SIMULATION_MECHANICS.md` §4·§7·§8, `test/GAME_IMPLEMENTATION_CASES.md` P0-27·P1-09.

앱 화면: Simulator(PlayView 포함)·SolutionRecorder·SolutionPlayer 는 모두 엔진의 `status` 만 쓰므로 고칠 것이 없다.

- 애니메이션을 켜면 굴림 프레임을 다 보여 준 뒤 마지막 프레임에서 클리어가 뜬다.
- 끄면 바로 뜬다.
- 마지막 판에서는 공이 버튼을 떠나 목표가 다시 잠긴 그림으로 보인다. 클리어 오버레이(반투명) 아래라 기능 문제는 없다.
- 게임(adventure `game/scripts/Main.gd`)은 다르게 그린다. 클리어가 정해진 프레임부터 목표를 연 채 그리고(`_goal_clear_turn_of`·`_goal_drawn_open`), 목표 도착 빛은 굴림 재생이 끝난 뒤 켠다. 클리어 뒤 같은 굴림에서 몸이 사라졌으면 빛 없이 클리어한다. 갤러리 #38 '굴러 지나간 초록 버튼 → 클리어', 검증 `game/test/test_main_contract.gd` `_test_rolled_button_clear_and_arch_build_presentation`.

## 검증

- 시나리오 `user-bugs-2026-11.scenario.ts` 의 `B-002 …` 8개는 다음과 같다.
  - 장면 2(맵 코드 그대로)
  - 공 하나로 버튼 두 개를 차례로 지남 → 클리어 아님
  - 그 틱에 다른 초록 버튼이 빔 → 클리어 아님
  - 공 두 개 열차가 버튼 두 개를 같은 틱에 덮음 → 클리어
  - 같은 칸 초록+노랑 버튼으로 열린 레이저가 같은 틱 플레이어를 맞힘 → `gameover`
  - 버튼을 덮은 공이 같은 틱 빔에 녹음 → 클리어 아님
  - 클리어 뒤 같은 굴림의 레이저 → `cleared` 유지
  - 초록 버튼이 없는 같은 판 → 첫 틱 클리어가 뒤 틱 레이저보다 우선(`cleared`, 아래 '확인할 점' · B-027, 검토 단계에서 더함)
- 고치기 전 엔진에서는 클리어를 기대하는 4개가 실패한다. 나머지 4개는 그대로 통과하는 순서 가드다.
- 테스트 워크벤치 사례 P0-27.
- 무작위 대조(scratch): 목표 위 공을 밀어 초록 버튼 줄을 굴리는 판 6000개(모두 다른 판) 중 443개가 달라졌다. 모두 turn.ts 수정 하나로만 설명되고, 표본 60개는 모두 `playing → cleared`(잠시 눌림)였다. 클리어 뒤 같은 굴림에서 플레이어가 죽는 경우는 표본에 없었다.
- 줄 밀기 무작위 대조(서로 다른 판 15000개)에서 turn.ts 때문에 달라진 169개도 표본 40개가 모두 더 이른 클리어였다. 38개는 `playing → cleared` 이고, 2개는 고치기 전엔 뒤 수에서야 끝났다.

## 영향

- 팀 맵 스냅샷(mapmaker `data/maps-2026-11-02.json`, 등록 풀이 281개 재생): 결과나 끝나는 수가 바뀐 풀이는 0개다.
- 초록 버튼이 있는 맵은 '공을 굴려 버튼을 스치게 하고 목표에 서 있기' 가 새 지름길이 될 수 있다. 채택 맵 중 초록 버튼과 눈덩이가 함께 있는 것은 34개다.
- BFS 가 끝나는 작은 초록 버튼 맵 5개의 턴 최적을 고친 엔진으로 다시 쟀다(scratch BFS, 고치기 전 = mapmaker `CORPUS.md` 값). 모두 그대로다.

| 맵 | 최적 |
|---|---|
| `205b3d08` | 30 |
| `bdf369a9` Vertical | 24 |
| `464ea1d3` Rotations | 22 |
| `68d7fd1e` Swap | 51 |
| `23fde9c2` Align | 63 |

더 큰 초록 버튼 맵(BFS 시간 초과)은 재지 못했다.

## 포트 (adventure, 2026-11-02)

- JS `editor/src/rules/engine.js` `makeTickRecorder`(틱마다 `isLevelCleared` → `cleared()`)·`applyMoveWithTrace`(굴림 도중 클리어면 `finishTurn` 없이 `cleared` + turn-end 프레임).
- GDScript `game/rules/engine.gd` `apply_move_with_trace` 의 `on_tick`(`trace["cleared"]`)과 그 뒤 분기. 같은 순서다.
- 골든 `bugs-2026-11.json` 의 `b002-*` 10케이스(장면 2 맵 코드, 첫 틱 누름, 버튼 둘·공 하나, 다른 버튼 빔, 열차, 같은 틱 사망, 빔에 녹은 덮개, 클리어 뒤 레이저, 초록 버튼 없는 맵, Q-14 영혼 이동)와 `tick-simulation.mjs`·`test_turn_flags.gd` 프레임 검사.

## 확인할 점 — 초록 버튼이 없는 맵에도 적용된다 (B-027)

**2026-11-05 팀 결정(B-027)으로 달라졌다.** 클리어가 정해지면 판이 그 tick에서 멈춘다. 공은 버튼 위에 남는다. 아래와 위의 '굴림은 끝까지 간다'는 그 전의 기록이다.

틱 판정은 초록 버튼과 무관하게 모든 맵에 적용된다. 초록 버튼이 없으면 목표는 늘 열려 있으므로, 목표 위 공을 밀고 목표에 들어선 턴은 굴림 첫 틱에 클리어가 정해진다. 그 뒤 같은 굴림이 연 레이저에 맞아도 결과는 `cleared` 이다. 고치기 전에는 굴림이 끝난 뒤 판정해서 `gameover` 였다.

- 재현: 맵 코드 `GcjF2ccd485rihEzWq3z1veNghemj8l4hClObjApkBj8k3POqPoo9frVsbpqm842MA`, 수열 `R`. 본 트리 세 엔진 `gameover` → 작업 트리 세 엔진 `cleared`(마지막 판에 플레이어 없음).
- 사용자가 말한 '잠시 눌린 초록 버튼 인정'보다 넓다. 지금 동작은 시나리오 `B-002 with no green button …`·골든 `b002-no-green-clear-stands-later-laser` 로 고정해 두었다. 팀 결정은 B-027 에서 받는다.
