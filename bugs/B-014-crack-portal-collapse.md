# B-014 금+포탈 칸이 무너지면 '구멍+포탈'이 남아, 걸어 들어간 플레이어가 구멍에 빠지지 않고 순간이동함

- **심각도**: medium
- **분류**: **DECIDE → 기능 삭제** — 규칙 의도가 갈려 팀 결정에 올렸으나, 그 기능을 게임에서 빼서 닫았다(2026-11-03)
- **어느 엔진**: studio · JS · GDScript (셋 다 같음)
- **상태**: 닫음 — 포탈 삭제(2026-11-03 팀 결정)
- **닫은 까닭**: 팀이 포탈을 게임에서 뺐다(에디터·엔진·게임 화면). 이 경우는 더는 생기지 않는다. 예전 맵 코드의 포탈 비트는 디코더가 버려 그 칸은 평범한 바닥이다(`ENGINE_ALGORITHMS.md` §18). 아래 내용은 기록으로 남긴다.
- **출처**: mapmaker `RULES.md` §16 버그 의심 4 · 옛 번호 `found/R-04-crack-portal-collapses-into-hole-portal`
- **줄 번호 기준**: 본 트리(현재 배포) — studio `fff5e12`, adventure `a2dd0e9`. 재현 스크립트(세 엔진 대조): `/tmp/claude-1000/bugfix/R-known/run3.sh <specs.txt>`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.

## 증상

에디터는 한 칸에 금과 포탈을 함께 둘 수 있다(`src/components/editor/Editor.tsx:700-714` — 금 도구는 `isPortal` 을, 포탈 도구는 `isCrack` 을 지우지 않는다). 그 칸이 무너지면 `isHole` 이 켜지는데 `isPortal` 은 남는다. 에디터가 금지하는 조합(구멍 도구는 포탈을 지운다 — `Editor.tsx:692-699` "A hole can't hold an object, a portal, or a crack")이 플레이 중에 생기고, 그 칸은 들어오는 방법에 따라 다르게 군다.

- **걸어서 들어가면**: 포탈 단계가 구멍 단계보다 먼저라 반대 포탈로 옮겨져 **산다**(구멍인데 안 빠짐).
- **굴러 들어가면**: 구멍이 먼저라 **빠진다**.
- **반대 포탈로 들어가면**: 이 구멍 칸으로 옮겨진 뒤 빠진다.

## 재현

```text
r04b (아래 (2,3) 이 금+포탈)
6 3 sun=left shadow=off soul=off
. P2 .%   .    .    .    .
. S1 .    .    .    .    .
. o1 .    .    .%   .    .
flag 2 3 crack
```

| 판 | 맵 코드 | 수열 | 지금(studio·JS·GD 같음) | 기대 |
|---|---|---|---|---|
| r04b | `BAg84Psr8w65qHhIjzgKsmmf7QLixLc6eZdb1AB3mU8l72Xv1czjNXw2dJnjEXWKUNMCiU7qL` | R | 포탈로 (2,3) 도착, 금 무장 | 같음 |
| r04b | 〃 | RU | (2,3) 이 구멍이 되는데 포탈도 남음(`H%`) | (2,3) 구멍만(포탈 사라짐) — 또는 애초에 금+포탈 금지 |
| r04b | 〃 | RUD | 플레이어가 구멍 칸 (2,3) 으로 걸어 들어가 **(0,1) 로 순간이동, 생존** | 빠져 죽고 영혼이 S1 로 → P1@(1,0) |
| r04a (눈사람 없음, `. P2 .%  …` / `(2,3)` 금+포탈) | `D2a0cuM0atnJKfIBz1FpnPw4VEiMbwMdLZk31pDGYJ32mlLV2D` | RLR | 구멍으로 걸어 들어가 (0,1) 로 순간이동, playing | gameover |
| r04a | 〃 | RLUULLR | 반대 포탈 (0,1) 로 들어가면 구멍 칸으로 옮겨져 빠짐 → gameover | (포탈이 사라졌다면) 그냥 (0,1) 에 섬 |
| r04c (`(1,3)` o1, `(2,3)` 금+포탈) | `tZnKyv5hPQ8wF5nU7x1ApZA2RWy5pzvsZbXPCYQwaSeh6kR4JJzNyWpQzEkK2n` | RDLUUURD | 붕괴 뒤 공을 굴려 넣으면 **빠짐** | 빠짐(같음) |

