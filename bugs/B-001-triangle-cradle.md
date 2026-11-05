# B-001 삼각 칸에 멈춘 공을 치면 출구의 공에 운동이 넘어가는 탄성충돌 (요람)

- **심각도**: medium
- **어느 엔진**: studio · JS · GDScript (셋 다 같은 결과 — JS 는 같은 맵 코드로 실행해 확인, GDScript 는 같은 코드 구조)
- **상태**: 고침 — Studio · adventure JS · GDScript (브랜치 `fix/engine-bugs-2026-11-02`, 두 저장소의 작업 트리). 더 무거운 굴림의 경우는 B-013 에서 사용자 결정 ①(2026-11-03, 함께 굴러감)으로 정해 Studio 를 고쳤다(아래 '확인할 점')
- **출처**: 사용자 보고 2026-11-02 첫 번째 사진 ("오른쪽으로 밀면 탄성충돌이 일어나는 버그")

## 증상

굴러온 공이 삼각 칸 안에 멈춰 있는 공을 친다. 그 공의 거울 출구 쪽 칸에는 다른 공이 붙어 있다.
붙어 있는 두 공은 한 덩어리(질량 2)이므로 질량 1 인 굴러온 공은 멈춰야 한다.
그런데 실제로는 삼각 칸 공이 운동을 받고, 다음 틱에 꺾이면서 옆 공을 다시 같은 질량으로 쳐서 옆 공이 굴러간다.
뉴턴의 요람처럼 운동이 두 번 넘어간다.

## 재현

판 글(mapmaker `tools/grid.ts` compose 문법) — `repro/screenshot1-triangle-cradle.txt`. 맵 '엇갈린 고리'(Twisting Ring) 지형에 에디터로 공을 놓은 판이다. 수열 `R`.

```text
7 7 sun=left shadow=off soul=off
.    .    .◤   .    .◥   .    .
.    .    .g   .    .    .    .
.◤   .    .    . P2 .go1 .    .◥
.    .    .    .    .G   .    .
.◣   .    .    .    .    . o1 .◢o1
.    .    .    .    ~g   .    .
.    .    .◣   .    ~◢   .    .
arch top 2 2 1
arch top 2 3 1
arch top 2 4 1
arch top 5 2 1
arch top 5 3 1
arch top 5 4 1
arch left 2 2 1
arch left 3 2 1
arch left 4 2 1
arch left 2 5 1
arch left 3 5 1
arch left 4 5 1
```

맵 코드 (`repro/CODES.txt`):
`D806VOTGJWbyoY63oAdJ9yVuK1iQCpPojzZbXCPVALxq1BkGpcO88HH9LhqWDWBXjY21Rte2d47j4lps3sdh4Gf5s0KlwUHC1URojMVqKFtyGvMNwpxmm6z1vHyYKYrgfpxawMwRjk`

공 (2,4)가 밀려 (2,5) → ◥(2,6)에서 아래로 꺾여 (3,6) → ◢(4,6) 안에 멈춘 공을 친다. ◢ 는 아래 → 왼쪽으로 꺾고, 그 출구 (4,5)에 공이 붙어 있다.

| | 프레임 | 결과 |
|---|---|---|
| 고치기 전 (studio fff5e12 · adventure JS 같음) | `mrmrmriimrmrmrmrmrmrmrmrmrmrt` — `impact` 두 번 연속 | (4,5) 공이 왼쪽으로 굴러 고리를 한 바퀴 돌아 (2,3)에 멈춤. (3,6)·(4,6) 공 |
| 고친 뒤 (studio) | `mrmrmrt` — `impact` 없음 | 굴러온 공이 (3,6)에서 멈춤. (4,5)·(4,6) 그대로 |

고치기 전 엔진 출력(최종 판):

```text
 2 .◤   .    .    . o1 .gP2 .    .◥
 3 .    .    .    .    .G   .    . o1
 4 .◣   .    .    .    .    .    .◢o1
```

고친 뒤:

```text
 2 .◤   .    .    .    .gP2 .    .◥
 3 .    .    .    .    .G   .    . o1
 4 .◣   .    .    .    .    . o1 .◢o1
```

## 원인

같은 질량 넘김(`impact`)을 판단할 때 장애물 묶음을 **곧은 방향으로만** 셌다(아래 줄 번호는 고치기 전 `fff5e12` 기준).

- `src/engine/roll.ts:198` — `getConsecutiveObjects(level, target, lead.dir)` 가 굴러온 방향(아래)으로만 센다.
- `src/engine/roll.ts:338-349` — 삼각 칸 공은 아래 변이 막혀 거기서 끊긴다. 그래서 묶음 = ◢ 공 하나 = 질량 1 = 굴러온 공과 같은 질량.
- `src/engine/roll.ts:219-224` — 같은 질량이라 ◢ 공에 운동을 넘긴다(`dir: lead.dir`).
- 다음 틱 ◢ 공이 왼쪽으로 꺾여 출구의 (4,5) 공을 치고, 이 둘도 질량 1 대 1 이라 또 넘긴다.

