# Snowmen Studio — 세션 인수인계 (다른 PC에서 이어서 작업하기)

> 이 문서는 Claude Code 대화를 다른 PC에서 이어가기 위한 **자기완결 컨텍스트**입니다.
> 새 PC의 Claude Code에는 이전 PC의 `~/.claude` 메모리가 없으므로, 여기 담긴 내용이 곧 컨텍스트입니다.
> 파일 자체는 이미 새 PC에도 동일하게 복사돼 있다고 가정합니다.

---

## 0. 바로 시작하기 (새 PC에서)

```bash
cd "<...>/퍼즐 게임/눈사람 게임 에디터/snowmen-studio"
git pull --ff-only origin main     # 최신 반영 (이 문서 자체도 pull로 받게 됨)
npm install                        # 아직 안 했다면
npm run build                      # tsc -b && vite build — 무오류여야 정상
```

- **현재 HEAD**: `9687122` (2026-07 기준 최신). 브랜치 `main`, 원격 `origin = https://github.com/goldgarnet/snowmen-studio.git` (goldgarnet 계정).
- **작업 규칙**: 사용자가 요청할 때만 commit/push. commit 메시지 말미에 반드시:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- git user: goldgarnet / jeongbin1003@gmail.com.
- **주의**: 이 저장소는 상위 폴더(`눈사람 게임 에디터`)와 **분리된 별도 git repo**. push는 항상 `snowmen-studio` 안에서.
- 다른 팀원도 이 repo에 push함 → 작업 전 `git fetch`/`git pull`로 최신 확인 (실제로 중간에 "풀이(solution)" 기능이 팀원 커밋으로 들어왔음).

### 로컬 미리보기 / 검증
- dev 서버: launch.json의 **`studiodev`** (포트 3002). Claude Code preview 도구(`preview_start {name:"studiodev"}`)로 띄움. **Bash로 dev 서버 실행 금지**.
- 앱은 로그인(Supabase) 게이트 뒤에 있어, 로컬에 `.env`(Supabase 키)가 없으면 로그인 화면만 보임.
- **엔진/로직 검증은 브라우저 import 어서션으로** 한다(아래 8번 참고). 실제 TS 모듈을 preview에서 동적 import해서 순수 함수를 돌려 결과를 단언.

---

## 1. 프로젝트 개요

- **Snowmen Studio** = 눈사람 소코반 퍼즐 게임의 **팀 내부용 맵 제작·공유·검토 웹사이트**.
  기존 로컬 단일파일 에디터(`../snowmen-adventure-editor-v2`)의 엔진/에디터/시뮬레이터를 복사·재사용해 만든 별도 프로젝트.
- **스택**: React 19 + TypeScript + Vite (일반 SPA 빌드). `@supabase/supabase-js`. 서버 코드 없음(클라이언트가 supabase-js로 직접 통신).
- **호스팅**: **Supabase**(Postgres DB + Auth) + **Vercel**(프론트, main push 시 자동 배포). 운영 런북은 `DEPLOY.md`.
- **위치**: `퍼즐 게임/눈사람 게임 에디터/snowmen-studio`.

### 인증(비자명)
- 아이디를 **합성 이메일 `username@snowmen.local`** 로 변환해 Supabase Auth 사용.
- → Supabase 대시보드 **Authentication → Providers → Email 에서 "Confirm email" 반드시 OFF** (안 끄면 가입 막힘).
- 세션 persistSession = 자동 로그인.
- 계정 생성/비밀번호 입력은 대신 못 함(사용자 직접). anon key는 공개돼도 되는 키. **service_role 키는 절대 사용 금지.**

---

## 2. ⚠️ 배포 시 반드시 할 일 — schema.sql 재실행

이번 세션들에서 **DB 컬럼/테이블이 여러 번 추가**됐다. 프론트는 push→Vercel 자동배포지만,
**DB는 수동**: Supabase **SQL Editor** 에 `supabase/schema.sql` **전체를 다시 붙여넣고 Run** 해야 함.
(스키마는 idempotent — 여러 번 실행 안전.) 안 하면 관련 기능에서 오류.

