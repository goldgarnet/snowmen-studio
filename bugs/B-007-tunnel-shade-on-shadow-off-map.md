# B-007 그림자 끈 맵의 따뜻한 터널 칸: Studio 는 그늘, adventure 는 볕

- **심각도**: medium
- **분류**: **FIX** — 기대 동작이 분명하고 고쳐도 위험이 작다. Studio 만 고치면 된다
- **어느 엔진**: Studio 가 팀 결정 B-11 과 다름. adventure JS · GDScript 는 B-11 대로(둘은 같음)
- **상태**: 고침 — Studio (브랜치 `fix/engine-bugs-2026-11-02`). adventure 는 이미 B-11 대로라 포트 없음. 골든 `b007-tunnel-shadow-off-melts` 박제함. 공개 맵 알림이 남음
- **출처**: mapmaker `RULES.md` §2·§16, 엔진 간 대조에서 재확인 · 옛 번호 `found/X-02-tunnel-shade-on-shadow-off-map`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.

## 증상

`shadow=off` 맵에서 따뜻한 터널 칸(좌우 통로 `=`·상하 통로 `"`)에 눈 물체가 턴을 끝내면

- Studio: 터널 칸이 그늘이라 안 녹는다.
- adventure JS·GDScript: 그늘이 전혀 없어서 녹는다.

## 재현

판 글(compose 문법):

```text
4 2 sun=left shadow=off soul=off
. P2 .    ~=o1 .G
.    .    .    .
```

- 맵 코드: `BrDkZ1EQvAxVLiG1VwZH7IUQ`
- 수열: `WW` (대기 두 번)

지금 엔진 출력:

| 수 | Studio (`mm.ts trace <코드> WW --boards`) | adventure JS (`advcheck.mjs --each`) · GDScript |
|---|---|---|
| 시작 | (0,2) `-=o1` — 따뜻한데 그늘 | (0,2) 따뜻함, 그늘 없음 |
| W | o1 그대로 | **o1 녹아 사라짐**, (0,2) 냉각 |
| W | o1 그대로 | — |

```text
Studio W 두 번 뒤                     adventure W 한 번 뒤
 0 . P2 .    -=o1 .G                  (0,0) P2 만 남음
```

## 원인

- Studio 디코더가 터널 칸에 그늘을 박는다: `src/utils/levelCode.ts:342` `isShade: isRowArch || isColumnArch`.
  에디터 터널 브러시도 `isShade = true` 로 칠한다(`src/components/editor/Editor.tsx:658-669`).
- Studio 는 그림자 켠 맵에서만 그늘을 다시 계산한다: 시작 `src/utils/game.ts:13`, 턴 끝 `src/engine/turn.ts:429`.
  그래서 끈 맵에서는 처음 박힌 터널 그늘이 끝까지 남는다.
- adventure 는 끈 맵의 그늘을 전부 지운다: JS `editor/src/rules/engine.js:339-342`, GDScript `game/rules/engine.gd:252-257`
  (주석: "꺼진 맵에는 그늘이 전혀 없다 — 터널도").

## 기대 동작과 근거

팀 결정 B-11(2026-09-29): **그림자를 끈 맵에는 그늘이 없다.** adventure `CLAUDE.md` §3:
"셀 터널과 닫힌 노랑/주황 파티션은 그림자 기능이 켜진 맵에서 … 고정 shelter다. 그림자 기능이 꺼진 맵(hasShadow=false)에는 그늘이 전혀 없다".
Studio `turn.ts` `endOfTurn` 주석도 같은 말을 한다("With shadows off there is no shade at all"). 터널만 디코드·브러시 단계의 그늘이 남아 이 결정과 어긋난다.

→ Studio 가 끈 맵에서 시작할 때(`newGameState`) 그늘을 모두 지우면 된다(또는 디코더가 `hasShadow` 일 때만 터널 그늘을 박는다). adventure 는 그대로.
단, 정본(Studio) 동작이 바뀌는 것이라 아래 맵 작가에게 알려야 한다.

