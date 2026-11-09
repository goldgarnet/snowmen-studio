# 엔진 버그 목록 (2026-11-02)

**요약.** 사용자가 보고한 엔진 버그 3개는 Studio(정본)·adventure JS·GDScript 세 엔진에서 모두 고쳤다. B-001 은 삼각 칸 탄성충돌, B-002 는 굴러 지나가며 잠시 누른 초록 버튼, B-003 은 플레이어가 못 지나는 아치 너머 눈사람이다. 엔진 점검에서 찾은 버그도 고쳤다. 세 엔진 공통인 B-004~B-006 은 세 엔진 모두, Studio 에만 있던 B-007~B-009 는 Studio, adventure 쪽에만 있던 B-011·B-012 는 JS·GDScript·대조 도구를 고쳤다. B-010 은 문서만 고쳤다. B-013 은 2026-11-03 사용자가 선택지 ①로 정했다. 더 무거운 굴림은 삼각 칸 공과 함께 꺾여 굴러간다. Studio 는 고쳤고(브랜치 `fix/b013-heavier-triangle`), JS·GDScript 포트가 남았다. 2026-11-03 팀이 포탈과 주황 버튼·주황 벽을 게임에서 빼기로 했다(같은 브랜치에서 Studio 를 고침, `ENGINE_ALGORITHMS.md` §18). 그래서 포탈 결정 6건(B-014·B-018~B-022)과 주황 래치 B-023 을 닫았다. B-025 는 사용자가 현행 유지로 확인해 버그 아님으로 닫았다. 팀 결정을 기다리는 것은 5건(B-015·B-016·B-017·B-024·B-027)이다. 그중 마무리 검토에서 나온 새 항목 B-027 을 먼저 봐 주면 좋다. 굴림 도중 클리어(B-002)가 초록 버튼이 없는 맵에도 적용되어, 같은 굴림의 뒤 틱 레이저 사망보다 앞서는 문제다. B-026 은 버그가 아니다. 모든 변경은 두 저장소의 작업 트리(브랜치 `fix/engine-bugs-2026-11-02`)에 있고 아직 커밋하지 않았다. 남은 일은 채택 맵 `82d18363` 의 풀이 재등록(B-003)과 공개 맵 2개 알림(B-007)이다.

## 목록

상태 표기는 다음과 같다.

- **Studio 고침 · JS 고침 · GDScript 고침**: 그 엔진의 작업 트리에서 고쳤다.
- **결정 필요**: 팀 결정 전까지 코드를 그대로 둔다.
- **닫음 — 포탈 삭제 · 닫음 — 주황 버튼 삭제**: 2026-11-03 팀 결정으로 그 기능을 게임에서 빼서 더는 생기지 않는다. 분류 열은 `DECIDE → 기능 삭제`.
- **열림**: 아직 손대지 않았다. 지금은 해당 항목이 없다.
- **버그 아님**: 의도된 동작이다. 결정 항목이었다가 현행 유지로 정한 것은 분류 열이 `DECIDE → NOTBUG`.

`엔진` 열은 버그가 있던 엔진이다. `studio·JS·GD` 는 세 엔진이 같은 (틀린) 결과를 내던 공통 버그이고, `≠` 는 엔진끼리 결과가 달랐다는 뜻이다.