현재 schema.sql이 만드는/마이그레이션하는 것:
- `profiles`, `maps`, `comments`, **`solutions`**(풀이) 테이블 + RLS + RPC `set_map_review`.
- `maps.author_difficulty`(출제자 난이도), `maps.difficulty`(회의 결정 난이도, null=미결정), `maps.published_at`(허브 공개 시각), `maps.solution`(구 출제자 풀이 — solutions 테이블로 1회 이관 후 사실상 미사용).
- `comments.suggested_difficulty`(피드백 난이도 제안).
- 각종 1회성 백필(난이도 이관, published_at 백필, solution 이관) — 모두 재실행 안전하게 가드됨.

---

## 3. 코드 구조 (핵심)

```
snowmen-studio/
  supabase/schema.sql      # 테이블+RLS+RPC+마이그레이션 (사용자가 SQL Editor에서 실행)
  DEPLOY.md                # 비개발자용 배포 런북
  src/
    App.tsx / App.css      # 인증 게이트 + 상단 탭 + 미저장 가드 모달
    context/AuthContext.tsx, GuardContext.ts
    lib/supabase.ts        # env 미설정 시 더미 Proxy (앱은 렌더됨)
    api/{maps,comments,solutions,types}.ts   # DB 접근 래퍼 + Row 타입
    types.ts               # 엔진 타입 (Tile/GameObject/Level/GameState 등)
    utils/{level,levelCode,game,solution}.ts # 맵 코드 인코딩/디코딩, 게임상태, 풀이 인코딩
    engine/{turn,push,roll,force,helpers,shadow}.ts   # 순수 게임 엔진
    components/
      editor/{Editor,Grid,Simulator,PlayView}.tsx(+css)
      studio/MapStudio.tsx(+css)    # 내 맵(제작중/비공개/공개) 목록 + 에디터 호스트
      hub/{MapHub,MapCard,MapDetail,UploadForm,CommentList,StatusControl,
           StarRating,SpoilerText,MapThumbnail,
           SolutionList,SolutionRecorder,SolutionPlayer}.tsx(+css)
      common/{ConfirmModal,Pagination}.tsx
      layout/TopNav.tsx, auth/LoginScreen.tsx
    styles/theme.css       # 디자인 토큰 단일 소스 (라이트/다크)
    index.css              # 전역 프리미티브(.btn/.badge/스크롤바 등) + html/body 규칙
```

---

## 4. 핵심 설계 결정 (비자명 — 코드만 봐선 놓치기 쉬움)

- **맵의 정본 = base62 맵 코드 하나**. 저장/공유/플레이 모두 `encodeLevelCode`/`decodeLevelCode`(utils/levelCode) 사용.
  초안·비공개·허브맵 모두 `maps` 한 행(`published` 플래그).
- **맵 상태 3종을 `published` + `published_at` 로 구분**:
  - **공개**: `published=true`
  - **비공개**: `published=false` 이고 `published_at != null` (예전에 공개했다 내림)
  - **제작중**: `published=false` 이고 `published_at == null` (한 번도 공개 안 함)
  - 스튜디오 카드 배지: 제작중=slate(`badge-draft`), 비공개=violet(`badge-private`) — 검토중(blue)과 구분.
  - 비공개 맵엔 카드에 **"다시 공개"** 1클릭(`updateMap {published:true}` 만 → 코멘트/난이도/상태/공개시각 전부 보존, 무손실).
  - 편집 후 재공개(허브에 올리기)는 `editRow`로 UploadForm을 저장값(제작자/코멘트/출제자난이도/등록일)으로 **프리필**해 손실 방지.
