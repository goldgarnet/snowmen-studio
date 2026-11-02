# B-021 포탈로 순간이동해 도착한 칸에서는 눈꽃을 먹지 않고, 굴러 나간 공이 그 칸의 금을 무장하지 않음

- **심각도**: low
- **분류**: **DECIDE** — 규칙 의도가 갈린다. 팀 결정 전까지 기록만 하고 코드는 그대로 둔다
- **어느 엔진**: studio · JS · GDScript (셋 다 같음)
- **상태**: 결정 필요
- **출처**: mapmaker `RULES.md` §16 버그 의심 3 · 옛 번호 `found/R-03-portal-arrival-skips-flake-and-crack`
- **줄 번호 기준**: 본 트리(현재 배포) — studio `fff5e12`, adventure `a2dd0e9`. 재현 스크립트(세 엔진 대조): `/tmp/claude-1000/bugfix/R-known/run3.sh <specs.txt>`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.
- **함께 정할 것**: 포탈 도착 규칙 4건 — B-019 · B-020 · B-021 · B-022.

## 증상

순간이동 도착 칸(반대 포탈 칸)에서 '들어온 칸' 효과 두 가지가 빠진다.

1. **눈꽃**: 반대 포탈 칸에 눈꽃이 있어도 걸어서·굴러서 도착한 눈 물체가 먹지 않는다. 공이 거기서 멈추면 크기 1 인 채로 눈꽃 위에 계속 서 있다.
2. **금(Q-16 c)**: 반대 포탈 칸이 금 간 칸이고 공이 거기로 나와 계속 굴러가면, 그 금은 무장되지 않는다. 같은 공이 평범한 금 칸을 굴러 지나가면 무장되고 다음 턴에 구멍이 된다.

에디터는 포탈+눈꽃, 포탈+금을 한 칸에 둘 수 있다(`src/components/editor/Editor.tsx:648-651·700-714` 의 `flake`·`crackWarm/crackCool`·`portal` 도구가 서로 지우지 않는다).

## 재현

```text
r03a (반대 포탈에 눈꽃)                         r03b (반대 포탈에 금, 공이 굴러 나감)
5 3 sun=left shadow=off soul=off               6 3 sun=left shadow=off soul=off
. P2 .%   .    .    .                          . P2 . o1 .%   .    .    .
.    .    .    .    .                          .    .    .    .    .    .
.    .    .    .    .%                         .%   .    .    .    .    .
flag 2 4 flake                                 flag 2 0 crack
```

| 판 | 맵 코드 | 수열 | 지금(studio·JS·GD 같음) | 기대(제안) |
|---|---|---|---|---|
| r03a 걸어서 도착 | `D2a0cuM0atnJKfIBz1FpnPw4VEiMbwMdLZk31pDcW0LcnrVnax` | R | P2 가 (2,4) 로 이동, 크기 2 그대로, 눈꽃 남음 | P3, 눈꽃 소비·칸 냉각 |
| r03d 굴러 도착해 멈춤 (`(2,1)` 벽, 반대 포탈 (2,0) 눈꽃) | `mz3YFQb1iymLbo3c1ob1MZ8UtF796qt0g6qTkaCc3y0qxZzO9ppUhmkHf` | R | o1 이 (2,0) 눈꽃 위에 크기 1 로 멈춤 | o2 |
| r03b 굴러 나감 | `mz3YFQb1iymLbo3c1ob1MZ8UtF796qt0g2g61F9pLxBsUHRbNPF5S6ZNJ` | RW | W 뒤에도 (2,0) 금 그대로(무장 안 됨) | R 끝에 무장, W 에 구멍 |
| 대조 r03c 평범한 금 굴러 지나감 (`. P2 . o1 .    .c  …`) | `CROhSPsIGWwhL6YXVrNVNoX9gtqpxZVkZxEzhjwETx6Pm9AQQHEeoFc` | RW | R 끝 "금 무장 (0,3)", W "구멍 생김 (0,3)" | — |

지금 엔진 출력(`mm.ts trace <r03a> R --boards`, 반대 포탈 칸 `(2,4)` 표식은 `*`+`flag … portal`):

```text
#1 → → 턴 1
   플레이어 (0,0)→(2,4)
   이벤트: portal_teleport
 2 .    .    .    .    .*P2
   player@(2,4) size=2
```

r03b:

```text
#1 → → 턴 1
   눈덩이 (0,1)→(2,5)  경로 0,1→2,0→2,1→2,2→2,3→2,4→2,5
 2 .c   .    .    .    .    . o1
#2 W(대기) → 턴 2
 2 .c   .    .    .    .    . o1
```

## 원인

- 걷기·밀기 순간이동 `src/engine/turn.ts:196-211` `applyPortals` 는 물체만 옮기고 도착 칸 눈꽃(`pickFlake`)을 부르지 않는다.
- 굴림 `src/engine/roll.ts:54-73` `resolveArrival`: `:58` 금 표시(`crackRolled`)는 **들어온 칸(입구 포탈)**에만 하고 `:68-71` 에서 반대 포탈로 옮긴 뒤 그 칸의 금·눈꽃은 보지 않는다. 눈꽃 흡수(`absorbRollFlake`, `roll.ts:251`)는 이동으로 들어온 칸에만 돈다.
- 포트: adventure `editor/src/rules/engine.js:593-610`(`applyPortals`)·`:920-940`(`resolveRollArrival`), `game/rules/engine.gd:669-686`·`:1020-1040`.

## 기대 동작과 근거 (결정 필요)

- adventure `CLAUDE.md` §3 타일 `isFlake`: "눈 오브젝트가 **도달/통과**하면 크기 +1(최대까지)". Q-10(새로 생긴 눈사람도 발밑 눈꽃을 먹는다)도 '그 칸에 새로 선 눈 물체는 먹는다' 쪽.
- Q-16 (c)(같은 문서, Studio `ENGINE_ALGORITHMS.md` §11.3): "굴러 지나가기만 한 금 간 칸도 무장". 반대 포탈 칸에 공이 한 틱 있다가 굴러 나갔으므로 '지나간' 칸이다.
- 반대쪽 근거: Studio `ENGINE_ALGORITHMS.md` §10 의 눈꽃 흡수 목록("일반 이동, 연쇄 밀기, 분할, 굴림으로 … 도착하면")에 순간이동이 없다. mapmaker `RULES.md` §13 은 지금 동작("포탈 순간이동 도착 — 안 먹음")을 적어 두었다.

제안: 순간이동 도착도 '그 칸에 들어옴'으로 보고 눈꽃 흡수·굴림 금 표시를 적용한다. 유지하기로 하면 문서에 '순간이동 도착은 도착 효과 없음'을 명시한다.

## 영향

팀 맵 스냅샷(283 맵)에서 포탈을 쓰는 맵 4개, 포탈+눈꽃·포탈+금 같은 칸 0개. 281 풀이 재생 중 '포탈 칸 눈꽃 위에 못 먹은 눈 물체' 0회.

## 결정할 것

순간이동 도착도 '그 칸에 들어옴'으로 보고 눈꽃 흡수·굴림 금 무장을 적용할까, 문서에 '도착 효과 없음'을 적을까? 팀 맵 0개.
