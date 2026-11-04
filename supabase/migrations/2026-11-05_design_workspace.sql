-- ============================================================
--  2026-11-05 · 디자인 작업 공간 (/design)
--  Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여넣고 Run.
--  여러 번 실행해도 안전합니다. (supabase/schema.sql 에도 같은 블록이 들어 있습니다.)
--  적용 전에는 /design 화면이 이 SQL 을 실행하라는 안내만 보여 줍니다.
-- ============================================================

-- ---------- 디자인 작업 공간(design_*) ----------
-- 팀 공동 작업물이라 챕터 구성과 같이 로그인한 팀원 전원이 조회·추가·수정·삭제한다.
create table if not exists public.design_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.design_items (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.design_groups(id) on delete cascade,
  sort_order  integer not null default 0,
  name        text not null default '',
  file_name   text not null default '',
  spec        text not null default '',     -- 제작 크기
  description text not null default '',     -- 세부 설명
  assignee    text not null default '',     -- 담당자
  status      text not null default 'todo'
              check (status in ('todo','doing','review','done')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists design_items_group_idx on public.design_items(group_id, sort_order);

-- 항목에 올린 그림. 지우지 않고 쌓이며 가장 최근 것이 대표 그림이다.
create table if not exists public.design_images (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.design_items(id) on delete cascade,
  path          text not null,              -- 저장소(design-assets) 안의 경로
  file_name     text not null,              -- 올린 파일의 원래 이름
  width         integer,
  height        integer,
  size_bytes    bigint,
  uploader_name text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists design_images_item_idx on public.design_images(item_id, created_at desc);

create table if not exists public.design_tasks (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  owner      text not null default '',
  start_date date not null,
  end_date   date not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

do $$
declare t text;
begin
  foreach t in array array['design_groups','design_items','design_images','design_tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_all', t);
  end loop;
end $$;

-- 그림 저장소. 주소만 알면 볼 수 있는 공개 버킷이고, 올리고 지우는 것은 로그인 사용자만 한다.
insert into storage.buckets (id, name, public)
values ('design-assets', 'design-assets', true)
on conflict (id) do nothing;

-- (저장소 파일을 지울 때 Supabase 가 그 파일을 조회하므로 조회 권한도 필요하다.)
drop policy if exists design_assets_select on storage.objects;
create policy design_assets_select on storage.objects
  for select to authenticated using (bucket_id = 'design-assets');
drop policy if exists design_assets_insert on storage.objects;
create policy design_assets_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'design-assets');
drop policy if exists design_assets_delete on storage.objects;
create policy design_assets_delete on storage.objects
  for delete to authenticated using (bucket_id = 'design-assets');