- **허브 정렬 = `created_at`(생성=등록일, 편집 가능) 우선 → 동일 시 `published_at`(공개시각) 최신순.** `published_at`은 첫 공개 시각 보존.
- **난이도 이원화**: 출제자 난이도(`author_difficulty`, 업로드 시) vs 회의 결정 난이도(`difficulty`, 초기 null=미결정, `set_map_review` RPC로 변경, 변경 시 ConfirmModal).
- **RLS**: 맵 내용 수정/삭제는 owner만. 상태/난이도는 회의에서 누구나 → `SECURITY DEFINER` RPC `set_map_review`로 우회. 코멘트/풀이는 본인 것 수정·삭제(맵 owner는 자기 맵의 풀이 전체 삭제 가능).
- **스포일러**: 디스코드식 `||텍스트||`. `SpoilerText` 컴포넌트가 파싱, 클릭 시 공개. **색상은 인라인 스타일로** 적용(헤드리스 렌더러의 getComputedStyle이 CSS 변수를 잘못 풀어서 클래스 방식이 실패했기 때문). 피드백+맵 코멘트 양쪽.
- **썸네일**(`MapThumbnail`): 별도 단순도형이 아니라 **실제 `Grid`의 `thumbnail` 읽기전용 모드**를 재사용해 맵과 동일하게 렌더. 맵 코드로 클라이언트에서 그리므로 **서버 저장 없음**.
- 목록(허브/스튜디오): **4열×2행(8개) 페이지네이션**(공용 `Pagination`).
- 전역 프리미티브(`.btn`, `.badge`, 모달 `.modal-backdrop`/`.modal`)는 index.css/theme.css. 다크모드는 `[data-theme="dark"]`.
- **전역 스크롤**: `body { zoom: 1.05 }`(전체 5% 확대) 때문에 `html,body,#root{height:100%}`면 문서가 ~5% 넘쳐 유령 스크롤 발생 → **body/#root의 height:100% 제거**(`html`만 100%), 풀스크린 루트(`.app`/`.login-screen`)만 `100vh/1.05`. 스크롤은 `.app-main`(overflow:auto) 내부에서만.

---

## 5. 엔진 메커니즘 레퍼런스 (매우 중요 — 버그 수정 시 필독)

엔진은 결정적(deterministic)이어야 함(풀이 재생 재현성). `turn.ts`가 `Date.now()` 대신 **단조 증가 카운터 `nextAge()`** 사용(팀원 커밋). 이걸 깨지 말 것.

### 타일 vs 오브젝트
- **타일 속성**: 따뜻/차가움, 눈꽃(`isFlake`), 골(`isGoal`), 가로/세로 터널(`isRowArch`/`isColumnArch`+`isShade`), 영혼 발판(`isSoulSwap`), **초록 버튼**(`isKeyTile`), **노랑 버튼/노랑 벽**(`isYellowButton`/`isYellowWall`), 삼각 벽(`triangle`), 엣지 아치(`edgeArchTop`/`edgeArchLeft`, 높이1/2).
- **오브젝트**: 플레이어(possessed 눈사람), 눈덩이(snowball, size1/2), 눈사람(snowman, size1/2/3), 벽, 블록, 나무(tree=벽 취급), 레이저.
- 에디터 UI에선 "타일" 섹션에 지형(따뜻/차가움/아치1/아치2/골)만, 나머지는 전부 "오브젝트" 섹션에 **시각적으로만** 재편(내부 로직 불변).

### 초록/노랑 버튼·벽
- **초록 버튼**(`isKeyTile`, 구 "열쇠 발판"): 눌리지 않은(오브젝트 안 올라간) 초록 버튼이 하나라도 있으면 골이 잠김(`isGoalActive`).
- **노랑 벽**: 모든 노랑 버튼이 눌리면(오브젝트가 올라감) 사라짐(토글). `yellowWallsSolid(level)`(engine/helpers) = 버튼 없거나 하나라도 안 눌림 → solid. **solid 노랑벽은 이동/힘(isBacked)/레이저(turn·roll)/굴림 + push의 `getObjAt`에서 전부 벽처럼 취급**.