| 번호 | 제목 | 심각도 | 엔진 | 분류 | 상태 | 파일 |
|---|---|---|---|---|---|---|
| B-001 | 삼각 칸에 멈춘 공을 치면 출구의 공에 운동이 넘어가는 탄성충돌 | medium | studio·JS·GD | 사용자 보고 | Studio 고침 · JS 고침 · GDScript 고침 (더 무거운 굴림 쪽은 B-013 결정 ①로 Studio 고침) | [B-001-triangle-cradle.md](B-001-triangle-cradle.md) |
| B-002 | 굴러 지나가며 잠시 누른 초록 버튼을 클리어로 인정하지 않음 | high | studio·JS·GD | 사용자 보고 | Studio 고침 · JS 고침 · GDScript 고침 · 게임 연출 고침 (적용 범위는 B-027 결정) | [B-002-roll-over-green-button.md](B-002-roll-over-green-button.md) |
| B-003 | 플레이어가 못 지나는 아치 너머로 눈사람이 만들어짐 | medium | studio·JS·GD | 사용자 보고 | Studio 고침 · JS 고침 · GDScript 고침 (채택 맵 1개 풀이 재등록 남음) | [B-003-snowman-past-arch-player.md](B-003-snowman-past-arch-player.md) |
| B-004 | 두 열차가 같은 공을 동시에 흡수하면 그 공이 복제되고 선두 공이 사라짐 | medium | studio·JS·GD (셋 다 다르게 틀림) | FIX | Studio 고침 · JS 고침 · GDScript 고침 · 포탈 삭제로 더는 생기지 않음(2026-11-03) | [B-004-concurrent-merge-duplicates-ball.md](B-004-concurrent-merge-duplicates-ball.md) |
| B-005 | 아치 너머 눈사람 검사가 눈꽃으로 커진 크기를 안 봄 | medium | studio·JS·GD | FIX | Studio 고침 · JS 고침 · GDScript 고침 | [B-005-arch-build-ignores-flake-growth.md](B-005-arch-build-ignores-flake-growth.md) |
| B-006 | P2 가 s2+s1 을 밀 때 s1 이 지형에만 받쳐지면 무반응 | medium | studio·JS·GD | FIX | Studio 고침 · JS 고침 · GDScript 고침 | [B-006-p2-s2s1-terrain-backed-noop.md](B-006-p2-s2s1-terrain-backed-noop.md) |
| B-007 | 그림자 끈 맵의 따뜻한 터널 칸이 Studio 에서만 그늘 | medium | studio | FIX | Studio 고침 (JS·GDScript 는 원래 맞음) · 공개 맵 알림 남음 | [B-007-tunnel-shade-on-shadow-off-map.md](B-007-tunnel-shade-on-shadow-off-map.md) |
| B-008 | soul=off 맵의 M 을 Studio 풀이 재생만 실행 | low | studio | FIX | Studio 고침 (JS·GDScript 는 원래 맞음) | [B-008-soul-cycle-on-soul-off-replay.md](B-008-soul-cycle-on-soul-off-replay.md) |
| B-009 | 턴 도중 새로 생긴 물체가 이미 쓰인 motionId 를 받음 | low | studio | FIX | Studio 고침 (JS·GDScript 는 해당 없음) | [B-009-motion-id-collisions.md](B-009-motion-id-collisions.md) |
| B-010 | 규칙 문서가 엔진과 다른 곳 | low | 문서 | FIX(문서) | 문서 고침 (Studio·adventure). mapmaker `RULES.md` 는 메인 세션 | [B-010-docs-disagree-with-engine.md](B-010-docs-disagree-with-engine.md) |
| B-011 | 같은 턴에 생긴 두 눈사람의 나이: Studio 는 동갑, adventure 는 생성 순서 | low | JS·GD | PORT | JS 고침 · GDScript 고침 (Studio 는 원래 맞음) | [B-011-same-turn-snowman-age.md](B-011-same-turn-snowman-age.md) |
| B-012 | `diff-vs-studio.mjs` 기본 모드의 거짓 갈림 | low | 도구(adventure) | PORT(도구) | 도구 고침 · JS 고침 · GDScript 고침 (`initState` 나이 시계) | [B-012-diff-tool-age-false-positives.md](B-012-diff-tool-age-false-positives.md) |
| B-013 | 삼각 칸 안의 공을 더 무거운 공이 치면 아무 일도 없음 (+ B-001 뒤 출구 공이 있으면 넘김) | medium | studio·JS·GD | DECIDE → 사용자 결정 ① · 팀 결정 | Studio 고침 — 사용자 결정 ①(2026-11-03) · 팀 결정(2026-11-05, 삼각 칸 공 밀기) · JS·GDScript 포트 | [B-013-heavier-roll-into-triangle-ball.md](B-013-heavier-roll-into-triangle-ball.md) |
| B-014 | 금+포탈 칸이 무너지면 구멍+포탈이 남아 걸어 들어가도 안 빠짐 | medium | studio·JS·GD | DECIDE → 기능 삭제 | 닫음 — 포탈 삭제(2026-11-03 팀 결정) | [B-014-crack-portal-collapse.md](B-014-crack-portal-collapse.md) |
| B-015 | 볕 칸 위 눈꽃: Studio 는 따뜻한 칸, adventure 는 찬 칸 | medium | studio ≠ JS·GD | DECIDE → 팀 결정 | 고침 — 눈꽃 칸은 늘 찬 칸(2026-11-05) | [B-015-warm-flake-cell.md](B-015-warm-flake-cell.md) |
| B-016 | 대기·턴 끝 영혼 이동의 목표 판정이 녹기 뒤라 녹을 덮개가 인정 안 됨 | low | studio·JS·GD | DECIDE → 팀 결정 | 닫음 — 지금 동작 유지(2026-11-05) | [B-016-wait-turn-goal-check-after-melt.md](B-016-wait-turn-goal-check-after-melt.md) |
| B-017 | 턴 끝에 새로 열린 빔을 안 보고 목표 판정 → 빔 위 목표로 클리어 | low | studio·JS·GD | DECIDE → 팀 결정 | 고침 — 금 붕괴로 열린 빔은 그 턴에 맞힘(2026-11-05) | [B-017-turn-end-beam-before-goal.md](B-017-turn-end-beam-before-goal.md) |
| B-018 | 동시에 구르는 두 열차의 경합을 읽기 순서로 판정 | low | studio·JS·GD | DECIDE → 기능 삭제 | 닫음 — 포탈 삭제(2026-11-03 팀 결정) | [B-018-concurrent-trains-reading-order.md](B-018-concurrent-trains-reading-order.md) |
| B-019 | 포탈 '턴 시작 점유'가 칸 기준 | low | studio·JS·GD | DECIDE → 기능 삭제 | 닫음 — 포탈 삭제(2026-11-03 팀 결정) | [B-019-portal-start-occupancy.md](B-019-portal-start-occupancy.md) |
| B-020 | 붙어 있는 두 포탈이 몸을 되돌려 보냄 | low | studio·JS·GD | DECIDE → 기능 삭제 | 닫음 — 포탈 삭제(2026-11-03 팀 결정) | [B-020-adjacent-portals-bounce.md](B-020-adjacent-portals-bounce.md) |
| B-021 | 순간이동 도착 칸에서 눈꽃을 안 먹고 금을 무장하지 않음 | low | studio·JS·GD | DECIDE → 기능 삭제 | 닫음 — 포탈 삭제(2026-11-03 팀 결정) | [B-021-portal-arrival-effects.md](B-021-portal-arrival-effects.md) |
| B-022 | 포탈로 영혼 발판에 도착하면 대기를 두 번 해야 함 | low | studio·JS·GD | DECIDE → 기능 삭제 | 닫음 — 포탈 삭제(2026-11-03 팀 결정) | [B-022-soulplate-before-portal.md](B-022-soulplate-before-portal.md) |
| B-023 | 처음부터 덮인 주황 버튼이 0턴에 래치되지 않음 | low | studio·JS·GD | DECIDE → 기능 삭제 | 닫음 — 주황 버튼 삭제(2026-11-03 팀 결정) | [B-023-turn-zero-orange-latch.md](B-023-turn-zero-orange-latch.md) |
| B-024 | 열린 목표 위에서 시작하는 맵의 0턴 클리어를 쓰는 곳과 버리는 곳이 섞임 | low | studio 화면 ≠ 녹화·게임 | DECIDE → 팀 결정 | 고침 — 시작하자마자 클리어(2026-11-05) | [B-024-turn-zero-clear.md](B-024-turn-zero-clear.md) |
| B-025 | '레이저는 발사면 쪽에서 못 민다' 검사가 바로 앞 칸에만 있음 | low | studio·JS·GD | DECIDE → NOTBUG | 버그 아님 — 현행 유지(사용자 확인 2026-11-03) | [B-025-laser-emitting-face-chain.md](B-025-laser-emitting-face-chain.md) |
| B-026 | 레거시 삼각 블록을 Studio 만 반사로 처리 | low | studio ≠ JS·GD | NOTBUG | 버그 아님 | [B-026-legacy-triangle-block.md](B-026-legacy-triangle-block.md) |
| B-027 | 굴림 도중 정해진 클리어가 같은 굴림의 뒤 사망보다 우선 — 초록 버튼이 없는 맵에도 | medium | studio·JS·GD (B-002 뒤) | DECIDE → 팀 결정 | 고침 — 클리어가 정해지면 판이 멈춤(2026-11-05) | [B-027-clear-then-death-same-roll.md](B-027-clear-then-death-same-roll.md) |
| B-028 | 삼각벽은 항상 밀리는 판정 — 쪼갠 반쪽의 밀기도 꺾임. 같은 날 수정: 다리는 밖에서 보면 벽(둘째 규칙 되돌림), 줄의 어느 공이든 삼각 칸에서 꺾임 | medium | studio·JS·GD | DECIDE → 사용자 결정 | `261a2b2` 배포 · 같은 날 수정은 작업 트리 `fix/triangle-bend-any`(Studio·JS·GD, 커밋 전) | [B-028-triangle-always-push.md](B-028-triangle-always-push.md) |