붙어 있는 공들은 한 덩어리라는 질량 규칙이 꺾인 방향에서 새어 나갔다.

포트도 같은 구조다: adventure `editor/src/rules/engine.js:799`·`:825`·`:903-914`(`consecutiveObjects`), `game/rules/engine.gd:916`·`:1007-1016`(`_consecutive_objects`).

## 기대 동작과 근거

- 사용자 지시(2026-11-02): 이 장면의 탄성충돌은 버그다. 굴러온 공이 멈추고 (4,5)·(4,6)은 그대로다.
- 굴림 질량 규칙(adventure `CLAUDE.md` §3 '굴리기 충돌', mapmaker `RULES.md` §7): 충돌한 무리의 질량은 이어진 물체 전부의 크기 합이다. 무리가 무거우면 멈추고, 같으면 무리가 굴러간다.
- RULES §7 "삼각 칸 안의 멈춘 공: 같은 질량에 맞으면 다음 틱 거울 방향으로 나감" — 출구가 비어 있을 때는 그대로 유지한다.
- Q-04(열차는 삼각 벽에서 한 공씩 꺾인다) · B-06(굴림 충돌은 막힌 경계를 넘지 않는다)과 어긋나지 않는다. 막힌 다리 너머는 여전히 세지 않고, 꺾이는 쪽(열린 출구)만 잇는다.

## 고친 내용 (Studio)

`src/engine/roll.ts` `getConsecutiveObjects`: 장애물 묶음을 셀 때, 구성원이 삼각 칸에 있으면 반사표(`TRI_DEFLECT`)대로 방향을 바꿔 그 출구 쪽으로 이어서 센다. 구성원마다 그 칸을 지나는 방향을 갖고, 같은 질량 넘김은 각자의 방향으로 운동을 준다.

- 출구에 공이 붙어 있으면 묶음이 무거워져 굴러온 공이 멈춘다(장면 1).
- 출구가 비면 예전처럼 삼각 칸 공 혼자 다음 틱 거울 방향으로 나간다.
- 질량이 같으면 묶음 전체가 함께 출구 쪽으로 굴러간다.
- 묶음이 더 가벼우면 예전처럼 멈춘다. 꺾인 묶음은 곧은 방향으로 한꺼번에 밀릴 수 없기 때문이다(삼각 칸 공의 곧은 길은 막힌 다리).
- 출구 쪽에 눈덩이가 아닌 것이 붙어 있으면 곧은 줄처럼 그냥 멈춘다(`impact` 없음, 최종 위치는 예전과 같음).
- 고리 모양으로 다시 돌아오는 묶음은 한 번 센 칸에서 멈춘다.

문서: `ENGINE_ALGORITHMS.md` §9.3·§9.4, `TICK_SIMULATION_MECHANICS.md` §4·§6, `test/GAME_IMPLEMENTATION_CASES.md` P0-26.

## 검증

- 시나리오 `test/engine/cases/user-bugs-2026-11.scenario.ts` 의 `B-001 …` 6개는 다음과 같다.
  - 장면 1(맵 코드 그대로)
  - 출구에 공이 붙은 질량 2 묶음
  - 빈 출구에서는 거울 출구로 나감
  - 같은 질량 묶음 전체 이동
  - 곧은 공 + 삼각 칸 공 + 출구 공(질량 3)
  - 출구의 눈사람
- 고치기 전 엔진으로 돌리면 빈 출구 경우를 뺀 5개가 실패한다.
- 테스트 워크벤치 사례 P0-26.
- 무작위 대조(scratch, 고치기 전 vs 고친 뒤): 삼각 칸 공을 치는 판 6000개(모두 다른 판) 중 847개의 결과가 달라졌다.
  - 845개는 roll.ts 수정 하나로만 설명되고, 표본을 직접 보니 위 규칙대로였다.
  - 나머지 2개는 둘째 수에서 P3 가 아치 너머로 만드는 경우라 B-003 수정이 함께 작용했다.
- 같은 묶음의 다른 판 4000개 중 최종 판은 같고 프레임만 다른 457개는 모두 `impact` 가 줄어든 경우였다. 늘어난 경우는 없었다.
- 넓은 무작위 대조 2종(서로 다른 판 15000개씩)에서 roll.ts 때문에 달라진 9개(1개는 B-002 와 함께)도 표본을 보니 모두 위 규칙대로였다.

## 영향

- 팀 맵 스냅샷(mapmaker `data/maps-2026-11-02.json`, 등록 풀이 281개 재생): 결과가 바뀐 풀이는 0개다.
- 삼각 칸과 눈덩이가 함께 있는 채택 맵 11개 가운데, 처음부터 삼각 칸 안에 공이 놓인 맵은 없다.
- 그래서 영향은 플레이 중에 공이 삼각 칸에 멈춘 뒤 같은 질량으로 맞는 경우뿐이다. 그런 수를 쓰는 맵은 풀이를 다시 재생해 보는 것이 안전하다.

## 포트 (adventure, 2026-11-02)