### 영혼 발판 = 한 턴 지연
- `level.soulSwapArmedAt`(transient, 코드에 저장 안 함, cloneLevel이 전파). 밟은 턴엔 무장만, 다음 턴 같은 발판이면 이동. `resolveSoulFootplate`(turn.ts).
- **M키 영혼이동(`cycleSoul`)은 프리액션(턴 소모 X)** 이라 클리어 판정을 안 거침 → `isLevelCleared(level)`로 골 도달 즉시 클리어(Simulator.handleSoulCycle).
- soulSwapEnabled 맵은 플레이 화면 상단에 `.sim-notice` 안내 배너.

### 레이저
- `applyLaserCheck`(turn.ts)가 매 턴 빔을 쏴 비-blocker 오브젝트를 죽임(size=0 → processDeadObjects 제거). blocker = wall/block/tree/laser. 삼각/solid 노랑벽에서 빔 정지.
- **executeTurn은 레이저를 골 클리어보다 먼저** 판정 → 레이저 빔 위 골에 진입하면 클리어 아니라 사망(gameover) 우선.
- **굴러가는 눈덩이 + 레이저**: `roll.ts`의 `killIfOnBeam`이 각 굴림 스텝 후 검사. `rollSnowball`/`rollGroup` **시작 시점에도** 검사(push 헬퍼가 시작 칸으로 한 칸 먼저 옮기므로, 그 칸이 빔이면 즉시 소멸).

### 밀기(push.ts) — 공식 로직표
- **정본 문서**: `../snowmen adventure_push table.xlsx` (상위 폴더). 이번 세션에 **엔진에 맞게 갱신함**(플레이어1/2의 "size1/size2 눈덩이 vs 벽/블록, C 있음 → A FORCED" 행이 예전엔 nothing이었음).
- 핵심: 눈덩이가 **못 움직이게 backing되면 FORCED** — size1→눈꽃, size2→쪼개짐(→ size1 눈사람). **블록도 벽처럼 backing** 함.
- "밀기 파워 사다리": 플레이어1은 블록도 못 밈(눈덩이 부서짐), 플레이어2는 단일블록(뒤 빈칸)은 밀지만 막힌 블록엔 눈덩이 부서짐, 플레이어3은 size1 3연쇄까지 밀어냄.
- 눈덩이 vs 노랑벽(solid): `getObjAt`가 노랑벽을 벽으로 취급 → 눈덩이 눌러 눈꽃.

### 굴림(roll.ts) — 눈꽃 흡수
- 그룹으로 굴러갈 때 **모든 눈덩이**가 각자 밟은 칸의 눈꽃을 흡수해야 함(`handleRollFlakeAll`). 선두만 처리하면 뒤 눈덩이가 눈꽃을 건너뜀(이번 세션 수정). 단일 눈덩이는 size2까지만.

---

## 6. 제약사항 (반드시 지킬 것)
- `tsconfig.app.json`의 `noUnusedLocals`/`noUnusedParameters` 는 **false 유지**(엔진 복사 코드에 미사용 심볼 존재).
- 엔진 결정성(`nextAge()`) 유지 — 풀이 재생이 어긋나면 안 됨.
- `viteSingleFile` 안 씀(일반 SPA). v2와 달리 Supabase 통신.
- Windows 환경. git이 LF→CRLF 경고 내는 건 정상(무시).

---