## 영향

- 팀 맵 스냅샷(`mapmaker/data/maps-2026-11-02.json`)에서 그림자 끈 맵의 따뜻한 터널: **2개 맵**.
  'Split & Push' [accepted · 공개] (1,2)·(1,8), 'Split & Push (Tight)' [held · 공개] 같은 자리. 둘 다 `~` 칠한 상하 통로 터널이다.
  등록 풀이('Split & Push', 정은후 120수)는 두 엔진에서 모두 클리어된다(`mm.ts check` · `advcheck.mjs` 모두 cleared). 하지만 그 터널에 물체를 두고 턴을 끝내는 다른 길은 게임에서 다르게 끝난다.
  팀 맵 283개를 무작위로 50수씩 40번 둔 대조(41만 수)에서 갈린 맵 3개 중 2개가 이 두 맵이다(나머지 1개는 B-026).
- mapmaker 완성 설계(`designs/*/map.txt`)에는 해당 맵이 없다(RULES §16 이 이미 금지).
- Studio 를 고치면 골든 B-11 계열에 '끈 맵 따뜻한 터널 칸 = 녹음' 1케이스를 넣는다.
  `editor/test/diff-vs-studio.mjs` 는 판을 만들 때 터널 칸 `isShade` 를 false 로 시작해(디코드와 다름) 이 차이를 못 본다.

## 고칠 방향 (분류 단계 시제품으로 확인)

- **Studio** 두 곳(엔진이 들어오는 길과 상관없이 같게):
  - `src/engine/turn.ts:443`(작업 트리 줄, `endOfTurn` 1단계) — `if (level.hasShadow) recalcShadows(level);` 에 `else` 로 모든 칸 `isShade = false`.
  - `src/utils/game.ts:13` `newGameState` — 같은 `else`(시작 화면·0턴 표시가 그늘로 보이지 않게).
- adventure 는 그대로(B-11 대로). 디코더(`levelCode.ts:342`)·에디터 터널 브러시(`Editor.tsx:658-669`)의 `isShade` 는 켠 맵에서 다시 계산되므로 손대지 않아도 된다.
- **문서**: adventure `CLAUDE.md:87` 의 "Studio와 동일"이 이 수정으로 맞아진다. mapmaker `RULES.md` §2·§16 '알려진 차이' 줄은 메인 세션이 지운다(mapmaker 는 로컬 전용).

시제품 결과(Studio): 위 판 `W` → (0,2) o1 이 녹아 사라진다(adventure 와 같음). 디코드한 판을 `newGameState` 없이 바로 `executeSkipTurn` 해도 같다.

시제품: 작업 트리 사본(scratch `/tmp/claude-1000/bugfix/triage/proto/`, 고친 내용 `proto.patch`)에 FIX 후보 6개(B-004~B-009)를 함께 넣어 확인했다. 코드는 작업 트리에 아직 넣지 않았다.
- Studio 엔진 테스트 `node test/engine/run.cjs` 77/77 통과(작업 트리 시나리오 그대로).
- 팀 맵 스냅샷(mapmaker `data/maps-2026-11-02.json`, 읽기만) 등록 풀이 281개 재생: 작업 트리 대비 결과·끝나는 수·매 수 판이 바뀐 풀이 0개(`impact.cjs`).
- 무작위 차분 4만 판(작업 트리 vs 시제품, `rdiff.cjs` 시드 7·11): 갈린 판은 모두 B-006·B-005·B-007·B-008 유형으로 분류되고 설명 안 되는 차이는 0이다.
- 공개 맵 2개('Split & Push' accepted · '(Tight)' held)의 등록 풀이도 그대로 클리어한다. 다만 그 터널에 눈 물체를 두고 턴을 끝내는 다른 길은 결과가 바뀌므로 **맵 작성자와 등록 풀이 작성자(정은후)에게 알린다**(스냅샷에는 맵 작성자 이름이 없다).

