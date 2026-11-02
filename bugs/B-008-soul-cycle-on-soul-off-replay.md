# B-008 `soul=off` 맵의 M(영혼 순환): Studio 풀이 재생은 실행, adventure 는 무시

- **심각도**: low
- **분류**: **FIX** — 기대 동작이 분명하고 고쳐도 위험이 작다. Studio 만 고치면 된다
- **어느 엔진**: Studio 엔진 함수(`cycleSoul`)·풀이 재생(`advanceSolutionState`/`playMoves`)이 다름. adventure JS · GDScript 엔진과 두 앱의 화면 입력은 막는다
- **상태**: 고침 — Studio (브랜치 `fix/engine-bugs-2026-11-02`). adventure 는 이미 막고 있어 포트 없음
- **출처**: mapmaker `RULES.md` §3 M · §16, 엔진 간 대조에서 재확인 · 옛 번호 `found/X-04-soul-cycle-on-soul-off-map`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.

## 증상

영혼 이동(M)이 꺼진 맵이라도 풀이 문자열에 `M` 이 들어 있으면

- Studio 풀이 재생(`playMoves` — 허브 풀이 보기·녹화기의 초기 풀이·mapmaker `mm.ts check`)은 M 을 실행한다. 영혼이 목표 위 눈사람으로 가면 클리어된다.
- adventure 엔진(JS `applySoulCycle`, GDScript `apply_soul_cycle`)은 M 을 무시한다. 게임(`Main.gd` `_soul_cycle`)도 막는다.

화면 입력은 둘 다 막는다(Studio `Simulator.tsx:177`·`SolutionRecorder.tsx:208`, 게임 `Main.gd` `_soul_cycle`). 갈리는 곳은 **저장된 풀이를 재생·검증하는 경로**다.

## 재현

판 글(compose 문법):

```text
3 1 sun=left shadow=off soul=off
. P2 .    .GS1
```

- 맵 코드: `I8M9KsTrQST`
- 수열: `M`

지금 엔진 출력:

| | 결과 |
|---|---|
| Studio `mm.ts check I8M9KsTrQST M` (= `playMoves`) | `{"status":"cleared","turnCount":0}` — 영혼이 (0,2) 목표 위 S1 로 감 |
| adventure JS `advcheck.mjs I8M9KsTrQST M --each` | `M playing p2@0,0 s1@0,2` → `cleared=false` |
| GDScript (본 트리 `engine.gd` 사본, headless) | 판 그대로, playing |

## 원인

- Studio `src/engine/turn.ts:607` `cycleSoul` 이 `soulSwapEnabled` 를 보지 않고, `src/utils/solution.ts:55-66` `advanceSolutionState` 도 검사 없이 부른다.
- adventure JS `editor/src/rules/engine.js:673`, GDScript `game/rules/engine.gd:729` 는 `soulSwapEnabled` 가 아니면 상태를 그대로 돌려준다.

## 기대 동작과 근거

`soul=off` 맵에서 M 은 아무 일도 하지 않는다 — Studio 화면·게임 화면·adventure 엔진이 이미 그렇게 한다.
Studio 풀이 재생 경로(`advanceSolutionState` 의 `soul` 분기, 또는 `cycleSoul` 자체)도 `level.soulSwapEnabled` 가 아니면 그대로 돌려주게 맞춘다.

- mapmaker `RULES.md` §3 M: "엔진 함수는 `soulSwapEnabled` 를 검사하지 않는다(UI가 막음, adventure 엔진은 무시) → soul=off 맵의 풀이에 M을 쓰면 안 된다." §16 · §17 도 같은 주의.
- 맵 설정 `soulSwapEnabled`(adventure `CLAUDE.md` §3 v5 표 'M키 영혼 순환': "레벨 작가가 켠다").

## 영향

- 녹화기는 `soul=off` 면 M 을 기록하지 않는다. 그래서 손으로 고친 풀이 문자열이나 외부 도구로 올린 풀이만 문제가 된다.
  팀 맵 스냅샷 풀이 281개 중 `soul=off` 맵에 `M` 이 든 풀이는 없다.