## 분류

| 분류 | 뜻 | 할 일 |
|---|---|---|
| **사용자 보고** | 사용자가 보고하고 고칠 방향을 정한 버그(2026-11-02) | FIX 와 같은 순서로 고친다 |
| **FIX** | 명백한 버그. 문서·팀 결정·다른 엔진과의 일관성으로 기대 동작이 분명하고, 고쳐도 위험이 작다 | Studio 에서 고친다 → 문서 → 시나리오·골든 → JS·GDScript 포트 |
| **PORT** | Studio(정본)가 맞고 adventure JS·GDScript 가 다르다 | 포트만 고친다 |
| **DECIDE** | 규칙 의도가 갈린다 | 팀 결정 전까지 기록만 하고 코드는 그대로 둔다 |
| **NOTBUG** | 의도된 동작 | 기록만 |

## 팀이 정할 것

남은 것은 없다. 2026-11-05 팀 결정으로 B-015·B-016·B-017·B-024·B-027 을 닫았다.

이 목록에서 뺀 것:

- **B-013**: 2026-11-03 사용자가 ①(함께 굴러감)으로 정했다.
- **B-014·B-018~B-022**(포탈), **B-023**(0턴 주황 래치): 2026-11-03 팀 결정으로 포탈과 주황 버튼·주황 벽을 게임에서 빼서 닫았다.
- **B-025**(레이저 발사면 쪽 사슬 밀기): 사용자가 현행 유지로 확인했다(2026-11-03). 버그 아님.

