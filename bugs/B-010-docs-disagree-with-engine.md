# B-010 규칙 문서가 엔진과 다른 곳 (엔진 동작은 정상 — 문서만 고치면 됨)

- **심각도**: low
- **분류**: **FIX(문서)** — 엔진은 정상, 문서만 고친다
- **어느 엔진**: 없음(문서) — Studio `ENGINE_ALGORITHMS.md`·`HANDOFF.md`, adventure `CLAUDE.md`·`shared/arch-edge-design.md`
- **상태**: 고침 — 문서(Studio 작업 트리·adventure 작업 트리 `wt-bugfix/snowmen_adventure`, 같은 브랜치). #9 mapmaker `RULES.md` 는 메인 세션
- **출처**: mapmaker `RULES.md` §18, `rules/verify-docs-vs-code.md` §B4·§B5·§B6 을 지금 문서(studio `fff5e12`, adventure `a2dd0e9`)로 다시 대조. 엔진이 문서와 다른 '규칙 문제'는 따로 적었다(B-006·B-021·B-025, 엔진 간 차이는 B-007·B-008·B-026). · 옛 번호 `found/R-10-docs-disagree-with-engine`
- **줄 번호 기준**: 본 트리(현재 배포) — studio `fff5e12`, adventure `a2dd0e9`. 재현 스크립트(세 엔진 대조): `/tmp/claude-1000/bugfix/R-known/run3.sh <specs.txt>`
- **재확인 (2026-11-02 분류 단계)**: 표의 문서 줄을 본 트리(studio `fff5e12`, adventure `a2dd0e9`)와 작업 트리에서 다시 읽어 그대로 남아 있음을 확인했다. 근거 실험은 다시 돌리지 않았다(원래 보고의 docs-vs-code 재실행 결과를 옮김).

## 증상과 재현

문서마다 지금도 남아 있는 틀린 서술. 실험 맵은 mapmaker `rules/experiments/docs-vs-code/` (지금 엔진으로 다시 돌려 결과 같음 확인 — 세 엔진 대조 71회, 갈린 것은 e03·e10a·e17a 셋뿐이고 각각 B-008·B-007·B-026).

| # | 문서:줄 | 문서 내용 | 엔진 실제 | 근거 실험(수열) |
|---|---|---|---|---|
| 1 | adventure `CLAUDE.md:109` | "`moveA_forceB` 는 A가 B 자리로 밀려 … 플레이어 전진 정상" | 플레이어와 A 는 제자리, B 만 힘(studio `push.ts:583-587`, JS `engine.js:1181-1185`) | e19 `R`: `P2@(0,0) o2@(0,1)`, (0,2) 눈꽃 |
| 2 | adventure `CLAUDE.md:108` | 눈사람 만들기 "또는 쪼개진 size1이 기존 눈덩이 위로(§Q4)" | 쪼개진 반쪽은 밀어내기만, 눈사람 안 만듦(Q-02, 같은 문서 Q4 줄과도 모순) | e07a/e07b `R` |
| 3 | adventure `CLAUDE.md:202`, `shared/arch-edge-design.md:60-61·131` | 가장자리 아치 판정 `archBlocks(archH, objH)` = **높이** 기준 | **크기** 기준(Q-11 — 상자·레이저(높이 1.5, 크기 1)가 h1 아치 통과). 눈 물체는 두 식 결과가 같고 상자·레이저만 다름 | e05c `RR`: 상자가 h1 아치 통과 |
| 4 | adventure `CLAUDE.md:140-142` 턴 처리 순서 | `… 레이저 → endOfTurn(…) → 골 판정` | 이동 턴은 레이저 직후 **조기 골 판정**(녹기 전 클리어)이 있다(studio `turn.ts:380-385`, JS `engine.js:1519-1540` `earlyGoal`) | e48 `WWR`: 녹는 중 P1 이 볕 목표에서 클리어 |
| 5 | Studio `ENGINE_ALGORITHMS.md:194` §4.2 대기 | "2. 무장된 영혼 이동 발판 해결" | 대기도 발판 위면 **무장**하고 발판 밖이면 해제(`turn.ts:254-269·280`) | e20 `MWW`: 첫 W 무장, 둘째 W 교체 |
| 6 | Studio `ENGINE_ALGORITHMS.md:601` §16.4 | "가장자리 아치는 이동을 막지만 받침은 아니다" | 그 물체를 막는 아치는 받침이다(`helpers.ts:205·210`). 같은 문서 §3.3·§5.7 과도 모순 | e04a `R`: h1 아치 앞 s2 에 s1 을 밀면 S2 생성 |
| 7 | Studio `HANDOFF.md:133-138` (7월 HEAD `9687122` 기준) | 레이저 빔 위 골 = gameover 우선 / 굴림 레이저 = `killIfOnBeam` 굴러가는 공만 / 밀기 정본 = 상위 폴더 xlsx / size2 막힘 → 쪼개짐(→ size1 눈사람) | 사망 → 영혼 이동(옮겨 간 몸이 목표면 클리어, Q-14) / 틱마다 판 전체 레이저 / 정본은 `push.ts`(adventure `CLAUDE.md` §6) / 양쪽 다 막힌 **직접** 힘만 눈사람 | e02a·e02c `U`, e31 `R`, e07a·e27b `R` |