지금 엔진 출력(`mm.ts trace <r04a> RLR --boards`):

```text
#1 → → 턴 1
   플레이어 (0,0)→(2,3)
   타일: 금 무장 (2,3)
#2 ← → 턴 2
   플레이어 (2,3)→(2,2)
   타일: 구멍 생김 (2,3)
 2 .    .    . P2 .H   .            (flag 2 3 portal 이 남아 있음)
#3 → → 턴 3
   플레이어 (2,2)→(0,1)
   이벤트: portal_teleport
 0 .    .%P2 .    .    .
 2 .    .    .    .H   .
최종: playing / 턴 3
```

## 원인

- 금 붕괴 `src/engine/turn.ts:214-225` `convertArmedCracks` 가 `isCrack=false; isHole=true` 만 하고 `isPortal` 은 그대로 둔다.
- 이동 턴 순서 `turn.ts:365-366`: `applyPortals` → `applyHoles`. 구멍+포탈 칸에 걸어 들어온 물체는 구멍 판정 전에 반대 포탈로 옮겨진다.
- 굴림 `src/engine/roll.ts:59-62` 은 구멍을 포탈보다 먼저 본다(그래서 공은 빠짐).
- 포트: adventure `editor/src/rules/engine.js:554-564`(`convertArmedCracks`)·`:1519-1522`(`finishTurn` 포탈 → 구멍), `game/rules/engine.gd:633-640`(`convert_armed_cracks`)·`:1629-1632`(`finish_turn`).

## 기대 동작과 근거 (고치는 방향 결정 필요)

- 구멍은 "들어가면 무엇이든 빠져 사라진다"(adventure `CLAUDE.md` v5 표 '구멍', Studio `ENGINE_ALGORITHMS.md` §3.6). 걸어 들어간 플레이어가 살아 나가면 안 된다.
- 구멍과 포탈은 한 칸에 있을 수 없다(에디터 불변식, `Editor.tsx:692-699`).

선택지:
1. **붕괴할 때 그 칸의 포탈을 지운다**(`convertArmedCracks` 에서 `isPortal=false`). 남은 포탈은 1개가 되어 짝 포탈도 멈춘다(포탈 ≠ 2 → 전부 무동작, `turn.ts:197`). 에디터의 '구멍은 포탈을 지운다'와 같은 결과.
2. 에디터·맵 검사에서 금+포탈 같은 칸을 금지한다(이미 있는 맵 코드는 1로 처리).
3. 구멍+포탈을 허용하되 이동 턴에서 구멍을 포탈보다 먼저 판정한다(굴림과 같게).

## 영향

팀 맵 스냅샷(283 맵)에서 포탈을 쓰는 맵 4개·금을 쓰는 맵 10개, 금+포탈 같은 칸 0개.

## 결정할 것

증상(구멍으로 걸어 들어간 플레이어가 산다)은 분명히 틀렸다. 고치는 방향만 정하면 된다.
- 권장: 1(붕괴 때 포탈을 지움 — 에디터의 '구멍은 포탈을 지운다'와 같은 결과) + 2(에디터가 금+포탈 같은 칸을 막음). 1 은 짝 포탈도 멈추게 하므로(포탈 ≠ 2) 이것이 의도인지 팀 확인이 필요하다.
- 팀 맵에 금+포탈 같은 칸이 0개라 어느 쪽이든 기존 풀이는 안 바뀐다.
