# B-012 `diff-vs-studio.mjs` 기본 모드의 거짓 갈림(나이 카운터)과 못 보는 영역

- **심각도**: low (게임 동작 버그 아님 — 대조 도구 문제. 고친 뒤 검증할 때 헷갈리게 한다)
- **분류**: **PORT(도구)** — 게임 동작 버그는 아니다. adventure 대조 도구를 고친다(포트 검증 때 필요)
- **어느 엔진**: 도구 `snowmen_adventure/editor/test/diff-vs-studio.mjs` + adventure JS `initState` 의 나이 카운터
- **상태**: 고침 — 도구(`diff-vs-studio.mjs`)와 adventure JS · GDScript `initState` 나이 시계 (브랜치 `fix/engine-bugs-2026-11-02`)
- **출처**: 엔진 간 대조(접두 X) — 13개 모드 × 시드 3개 × 3만 케이스 실행 · 옛 번호 `found/X-07-diff-vs-studio-age-false-positives`
- **재확인 (2026-11-02 분류 단계)**: 아래 '재확인 실행'처럼 한 모드·한 시드(`V5=1`, 3333)만 본 트리로 다시 돌려 같은 현상을 확인했다. 나머지 모드의 건수는 원래 보고를 옮긴 것이다.
- **재확인 실행**: 작업 디렉터리 밖 번들(`/tmp/claude-1000/bugfix/triage/studio-engine.mjs`, 본 트리 Studio)로 `V5=1` 시드 3333 3만 케이스를 돌렸다. 기본 모드는 2건 갈림(#24208·#29583, 요약 `(0.0%)`, 종료 코드 1), `PRODUCTION_AGE=1` 은 "두 엔진이 완전히 같습니다"(종료 코드 0).

## 증상

본 트리 엔진(studio `fff5e12`, adventure `a2dd0e9`)으로 모드마다 3만 케이스씩 시드 3개(11·222·3333)를 돌렸다.
기본·`V5=1`·`SHADOW=mix`·`TERRAIN=1`·`NOMELT=1` 과 그 조합 13개 모드, 합계 117만 케이스.

- 갈림 **22건**. 화면에는 `(0.0%)` 로 반올림돼 찍히지만 종료 코드는 1 이다.
  모드별: v5 2 · v5sh 4 · v5shterr 2 · v5terr 3 · v5nomelt 3 · shmix 2 · shterr 2 · all(V5+SHADOW+TERRAIN+NOMELT) 4.
  그 밖의 모드(base·terr·nomelt·terrnomelt·`PRODUCTION_AGE=1`)는 0.
- **22건 모두 영혼 이동 대상이 나이 동률에서 갈린 것**이다. 저작 눈사람의 `createdAt` 을 0 으로 바꿔 다시 돌리면 22건 모두 끝까지 같다.
  `V5=1 SHADOW=mix TERRAIN=1 PRODUCTION_AGE=1` 9만 케이스는 0건.

예: `V5=1` 시드 3333 case #24208, 수열 `left,left,right,right,skip,skip`.
저작 S2(`createdAt`=1)와 게임 중 생긴 S1 이 플레이어에게서 같은 거리(1)다.
- Studio 는 S1 의 `createdAt` 이 전역 턴 시계 값(수천 이상)이라 저작 S2 를 고른다.
- adventure 는 S1 의 age 가 1(카운터가 1부터 시작) = 저작 S2 의 age 1 이라 읽기 순서로 S1 을 고른다.

## 원인

- 도구: `editor/test/diff-vs-studio.mjs:137` 이 기본으로 저작 눈사람에 `createdAt: ++age`(1, 2, …)를 준다(주석대로 일부러 넣은 '무작위 나이 스트레스 모드').
- adventure JS `editor/src/rules/engine.js:277`·`:318` `initState` 는 저작 나이와 상관없이 `ageCounter = 1` 로 시작한다. GDScript `game/rules/engine.gd:393`·`:446` 도 같다.
  그래서 저작 나이가 0 보다 크면 새 눈사람이 저작 눈사람과 동갑이거나 더 '오래된' 것으로 잡힐 수 있다.
- 실제 입력에서는 안 생긴다: 맵 코드·Studio 에디터는 저작 눈사람을 모두 `createdAt: 0` 으로 만든다(`src/utils/levelCode.ts:263-265`, `src/components/editor/Editor.tsx:732`). `levels/*.json` 에도 나이 필드가 없다.

## 기대 동작과 근거

- 도구: 기본을 `PRODUCTION_AGE=1`(실제와 같은 조건)로 바꾸거나, 무작위 나이 모드에서는 adventure 쪽 카운터를 저작 최대 나이 + 1 부터 시작하게 맞춘다. 갈린 수가 0 이 아니면 `0.0%` 대신 건수를 보이게 한다.
- 엔진(선택): `initState`·`init_state` 가 `ageCounter = max(저작 age) + 1` 로 시작하면 저작 나이가 들어와도 '게임 중 생긴 눈사람은 저작 눈사람보다 젊다'(mapmaker `RULES.md` §6)가 지켜진다.

## 함께 적는 것 — 이 도구가 못 보는 곳(이번 대조에서 별도 하네스로 확인)

`diff-vs-studio.mjs` 의 무작위 판에는 아래가 없다. 그래서 B-015·B-007·B-011 같은 차이를 원리상 못 잡는다.
- 볕+눈꽃 칸(볕과 눈꽃을 배타적으로 뽑음) → B-015
- 디코드처럼 터널 칸에 처음부터 그늘을 박은 판 → B-007
- void 칸, 영혼 발판, 초록 버튼, M, 0.5 단위 나무, 1칸 폭 판
- 0턴 판정(`applyTurnZero`), 눈사람·눈덩이의 '녹는 중' 표시와 발판 무장 위치 비교, 9수 이상의 긴 수열

이 항목들을 섞은 확장 대조를 별도로 돌린 결과다(스크래치 `/tmp/claude-1000/bugfix/cross/xdiff2.mjs`·`gen.mjs`, 커밋 안 함).
알려진 차이(B-015·B-007·B-008)를 뺀 조건에서 Studio↔JS 약 29만 케이스, JS↔GDScript 2.4만 케이스·팀 맵 풀이 281개 모두 0건이었다.
실제 맵으로도 대조했다.
- 팀 맵 283개 무작위 걷기(맵마다 50수 × 40번, 41만 수, Studio↔JS): 갈린 맵 3개(B-007 둘, B-026 하나)뿐이다.
- 캠페인 `levels/L1~L8` 무작위 걷기 10만 수: 0건.
- mapmaker 설계 풀이 40개(Studio·JS·GD): 0건.
- 맵 코드 디코드 3자 대조(Studio·JS `levelCode.js`·GD `level_io.gd`) 3천 개: 0건.

## 고칠 방향 (포트 단계에서 함께)

- `editor/test/diff-vs-studio.mjs:137` — 기본을 실제와 같은 나이(저작 `createdAt: 0`)로 하고 무작위 나이는 옵션으로 돌리거나, 무작위 나이 모드에서는 adventure `ageCounter` 를 저작 최대 나이 + 1 부터 시작하게 맞춘다.
- 요약 줄이 갈린 건수가 0 이 아닐 때 `(0.0%)` 대신 건수를 보이게 한다.
- 선택(엔진): JS `editor/src/rules/engine.js:277`·`:318`, GDScript `game/rules/engine.gd:393`·`:446` `initState` 의 `ageCounter` 시작값을 `max(저작 age) + 1` 로. B-011 포트와 같은 곳이라 함께 손보면 된다.
- 포트 검증 때 이 도구를 쓰므로(골든 + diff-vs-studio 0%), B-001~003 포트보다 먼저 고치거나 `PRODUCTION_AGE=1` 로 돌린다.

## 테스트 아이디어

- `V5=1` 시드 3333 3만 케이스: 고친 뒤 기본 모드에서도 0건.

## 고친 내용 (adventure, 2026-11-02)

- `editor/test/diff-vs-studio.mjs`: 기본 모드의 저작 눈사람 나이를 실제 맵처럼 0 으로 했다. 예전 무작위 나이는 `RANDOM_AGE=1` 옵션이고, 예전 이름 `PRODUCTION_AGE=1` 은 기본과 같다. 시작 전에 Studio 나이 시계를 저작 나이보다 넉넉히 먼저 돌려 둔다. 갈림이 0 이 아니면 '0.0%' 대신 건수를 보인다. `FOCUS=1`(2026-11-02 버그 상황을 판마다 하나 깖)도 더했다.
- 엔진: JS `editor/src/rules/engine.js` `initState`, GDScript `game/rules/engine.gd` `init_state` 의 나이 시계가 저작 최대 나이에서 시작한다. 그래서 새 몸이 늘 저작 몸보다 젊다. 맵 코드의 저작 나이는 모두 0 이라 실제 맵의 결과는 같다.
- 검증: 작업 트리 Studio 로 새로 만든 번들(`STUDIO_BUNDLE`)로 기본 모드를 다시 돌렸다. 결과는 `bugs/README.md` '마지막 검증'에 있다.