## 원인

규칙이 9월 감사(B-xx·Q-xx·N-01)와 10월 구멍 규칙 변경으로 바뀌었는데 위 줄들이 따라오지 않았다.

## 기대 동작과 근거

엔진(정본, adventure `CLAUDE.md` §1·§9: Studio → 문서 순)에 맞춰 문서를 고친다. 고칠 문안:

1. `CLAUDE.md:109` "단 `moveA_forceB`(s2 뒤 s1 이 받쳐진 경우)도 플레이어와 A 는 제자리, B 만 힘을 받는다."
2. `CLAUDE.md:108` "또는 쪼개진 size1이 기존 눈덩이 위로(§Q4)" 삭제.
3. `CLAUDE.md:202` "판정: 물체의 **크기**가 아치 높이보다 크면 막힌다(`size > archH`). 상자·레이저는 크기 1이라 h1 아치를 지난다(Q-11)." `arch-edge-design.md` 머리에 'Q-11 로 크기 기준으로 바뀜' 표시.
4. `CLAUDE.md:140-142` 레이저 다음에 "→ (이동 턴만) 활성 목표면 즉시 클리어 →" 를 넣는다.
5. `ENGINE_ALGORITHMS.md:194` "2. 영혼 이동 발판 판정(발판 위면 무장, 같은 발판에 이미 무장돼 있으면 발동, 발판 밖이면 해제)".
6. `ENGINE_ALGORITHMS.md:601` "가장자리 아치는 그 오브젝트를 막을 때만 받침이 된다(통과할 수 있는 아치는 받침이 아니다)".
7. `HANDOFF.md` 머리에 "7월 기준 인수인계 — 엔진 규칙은 `ENGINE_ALGORITHMS.md` 가 최신" 한 줄.

## 덧붙임 (분류 단계)

- 줄 번호는 본 트리 기준이다. 작업 트리에서는 `ENGINE_ALGORITHMS.md` 가 B-001~003 문서 수정으로 밀려 #6 이 `:621` 이다(#5 는 `:194` 그대로).
- 다른 에이전트가 찾은 낡은 문서 두 곳을 더한다.

| # | 문서 | 문서 내용 | 실제 |
|---|---|---|---|
| 8 | adventure `CLAUDE.md:86-87` | 끈 맵에는 그늘이 전혀 없다 — "Studio와 동일" | Studio 는 끈 맵의 따뜻한 터널 칸만 그늘이다. B-007 을 고치면 이 문장이 맞아지므로 문서는 그대로 둔다 |
| 9 | mapmaker `RULES.md` §16 '막힌 입력의 턴 카운터' 차이 | Studio 와 게임이 다르다 | 게임 `Main.gd` `_commit_turn_trace` 도 막힌 입력에 턴 +1·언두 기록을 쌓아 같다(Q-15). mapmaker 는 로컬 전용이라 메인 세션이 고친다 |