## 포탈·주황 삭제 (2026-11-03 팀 결정)

포탈(`isPortal`)과 주황 버튼·주황 벽(`isOrangeButton`·`isOrangeWall`, 래치 `orangePressed`)을 게임에서 뺐다. 노란 버튼·노란 벽·초록 버튼은 그대로다. Studio 는 브랜치 `fix/b013-heavier-triangle` 에서 고쳤다(엔진·에디터 팔레트·그리기·카탈로그·문서). 맵 코드 형식은 그대로다. 디코더는 그 비트를 읽고 버리고(그 칸은 평범한 바닥), 인코더는 0 을 쓴다(`ENGINE_ALGORITHMS.md` §18).

**팀 맵 영향** — 스냅샷 `maps-2026-11-02.json`(맵 283개, 등록 풀이 281개 재생). 운영 DB 는 손대지 않았다.

| 맵 | 출제자 · 상태 | 쓰던 것 | 등록 풀이 | 포탈·주황 없이 |
|---|---|---|---|---|
| 「CLAUDE-1」 | 김정훈 · 반려 | 포탈 2 | 3개 중 김정훈 22수가 더는 클리어하지 않음(17수째 gameover). 홍은기 31수·정은후 41수는 포탈을 안 써서 그대로 클리어 | 풀림. 최단 17수(전과 같음) |
| 「CLAUDE-1-FIX-FIX」 | 김정훈 · 반려 | 포탈 2 | 없음 | 풀림. 최단 17수(전 18수) |
| 「one way」 | 정은후 · 보류 | 포탈 2 | 2개 모두 더는 클리어하지 않음(김정훈 87수, 정은후 44수 — 끝까지 두어도 진행 중) | 풀림. 최단 44수(전 38수) |
| 「Q-06 굴러가던 눈덩이와 포털」 | 김정훈 · 검토중 | 포탈 2 | 1수 `R`(원래 클리어 아님). 공이 순간이동하지 않고 곧게 굴러가 판이 달라짐 | 시연할 것이 없어짐 |
| 「Maze」 | 정은후 · 보류 | 주황 버튼 6, 주황 벽 1(목표 칸) | 정은후 48수는 그대로 클리어(판도 같음) | 목표를 막던 벽이 바닥이 되어 최단 16수(전 48수). 퍼즐 의도가 사라짐 |

등록 풀이 281개 중 결과나 판이 바뀌는 것은 위 4개(「CLAUDE-1」 1, 「one way」 2, 「Q-06」 1)뿐이다. 나머지 맵의 풀이 274개는 판·결과·끝난 수가 모두 같다. 같은 브랜치의 B-013 으로 바뀌는 등록 풀이도 0개다.

**검증**: `npm run test:engine` 148 통과(삭제 기능 시나리오 8개를 빼고 `legacy-portal-orange-codes.scenario.ts` 7개를 더함), `npx tsc -b`·`npm run lint`·`npm run build`·`npm run test:clears`·`npm run test:nav` 통과. 무작위 차분 1.1만 판(임시 도구 `/tmp/claude-1000/rmpo/rdiff.cjs`): 포탈·주황이 없는 판은 삭제 전·후 엔진 결과가 프레임까지 같고, 있는 판은 그 필드를 지운 판과 같으며, 옛 인코더 코드의 왕복도 맞다(차이 0).

**adventure (끝남, 2026-11-03)**: 같은 브랜치에서 JS·GDScript 엔진과 `levelCode.js`·`level_io.gd` 디코더(비트를 읽고 버림, 0 을 씀), 게임 화면 그리기, `levels/_debug.json`·`_showcase.json` 과 생성 도구를 고쳤다. 골든 중 포탈·주황을 쓰던 9케이스(`audit-q-06-a`, `b004-dup-a`·`b004-dup-a-flipped`·`b004-equal-mass-meets-absorbed-ball`, `mechanics-v5` 의 `orange-latch-stays-open`·`orange-wall-blocks-before-latch`·`portal-player-teleports`·`portal-destination-occupied`·`portal-rolling-ball`)는 지우거나 예전 코드 호환 케이스(`shared/test-cases/legacy-portal-orange.json`)로 바꿨다. 골든 267/267, diff-vs-studio 갈림 0, Godot CI 18단계 통과.

