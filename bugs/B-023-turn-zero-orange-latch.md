# B-023 0턴 판정이 레이저만 해서, 처음부터 덮인 주황 버튼의 벽이 0턴엔 닫혀 있음 (노랑은 열림)

- **심각도**: low
- **분류**: **DECIDE** — 규칙 의도가 갈린다. 팀 결정 전까지 기록만 하고 코드는 그대로 둔다
- **어느 엔진**: studio · JS · GDScript (셋 다 같음)
- **상태**: 결정 필요
- **출처**: mapmaker `RULES.md` §16 버그 의심 5 · 옛 번호 `found/R-05-turn-zero-orange-not-latched`
- **줄 번호 기준**: 본 트리(현재 배포) — studio `fff5e12`, adventure `a2dd0e9`. 재현 스크립트(세 엔진 대조): `/tmp/claude-1000/bugfix/R-known/run3.sh <specs.txt>`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.
- **함께 정할 것**: 0턴 2건 — B-023(0턴 주황 래치) · B-024(0턴 클리어). B-017 의 r06a 도 이 래치 시점에서 시작한다.

## 증상

레벨 시작 때 이미 물체가 주황 버튼을 덮고 있어도, 주황 벽은 **첫 유효 턴의 첫 래치 시점**(이동 직후·굴림 첫 틱·대기 턴 끝)까지 닫혀 있다. 0턴 레이저 판정(Q-07)은 닫힌 주황 벽을 기준으로 하므로, 벽 너머 빔 길의 눈 물체는 0턴에 살아 있다가 첫 이동에서 녹는다. 같은 배치를 노랑 버튼·노랑 벽으로 바꾸면 0턴부터 열려 있어 0턴에 녹는다. 화면도 0턴에 '버튼 덮임 + 벽 닫힘'(`n` + `Q`)으로 보인다.

함께 본 0턴 경계(버그로 보지 않음):

- 시작부터 금 위에 선 물체: 0턴 무장 없음 → 첫 턴 끝에 무장, 둘째 턴에 붕괴. 걸어서 올라선 경우(그 턴 끝 무장 → 다음 턴 붕괴)와 붕괴 턴이 같다(아래 r05c·r05d). 일관적.
- 시작부터 눈꽃 위에 선 눈 물체: 먹지 않는다(RULES §13). 팀 맵 3곳('pool' 의 플레이어 시작 칸, '아좀비켜좀비켜좀!!' 의 S1 둘)이 이 배치다. 세 엔진 같음.
- 시작부터 구멍 위 물체: 에디터가 막는다(`Editor.tsx:629-630`·`:692-699`). 맵 코드로만 가능.

## 재현

```text
r05a (주황)                                    r05b 대조 (노랑)
6 3 sun=left shadow=off soul=off               6 3 sun=left shadow=off soul=off
. L> .    .Q   . o1 .    .                     . L> .    .Y   . o1 .    .
.n[] .    .    .    .    .                     .b[] .    .    .    .    .
. P2 .    .    .    .    .G                    . P2 .    .    .    .    .G
```

| 판 | 맵 코드 | 수열 | 지금(studio·JS·GD 같음) |
|---|---|---|---|
| r05a | `mz3YF93Kaofrxlo2RvMsWORXkC8PMrhCXT4hMKHYDAFV3UR71PyNuDSzG` | (0턴) | 주황 벽 닫힘, (0,3) o1 생존 |
| r05a | 〃 | R | 이동 직후 래치 → 벽 열림 → 레이저가 (0,3) o1 녹임 |
| r05b | `EAwa5htNfAxoYMEILEzEFjz0uBQao7zr5CbLV8VybHLsUGFdlb6` | (0턴) | 노랑 벽 열림, (0,3) o1 0턴에 녹음 |
| r05c 시작부터 금 위 (`.cP2 …` / `. S1 …`) | `BBiNVoo0yrhys7VXDCIvfsDnwYFb5w` | WW | W 끝 무장, WW 에 붕괴 → 영혼 S1 로 |
| r05d 대조 금에 걸어 올라섬 | `BBiNVoo0yrhys7VXDCIvfsDnwYFb6S` | RW | R 끝 무장, W 에 붕괴 |

지금 엔진 출력(`mm.ts trace <r05a> R --boards`):

```text
 0 . L> !    .Q   . o1 .    .          ← 0턴: 버튼 덮였는데 벽 닫힘
 1 .n[] .    .    .    .    .
#1 → → 턴 1
   눈덩이 (0,3)→소멸 크기 1→-
   타일: 주황 래치 (1,0)
   토글: 주황 벽 열림
 0 . L> !    !q   !    !    !
 1 .N[] .    .    .    .    .
```

## 원인

- `src/engine/turn.ts:126-130` `applyTurnZero` 는 `applyLaserCheck` 만 한다. 주황 래치(`latchOrangeButtons`, `turn.ts:157-165`)는 이동 해석 뒤(`:367`)·굴림 틱(`:329`)·턴 끝(`:446`)에만 있다.
- 노랑 벽은 래치 없이 매번 버튼 점유로 계산하므로(`helpers.ts:23-34`) 0턴에도 열린다.
- 포트: adventure `editor/src/rules/engine.js:1505-1511` `applyTurnZero`, `game/rules/engine.gd:1617-1624` `apply_turn_zero` — 둘 다 레이저만.

## 기대 동작과 근거 (결정 필요)

- 주황 버튼 정의: "오브젝트가 한 번 덮으면 `orangePressed = true`가 되고 되돌아가지 않는다"(Studio `ENGINE_ALGORITHMS.md` §11.2, adventure `CLAUDE.md` v5 표 "한 번 덮이면 영구히 눌린 상태"). 시작부터 덮였으면 이미 덮인 것이므로 0턴에 래치되는 것이 자연스럽다.
- 반대쪽: Q-07 의 0턴 판정은 "레이저만"으로 정해졌고(`ENGINE_ALGORITHMS.md` §12 '0턴 판정'), mapmaker `RULES.md` §10·§15-20 은 지금 동작을 적어 두었다.

제안: `applyTurnZero` 맨 앞에서 `latchOrangeButtons` 를 한 번 부른 뒤 레이저를 판정한다(세 엔진 같이). 유지하기로 하면 Q-07 설명에 "주황 래치는 첫 유효 턴부터"를 명시한다.

## 영향

팀 맵 스냅샷(283 맵)에서 주황 버튼을 쓰는 맵 1개, 시작부터 덮인 주황 버튼 0개.

## 결정할 것

처음부터 덮인 주황 버튼을 0턴에 래치할까(`applyTurnZero` 맨 앞 `latchOrangeButtons`, 세 엔진), Q-07 설명에 '주황 래치는 첫 유효 턴부터'를 적을까? 팀 맵 0개.