- 고칠 곳 나눔: Studio 문서(#5·#6·#7)는 Studio 작업 트리, adventure 문서(#1~#4, `shared/arch-edge-design.md`)는 adventure 작업 트리(`wt-bugfix/snowmen_adventure`)에서 고친다.

## 고친 내용 (문서, 2026-11-02)

엔진 동작은 바꾸지 않았다.

| # | 문서 | 고친 내용 |
|---|---|---|
| 1 | adventure `CLAUDE.md` '이동 / 밀기 / 굴리기' | `moveA_forceB` 도 플레이어·A 제자리, B 만 힘. 지금 코드에 없는 `execAction` 설명은 뺐다 |
| 2 | adventure `CLAUDE.md` 같은 곳 '눈사람 만들기' | "또는 쪼개진 size1이 기존 눈덩이 위로(§Q4)" 삭제 |
| 3 | adventure `CLAUDE.md` '아치' · `shared/arch-edge-design.md` 머리·`:60-61`·`:131` | 판정은 크기 기준(`size > archH`, Q-11). 상자·레이저는 h1 아치를 지난다 |
| 4 | adventure `CLAUDE.md` '턴 처리 순서' | 레이저 다음에 "(이동 턴만) 활성 목표면 즉시 클리어". 대기 턴에는 없다는 말도 더했다 |
| 5 | Studio `ENGINE_ALGORITHMS.md` §4.2 | "영혼 이동 발판 판정(발판 위면 무장, 같은 발판에 이미 무장돼 있으면 발동, 발판 밖이면 해제)" |
| 6 | Studio `ENGINE_ALGORITHMS.md` §16.4 | 가장자리 아치는 그 물체를 막을 때만 받침, 통과할 수 있는 아치는 받침이 아님 |
| 7 | Studio `HANDOFF.md` 머리·§5 | 2026-07 기준이라 엔진 규칙은 `ENGINE_ALGORITHMS.md` 가 최신이라는 표시. 낡은 네 줄(빔 위 골, 굴림 레이저, 밀기 정본, 쪼개기 눈사람)에 `[낡음]` 과 지금 규칙을 달았다 |
| 8 | adventure `CLAUDE.md:86-87` | B-007 을 고쳐 문장이 맞아졌으므로 그대로 둠 |
| 9 | mapmaker `RULES.md` §16 | 로컬 전용이라 메인 세션이 고친다 |

## 검증

고친 문구를 docs-vs-code 실험과 한 줄씩 대조했다. 실험은 작업 트리 엔진(B-004~009 수정 포함)으로 다시 돌렸다(scratch `docexp.mts`). 결과는 본 트리 `results.log` 와 같다(e03·e10a 는 B-008·B-007 로 바뀐 것이고 이 문서 줄과 무관).

| # | 실험(수열) | 결과 |
|---|---|---|
| 1 | e19 `R` | P2 (0,0)·o2 (0,1) 제자리, (0,2) 눈꽃 |
| 2 | e07a·e07b `R` | 쪼개진 반쪽은 눈사람을 만들지 않는다. e07a 위쪽 반쪽은 벽 너머라 못 밀고 제자리에 남는다. e07b 위쪽 반쪽은 이웃 o1 을 밀어낸다 |
| 3 | e05c `RR` | 상자가 h1 아치를 지나 (0,2) 로 간다 |
| 4 | e48 `WWR` | 녹는 중인 P1 이 볕 목표에 들어서 녹기 전에 클리어 |
| 5 | e20 `MWW` | 첫 W 에 무장, 둘째 W 에 교체 |
| 6 | e04a `R` | h1 아치에 막힌 o2 에 o1 을 밀면 S2 |
| 7 | e02a·e02c `U`, e31 `R`, e27b `R` | 사망 → 영혼 이동, 옮겨 간 몸이 목표면 클리어. 굴림 중 열린 빔이 플레이어를 맞힌다(판 전체 레이저). 간접 힘은 눈사람을 만들지 않는다(무반응) |

엔진 테스트 97/97(문서만 바꿨으므로 그대로).