## 7. 이번(및 직전) 세션에서 한 작업 — 커밋 요약 (최신→과거)
- `9687122` 굴러가는 눈덩이 그룹: 뒤 눈덩이도 눈꽃 흡수(`handleRollFlakeAll`).
- `7291b0b` 플레이어2: 블록에 막힌 size1 눈덩이가 눈꽃으로 부서지도록(push.ts C-present에 `b.isBlock` 추가). **push 로직표 xlsx도 이때 갱신.**
- `24ec2b7` 굴러가는 눈덩이가 레이저 첫 진입 칸에서 안 죽던 버그(roll 시작 시 `killIfOnBeam`).
- `a0b9b97`~`c4a86d1` (팀원) 풀이(solution) 등록/재생/자동재생 속도 + 턴수 숨김 등. `nextAge()` 결정성 도입.
- `8b0a6d4` 자신이 단 피드백 코멘트 수정(`updateComment`, 인라인 편집).
- `8c52c8b` 노랑벽 눈덩이 크러시 + 레이저 우선 사망 + 유령 스크롤 제거.
- `53f75ea` 영혼이동 활성 맵 플레이 화면 상단 안내 배너.
- `8dfe37e` 비공개/제작중 상태 구분 + 무손실 1클릭 재공개 + 스튜디오 태그/색.
- `9fd2294` 허브 정렬 생성일 우선(공개일 보조) + 재공개 시 메타 보존.
- `669a430` 맵 비공개 전환 + 허브 정렬 공개시각화(published_at 컬럼).
- `d116b2c` 영혼이동으로 골 도달 즉시 클리어 + 시뮬 하단 도움말바 제거.
- `d5a48bf` 에디터 도구 재편 + 시뮬 단일행 상단바 + 스튜디오 헤더 크기 통일 + 페이지네이션 + 실사 썸네일.
- (그 이전) `1442b61` 게임 메커니즘 확장(영혼발판 지연/초록버튼 개명/노랑버튼·벽) + 난이도 이원화 + 스포일러/모달. `04fb63c` 댓글 스포일러. `92a1a7f` 12개 개선(확대·다크모드·모바일·썸네일·미저장 가드 등).

---

## 8. 검증 워크플로 (이 프로젝트에서 실제로 쓴 방법)
1. `npm run build` 로 tsc/vite 무오류 확인.
2. 엔진/순수로직은 **preview에서 실제 TS 모듈 동적 import 후 어서션**:
   ```js
   const { createLevel } = await import('/src/utils/level.ts?t=' + Date.now());
   const { executeTurn } = await import('/src/engine/turn.ts?t=' + Date.now());
   // Level 만들고 executeTurn 돌려 결과(objects/tiles/status) 단언
   ```
   (`?t=`로 캐시 무효화. auth 게이트와 무관하게 순수 함수 검증 가능.)
3. UI/레이아웃은 preview 스크린샷 + `preview_eval`로 DOM 치수/스크롤 측정. auth 게이트 뒤 화면은 임시 `dev.html`+`src/dev.tsx` 하네스로 컴포넌트 직접 렌더 후 확인하고 **끝나면 삭제**.
4. Supabase 게이트 기능(허브/스튜디오 CRUD)은 로컬 env 없이는 e2e 불가 → 빌드 통과 + 로직/RLS 검토로 갈음.

---

## 9. 열린 항목 / 참고
- **push 로직표 xlsx**는 상위 폴더(`눈사람 게임 에디터/snowmen adventure_push table.xlsx`)에 있고 **snowmen-studio repo 밖**이라 git에 안 올라감. 원하면 repo 안(docs/)으로 옮겨 버전관리 가능(사용자 확인 필요).
- 코멘트에는 "수정됨" 표식/수정시각 컬럼이 없음(원하면 추가 가능).
- 배포 미실행 시: schema.sql 재실행 안 하면 published_at/solutions/난이도 관련 기능 오류.
- 사용자 언어: 한국어. 응답도 한국어로.

---

## 10. 이전 PC의 자동 메모리 (참고 — 새 PC엔 없음)
이전 PC `~/.claude/.../memory/project_snowmen_studio.md` 에 위 4·5절과 같은 요지가 저장돼 있었음.
새 PC에서 원하면 동일 요지로 메모리를 다시 저장해도 됨(선택). 이 문서가 사실상 그 상위 집합.
