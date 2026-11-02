# B-025 '레이저는 발사면 쪽에서 못 민다' 검사가 플레이어 바로 앞(A)에만 있어 실제로는 발동하지 않고, 상자 사슬로는 발사면 쪽에서 밀림

- **심각도**: low
- **분류**: **DECIDE** — 규칙 의도가 갈린다. 팀 결정 전까지 기록만 하고 코드는 그대로 둔다
- **어느 엔진**: studio · JS · GDScript (셋 다 같음)
- **상태**: 결정 필요
- **출처**: mapmaker `RULES.md` §16 버그 의심 9 (`rules/verify-docs-vs-code.md` §I-3) · 옛 번호 `found/R-08-laser-emitting-face-push-rule-only-for-A`
- **줄 번호 기준**: 본 트리(현재 배포) — studio `fff5e12`, adventure `a2dd0e9`. 재현 스크립트(세 엔진 대조): `/tmp/claude-1000/bugfix/R-known/run3.sh <specs.txt>`
- **재확인 (2026-11-02 분류 단계)**: 본 트리 엔진(studio `fff5e12` · adventure JS·GDScript `a2dd0e9`)으로 아래 재현을 다시 돌려 적힌 결과와 같음을 확인했다(GDScript 는 `game/rules` 사본 headless). 작업 트리(`fix/engine-bugs-2026-11-02`, B-001~003 수정) Studio 에서도 같다.

## 증상

1. 직접 밀기 금지는 도달할 수 없다. 레이저 발사면 바로 앞 칸은 빔이 지나는 칸이라, 플레이어가 그 칸에 들어서면 이동 직후 레이저 판정에 죽는다(0턴에 그 칸에서 시작하는 배치는 에디터가 막는다). 그래서 `push.ts:31-33` 의 금지는 한 번도 발동하지 않는다.
2. 상자를 사이에 두면 발사면 쪽에서 레이저가 그대로 밀린다(상자가 빔을 막아 플레이어가 살아 있다).

## 재현

```text
e23 (mapmaker rules/experiments/docs-vs-code)   r08b (발사면 앞 칸으로 걸어 들어감)
5 2 sun=left shadow=off soul=off                5 2 sun=left shadow=off soul=off
. P2 . [] . L< .    .                           .    .    . L< .    .
.    .    .    .    .G                          .    . P2 .    .    .G
```

| 판 | 맵 코드 | 수열 | 지금(studio·JS·GD 같음) |
|---|---|---|---|
| e23 | `B9aarrWI1qjVdaUmkunlyiCE75aG8` | R | 상자 (0,1)→(0,2), 왼쪽을 쏘는 레이저 (0,2)→(0,3) — 발사면 쪽에서 밀림 |
| r08b | `B9aarrGDZ5CVLSIgL5JkvgP4zPTuY` | U | 플레이어가 빔 칸 (0,1) 에 들어서자 녹아 gameover — 발사면에 닿을 수 없음 |

지금 엔진 출력(`mm.ts trace <e23> R --boards`):

```text
#1 → → 턴 1
   플레이어 (0,0)→(0,1)
   상자 (0,1)→(0,2)
   laser (0,2)→(0,3)
 0 .    . P2 . [] . L< .
```

## 원인

- `src/engine/push.ts:28-33`: `objA?.type === 'laser' && dir === OPP_DIR[laserDirection]` 일 때만 무반응. B·C 자리의 레이저는 검사하지 않는다(`doMove2`·`doMove3` 로 함께 밀림).
- 포트: adventure `editor/src/rules/engine.js:1254-1255`, `game/rules/engine.gd:1382-1384`(같은 A 전용 검사).

## 기대 동작과 근거 (결정 필요)

- Studio `ENGINE_ALGORITHMS.md` §2.2 오브젝트 표: "레이저 — 블록처럼 밀릴 수 있지만 **발사 면에서는 밀 수 없다**"(일반 규칙). §5.1 은 "A가 레이저이고 …"(A 한정), `test/GAME_IMPLEMENTATION_CASES.md` P0-06 은 플레이어가 레이저에 바로 붙어 미는 경우만 적었다. 두 서술이 사슬 경우에 갈린다.
- 금지가 실제로 의미를 가지는 유일한 경우가 사슬이므로, 금지를 유지할 거면 사슬 속 레이저(B·C)에도 적용해야 하고, 사슬 밀기를 허용할 거면 A 검사(죽은 코드)와 §2.2 문구를 정리해야 한다.

## 영향

팀 맵 스냅샷(283 맵) 중 레이저를 쓰는 맵 31개. 상자로 레이저를 발사면 쪽에서 미는 수가 풀이에 있는지는 세지 않았다(고치는 쪽을 정하면 그때 대조).

## 결정할 것

'레이저는 발사면 쪽에서 못 민다'를 사슬 속 레이저(B·C)에도 적용할까(그러면 상자 사슬로 미는 길이 막힘), 금지를 없애고 A 검사(실제로는 발동 안 하는 코드)와 §2.2 문구를 정리할까? 고치기로 하면 레이저 맵 31개의 풀이를 다시 재생해 영향을 센다.