## 테스트 아이디어

- Studio 시나리오: 맵 코드 `BrDkZ1EQvAxVLiG1VwZH7IUQ` → `W` 뒤 (0,2) 빈칸. 같은 판을 `hasShadow=true` 로 바꾼 대조는 그늘이라 o1 이 남는다.
- 골든(B-11 계열)에 '끈 맵 따뜻한 터널 칸 = 녹음' 1케이스(지금 JS·GDScript 는 이미 통과해야 한다).

## 고친 내용 (Studio, 2026-11-02)

- `src/engine/shadow.ts` 에 `clearShadows(level)` 을 더했다. 모든 칸을 `isShade = false` 로 만든다.
- `src/engine/turn.ts` `endOfTurn` 1단계: `if (level.hasShadow) recalcShadows(level); else clearShadows(level);`. 엔진에 들어오는 길과 상관없이 턴 끝 녹기 전에 끈 맵의 그늘이 없다.
- `src/utils/game.ts` `newGameState`: 같은 `else`. 시작 화면·0턴 표시에도 터널 그늘이 없다.
- 디코더(`levelCode.ts:342`)·에디터 터널 브러시(`Editor.tsx`)의 `isShade` 는 그대로 두었다. 켠 맵은 다시 계산하고, 끈 맵은 위 두 곳이 지운다.
- adventure 는 바꾸지 않았다(이미 B-11 대로). adventure `CLAUDE.md:86-87` "Studio와 동일" 은 이제 맞다.

문서: `ENGINE_ALGORITHMS.md` §1·§13·§13.1·§17, `test/GAME_IMPLEMENTATION_CASES.md` P1-04.

## 검증

- 시나리오 `test/engine/cases/found-bugs-2026-11.scenario.ts` 의 `B-007 …` 3개.
  - `BrDkZ1EQvAxVLiG1VwZH7IUQ` 를 디코드한 판 그대로(`newGameState` 없이) `W` → (0,2) 빈칸, 칸 냉각.
  - 같은 판을 `hasShadow=true` 로 바꾸면 o1 이 남는다(터널 그늘).
  - `newGameState` 시작 판: 끈 맵은 (0,2) 그늘 없음, 켠 맵은 그늘.
- 고치기 전에는 첫째·셋째가 실패한다.
- mapmaker docs-vs-code 실험 e10a(끈 맵 `WW`)가 adventure 와 같아졌다. 따뜻한 터널 칸의 o1 둘도 첫 대기에 녹는다. e10b(켠 맵)는 그대로다.
- 무작위 차분 6만 판: 이 유형으로 갈린 판 459개, 모두 '끈 맵 볕 터널 위 눈 물체'.
- 팀 맵 등록 풀이 281개 재생: 바뀐 풀이 0개. 'Split & Push'(accepted)의 정은후 풀이 120수는 고친 엔진에서도 120수째 클리어한다. '(Tight)'(held)는 스냅샷에 등록 풀이가 없다.

## 남은 일

- (끝남) 골든 `bugs-2026-11.json` `b007-tunnel-shadow-off-melts` — 끈 맵 따뜻한 터널 칸 = 녹음. JS·GD 는 고치기 전부터 통과하고, 기대값은 고친 Studio 엔진으로 만들었다.
- **알림**: 공개 맵 'Split & Push'(accepted)·'Split & Push (Tight)'(held)의 작성자와 등록 풀이 작성자(정은후)에게 알린다. (1,2)·(1,8) 터널에 눈 물체를 두고 턴을 끝내는 다른 길은 이제 녹는다(게임과 같다). 스냅샷에는 맵 작성자 이름이 없다.
- mapmaker `RULES.md` §2·§16 '알려진 차이' 줄은 메인 세션이 지운다.
