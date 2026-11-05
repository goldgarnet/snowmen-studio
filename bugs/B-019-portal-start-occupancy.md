# B-019 포탈 '턴 시작 점유'가 칸 기준이라, 포탈 위 물체를 밀어내고 올라선 플레이어는 순간이동하지 않음 (굴림은 이 조건이 없음)

- **심각도**: low
- **분류**: **DECIDE → 기능 삭제** — 규칙 의도가 갈려 팀 결정에 올렸으나, 그 기능을 게임에서 빼서 닫았다(2026-11-03)
- **어느 엔진**: studio · JS · GDScript (셋 다 같음)
- **상태**: 닫음 — 포탈 삭제(2026-11-03 팀 결정)
- **닫은 까닭**: 팀이 포탈을 게임에서 뺐다(에디터·엔진·게임 화면). 이 경우는 더는 생기지 않는다. 예전 맵 코드의 포탈 비트는 디코더가 버려 그 칸은 평범한 바닥이다(`ENGINE_ALGORITHMS.md` §18). 아래 내용은 기록으로 남긴다.
- **출처**: mapmaker `RULES.md` §16 버그 의심 2 · 옛 번호 `found/R-02-portal-start-occupancy-per-cell`
- **줄 번호 기준**: 본 트리(현재 배포) — studio `fff5e12`, adventure `a2dd0e9`. 재현 스크립트(세 엔진 대조): `/tmp/claude-1000/bugfix/R-known/run3.sh <specs.txt>`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.
- **함께 정할 것**: 포탈 도착 규칙 4건 — B-019(시작 점유) · B-020(붙은 포탈) · B-021(도착 칸 눈꽃·금) · B-022(발판보다 늦은 포탈). 모두 팀 맵 영향 0.

## 증상

1. 포탈 A 위에 상자(또는 눈덩이)가 있고 플레이어가 그것을 밀면, 상자는 밀려나고 플레이어가 A 에 올라선다. 반대 포탈 B 가 비어 있어도 **플레이어는 순간이동하지 않는다.** 같은 플레이어가 빈 포탈로 걸어 들어가면 순간이동한다.
2. 굴림에는 이 조건이 없다. 턴 시작에 공이 서 있던 포탈 A 를, 같은 턴에 뒤따라 굴러 들어온 공은 그대로 순간이동한다.

## 재현

```text
r02a (상자를 포탈 밖으로 밀고 올라섬)          r02c (P3 가 s1+s1 열차를 굴림, 앞 공이 포탈 A 위)
5 3 sun=left shadow=off soul=off               6 3 sun=left shadow=off soul=off
. P2 .%[] .    .    .                          . P2 .    .    .    .    .
.    .    .    .    .                          .*   . o1 .%o1 .    .    .
.    .    .    .    .%                         .%   .    .    .    .    .
```

| 판 | 맵 코드 | 수열 | 지금(studio·JS·GD 같음) |
|---|---|---|---|
| r02a | `D2a0cuM0tHCwnPNVeDmEUN5AnFAzhcmtUnTeWHWKxd1S8rYzzr` | R | 플레이어 (0,1) 포탈 위에 그대로, 상자 (0,2) |
| 대조 r02b 빈 포탈로 걸어감 (`. P2 .%   . [] …`) | `D2a0cuM0atpSzp7WcNXz1sHJGGMQLLgfTEAwJyVJFjQcHeooFr` | R | 플레이어 (2,4) 로 순간이동 |
| r02d 공을 포탈 밖으로 굴리고 올라섬 (`. P2 .%o1 …`) | `mz3YFQb1iymLbo3c1ob1MZ8UtF796qt0g2g61F9pLxBsUHRbNPF5Sxlqp` | R | 플레이어 (0,1) 포탈 위에 그대로 |
| r02c | `mz3YFQb0XXEkv4bm6TViZelxAEbVfefAATAD0zx5pkT7qWr8eNGT6vVBn` | DR | 뒤 공이 포탈 A(1,2) 에 들어가 (2,0) 으로 순간이동해 (2,5) 까지 구름 |

지금 엔진 출력(`mm.ts trace <r02a> R --boards`):

```text
#1 → → 턴 1
   플레이어 (0,0)→(0,1)
   상자 (0,1)→(0,2)
 0 .    .%P2 . [] .    .
 2 .    .    .    .    .%
```

r02c:

```text
#2 → → 턴 2
   눈덩이 (1,1)→(2,5)  경로 1,1→2,0→2,1→2,2→2,3→2,4→2,5
   눈덩이 (1,2)→(1,5)  경로 1,2→1,3→1,4→1,5
 1 .    . P3 .%   .    .    . o1
 2 .%   .    .    .    .    . o1
```

## 원인

- `src/engine/turn.ts:309-310` 이 턴 시작 때 포탈 **칸마다** 점유 불리언을 찍고, `applyPortals`(`turn.ts:196-211`)의 `:204` `if (startOccupied[si]) continue;` 가 그 칸에 지금 서 있는 물체가 누구든 건너뛴다(물체 신원이 아니라 칸 기준).
- 굴림은 `src/engine/roll.ts:54-73` `resolveArrival` 이 도착 틱에 칸 이력 없이 옮긴다.
- 포트: adventure `editor/src/rules/engine.js:593-610` `applyPortals`, `game/rules/engine.gd:669-686` `apply_portals` 가 같은 칸 기준.

## 기대 동작과 근거 (결정 필요)

문서끼리 다르다.

- adventure `CLAUDE.md` v5 표 '포탈': "이번 턴에 **새로 올라선 물체**를 반대쪽으로 옮긴다" → r02a·r02d 의 플레이어는 이번 턴에 새로 올라섰으니 옮겨져야 한다.
- Studio `ENGINE_ALGORITHMS.md` §11.1: "점유 스냅샷은 오브젝트 신원이 아니라 포털 칸별 불리언 값이다. 따라서 턴 시작에 차 있던 포털이 도중에 비고 다른 오브젝트가 들어와도 … 건너뛴다" → 지금 동작을 구현 명세로 적어 둠(설계 의도인지는 적혀 있지 않음).

제안: '턴 시작에 그 포탈 위에 있던 **물체**'만 건너뛰게(물체 신원 기준) 바꾸면 CLAUDE.md 문구와 굴림 쪽 동작이 맞는다. 지금 동작을 유지하기로 하면 CLAUDE.md 문구를 고친다.

## 영향

팀 맵 스냅샷(283 맵·281 풀이)에서 포탈을 쓰는 맵 4개, '턴 시작에 찬 포탈에 플레이어가 새로 올라선' 수는 0개.

## 결정할 것

'턴 시작에 차 있던 포탈'을 칸 기준(지금, `ENGINE_ALGORITHMS.md` §11.1)으로 둘까, 물체 기준(adventure `CLAUDE.md` "새로 올라선 물체")으로 바꿀까? 물체 기준으로 바꿔도 B-020(붙은 포탈)은 따로 정해야 한다.
