-- ============================================================
--  Snowmen Studio — Supabase schema
--  Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요.
--  (여러 번 실행해도 안전하도록 작성되어 있습니다.)
--
--  ⚠️ 실행 후 반드시: Authentication → Providers → Email 에서
--     "Confirm email" 을 꺼야 회원가입이 즉시 완료됩니다.
-- ============================================================

-- ---------- 테이블 ----------

-- 사용자 프로필 (auth.users 와 1:1). 아이디/이름 표시에 사용.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  name       text not null,
  created_at timestamptz not null default now()
);

-- 맵. published=false 는 개인 초안(맵 제작 저장), true 는 허브 공개 맵.
create table if not exists public.maps (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text,
  author_name text,                       -- 제작자(허브 업로드 시 필수)
  code        text not null default '',    -- 맵 코드(base62) — 맵의 정본
  comment     text,
  difficulty  numeric(2,1),                -- 0.5 ~ 5.0 (별점, 0.5 단위)
  status      text not null default 'pending'
              check (status in ('pending','accepted','held','rejected')),
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 피드백 댓글.
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references public.maps(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists maps_owner_idx     on public.maps(owner_id);
create index if not exists maps_published_idx on public.maps(published);
create index if not exists comments_map_idx   on public.comments(map_id);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.maps     enable row level security;
alter table public.comments enable row level security;

-- profiles: 로그인 사용자는 모두 조회, 본인 것만 생성/수정
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- maps: 공개 맵은 전원 조회, 초안은 소유자만. 생성/수정(내용)/삭제는 소유자만.
--       (status/difficulty 변경은 아래 set_map_review RPC 로 전원 허용)
drop policy if exists maps_select on public.maps;
create policy maps_select on public.maps
  for select to authenticated using (published = true or owner_id = auth.uid());
drop policy if exists maps_insert on public.maps;
create policy maps_insert on public.maps
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists maps_update on public.maps;
create policy maps_update on public.maps
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists maps_delete on public.maps;
create policy maps_delete on public.maps
  for delete to authenticated using (owner_id = auth.uid());

-- comments: 전원 조회, 본인 author 로만 작성, 본인 것만 수정/삭제
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated using (true);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated using (author_id = auth.uid());

-- ---------- 리뷰 RPC (채택/보류/반려 + 난이도: 회의에서 누구나 변경) ----------
-- 테이블 UPDATE 는 소유자로 제한되므로, 상태/난이도만 바꾸는 통로를 SECURITY DEFINER
-- 함수로 열어 로그인 사용자 전원이 호출할 수 있게 한다. (내용/삭제 권한은 그대로 소유자만)
create or replace function public.set_map_review(
  p_map_id     uuid,
  p_status     text default null,
  p_difficulty numeric default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status is not null and p_status not in ('pending','accepted','held','rejected') then
    raise exception 'invalid status %', p_status;
  end if;
  if p_difficulty is not null and (p_difficulty < 0.5 or p_difficulty > 5) then
    raise exception 'invalid difficulty %', p_difficulty;
  end if;
  update public.maps
     set status     = coalesce(p_status, status),
         difficulty = case when p_difficulty is null then difficulty else p_difficulty end,
         updated_at = now()
   where id = p_map_id and published = true;
end;
$$;

revoke all on function public.set_map_review(uuid, text, numeric) from public;
grant execute on function public.set_map_review(uuid, text, numeric) to authenticated;
