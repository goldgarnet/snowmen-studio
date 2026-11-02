# B-026 삼각 블록(레거시): Studio 는 굴러온 공을 꺾고, adventure 는 평범한 상자

- **심각도**: low
- **분류**: **NOTBUG** — 의도된 동작(문서화된 의도적 차이). 기록만
- **어느 엔진**: Studio 만 반사. adventure JS · GDScript 는 디코드 때 삼각 블록 섹션을 건너뛰어 평범한 상자로 읽음(둘은 같음)
- **상태**: 버그 아님 — 기록만
- **출처**: mapmaker `RULES.md` §16, adventure `CLAUDE.md` §3 '~~삼각 블록~~' · 옛 번호 `found/X-05-legacy-triangle-block`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.
- **분류 근거**: adventure `CLAUDE.md` §3 "삼각 블록 (2026-10-06 제거) — … Studio 에는 남은 **의도적 차이**". 에디터에 도구가 없고 RULES §16 이 "쓰지 말 것"으로 막는다. 해당 팀 맵은 rejected 1개뿐이고 등록 풀이 2개는 두 엔진에서 같다.

## 증상

맵 코드에 삼각 블록 섹션(`TRIBLOCK_MAGIC`)이 있으면

- Studio: 혼자 굴러온 공이 그 상자에 닿으면 꺾여서 옆으로 빠져나간다(같은 틱).
- adventure JS·GDScript: 그냥 상자라 공이 그 앞에서 멈춘다.

## 재현

판 글(compose 문법, 꼬리 줄 `triblock`):

```text
5 3 sun=left shadow=off soul=off
. P2 . o1 .    . [] .
.    .    .    .    .
.G   .    .    .    .
triblock 0 3 tr
```

- 맵 코드: `PBqBxYDRnFZkQdmbkaRmAmjYbWlkSwcMi6v2FiOHVjc0mMGIF`
- 수열: `R`

지금 엔진 출력:

| | 공 (0,1) 의 끝 |
|---|---|
| Studio (`mm.ts trace <코드> R --boards`) | 경로 0,1→0,2→1,3→2,3 — (0,3) 삼각 블록에서 아래로 꺾여 **(2,3)** |
| adventure JS (`advcheck.mjs --each`) · GDScript | **(0,2)** — 상자 앞에서 멈춤 |

## 원인

- Studio `src/engine/roll.ts:188-196`(`obstacle.triangleCorner` → `deflectThroughTriangleBlock`), 디코드 `src/utils/levelCode.ts:396-409`.
- adventure JS `editor/src/utils/levelCode.js:327` · GDScript `game/rules/level_io.gd:292-295` 는 섹션을 읽고 버린다. 엔진에는 해당 분기가 없다.

## 기대 동작과 근거

adventure `CLAUDE.md` §3: "삼각 블록 (2026-10-06 제거) — adventure 에서 뺐다. 삼각 벽과 기능이 겹친다. Studio 에는 남은 **의도적 차이**".
에디터에는 도구가 없다(RULES §16 "쓰지 말 것").

정본(Studio)과 게임이 다르게 노는 상태를 계속 둘지 정해야 한다.
- (a) 그대로 둔다 — 지금처럼 문서·업로드 검사로 막는다.
- (b) Studio 도 평범한 상자로 읽는다(디코드에서 `triangleCorner` 를 안 붙이거나 `roll.ts` 분기를 뺀다). 그러면 정본과 게임이 같아진다.

## 영향

- 팀 맵 스냅샷(`data/maps-2026-11-02.json`, 맵 283개) 중 삼각 블록이 있는 맵은 1개: '이제 쭈꾸미 아니다' [rejected · 공개] — 블록 8개.
  등록 풀이 2개(홍은기 212수, 나인석 48수)는 두 엔진에서 모두 클리어되고, 풀이 내내 두 엔진의 판이 매 수 같다. 굴러간 공이 삼각 블록에 닿는 수가 없다.
  같은 맵에서 무작위로 50수씩 40번 두면 1번 갈렸다(44번째 수 `D` — Studio 는 공이 꺾여 (4,0), adventure 는 (6,4) 에서 멈춤). Studio 판에서 삼각 블록 표시만 지우고 다시 돌리면 끝까지 같다 — 원인이 이 차이 하나뿐이라는 확인이다.
- `editor/test/diff-vs-studio.mjs` 의 무작위 판에는 삼각 블록이 없다.

## 남은 선택(급하지 않음)

정본과 게임을 완전히 같게 하고 싶으면 Studio 도 삼각 블록을 평범한 상자로 읽게 할 수 있다(디코드에서 `triangleCorner` 를 안 붙이거나 `roll.ts:188-196` 분기 제거). 그 전까지는 기록만 한다.