## 배포 전후에 할 일 (메인 세션)

1. 커밋·푸시. Studio·adventure 작업 트리의 같은 브랜치를 사용자 확인 뒤에 올린다. adventure 작업 트리의 `editor/node_modules` 는 본 트리로 가는 심볼릭 링크(untracked)라 커밋하지 않는다.
2. **B-003**: 채택 맵 `82d18363`(김정훈, 6×4, 제목 없음)의 등록 풀이 27수가 더는 클리어하지 않는다.
   - 출제자 김정훈이 배포 뒤 직접 다시 등록하기로 했다(2026-11-02).
   - 31수 풀이로 다시 등록하거나, 관리자 댓글대로 아치를 지운 판으로 고친다. 아치를 지운 판에서는 옛 풀이가 그대로 클리어한다.
   - 그 뒤 mapmaker `CORPUS.md` 의 최적 턴(25 → 31)과 난이도를 갱신한다.
3. **B-007**: 공개 맵 'Split & Push'(accepted)·'Split & Push (Tight)'(held)의 작성자와 등록 풀이 작성자(정은후)에게 알린다. 등록 풀이는 그대로 클리어한다.
4. mapmaker `RULES.md`(로컬 전용)에 반영할 곳:
   - §7 삼각 칸의 꺾인 묶음(B-001)과 B-013 결정 ①(더 무거운 굴림은 꺾인 묶음과 함께 굴러감, 2026-11-03)
   - §12 굴림 중 클리어(B-002)와 B-027 결정
   - Q-03 확장 — 미는 플레이어 크기(B-003)와 눈꽃으로 커지는 크기(B-005)
   - §2·§16 터널 그늘(B-007), §3·§16·§17 M(B-008), §16 막힌 입력 턴 카운터(B-010 #9), §17 trace 주의(B-009)
   - 포탈·주황 버튼·주황 벽 삭제(2026-11-03)와 그 규칙 절(포탈 도착·래치·주황 그늘), §16 의 포탈·주황 의심 항목(B-014·B-018~B-023 닫음), B-025 현행 유지
5. **포탈·주황 삭제(2026-11-03)**: 팀 맵에 미치는 영향은 위 '포탈·주황 삭제' 절에 있다. 운영 DB 의 맵은 손대지 않았다. 출제자에게 알릴지는 메인 세션이 정한다.

## 고친 곳과 고정한 테스트

자세한 내용은 각 파일의 '고친 내용'·'포트'·'검증'에 있다.

| 번호 | Studio | adventure JS (`editor/src/rules/engine.js`) | GDScript (`game/rules/engine.gd`) |
|---|---|---|---|
| B-001 | `roll.ts` `getConsecutiveObjects` — 장애물 묶음을 삼각 칸에서 꺾어 셈 | `consecutiveObjects`·`rollBalls` | `_consecutive_objects`·`_roll_balls` |
| B-002 | `turn.ts` `executeTurn` — 굴림 틱마다 목표 판정 | `makeTickRecorder`·`applyMoveWithTrace` | `apply_move_with_trace`. 연출 `game/scripts/Main.gd` `_goal_drawn_open`(갤러리 #38) |
| B-003 | `push.ts` `doBuildSnowman` — 미는 플레이어도 A→B 경계 통과 | `doBuild` | `do_build`. 연출은 Q-03 그대로(갤러리 #39) |
| B-004 | `roll.ts` `rollBalls` — 한 공은 한 틱에 한 열차만 | `rollBalls`(+ 기록 열쇠 = 물체) | `_roll_balls`(`_merged_has`) |
| B-005 | `push.ts` `doBuildSnowman` — 눈꽃을 먹은 크기로 검사 | `doBuild` | `do_build` |
| B-006 | `push.ts` P2 'C 빈칸' 분기 — s2+s1 지형 받침 | `resolvePush` | `resolve_push` |
| B-007 | `shadow.ts` `clearShadows`, `turn.ts` `endOfTurn`, `utils/game.ts` `newGameState` | (원래 맞음) | (원래 맞음) |
| B-008 | `turn.ts` `cycleSoul` 이 `soulSwapEnabled` 를 봄 | (원래 맞음) | (원래 맞음) |
| B-009 | `turn.ts` `ensureMotionIds` — 턴 안에서 겹치지 않는 id | (해당 없음) | (해당 없음) |
| B-011 | (원래 맞음) | 나이 = 행동 도장 | 같음 |
| B-012 | — | `initState` 나이 시계 + `editor/test/diff-vs-studio.mjs` 기본 나이 0 | `init_state` 나이 시계 |
| B-013 | `roll.ts` `rollBalls` 더 가벼운 장애물 분기 — 꺾인 묶음을 구성원마다 자기 방향으로 흡수 (2026-11-03) | 포트 남음 | 포트 남음 |

고정한 테스트는 다음과 같다.

- Studio 시나리오: `test/engine/cases/user-bugs-2026-11.scenario.ts` 21개(B-001~003), `found-bugs-2026-11.scenario.ts` 17개(B-005~009 — B-004 의 3개는 포탈 삭제로 지움), `b013-heavier-triangle.scenario.ts` 48개(B-013, 2026-11-03 — 꺾인 길 위 포털 판은 지움), `legacy-portal-orange-codes.scenario.ts` 7개(포탈·주황 삭제, 2026-11-03).
- Studio 테스트 워크벤치: P0-26~P0-28·P0-30~P0-32, P1-15a·P1-15b, P2-06(예전 맵 코드). P0-24(포털)·P0-29(B-004)·P1-01(주황 래치)는 지웠다.
- adventure 골든: `shared/test-cases/bugs-2026-11.json` 39케이스. 기대값은 고친 Studio 엔진으로 만들고 JS 결과와 대조했다.
- adventure 프레임·연출 검사: `editor/test/tick-simulation.mjs`·`game/test/test_turn_flags.gd`(B-001·B-002·B-004 프레임), `game/test/test_main_contract.gd` `_test_rolled_button_clear_and_arch_build_presentation`(B-002·B-003 연출), 갤러리 #38·#39.

## 마지막 검증 (2026-11-02, 마무리 검토 반영 뒤)

- **Studio**: `npm run test:engine` 98 통과·0 실패, `npx tsc -b` 통과. 바꾼 TS 두 파일(카탈로그·시나리오)은 eslint 도 통과했다.
- **adventure JS**: `editor` 에서 `npm test` 통과. 골든은 221/221(`bugs-2026-11` 39)이고, turn-flags·tick-simulation 과 나머지 검사도 통과했다.
- **`diff-vs-studio.mjs`**: 작업 트리 Studio 로 새로 만든 번들(`STUDIO_BUNDLE`)로 돌렸고, 네 조합 모두 갈림 0건이다.
  - 기본 모드 400케이스(시드 12345)
  - 기본 모드 4000케이스(시드 777)
  - `V5=1 SHADOW=mix TERRAIN=1 FOCUS=1` 4000케이스(시드 2026)
  - `V5=1 SHADOW=mix TERRAIN=1 RANDOM_AGE=1` 3000케이스(시드 3333)
- **Godot 4.4 headless**: CI(`.github/workflows/ci.yml`)의 Godot 단계를 모두 통과했다. 항목은 임포트, 컴파일 검사, 골든 221/221, 그림자, 레벨 코드, 원근 격자, 캠페인, Main 계약 946/946, 턴 플래그, 갤러리 39항목(검사 95개), PNG 4종, 컷씬, 그리기 smoke, PCK 내보내기다. `SCRIPT ERROR` 는 없었다.
- **여섯 엔진 대조**: 본 트리와 작업 트리의 Studio·JS·GD 를 같은 판으로 돌렸다. 판은 분류 단계의 재현 판 70개, 사용자 장면 4개, 검토 재현 7개다. 작업 트리의 세 엔진은 모든 판에서 결과가 같다. 예외는 원래 엔진끼리 다르게 기록된 세 항목뿐이다: B-015(X01), B-024(X06), B-026(X05).

## 마무리 검토 반영 (2026-11-02)

1. **B-003 으로 채택 맵 `82d18363` 의 등록 풀이가 깨짐.** 사용자 결정대로라 엔진은 그대로 둔다. 세 엔진에서 다시 확인하고, B-003 '영향'에 할 일과 아치를 지운 판이라는 대안을 적었다.
2. **B-001 뒤 더 무거운 굴림의 비단조.** B-013 '덧붙임'과 B-001 '확인할 점'에 재현 4판을 적고 결정 항목에 넣었다. `ENGINE_ALGORITHMS.md` §9.3·`TICK_SIMULATION_MECHANICS.md` 에도 한 줄씩 적었다. 코드는 그대로다. 2026-11-03 B-013 결정 ①로 고쳤다. 출구 공이 없어도 함께 굴러가므로 비단조가 없어졌다.
3·5. **adventure 연출 문서가 `Main.gd` 와 어긋남.** 다음 문서를 `Main.gd` 동작대로 고쳤다. 클리어 프레임부터 목표를 연 채 그리고, 도착 빛은 굴림이 끝난 뒤 켠다.
   - `CLAUDE.md` §8 25번 연출 줄
   - `shared/animation-contract.md` ⑦·회귀 테스트 목록·만들기 실패 단락
   - `shared/tick-simulation-spec.md` §5.5
   - 갤러리 #38·#39 와 검증 함수 이름도 적었다.
4. **B-002 가 초록 버튼이 없는 맵에도 적용됨.** 결정 항목 B-027 을 새로 만들었다. 지금 동작은 Studio 시나리오와 골든 `b002-no-green-clear-stands-later-laser` 로 고정했다. 다음 문서에 '같은 순간 안의 순서'라는 범위를 적었다.
   - `ENGINE_ALGORITHMS.md` §12·§15
   - `TICK_SIMULATION_MECHANICS.md`
   - P1-08(문서·카탈로그)·P0-27
   - adventure `CLAUDE.md` 턴 처리 순서, `tick-simulation-spec.md` §5.5
6. **P0-08 이 B-003 과 모순.** 미는 플레이어를 P1 으로 바꾸고, P2·P3 무반응 변형을 적었다. 카탈로그 P0-08 문구도 고쳤다.
7. **버그 문서가 이 PC 의 임시 스크립트를 근거로 듦.** 아래 '재현과 검증 도구'에 팀이 재현하는 방법과 임시 도구의 성격을 나눠 적었다.

## 버그 아님 — 파일 없음

- 터널·아치는 레이저 빔을 막지 않고, 빔은 삼각 칸까지 맞힌다(RULES §16 의심 8). 근거: `ENGINE_ALGORITHMS.md` §12, `test/GAME_IMPLEMENTATION_CASES.md` P0-25, RULES §2.
- 막힌 입력도 화면 턴·언두 기록이 쌓인다. Q-15 현행이고, 게임 `Main.gd` `_commit_turn_trace` 도 같다. RULES §16 의 '차이' 서술만 낡았다(B-010 #9).
- 거리·나이가 같은 눈사람 사이의 영혼 이동은 읽기 순서로 정해진다. 그래서 판을 뒤집으면 다른 몸으로 간다. `ENGINE_ALGORITHMS.md` §14 에 적힌 동작이다(대칭 검사 대조 실험 108건이 모두 이 규칙).
- `justTeleported` 플래그가 `cleared`·`gameover` 로 끝난 상태에만 남는다. 다음 턴이 없으니 해가 없다. 포탈 삭제(2026-11-03)로 이 플래그는 없어졌다.
- 저작 배치나 포탈로 눈꽃 위에 놓인 s1 을 부수면 눈꽃이 하나로 겹쳐 눈 질량 1 이 사라진다. 포탈 경우는 B-021(도착 칸 눈꽃) 때문에 생겼고 포탈 삭제로 없어졌다. 저작 배치 경우는 남는다.
- 맵 코드 왕복이 크기 33 에서 어긋난다. 에디터 상한이 30 이라 실제로는 생기지 않는다.
- 0턴 경계 세 가지(B-023 조사 중 확인)
  - 시작부터 금 위에 있는 물체는 걸어 올라선 경우와 같은 턴에 무너진다.
  - 시작부터 눈꽃 위에 있는 물체는 눈꽃을 안 먹는다(RULES §13).
  - 시작부터 구멍 위에 있는 물체는 에디터가 막는다.
- 무한 루프 표시(Q-13)가 붙은 굴림 266건은 틱 한도를 40배로 늘려도 계속 돌았다. 표시가 맞다.

## 옛 번호 대응 (`found/` → B)

| 옛 번호 | 새 번호 | | 옛 번호 | 새 번호 |
|---|---|---|---|---|
| SYM-01 | B-018 | | R-04 | B-014 |
| SYM-02 · X-08 | B-004 | | R-05 | B-023 |
| SYM-03 · C-04 | B-009 | | R-06 | B-017 |
| C-01 | B-013 | | R-07 | B-022 |
| C-02 | B-016 | | R-08 | B-025 |
| C-03 | B-020 | | R-09 | B-005 |
| R-01 | B-006 | | R-10 | B-010 |
| R-02 | B-019 | | X-01 | B-015 |
| R-03 | B-021 | | X-02 | B-007 |
| X-03 | B-011 | | X-04 | B-008 |
| X-05 | B-026 | | X-06 | B-024 |
| X-07 | B-012 | | | |

## 재현과 검증 도구

### 팀이 재현하는 방법 — Studio

모든 버그 파일에 맵 코드와 수열이 있다.

1. Studio 맵 에디터의 '레벨 코드 불러오기'에 맵 코드를 붙여 넣는다.
2. 시뮬레이터에서 수열대로 둔다. `U`·`D`·`L`·`R` 은 방향키, `W`(대기)는 스페이스, `M`(영혼 순환)은 M 키다. 시뮬레이터에서는 W·A·S·D 키도 방향 이동이라, 수열의 `W` 를 W 키로 누르면 위로 간다.

판 글(`6 4 sun=left shadow=off …`)은 mapmaker `tools/grid.ts` 의 compose 문법으로, 같은 판을 글로 적은 것이다.

### 저장소에 있는 검증 — 누구나 다시 돌릴 수 있다

- Studio: `npm run test:engine`(시나리오 `test/engine/cases/*.scenario.ts`), `npx tsc -b`, 테스트 워크벤치(`src/test-cases/catalog.ts`).
- adventure:
  - `editor` 의 `npm test` — 골든 `shared/test-cases/*.json` 과 프레임 검사.
  - `editor/test/diff-vs-studio.mjs` — Studio 번들과 무작위 대조. 번들을 만드는 esbuild 명령은 파일 머리 주석에 있다.
  - Godot headless `game/test/runner.gd`·`test_turn_flags.gd`·`test_main_contract.gd` 등. CI 단계와 같다.

### 이 PC 의 임시 도구 — 커밋 안 함

`/tmp/claude-1000/bugfix/` 아래 스크립트는 이 PC 에만 있다. 팀원 PC 에는 없고, 이 PC 도 재부팅하면 사라질 수 있다.

- 버그 파일의 '무작위 차분 N판'·'등록 풀이 281개 재생'·'스냅샷 N맵' 같은 숫자는 이 도구로 낸 기록이다.
- 팀이 다시 돌릴 수 있는 근거는 위의 맵 코드·수열과 저장소의 시나리오·골든이다.

저장소로 옮기지 않기로 했다. 이유는 셋이다.

- 등록 풀이 재생과 스냅샷 집계는 mapmaker 의 팀 맵 스냅샷(`data/maps-2026-11-02.json`, 로컬 전용·커밋 금지)을 읽는다.
- 세 엔진 대조는 두 작업 트리 경로와 이 PC 의 Godot 바이너리에 묶여 있다.
- 같은 역할을 하는 도구가 저장소에 이미 있다: 골든, `diff-vs-studio.mjs`(`FOCUS`·`V5`·`RANDOM_AGE` 포함).

단계별 위치는 참고로만 적는다.

- `triage/` — 분류·재확인. `run.sh`·`v.mts`(세 엔진 대조), `all.txt`(재현 판 70개), `impact.cjs`(풀이 재생), `mid.mts`(motionId 확인), `proto/`·`proto.patch`(FIX 시제품), `found-backup/`(옛 `found/` 사본).
- `fix-b004-010/` — B-004~B-010 고치기. `split_hunks.py`·`variants/`(버그별 사본), `impact.cjs`·`rdiff.cjs`·`mid-fuzz.cjs`·`docexp.mts`.
- `port-js/`·`port-gd/` — 포트. `make-golden.mjs`(골든 생성기), `ci-godot.sh`(CI 의 Godot 단계).
- `review1/` — 검토.
- `finalize/` — 마무리.
  - `allspecs.mjs`: 여섯 엔진 대조.
  - `items.mjs`: 검토 항목 재현.
  - `make-golden.mjs`: 골든 생성기 사본. `b002-no-green-…` 를 더했다.
  - `featcount.mjs`: B-027 스냅샷 집계.
- `/tmp/claude-1000/b013/` — B-013 결정 반영(2026-11-03). `pre/`(고치기 전 `e359b23` 의 `src` 사본), `wtlog/`(꺾인 묶음 흡수를 기록하는 계측 사본).
  - `impact.cjs`: 등록 풀이 재생.
  - `rdiff.cjs`: 무작위 차분.
  - `bfs-impact.cjs`·`walk-impact.cjs`: 맵 상태 탐색.
  - `golden-check.cjs`: 골든 영향.

- `/tmp/claude-1000/rmpo/` — 포탈·주황 삭제(2026-11-03). `b013-src/`(삭제 전, B-013 만 고친 `src` 사본), `lib.cjs`(세 엔진 `pre`·`b013`·`wt` 불러오기).
  - `features.cjs`: 스냅샷에서 포탈·주황을 쓰는 맵 찾기.
  - `impact.cjs`: 등록 풀이 재생(세 엔진, 원인을 B-013 과 삭제로 나눔).
  - `rdiff.cjs`: 무작위 차분(포탈·주황 없는 판은 삭제 전·후가 같은지, 있는 판은 그 필드를 지운 판과 같은지, 맵 코드 왕복).
  - `bfs.cjs`·`play.cjs`: 최단 풀이 탐색·수열 재생. `segfuzz*.cjs`: 한 틱에 열차가 둘 이상인 경우 세기.

B-013 은 결정 ①로 정했다. 골든 221케이스의 입력을 고치기 전·후 Studio 로 돌려 보니 바뀌는 케이스가 없다. 그래서 포트할 때 B-013 케이스만 더하면 된다. B-027 결정이 골든 기대값을 바꾸면 골든을 다시 만들어야 한다. 그때는 `finalize/make-golden.mjs` 를 쓰거나 같은 일을 하는 도구를 저장소에 둔다. 아직 정하지 않았다.