- JS `editor/src/rules/engine.js` `consecutiveObjects`(구성원 = `{ obj, dir }`, 삼각 칸에서 `TRI_DEFLECT` 로 꺾음)·`rollBalls` 의 같은 질량 넘김(`dir: m.dir`).
- GDScript `game/rules/engine.gd` `_consecutive_objects`·`_roll_balls` 같은 변경.
- 골든 `shared/test-cases/bugs-2026-11.json` 의 `b001-*` 6케이스(장면 1 맵 코드 포함)와 `editor/test/tick-simulation.mjs`·`game/test/test_turn_flags.gd` 의 프레임 검사. 장면 1 은 세 엔진의 판·프레임이 같다.

## 확인할 점 — 더 무거운 굴림이 꺾인 묶음을 칠 때 (B-013 과 함께 결정)

**2026-11-03 정함 — B-013 선택지 ①.** 더 무거운 굴림이 더 가벼운 꺾인 묶음을 치면 이제 함께 굴러간다. 묶음은 같은 질량 넘김과 같은 길로 나가고, 굴러온 공은 삼각 칸으로 따라 들어와 꺾인다.

- 아래 표에서 ◥ 공 혼자인 두 판이 바뀐다. s2 판은 (4,4) s2·(5,4) s1 으로, 열차 판은 (3,4)·(4,4)·(5,4) 로 함께 내려간다.
- 출구 공이 붙은 두 판은 같은 질량 넘김이라 그대로다. 사용자가 의도 동작이라고 확인했다.
- 자세한 내용은 `B-013-heavier-roll-into-triangle-ball.md` 에 있다. 아래는 결정 전 기록이다.

같은 질량 넘김을 꺾인 묶음으로 세면서, 더 무거운 굴림이 '삼각 칸 공 + 출구 공' 묶음을 치는 경우가 새로 같은 질량 넘김이 됐다. 이 수정의 고칠 방향(메인 세션 지시 — '꺾인 묶음과 질량이 같으면 묶음 전체가 움직임을 받는다, 곧은 줄 넘김과 같게')대로이고, 시나리오 `B-001 an equal-mass hit moves the whole bent group…`·골든 `b001-equal-mass-bent-group` 이 이 동작을 고정한다.

그런데 출구 공이 없으면 더 무거운 굴림은 지금처럼 아무것도 못 움직인다(B-013). 출구에 공을 하나 더 붙이면 오히려 움직이는 셈이다. 판은 soul=on 이고, `M` 으로 (0,0) 의 S3 에 들어가 P3 가 된 뒤 `R` 을 둔다.

| 판 | 맵 코드 | 본 트리 (studio `fff5e12` · JS·GD `a2dd0e9`) | 작업 트리 (세 엔진 같음) |
|---|---|---|---|
| s2 → ◥(0,4) 공 혼자 | `CmG9lI45vUjNGOy1GY6UCnJHqSJyzLfSuqR8qPGQtkqfiv7tmGR0CUHRWbGIXIHbCkrHknmMP778Jf4cVB1h8sRMqoPJUYgc6Qp2O0S` | s2 가 (0,3) 에서 서고 ◥ 공 그대로 (`mrmrt`) | 같음 |
| 같은 판 + 출구 (1,4) s1 | `CmG9lI45vUjNGOy1GY6UCnJHqSJyzLfXgBq1fH7tNqkS3cqHcpbjV9zbTcc3LH4RPmEUiATsWOd7yYpotYSQSacA4ez7MlMoVf4eYgy` | 아무것도 안 움직임 (`mrmrt`) | **두 공이 (4,4)·(5,4) 까지 굴러감** (`mrmrimrmrmrmrt`) |
| s1+s1 열차 → ◥ 공 혼자 | `CmG9lI45s1USGuzpKcM19tHgmo3FdLhdCpky5iLvNYMjGd0LrLS45URuyFScRIpNpLgpPUmXiExo0EutIAkaNTUNaD6LP2oGV92rzDU` | 열차가 서고 ◥ 공 그대로 (`mrt`) | 같음 |
| 같은 열차 + 출구 (1,4) s1 | `CmG9lI45s1USGuzpKcM19tHgmo3FdLhhyA9rubDNreGWbKijhucoO994vGpNFIcD2M32MrT3oVToe7f5gXBIhBfBn4g9IFURvPHT8t0` | 아무것도 안 움직임 (`mrt`) | **두 공이 (4,4)·(5,4) 까지 굴러감** (`mrimrmrmrmrt`) |

B-013 에서 선택지 1(거울을 돌아 함께 굴러감)이나 2(운동만 넘김)를 고르면, 묶음이 가벼울 때와 같을 때가 한 규칙으로 이어진다. 지금 동작을 그대로 두기로 하면 B-001·B-013·`ENGINE_ALGORITHMS.md` §9.3·mapmaker `RULES.md` §7 에 '출구에 공이 붙어 질량이 같으면 무거운 굴림도 묶음을 넘긴다. 삼각 칸 공 혼자면 무반응'이라고 적는다.
