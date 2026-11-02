# B-020 붙어 있는 두 포탈 — 한 포탈에서 옆 포탈로 넘어가면 되돌려 보내진다 (걷기: 제자리인데 턴만 흐름, 굴림: 끝없는 핑퐁 '무한 루프')

- **심각도**: low (붙은 포탈 쌍은 팀 맵 283개 중 0개. 다만 에디터가 막지 않고, 굴림은 Q-13 '무한 루프' 연출이 엉뚱하게 뜬다)
- **분류**: **DECIDE** — 규칙 의도가 갈린다. 팀 결정 전까지 기록만 하고 코드는 그대로 둔다
- **어느 엔진**: studio · adventure JS · GDScript (셋 다 같음 — JS 는 `applyMoveWithTrace` 로 `infiniteLoop: true` 확인, GDScript 는 /tmp 사본 headless 실행)
- **상태**: 결정 필요
- **출처**: 엔진 정독(C) — `applyPortals` 의 '턴 시작 점유' 스냅샷과 `resolveArrival` 를 읽다가, 타입 주석의 "(from a non-portal cell)" 조건이 구현에 없음을 확인 · 옛 번호 `found/C-03-adjacent-portals-bounce-back`
- **기준**: 줄 번호·출력은 본 트리(현재 배포) studio `fff5e12`
- **관련**: B-019(포탈 시작 점유가 칸 기준) — 원인이 같은 뿌리(물체가 '어디서 왔는지' 대신 칸 점유 스냅샷을 씀)지만 증상이 반대다(B-019 는 옮겨야 할 것을 안 옮김, 여기는 옮기면 안 될 것을 되돌림).
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.
- **함께 정할 것**: 포탈 도착 규칙 4건 — B-019 · B-020 · B-021 · B-022.

## 증상

포탈 P0·P1 이 붙어 있을 때(가로/세로 이웃):

1. **걷기**: P0 위에 선 플레이어가 P1 으로 한 칸 걸으면, P1 은 턴 시작에 비어 있었으므로 '새로 올라섰다'고 보고 반대쪽 P0(방금 비움)으로 순간이동시킨다 → **제자리로 돌아오고 턴은 흐른다**(녹기·금·발판 처리 진행). 그 방향으로는 영영 못 건너간다.
2. **굴림**: P0 위에 멈춰 있던 공이 같은 질량 충돌로 P1 쪽으로 굴러가면, P1 도착 → P0 으로 순간이동 → 같은 방향으로 계속 → 다시 P1 도착 → … 틱 한도(W·H·4+16)까지 **두 칸 사이를 핑퐁**하고 `infiniteLoop: true`(Q-13 무한 루프)로 끝난다.

## 재현

```text
r1 걷기 (볕 위 o2 는 턴이 흐르는지 보려는 표시)     r2 굴림
5 2 sun=left shadow=off soul=off                   6 2 sun=left shadow=off soul=off
.    .%P2 .%   .    .                              . P2 . o1 .    .%o1 .%   .
.    .    .    .    ~ o2                           .    .    .    .    .    .
```

| 판 | 맵 코드 | 수열 | 지금(studio·JS·GD 같음) |
|---|---|---|---|
| r1 | `Ug5iycfybnteVXsvT0c4xLLzg4tx0RRs8Anbb` | RR | 두 번 다 플레이어 (0,1) 그대로. 볕 위 o2 는 2→1→소멸(턴이 두 번 흐름) |
| r2 | `YHdv5JXKuIE6NI0gaXUkBhmbVts8VfDy6bzjt5Ctbj` | R | (0,3) 공이 (0,4)↔(0,3) 핑퐁, frames 130개, `infiniteLoop: true`, 공은 (0,3) 에 남음 |

지금 엔진 출력(`mm.ts trace <code> RR --boards`):

```text
r1
#1 → → 턴 1
   눈덩이 (1,4)→(1,4) 크기 2→1
 0 .    .%P2 .%   .    .                ← (0,2) 로 갔다가 (0,1) 로 되돌아옴
#2 → → 턴 2
   눈덩이 (1,4)→소멸 크기 1→-
 0 .    .%P2 .%   .    .
r2
#1 → → 턴 1
   (무한 굴림 — 틱 한도에서 멈춤)
 0 .    . P2 . o1 .%o1 .%   .
```

## 원인

- `src/engine/turn.ts:196-211` `applyPortals`: '새로 올라선 물체'를 **턴 시작 때 그 포탈 칸이 비어 있었는가**(`startOccupied`, `:309-310`)로만 가린다. P0→P1 로 옮긴 몸은 P1 이 처음에 비어 있었으므로 새 도착으로 보이고, 반대쪽 P0 은 방금 비었으므로 `:206` 통과 → P0 으로 이동.
- `src/engine/roll.ts:54-73` `resolveArrival`: 굴러 도착한 공은 출발 칸과 상관없이 반대쪽이 비면 순간이동한다(`:67-71`). P0 에서 출발해 P1 에 닿으면 비어 있는 P0 으로 돌아가고, 방향을 유지하므로 다음 틱에 또 P1 → 반복. 틱 한도 `roll.ts:120` 에서 멈추고 `:260` 이 'loop' 를 알린다.
- 포트: adventure `editor/src/rules/engine.js` `applyPortals`·`rollGroup`, `game/rules/engine.gd:669-…` — 같은 구조.

## 기대 동작과 근거 (결정 필요)

- 근거: 코드 주석이 의도를 적어 두었다 — `src/types.ts:65-69` "An object/player that moves onto a portal **(from a non-portal cell)** is instantly relocated to the other portal", `turn.ts:190-191` "just moved ONTO a portal **(from a non-portal cell this turn)**". P1 에 P0 에서 온 몸은 이 조건에 해당하지 않으므로 순간이동하지 않아야 한다. RULES §10 은 지금 동작('턴 시작 때 비어 있었으면')만 적었다.
- 선택지:
  1. 주석대로 — 반대쪽 포탈에서 막 건너온 몸(걷기·밀기·굴림 모두)은 순간이동하지 않는다. 걷기는 P1 에 그대로 서고, 굴림은 P1 을 지나 계속 굴러간다.
  2. 에디터에서 포탈 두 개를 이웃 칸에 못 놓게 막는다(`Editor.tsx` 포탈 도구는 지금 개수만 경고, `:1049-1054`).
  3. 지금대로(붙은 포탈 = '못 건너는 칸'·'무한 루프 장치'로 쓰는 것을 허용) — 그러면 RULES·주석을 고친다.

## 영향

- 팀 맵 스냅샷(맵 283개)에 붙어 있는 포탈 쌍은 **0개** — 기존 풀이는 안 바뀐다.

## 결정할 것

붙은 포탈에서 옆 포탈로 건너간 몸을 되돌려 보낼까? 선택지 1(코드 주석대로 '포탈이 아닌 칸에서 온 몸만' 순간이동)·2(에디터가 붙은 포탈을 막음)·3(지금대로, 문서 수정). 팀 맵 0개.
