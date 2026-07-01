# Snowmen Studio

Snowmen Adventure 팀 내부용 **맵 제작 · 허브** 웹사이트.
기존 눈사람 퍼즐 에디터/시뮬레이터를 그대로 사용하면서, 로그인·맵 저장·공유·피드백·채택 결정 기능을 더했습니다.

## 기능
- **로그인 / 회원가입** — 아이디·비밀번호·이름만. 자동 로그인(세션 유지).
- **맵 제작 탭** — 에디터/시뮬레이터(기존과 동일). 맵을 저장하고 이어서 만들거나, 허브에 올릴 수 있음.
- **맵 허브 탭** — 팀원 맵을 카드로 보고 바로 플레이. 업로드(제작자/맵코드/제목/코멘트/난이도), 피드백 댓글, 채택/보류/반려, 난이도(별 0.5단위) 지정, 채택된 맵만 보기, 전체 백업 내보내기. 내가 올린 맵은 수정/삭제 가능.

## 기술 스택
- React 19 + TypeScript + Vite
- Supabase (Postgres DB + Auth) — `@supabase/supabase-js`
- Vercel 배포

## 로컬 실행
```
npm install
cp .env.example .env   # 값 채우기 (Supabase URL / anon key)
npm run dev
```

## 배포
처음 사이트를 띄우는 방법은 **[DEPLOY.md](./DEPLOY.md)** 를 그대로 따라 하세요. (Supabase → GitHub → Vercel)

## 구조
```
src/
  engine/            퍼즐 규칙 엔진 (기존 에디터와 동일)
  utils/             레벨 코드 인코딩/디코딩, 게임 상태
  components/editor/  에디터·시뮬레이터·플레이 뷰 (기존과 동일, 색감만 리워크)
  components/studio/  맵 제작 탭
  components/hub/     맵 허브 (카드/상세/업로드/댓글/별점/상태)
  components/auth/    로그인 화면
  api/               Supabase 접근 래퍼
  context/           인증 컨텍스트
supabase/schema.sql  DB 테이블 + 보안 규칙(RLS) + 리뷰 RPC
```

맵의 정본은 **맵 코드(base62 문자열)** 하나로 통일되어 있습니다. 저장·공유·플레이 모두 이 코드를 사용합니다.
