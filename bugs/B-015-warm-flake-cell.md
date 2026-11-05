# B-015 볕 칸 눈꽃(따뜻한 칸 + 눈꽃)이 adventure 에서는 찬 칸이 된다

- **심각도**: medium
- **분류**: **DECIDE → 팀 결정**
- **어느 엔진**: adventure JS · GDScript 가 Studio 와 다름 (JS·GD 끼리는 같음)
- **상태**: **고침 — 눈꽃 칸은 늘 찬 칸 (팀 결정 2026-11-05)**
- **출처**: 엔진 간 대조(접두 X) — 확장 무작위 대조 `xdiff`(볕+눈꽃 칸 섞음)에서 0턴부터 갈림 · 옛 번호 `found/X-01-warm-flake-cold-in-adventure`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.
- **분류 근거**: 엔진 간 대조에서는 PORT(adventure 를 Studio 에 맞춤)로 올라왔지만, Studio 안에서도 엔진과 에디터의 전제가 다르다. 에디터 브러시는 볕·눈꽃을 서로 지우고(`Editor.tsx:641-651`), 부서져 생긴 눈꽃 칸은 늘 식는다(`force.ts:24-25`). 그래서 볕 눈꽃 칸은 맵 코드(mapmaker compose `~*`)로만 생긴다. 게임 바닥 그림도 눈꽃 칸을 찬 칸으로 그린다(adventure `CLAUDE.md:486` 바닥 키). 어느 쪽을 정본으로 할지 정해야 한다.

## 팀 결정 (2026-11-05)

"눈꽃 위에서 눈덩이가 녹아요"는 버그다. 눈꽃 칸은 늘 찬 칸이다.

Studio 디코더(`src/utils/levelCode.ts`)가 볕 비트와 눈꽃 비트가 함께 켜진 칸을 찬 칸으로 읽는다. adventure 는 원래 `makeTile`·`_make_tile` 이 찬 칸으로 만들어서 고칠 것이 없다. 시험은 Studio `team-decisions-2026-11.scenario.ts`, 게임 골든 `team-b015-warm-flake-cold`.

## 증상

맵 코드는 칸마다 `isWarm`·`isFlake` 비트를 따로 저장한다(Studio `src/utils/levelCode.ts:72-73`, `:316-317`).
그래서 '따뜻한 칸 위의 눈꽃'이 맵 코드로 존재할 수 있고(mapmaker compose 의 `~*`), Studio 엔진은 그 칸을 따뜻한 칸으로 다룬다:

- 최대 크기(P3·s2·S3)로 들어선 물체는 눈꽃을 못 먹으므로 칸이 따뜻한 채 남아 **녹는다**.
- 시작부터 그 칸 위에 있던 물체(들어온 게 아니라 안 먹음)도 **녹는다**.

adventure JS·GDScript 는 레벨을 읽을 때 눈꽃 칸을 무조건 차가운 칸으로 바꾼다. 그래서 같은 맵에서 아무것도 안 녹는다.

## 재현

판 글(mapmaker `tools/grid.ts` compose 문법):

```text
5 2 sun=left shadow=off soul=off
. P2 .*   ~*   .    .G
.    .    ~*o2 .    .
```

- 맵 코드: `B9aarraKDucRSxE5A0SuOMwGdjClK`
- 수열: `RRWW` — (0,1) 찬 눈꽃을 먹어 P3, (0,2) 볕 눈꽃 위로(최대라 못 먹음), 두 번 대기. (1,2) 의 o2 는 처음부터 볕 눈꽃 위.

지금 엔진 출력:

| 수 | Studio (`mm.ts trace <코드> RRWW --boards`) | adventure JS (`tools/advcheck.mjs <코드> RRWW --each`) · GDScript |
|---|---|---|
| R | P3 (0,1), o2→o1 (볕 눈꽃 위에서 녹음) | P3 (0,1), o2 그대로 |
| R | P3 (0,2) **녹기 시작**, o1 소멸·(1,2) 냉각 | P3 (0,2), o2 그대로 |
| W | P3→P2 | P3 그대로 |
| W | P2→P1 | P3 그대로 |

Studio 마지막 판:

```text
 0 .    .    ~*p1 .    .G
 1 .    .    .*   .    .
```

adventure(JS·GD 같음) 마지막 판: `(0,2) P3 · (1,2) o2`, 두 칸 모두 찬 칸.
GDScript 는 본 트리 `game/rules/engine.gd` 사본을 headless 로 돌려 확인했다(스크래치 `/tmp/claude-1000/bugfix/cross/gdrun.mjs`).

