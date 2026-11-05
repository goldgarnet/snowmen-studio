# B-022 영혼 발판 판정이 포탈보다 먼저라, 포탈로 발판에 도착하면 대기를 두 번 해야 영혼이 옮겨 감

- **심각도**: low
- **분류**: **DECIDE → 기능 삭제** — 규칙 의도가 갈려 팀 결정에 올렸으나, 그 기능을 게임에서 빼서 닫았다(2026-11-03)
- **어느 엔진**: studio · JS · GDScript (셋 다 같음)
- **상태**: 닫음 — 포탈 삭제(2026-11-03 팀 결정)
- **닫은 까닭**: 팀이 포탈을 게임에서 뺐다(에디터·엔진·게임 화면). 이 경우는 더는 생기지 않는다. 예전 맵 코드의 포탈 비트는 디코더가 버려 그 칸은 평범한 바닥이다(`ENGINE_ALGORITHMS.md` §18). 아래 내용은 기록으로 남긴다.
- **출처**: mapmaker `RULES.md` §16 버그 의심 7 · 옛 번호 `found/R-07-soulplate-before-portal-arms-late`
- **줄 번호 기준**: 본 트리(현재 배포) — studio `fff5e12`, adventure `a2dd0e9`. 재현 스크립트(세 엔진 대조): `/tmp/claude-1000/bugfix/R-known/run3.sh <specs.txt>`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.
- **함께 정할 것**: 포탈 도착 규칙 4건 — B-019 · B-020 · B-021 · B-022.

## 증상

영혼 발판은 '밟은 턴에 무장 → 같은 발판에서 다음 유효 턴에 교체'다. 걸어서 발판에 올라서면 W 한 번에 교체된다. 그런데 **반대 포탈이 발판 칸**이라 순간이동으로 발판에 도착하면, 도착한 턴에는 무장되지 않고 W 를 두 번(무장 → 교체) 해야 한다.

## 재현

```text
r07a (반대 포탈 (2,3) 이 영혼 발판)            r07b 대조 (걸어서 발판으로)
5 3 sun=left shadow=off soul=off               5 3 sun=left shadow=off soul=off
. P2 .%   .    .    .                          .    .    .    .    .
.    .    .    .    .                          .    .    .    .    .
. S1 .    .    .%   .                          . S1 .    . P2 .@   .
flag 2 3 soul
```

| 판 | 맵 코드 | 수열 | 지금(studio·JS·GD 같음) | 기대(제안) |
|---|---|---|---|---|
| r07a | `D2a0cuM0atnJKfIBz1FpnPw4VEiMbwOEV4SYO5HMuWZntr0KkR` | RW | R: 포탈로 (2,3) 발판 도착(무장 없음), W: 무장만 | R 끝 무장, W 에 교체(P1@(2,0)) |
| r07a | 〃 | RWW | 둘째 W 에 교체 → P1@(2,0), S2@(2,3) | — |
| r07b | `XTZGO3f4W5vCA0kziJQLX9pCyTWEKjV5lYTOvkMhC` | RW | R 끝 무장, W 에 교체 → P1@(2,0) | — |

지금 엔진 출력(`mm.ts trace <r07a> RWW --boards`):

```text
#1 → → 턴 1
   플레이어 (0,0)→(2,3)
 2 . S1 .    .    .@P2 .          ← 발판 위인데 무장(&) 아님
#2 W(대기) → 턴 2
   토글: 영혼 발판 무장 (2,3)
#3 W(대기) → 턴 3
   영혼 (2,3) → (2,0) 몸 크기 1
```

## 원인

- 이동 턴 `src/engine/turn.ts:356-365`: `resolveSoulFootplate`(`:359-361`, 순간이동 **전** 위치로 판정) → `applyPortals`(`:365`). 포탈 출발 칸은 발판이 아니라 무장이 풀리고, 도착 칸은 그 턴에 판정되지 않는다.
- 포트: adventure `editor/src/rules/engine.js:1519-1521` `finishTurn`(발판 → 포탈), `game/rules/engine.gd:1629-1631` `finish_turn`.

## 기대 동작과 근거 (결정 필요)

- 발판 규칙: "밟은 턴엔 무장만, 다음 턴에도 같은 발판이면 … 영혼 이동"(adventure `CLAUDE.md` v5 표, Studio `ENGINE_ALGORITHMS.md` §14). 포탈로 도착한 것도 그 턴에 발판을 밟은 것이다.
- 반대쪽: 순서 '영혼 발판 → 포탈'은 문서에 적혀 있다(adventure `CLAUDE.md` '턴 처리 순서', `ENGINE_ALGORITHMS.md` §4.1 6→7번). 결과(대기 두 번)는 mapmaker `RULES.md` §11·§15-15 에만 적혀 있다.

제안: 발판 판정을 포탈 다음으로 옮기거나, 포탈 뒤 위치로 한 번 더 무장만 판정한다. 유지하기로 하면 문서에 "포탈로 발판에 도착한 턴엔 무장되지 않는다"를 적는다. (M 으로 발판 위 몸에 들어간 경우는 M 이 턴이 아니므로 별개 — 지금처럼 W 두 번.)

## 영향

팀 맵 스냅샷(283 맵)에서 포탈을 쓰는 맵 4개, 포탈+발판 같은 칸 0개.

## 결정할 것

포탈로 영혼 발판에 도착한 턴에 무장할까(발판 판정을 포탈 뒤로), 지금처럼 대기 두 번을 둘까? 팀 맵 0개.
