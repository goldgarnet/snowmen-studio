-- ============================================================
--  2026-11-02 · '풀었어요' 체크 (map_clears)
--  Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여넣고 Run.
--  여러 번 실행해도 안전합니다. (supabase/schema.sql 에도 같은 블록이 들어 있어,
--  schema.sql 전체를 다시 실행해도 같은 결과입니다.)
--  적용 전에는 사이트가 이 기능만 조용히 숨깁니다 (콘솔 경고만).
-- ============================================================

-- ---------- 풀었어요 체크(map_clears) ----------
-- 팀원이 "이 맵 풀었어요"를 체크한 기록. 한 사람·한 맵에 한 줄(기본키 map_id + user_id).
-- 체크 = 행 있음, 해제 = 행 삭제. 로그인한 사용자 전원이 읽고(누가 풀었는지 모두에게 보임),
-- 자기 체크만 넣고 지운다. 맵이나 계정이 지워지면 체크도 함께 지워진다.
create table if not exists public.map_clears (
  map_id     uuid not null references public.maps(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (map_id, user_id)
);
create index if not exists map_clears_user_idx on public.map_clears(user_id);

alter table public.map_clears enable row level security;
-- (Supabase 는 새 테이블 권한을 보통 자동으로 주지만, 꺼 둔 프로젝트도 있어 명시해 둔다.)
grant select, insert, delete on public.map_clears to authenticated;

-- 조회: 로그인 사용자 전원
drop policy if exists map_clears_select on public.map_clears;
create policy map_clears_select on public.map_clears
  for select to authenticated using (true);
-- 체크: 본인 것으로만
drop policy if exists map_clears_insert on public.map_clears;
create policy map_clears_insert on public.map_clears
  for insert to authenticated with check (user_id = auth.uid());
-- 해제: 본인 것만
drop policy if exists map_clears_delete on public.map_clears;
create policy map_clears_delete on public.map_clears
  for delete to authenticated using (user_id = auth.uid());
