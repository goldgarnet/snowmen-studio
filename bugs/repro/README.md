# 사용자 보고 버그 4장면 (2026-11-02) — 재현 판

판 글은 mapmaker `tools/grid.ts` compose 문법(칸마다 5글자: 바닥 + 표식 + 물체). 코드는 CODES.txt.
현재(main, studio fff5e12) 엔진 출력은 mapmaker `tools/mm.ts trace <code> <수열> --boards` 로 확인했다.

| 장면 | 판 | 수열 | 지금 | 사용자가 기대하는 것 |
|---|---|---|---|---|
| 1 | screenshot1-triangle-cradle.txt (맵 '엇갈린 고리'/Twisting Ring 지형 + 에디터로 놓은 공) | R | 공 (2,4)가 굴러 ◥(2,6)에서 아래로 꺾여 (3,6) → ◢(4,6) 안에 멈춘 공을 친다 → 그 공은 왼쪽으로 꺾여야 하지만 (4,5)에 공이 붙어 있다 → 그런데도 (4,5) 공이 왼쪽으로 굴러 고리를 한 바퀴 돌아 (2,3)까지 간다 | "탄성충돌이 일어나는 버그" — 굴러온 공이 멈추고 (4,5)·(4,6)은 그대로 |
| 2 | screenshot2-roll-over-button.txt | R | 목표 위 공이 굴러 초록 버튼 (3,5)를 지나 (3,7)에서 멈춤, 플레이어는 목표 (3,2) — 상태 playing | 클리어. 사용자: "따뜻한 칸에 녹기 전의 눈덩이가 누르는 것도 인정이 되면 이것처럼 잠시 눌리는 것도 인정이 되어야 함" |
| 3 | screenshot3-snowman-h2-p3.txt | RD (R 은 눈꽃 먹어 P3) | D: 무반응(눈사람 안 생김) — 지금이 맞음 | 그대로 |
| 4 | screenshot4-snowman-h1-p2.txt | D | P2 가 s1 을 높이 1 아치 너머 s1(벽 받침) 위로 → S1 눈사람이 생김 | 눈사람이 생기면 안 된다(3 과 같이 무반응). 사용자: "플레이어가 눈사람을 만들 때 한 칸 뒤에서 다듬어 만든다. 크기 2 플레이어는 크기 1 아치를 못 통과하니까 눈사람이 생기면 안 돼" |

## 버그 보고

| 장면 | 보고 | 상태 |
|---|---|---|
| 1 | [B-001 삼각 칸 꺾임 탄성충돌](../B-001-triangle-cradle.md) | 고침 — Studio · JS · GDScript |
| 2 | [B-002 굴러 지나간 초록 버튼 클리어](../B-002-roll-over-green-button.md) | 고침 — Studio · JS · GDScript · 게임 연출 |
| 3·4 | [B-003 아치 너머 눈사람 — 플레이어 통과](../B-003-snowman-past-arch-player.md) | 고침 — Studio · JS · GDScript (장면 3 은 원래 맞음) |

네 장면은 Studio 시나리오 `test/engine/cases/user-bugs-2026-11.scenario.ts` 가 맵 코드 그대로 불러와 검증한다. adventure 는 골든 `shared/test-cases/bugs-2026-11.json`(`b001-scene1-cradle`·`b002-scene2-roll-over-button`·`b003-scene3-p3-h2-arch`·`b003-scene4-p2-h1-arch`)과 `game/test/test_turn_flags.gd`(게임이 맵 코드를 읽는 길)가 같은 판을 검증한다.

전체 버그 목록과 분류는 [../README.md](../README.md) 에 있다.