## 원인

- adventure JS `editor/src/rules/engine.js:247` — `makeTile`: `isWarm: flake ? false : t.isWarm !== false`
- GDScript `game/rules/engine.gd:363` — `_make_tile`: `"isWarm": false if flake else ...`
- Studio 는 칸 플래그를 그대로 쓴다(`src/engine/turn.ts:483` `isHeated = tile.isWarm && !tile.isShade`). 눈꽃을 먹을 때만 식는다(`src/engine/push.ts:625-644` `pickFlake` — 최대 크기면 안 먹고 안 식는다).

## 기대 동작과 근거 (결정 필요)

엔진 간 대조를 한 에이전트의 의견(선택지 (a)): Studio 엔진대로 볕 눈꽃 칸은 따뜻한 칸이다. 최대 크기로 들어서거나 처음부터 위에 있던 몸은 그 칸에서 녹는다. 먹으면 그때 식는다.

- 규칙 정본은 Studio 엔진(adventure `CLAUDE.md` §1·§9 "차이가 발견되면 Studio 동작을 정답으로 삼는다").
- mapmaker `RULES.md` §8: "최대 크기 물체는 볕 칸 눈꽃을 못 먹으므로 그 칸은 따뜻한 채 남는다", §13 "안 먹는 경우: … 레벨 시작 때 이미 그 위에 있던 물체". Studio 실험으로 확인한 규칙이다(`rules/verify-turn-melt-laser.md` `m12f_p3_flake_no_cool` `~*p3`, `rules/verify-buttons-soul.md` f10 `~*p1`).
- 참고: Studio 에디터 브러시는 볕과 눈꽃을 서로 지운다(`src/components/editor/Editor.tsx:642-650`). 그래서 에디터로 만든 맵에는 없다. 맵 코드와 mapmaker compose(`~*`)로는 만들 수 있다.
  고치는 방법은 둘이다. (a) adventure 가 `isWarm` 을 그대로 읽는다(정본 원칙). (b) 볕+눈꽃을 저작 금지 조합으로 정해 compose·디코더가 막는다. 정본 원칙대로라면 (a) 다.

## 영향

- 팀 맵 스냅샷(mapmaker `data/maps-2026-11-02.json`, 맵 283개)에는 볕 눈꽃 칸이 0개다.
- mapmaker 설계 작업본에는 많다(`designs/21-twin-parasol/wip/*`, `48h-parasol-3/work/c2.txt`, `53-tunnel-shelters/work/v30.txt`, `53h-rooftop-3/work/v5*.txt`, `17-shade-relay/r2/k4.txt` 등). 지금 `designs/*/map.txt` 완성본에는 없다.
  볕 눈꽃을 쓰는 설계가 올라오면 게임에서 녹기 결과가 달라진다.
- 고칠 때: JS `makeTile`·GD `_make_tile` 을 함께 바꾸고, 골든에 '최대 크기 물체가 볕 눈꽃에서 녹음'·'시작부터 볕 눈꽃 위 눈덩이가 녹음' 2케이스를 넣는다.
  `editor/test/diff-vs-studio.mjs` 의 무작위 판은 볕과 눈꽃을 서로 배타적으로 뽑아서(`p < 0.28` / `0.28 ≤ p < 0.38`) 이 조합을 못 본다.

## 결정할 것

볕 칸 위의 눈꽃(맵 코드로만 생김)은 따뜻한 칸인가?
- (a) **따뜻한 칸(지금 Studio 엔진)** → adventure JS `makeTile`(`engine.js:247`)·GDScript `_make_tile`(`engine.gd:363`)이 `isWarm` 을 그대로 읽게 포트한다. 게임에 '볕 위 눈꽃' 바닥 그림이 따로 필요하다. mapmaker 작업본(`designs/*/wip`·`work`)의 볕 눈꽃 설계가 그대로 산다.
- (b) **찬 칸(Studio 에디터·게임과 같음)** → Studio 디코더(`src/utils/levelCode.ts` 타일 읽기)가 `isFlake` 면 `isWarm=false` 로 정규화하고, mapmaker compose 는 `~*` 를 경고한다. adventure 는 그대로다. mapmaker 작업본의 볕 눈꽃 설계는 다시 봐야 한다(완성본 `designs/*/map.txt` 에는 없음).
- 팀 맵 283개에는 볕 눈꽃 칸이 0개라 어느 쪽이든 공개 맵은 안 바뀐다.
