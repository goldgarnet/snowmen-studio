# Snowmen Studio 운영 가이드 (배포 런북)

사이트 운영이 처음이어도 이 순서대로만 따라 하면 됩니다.
전체 30~40분 정도, **무료**로 팀 사이트를 띄울 수 있어요.

구성:
- **Supabase** — 데이터베이스 + 로그인 (무료, 영구 보존)
- **Vercel** — 웹사이트 호스팅 (무료, GitHub에 올리면 자동 배포)
- **GitHub** — 코드 저장소 (Vercel이 여기서 코드를 가져감)

> 💡 이 세 가지는 모두 **본인이 직접 가입**해야 합니다. (비밀번호·결제정보 입력이 필요해서 대신 해드릴 수 없어요.) 가입은 GitHub 계정 하나로 Vercel까지 연결하면 편합니다.

---

## 1단계. Supabase (데이터베이스 + 로그인)

1. https://supabase.com 접속 → **Start your project** → GitHub 계정으로 가입/로그인.
2. **New project** 클릭.
   - Organization: 아무거나(개인) 선택
   - Name: `snowmen-studio` (자유)
   - Database Password: 아무 강한 비밀번호 입력 후 **어딘가 메모**(자주 쓰진 않음)
   - Region: **Northeast Asia (Seoul)** 또는 (없으면) Tokyo
   - **Create new project** → 1~2분 기다리면 준비 완료.
3. 왼쪽 메뉴 **SQL Editor** → **New query** →
   이 저장소의 `supabase/schema.sql` 파일 내용을 **전체 복사해서 붙여넣고** 오른쪽 아래 **Run** 클릭.
   → "Success" 가 나오면 테이블/보안규칙이 모두 만들어진 것입니다.
4. ⚠️ **중요** — 왼쪽 메뉴 **Authentication → Sign In / Providers → Email** 로 이동해서
   **"Confirm email"** 옵션을 **끕니다(OFF)** → **Save**.
   (이 사이트는 이메일이 아니라 아이디로 가입하므로 이메일 확인이 켜져 있으면 가입이 막힙니다.)
5. 왼쪽 아래 **Project Settings → API** 에서 두 값을 복사해 둡니다.
   - **Project URL** (예: `https://abcd1234.supabase.co`)
   - **anon public** 키 (`Project API keys` 의 `anon` `public` 항목. 길쭉한 문자열)
   > `service_role` 키는 절대 사용하지 마세요. (관리자 키라 외부에 노출되면 안 됩니다.)

---

## 2단계. 내 컴퓨터에서 먼저 테스트 (선택이지만 권장)

1. 이 폴더의 `.env.example` 파일을 복사해 **`.env`** 라는 이름으로 저장.
2. `.env` 를 열어 1단계에서 복사한 값을 채웁니다:
   ```
   VITE_SUPABASE_URL=https://abcd1234.supabase.co
   VITE_SUPABASE_ANON_KEY=여기에-anon-public-키
   ```
3. 터미널에서 이 폴더로 이동 후:
   ```
   npm install
   npm run dev
   ```
   → 안내되는 주소(예: http://localhost:3002)를 브라우저에서 열기.
4. **회원가입** 탭에서 아이디·비밀번호·이름으로 가입 → 로그인 → 맵 제작/허브가 보이면 성공!

> `.env` 파일은 비밀 값이라 GitHub에 올라가지 않습니다(자동 제외). Vercel에는 3단계에서 따로 입력합니다.

---

## 3단계. GitHub에 코드 올리기

이미 이 폴더는 git 저장소로 초기화되어 있고 첫 커밋도 되어 있습니다. 새 원격 저장소만 연결하면 됩니다.

1. https://github.com 에서 **New repository** →
   - Repository name: `snowmen-studio`
   - **Private** 선택(팀 내부용) → **Create repository**
   - (README/gitignore 등은 추가하지 마세요 — 이미 있습니다.)
2. 만들어진 화면에 나오는 주소를 사용해, 터미널에서 이 폴더에서 실행:
   ```
   git remote add origin https://github.com/<본인아이디>/snowmen-studio.git
   git branch -M main
   git push -u origin main
   ```

---

## 4단계. Vercel로 배포 (사이트 켜기)

1. https://vercel.com → **Sign Up** → **Continue with GitHub**.
2. **Add New… → Project** → 방금 만든 `snowmen-studio` 저장소 **Import**.
3. 설정 화면에서:
   - Framework Preset: **Vite** (자동으로 잡힙니다)
   - **Environment Variables** 에 두 개 추가:
     | Name | Value |
     |------|-------|
     | `VITE_SUPABASE_URL` | (1단계의 Project URL) |
     | `VITE_SUPABASE_ANON_KEY` | (1단계의 anon public 키) |
   - **Deploy** 클릭.
4. 1~2분 뒤 `https://snowmen-studio-xxxx.vercel.app` 같은 주소가 나옵니다.
   → 팀원들에게 이 주소를 공유하면, 각자 회원가입해서 바로 사용할 수 있어요.

---

## 이후 운영 팁

- **코드를 수정했을 때**: 변경 사항을 GitHub에 push 하면 Vercel이 자동으로 다시 배포합니다. (별도 작업 불필요)
- **DB 구조가 바뀐 업데이트**: 가끔 새 기능이 데이터베이스에 새 칼럼을 추가합니다. 이때는 Supabase **SQL Editor** 에 `supabase/schema.sql` 전체를 다시 붙여넣고 **Run** 하면 됩니다. (여러 번 실행해도 안전하도록 작성되어 있어요. 예: "출제자 난이도 / 피드백 난이도 제안" 업데이트, "맵 비공개 전환 / 허브 공개시각 정렬(published_at)" 업데이트는 이 한 번의 재실행이 필요합니다.)
- **데이터 백업**: 맵 허브 상단의 **⭳ 전체 백업** 버튼으로 모든 맵 코드·정보를 텍스트 파일로 내려받을 수 있습니다. 가끔 눌러 보관해두면 안전합니다. (데이터는 Supabase에 영구 보존되지만, 이중 안전장치)
- **주소를 예쁘게**: Vercel 프로젝트 Settings → Domains 에서 원하는 이름/도메인을 붙일 수 있습니다(선택).

## 보안 수준 (참고)

- 팀 내부용이라 인증은 최소한(아이디/비밀번호/이름)입니다.
- 다른 사람의 맵을 **함부로 수정·삭제하지 못하도록** 데이터베이스 규칙(RLS)이 막아 둡니다. (맵 내용/삭제는 올린 사람만 가능)
- **채택/보류/반려 상태와 난이도**는 회의에서 바로 반영하도록 **로그인한 팀원 누구나** 바꿀 수 있습니다.
- `anon public` 키는 프론트엔드에 노출되어도 되는 공개 키입니다. (`service_role` 키만 조심하면 됩니다.)

## 자주 겪는 문제

- **회원가입이 "이메일 확인" 어쩌고로 막힘** → 1단계 4번(Confirm email 끄기)을 안 한 경우입니다.
- **로그인 화면에 "Supabase가 설정되지 않았습니다" 경고** → `.env`(로컬) 또는 Vercel 환경변수(배포)에 값이 안 들어간 경우입니다. 값을 넣고 다시 시작/재배포하세요.
- **Vercel 배포 후 값 바꿈** → 환경변수를 바꾼 뒤에는 Vercel에서 **Redeploy** 를 한 번 해줘야 반영됩니다.