- 고치면 Studio 시나리오 테스트에 위 판(`M` → playing)을 넣는다.

## 고칠 방향 (분류 단계 시제품으로 확인)

- **Studio**: `src/engine/turn.ts:621`(작업 트리 줄) `cycleSoul` 맨 앞에 `if (!level.soulSwapEnabled) return null;` — adventure `applySoulCycle`(JS `engine.js:673`, GDScript `engine.gd:729`)과 같은 자리다. `advanceSolutionState`(`src/utils/solution.ts:58-66`)는 `null` 이면 상태를 그대로 돌려주므로 따로 고칠 것이 없다.
- 화면(Simulator `:177`·SolutionRecorder `:98`)은 이미 막으므로 동작이 바뀌지 않는다. RL 하네스(`snowmen-rl/training/env.ts:232`)도 이미 `soulSwapEnabled` 를 본다.
- **문서**: mapmaker `RULES.md` §3 M·§16·§17 의 '엔진 함수는 검사하지 않는다' 주의는 메인 세션이 지운다.

시제품 결과(Studio): `I8M9KsTrQST` `M` → `playing`, 판 그대로(adventure 와 같음).

시제품: 작업 트리 사본(scratch `/tmp/claude-1000/bugfix/triage/proto/`, 고친 내용 `proto.patch`)에 FIX 후보 6개(B-004~B-009)를 함께 넣어 확인했다. 코드는 작업 트리에 아직 넣지 않았다.
- Studio 엔진 테스트 `node test/engine/run.cjs` 77/77 통과(작업 트리 시나리오 그대로).
- 팀 맵 스냅샷(mapmaker `data/maps-2026-11-02.json`, 읽기만) 등록 풀이 281개 재생: 작업 트리 대비 결과·끝나는 수·매 수 판이 바뀐 풀이 0개(`impact.cjs`).
- 무작위 차분 4만 판(작업 트리 vs 시제품, `rdiff.cjs` 시드 7·11): 갈린 판은 모두 B-006·B-005·B-007·B-008 유형으로 분류되고 설명 안 되는 차이는 0이다.

## 테스트 아이디어

- Studio 시나리오: soul=off 판에서 `cycleSoul` → `null`, `playMoves(…, ['soul'])` → playing·판 그대로. soul=on 대조(같은 판, 플래그만 켬) → cleared.

## 고친 내용 (Studio, 2026-11-02)

`src/engine/turn.ts` `cycleSoul` 맨 앞에 `if (!level.soulSwapEnabled) return null;` 을 넣었다. adventure `applySoulCycle`(JS `engine.js:673`, GDScript `engine.gd:729`)과 같은 자리다.

- `advanceSolutionState` 는 `null` 이면 상태를 그대로 돌려주므로 풀이 재생(`playMoves`)도 M 을 무시한다.
- 화면(Simulator·SolutionRecorder)은 이미 막고 있어 동작이 같다.

문서: `ENGINE_ALGORITHMS.md` §4.3·§17, `test/GAME_IMPLEMENTATION_CASES.md` P1-06.

## 검증

- 시나리오 `test/engine/cases/found-bugs-2026-11.scenario.ts` 의 `B-008 …` 1개(`I8M9KsTrQST`).
  - `cycleSoul` → `null`.
  - `playMoves(start, ['soul'])` → `playing`, 턴 0, 판 그대로.
  - 같은 판을 soul=on 으로 바꾸면 `cleared`.
- 고치기 전에는 실패한다.
- docs-vs-code 실험 e03(`MD`)이 adventure 와 같아졌다. M 을 무시하고 D 로 한 칸 내려가 playing 이다.
- 무작위 차분 6만 판: 이 유형으로 갈린 판 5599개, 모두 soul=off 맵의 M 이다. 무작위 수열에 M 을 5% 섞어서 많다.
- 팀 맵 등록 풀이 281개 재생: 바뀐 풀이 0개.

## 남은 일

- mapmaker `RULES.md` §3 M·§16·§17 의 '엔진 함수는 검사하지 않는다' 주의는 메인 세션이 지운다.
