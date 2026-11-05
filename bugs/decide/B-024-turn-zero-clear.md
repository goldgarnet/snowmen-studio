# B-024 목표 위에서 시작하는 맵: '0턴 클리어'를 쓰는 곳과 버리는 곳이 섞여 있다

- **심각도**: low
- **분류**: **DECIDE** — 규칙 의도가 갈린다. 팀 결정 전까지 기록만 하고 코드는 그대로 둔다
- **어느 엔진**: 엔진 함수는 셋 다 0턴 클리어를 낸다(Studio `applyTurnZero`, JS `applyTurnZero`, GDScript `apply_turn_zero`). 갈리는 곳은 그 결과를 쓰는 쪽이다 — Studio 플레이 화면(`newGameState`)은 쓰고, Studio 풀이 녹화·재생(`createSolutionState`/`playMoves`)과 게임(`Main.gd` `_apply_turn_zero`)은 버린다
- **상태**: 결정 필요
- **출처**: 엔진 간 대조 — 팀 맵 풀이 281개를 Studio·adventure 로 한 수씩 재생하다 발견('여러분의 성원에 힘입어') · 옛 번호 `found/X-06-turn-zero-clear-on-start-goal`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.
- **함께 정할 것**: 0턴 2건 — B-023 · B-024.

## 증상

플레이어가 **열린 목표 칸 위에서 시작**하는 맵(초록 버튼이 없거나 다 덮인 경우):

| 실행 경로 | 시작 상태 |
|---|---|
| Studio 플레이 화면 `PlayView` — 에디터 시험 플레이·허브 플레이 공용 (`gameStateFromCode` → `newGameState`) | **cleared** — 입력 전에 클리어 |
| Studio 풀이 녹화기·풀이 보기 (`createSolutionState`) · mapmaker `mm.ts check` (`playMoves`) | playing — 0턴 결과를 버림 |
| adventure JS 도구 (`applyTurnZero(initState)` — `advcheck.mjs`, solver) | **cleared** |
| 게임 (`Main.gd` `_apply_turn_zero`) | playing — 0턴에 사라진 물체가 없으면 0턴 결과를 통째로 버림 |

게임은 0턴에 레이저로 녹은 물체가 하나라도 있으면 0턴 상태(그 status 포함)를 받아들인다. 같은 맵이라도 0턴 레이저 유무에 따라 처리가 달라진다.

## 재현

판 글(compose 문법):

```text
3 1 sun=left shadow=off soul=off
.GP2 .    .
```

- 맵 코드: `I8NAaI84MeM`
- 수열: (없음) / `R`

지금 출력:

- Studio `newGameState` → `cleared` (스크래치 `/tmp/claude-1000/bugfix/cross/t0.mjs`)
- Studio `mm.ts check I8NAaI84MeM ""` → `{"status":"playing","turnCount":0}`. `R` → `playing`(목표를 떠남)
- adventure JS `advcheck.mjs I8NAaI84MeM R` → `ADV cleared=true status=cleared moves=0`
- 게임: `Main.gd:1330-1332` 에서 `t0` 의 물체 수가 저작 상태와 같으면 `return` 해서 `state` 가 `init_state` 그대로(`playing`)다. `R` 로 목표를 떠날 수 있다.

팀 맵 스냅샷의 실제 예: '여러분의 성원에 힘입어' [rejected · 공개] (맵 코드 `IMnQyd`, 1×1 칸에 `.GP2`, 김정훈 풀이 999수).
Studio 플레이 화면은 시작하자마자 클리어되고, 녹화기·게임은 playing 으로 시작한다. 막힌 입력만 계속되므로 대기(W)를 해야 턴 끝에서 클리어된다.

## 원인

- Studio `src/utils/game.ts:11-16` `newGameState` 는 `applyTurnZero` 의 status 를 쓴다. `src/utils/solution.ts:81-87` `createSolutionState` 는 `status: 'playing'` 으로 버린다.
- 게임 `game/scripts/Main.gd:1326-1332` `_apply_turn_zero`: 물체 수가 같으면 `t0` 를 안 쓰고 끝난다(연출 계산만 하려던 조기 반환이 status 까지 버린다).
- adventure JS `editor/src/rules/engine.js:1505-1511` `applyTurnZero` 는 status 를 낸다(도구들이 그대로 씀).

## 기대 동작과 근거

한 가지로 정한다.
- (a) 0턴 클리어를 인정한다 → 녹화기·`playMoves`·게임도 0턴 status 를 쓴다. 게임은 조기 반환 전에 `state["status"] = t0["status"]`.
- (b) 0턴 클리어를 버린다 → 0턴은 레이저 녹이기만 하고 status 는 항상 playing. Studio `newGameState`·JS·GD `applyTurnZero` 의 status 판정을 뺀다.

근거: mapmaker `RULES.md` §3 0턴 — "엔진은 0턴 클리어/게임오버도 판정하지만 풀이 재생(playMoves)은 0턴 상태를 버리고 playing 으로 시작한다"(지금 상태를 적어 둔 것이다). 팀 결정 Q-07 은 0턴 레이저만 정했다.
에디터는 '시작부터 빔 위 플레이어'를 막는다. 그래서 실제로 갈리는 건 '열린 목표 위에서 시작'뿐이다. 에디터가 이 배치를 막는 것도 방법이다.

## 영향

- 정상 퍼즐에는 없는 배치다. 팀 맵 중 1개(rejected)만 해당한다.
- 팀 맵 풀이 281개를 Studio(`newGameState` 시작 → 0턴 status 무시)와 adventure JS 로 한 수씩 대조하면 이 맵만 갈린다(B-007 'Split & Push' 는 0턴 판의 그늘 표시만 다르고 결과는 같음).

## 결정할 것

열린 목표 위에서 시작하면 바로 클리어인가? (a) 인정 — 녹화기·`playMoves`·게임 `Main.gd` 도 0턴 status 를 쓴다. (b) 버림 — 0턴은 레이저만, status 는 늘 playing(Studio `newGameState`·JS·GD `applyTurnZero` 에서 판정 제거). 에디터가 이 배치를 막는 것도 방법이다. 해당 팀 맵 1개(rejected).
