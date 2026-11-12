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
  solution    text,                        -- 출제자가 등록한 풀이(이동 순서 기록, 예: "RRULW"). null=미등록
  author_difficulty numeric(2,1),          -- 출제자가 등록 시 매긴 난이도 (0.5~5.0)
  difficulty  numeric(2,1),                -- 회의 결정 난이도 (0.5~5.0, null=미결정)
  status      text not null default 'pending'
              check (status in ('pending','accepted','held','rejected')),
  published   boolean not null default false,
  published_at timestamptz,             -- 허브에 가장 최근 공개된 시각 (허브 정렬 기준)
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
  suggested_difficulty numeric(2,1),       -- 피드백에 첨부한 난이도 제안 (선택)
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

-- ---------- 풀이(solutions) ----------
-- 누구나 자기 풀이를 등록/삭제할 수 있고, 한 맵에 여러 사람·여러 풀이가 붙는다.
-- 출제자(맵 주인) 풀이는 author_id = map.owner_id 로 구분해 UI에서 배지/고정 처리.
create table if not exists public.solutions (
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references public.maps(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  moves       text not null,               -- 이동 순서 기록 (예: "RRULW")
  turn_count  integer,                      -- 턴 수 (정렬/표시용, null=미상)
  note        text,                         -- 한 줄 코멘트 (선택)
  created_at  timestamptz not null default now()
);
create index if not exists solutions_map_idx on public.solutions(map_id);

alter table public.solutions enable row level security;

-- 조회: 로그인 사용자 전원
drop policy if exists solutions_select on public.solutions;
create policy solutions_select on public.solutions
  for select to authenticated using (true);
-- 등록: 본인 author 로만
drop policy if exists solutions_insert on public.solutions;
create policy solutions_insert on public.solutions
  for insert to authenticated with check (author_id = auth.uid());
-- 수정: 본인 것만
drop policy if exists solutions_update on public.solutions;
create policy solutions_update on public.solutions
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
-- 삭제: 본인 것, 또는 그 맵의 주인(관리 목적 + 맵 수정 시 일괄 삭제)
drop policy if exists solutions_delete on public.solutions;
create policy solutions_delete on public.solutions
  for delete to authenticated using (
    author_id = auth.uid()
    or exists (select 1 from public.maps m where m.id = map_id and m.owner_id = auth.uid())
  );

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

-- ---------- 맵 폴더(map_folders) ----------
-- 여러 맵을 하나로 묶는 "폴더". 제작 탭에서 이름만으로 만들고, 그 안에 맵을 새로
-- 만들거나 폴더 밖 내 맵을 옮겨 넣는다. 허브에 올리면 폴더 카드 하나로 보이고,
-- 폴더를 열면 안의 맵들이 각각 (단일 맵과 동일하게) 개별 리뷰/난이도/댓글/풀이를 가진다.
-- 리뷰는 맵별이므로 폴더 자체에는 status/difficulty 가 없고, 표시용 메타만 담는다.
create table if not exists public.map_folders (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  name         text not null default '',
  author_name  text,                       -- 제작자(허브 공개 시 필수)
  comment      text,                        -- 폴더 설명(스포일러 || || 가능)
  published    boolean not null default false,
  published_at timestamptz,                 -- 허브 공개 시각(정렬 기준)
  created_at   timestamptz not null default now(),  -- 등록일(편집 가능)
  updated_at   timestamptz not null default now()
);
create index if not exists map_folders_owner_idx     on public.map_folders(owner_id);
create index if not exists map_folders_published_idx on public.map_folders(published);

-- 맵이 속한 폴더(없으면 단독 맵). 폴더 삭제 시 맵은 남고 단독으로 돌아간다.
alter table public.maps add column if not exists folder_id uuid references public.map_folders(id) on delete set null;
create index if not exists maps_folder_idx on public.maps(folder_id);

-- 폴더 안에서의 순서(제작 탭에서 드래그로 변경). null = 아직 순서를 지정한 적 없음
-- → 등록일(created_at) 순으로 뒤에 붙는다.
alter table public.maps add column if not exists sort_order integer;
create index if not exists maps_folder_order_idx on public.maps(folder_id, sort_order);

alter table public.map_folders enable row level security;
-- 공개 폴더는 전원 조회, 초안은 소유자만. 생성/수정/삭제는 소유자만.
drop policy if exists map_folders_select on public.map_folders;
create policy map_folders_select on public.map_folders
  for select to authenticated using (published = true or owner_id = auth.uid());
drop policy if exists map_folders_insert on public.map_folders;
create policy map_folders_insert on public.map_folders
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists map_folders_update on public.map_folders;
create policy map_folders_update on public.map_folders
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists map_folders_delete on public.map_folders;
create policy map_folders_delete on public.map_folders
  for delete to authenticated using (owner_id = auth.uid());

-- ---------- 챕터 구성(chapters / stages) ----------
-- 실제 게임에 들어갈 챕터·스테이지 배치. 게임 구조는 팀의 공동 작업물이므로
-- (회의 리뷰와 동일하게) 로그인한 팀원 전원이 추가/수정/삭제할 수 있다.
create table if not exists public.chapters (
  id          uuid primary key default gen_random_uuid(),
  number      integer not null default 1,   -- 챕터 번호 (스테이지 번호 "2-1"의 앞부분)
  name        text not null default '',
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 스테이지 = 챕터 안에 배치된 허브 맵 하나. 번호는 저장하지 않는다 —
-- 챕터 안 순서(sort_order)로부터 "챕터번호-순번"(예: 2-1)이 자동으로 매겨진다.
create table if not exists public.stages (
  id          uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null references public.chapters(id) on delete cascade,
  map_id      uuid not null references public.maps(id) on delete cascade,
  sort_order  integer not null default 0,
  description text,
  requires    text,   -- 이 맵에 접근하기 위해 풀었어야 하는 스테이지 번호들 (예: "1-3, 2-1")
  unlocks     text,   -- 이 맵을 풀면 해금되는 스테이지 번호들
  note        text,   -- 비고 (자유 메모)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.stages add column if not exists note text;
create index if not exists stages_chapter_idx on public.stages(chapter_id);
create index if not exists stages_map_idx     on public.stages(map_id);

alter table public.chapters enable row level security;
alter table public.stages   enable row level security;

-- 챕터/스테이지: 팀원(로그인 사용자) 전원이 조회·추가·수정·삭제 가능.
drop policy if exists chapters_select on public.chapters;
create policy chapters_select on public.chapters for select to authenticated using (true);
drop policy if exists chapters_insert on public.chapters;
create policy chapters_insert on public.chapters for insert to authenticated with check (true);
drop policy if exists chapters_update on public.chapters;
create policy chapters_update on public.chapters for update to authenticated using (true) with check (true);
drop policy if exists chapters_delete on public.chapters;
create policy chapters_delete on public.chapters for delete to authenticated using (true);

drop policy if exists stages_select on public.stages;
create policy stages_select on public.stages for select to authenticated using (true);
drop policy if exists stages_insert on public.stages;
create policy stages_insert on public.stages for insert to authenticated with check (true);
drop policy if exists stages_update on public.stages;
create policy stages_update on public.stages for update to authenticated using (true) with check (true);
drop policy if exists stages_delete on public.stages;
create policy stages_delete on public.stages for delete to authenticated using (true);

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

-- ---------- 마이그레이션 (이미 운영 중인 DB에 새 컬럼 추가) ----------
-- 이 파일 전체를 다시 실행하면 아래 ALTER 들이 idempotent 하게 적용됩니다.
alter table public.maps     add column if not exists author_difficulty numeric(2,1);
alter table public.maps     add column if not exists solution text;
alter table public.comments add column if not exists suggested_difficulty numeric(2,1);

-- 기존 "출제자 풀이"(maps.solution) 를 solutions 테이블로 1회 이관.
-- (이미 옮겨진 것이 있으면 중복 삽입하지 않아 재실행해도 안전합니다.)
insert into public.solutions (map_id, author_id, author_name, moves, created_at)
select m.id, m.owner_id, coalesce(nullif(m.author_name, ''), '출제자'), m.solution, m.updated_at
from public.maps m
where m.solution is not null and m.solution <> ''
  and not exists (
    select 1 from public.solutions s where s.map_id = m.id and s.moves = m.solution
  );

-- 허브 정렬을 "공개 시각" 기준으로 하기 위한 컬럼. 기존 공개 맵은 created_at 으로
-- 1회 백필(비어 있는 것만 채우므로 재실행 안전).
alter table public.maps     add column if not exists published_at timestamptz;
update public.maps set published_at = created_at where published = true and published_at is null;

-- 기존 맵의 난이도를 "출제자 난이도"로 옮기고 "회의 결정 난이도"는 미결정(null)으로 (1회만).
-- author_difficulty 가 전부 비어 있을 때만 실행되므로 재실행해도 안전합니다.
do $$
begin
  if not exists (select 1 from public.maps where author_difficulty is not null) then
    update public.maps set author_difficulty = difficulty where difficulty is not null;
    update public.maps set difficulty = null where difficulty is not null;
  end if;
end $$;

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

-- ---------- 디자인 작업 공간 v2: 파일 칸 · 색 · 분류 ----------
alter table public.design_groups
  add column if not exists note  text not null default '',
  add column if not exists color text not null default 'gray';

alter table public.design_items
  add column if not exists category text not null default '',
  add column if not exists alpha    text not null default '',
  add column if not exists priority text not null default '',
  add column if not exists rules    text not null default '',     -- 지킬 것 (줄마다 하나)
  add column if not exists ideas    text not null default '',     -- 참고 아이디어 (쉼표로 구분)
  add column if not exists is_new   boolean not null default false;

-- 항목 안의 파일 칸. 그림은 칸마다 올리고, 규격과 설명도 칸마다 가진다.
create table if not exists public.design_files (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.design_items(id) on delete cascade,
  sort_order integer not null default 0,
  file_name  text not null default '',
  label      text not null default '',
  canvas_w   integer,
  canvas_h   integer,
  body_w     integer,
  body_h     integer,
  bottom_px  integer,                        -- 아래 여백
  face_px    integer,                        -- 앞면 높이
  placement  text not null default 'free',   -- 그리는 위치
  spec_note  text not null default '',
  note       text not null default '',       -- 이 파일의 설명
  created_at timestamptz not null default now()
);
create index if not exists design_files_item_idx on public.design_files(item_id, sort_order);

alter table public.design_images
  add column if not exists file_id uuid references public.design_files(id) on delete cascade;

alter table public.design_tasks
  add column if not exists category text not null default 'base';

alter table public.design_files enable row level security;
grant select, insert, update, delete on public.design_files to authenticated;
drop policy if exists design_files_all on public.design_files;
create policy design_files_all on public.design_files for all to authenticated using (true) with check (true);

-- ---------- 디자인 작업 공간 v3: 시안 · 피드백 · 가이드/채색 · 마감 ----------
alter table public.design_items
  add column if not exists split          boolean not null default false,  -- 가이드와 채색을 나눠 맡는 항목
  add column if not exists guide_assignee text not null default '',        -- 이때 assignee 는 채색 담당
  add column if not exists guide_done     boolean not null default false,
  add column if not exists task_id        uuid references public.design_tasks(id) on delete set null,
  add column if not exists draft_task_id  uuid references public.design_tasks(id) on delete set null;

-- file_id 가 없는 그림은 항목의 시안 · 가이드다.
alter table public.design_images
  add column if not exists sort_order integer not null default 0,
  add column if not exists rank       text not null default '',
  add column if not exists picked     boolean not null default false;

-- 그림 한 장에 달린 피드백. pin 이 있으면 그림 위 그 자리(0~1 비율)를 가리킨다.
create table if not exists public.design_comments (
  id          uuid primary key default gen_random_uuid(),
  image_id    uuid not null references public.design_images(id) on delete cascade,
  author_id   uuid default auth.uid() references public.profiles(id) on delete set null,
  author_name text not null default '',
  body        text not null,
  pin_x       real,
  pin_y       real,
  created_at  timestamptz not null default now()
);
create index if not exists design_comments_image_idx on public.design_comments(image_id, created_at);

alter table public.design_comments enable row level security;
grant select, insert, delete on public.design_comments to authenticated;
-- 조회와 작성은 로그인 사용자 전원, 삭제는 쓴 사람만.
drop policy if exists design_comments_select on public.design_comments;
create policy design_comments_select on public.design_comments for select to authenticated using (true);
drop policy if exists design_comments_insert on public.design_comments;
create policy design_comments_insert on public.design_comments for insert to authenticated with check (author_id = auth.uid());
drop policy if exists design_comments_delete on public.design_comments;
create policy design_comments_delete on public.design_comments for delete to authenticated using (author_id = auth.uid());

-- 2026-11-05: 디자인 작업 공간 '게임에서 보기'.
-- 게임 데이터(index.pck)를 두는 비공개 저장소. 로그인한 팀원만 받을 수 있다.
-- 파일은 Supabase 대시보드의 Storage 화면에서 올린다(사이트에서는 쓰기 권한이 없다).
-- 기존 데이터는 건드리지 않는다.
insert into storage.buckets (id, name, public)
  values ('game-preview', 'game-preview', false)
  on conflict (id) do nothing;

drop policy if exists game_preview_select on storage.objects;
create policy game_preview_select on storage.objects
  for select to authenticated using (bucket_id = 'game-preview');

-- 2026-11-05: 회원가입 승인제.
--   · 새 계정은 승인 전까지 자기 프로필 말고는 아무것도 읽거나 쓰지 못한다.
--   · 승인과 거절은 luffy84(김정훈) 계정만 할 수 있다.
--   · 지금까지 가입한 계정은 승인된 상태로 둔다. 몇 번을 다시 실행해도 안전하다.
--   · 테이블을 새로 만들면 아래 approved_only 블록을 다시 실행해야 그 테이블도 막힌다.

-- 열을 처음 만들 때만 기존 계정이 true 를 받는다. 그 뒤 새 계정의 기본값은 false 다.
alter table public.profiles add column if not exists approved boolean not null default true;
alter table public.profiles alter column approved set default false;

-- 사이트에서 오는 요청은 승인 값을 바꿀 수 없다. approve_signup 은 소유자 권한으로 돌아 여기를 지나간다.
create or replace function public.profiles_keep_approved()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.approved := false;
    else
      new.approved := old.approved;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_keep_approved on public.profiles;
create trigger profiles_keep_approved
  before insert or update on public.profiles
  for each row execute function public.profiles_keep_approved();

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.approved from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.is_signup_approver()
returns boolean
language sql
stable
as $$
  select auth.uid() is not distinct from 'b807cfa1-b912-4a27-a0a5-af2a302e4577'::uuid;   -- luffy84
$$;

revoke all on function public.is_approved() from public, anon;
revoke all on function public.is_signup_approver() from public, anon;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_signup_approver() to authenticated;

-- 기존 정책에 '승인된 계정만' 을 덧붙인다. restrictive 정책은 기존 정책과 AND 로 묶인다.
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public' and rowsecurity and tablename <> 'profiles'
  loop
    execute format('drop policy if exists approved_only on public.%I', t);
    execute format(
      'create policy approved_only on public.%I as restrictive for all to authenticated '
      'using ((select public.is_approved())) with check ((select public.is_approved()))', t);
  end loop;
end;
$$;

-- 승인 전에도 자기 프로필은 읽고 만들어야 대기 화면을 보여 줄 수 있다.
drop policy if exists approved_only on public.profiles;
create policy approved_only on public.profiles as restrictive for all to authenticated
  using ((select public.is_approved()) or id = auth.uid())
  with check ((select public.is_approved()) or id = auth.uid());

drop policy if exists approved_only on storage.objects;
create policy approved_only on storage.objects as restrictive for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

-- SECURITY DEFINER 함수는 RLS 를 지나치므로 안에서 따로 막는다.
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
  if not public.is_approved() then
    raise exception '승인되지 않은 계정입니다.';
  end if;
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

create or replace function public.approve_signup(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_signup_approver() then
    raise exception '가입 승인 권한이 없습니다.';
  end if;
  update public.profiles set approved = true where id = p_user_id;
end;
$$;

-- 거절하면 계정을 지운다. 같은 아이디로 다시 신청할 수 있다. 승인된 계정은 지우지 않는다.
create or replace function public.reject_signup(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_signup_approver() then
    raise exception '가입 승인 권한이 없습니다.';
  end if;
  delete from auth.users u
   where u.id = p_user_id
     and exists (select 1 from public.profiles p where p.id = p_user_id and not p.approved);
end;
$$;

revoke all on function public.approve_signup(uuid) from public, anon;
revoke all on function public.reject_signup(uuid) from public, anon;
grant execute on function public.approve_signup(uuid) to authenticated;
grant execute on function public.reject_signup(uuid) to authenticated;

-- 2026-11-12: 챕터 음악 (/music). 승인제(is_approved) 뒤에 둔다 — approved_only 정책이 그 함수를 쓴다.
-- ---------- 챕터 음악(music_samples / music_comments) ----------
-- 곡 하나 = 샘플 한 줄. 팀원 누구나 여러 곡을 올린다. 채택 · 보류 · 반려는 맵처럼 회의에서
-- 누구나 바꾸고(set_music_status), 제목 · 메모 · 챕터 옮기기 · 삭제는 올린 사람만 한다.
-- chapter_id 가 비어 있으면 '공통'(타이틀 · 엔딩처럼 챕터 밖의 곡)이다. 챕터를 지워도 곡은 공통으로 남는다.
create table if not exists public.music_samples (
  id            uuid primary key default gen_random_uuid(),
  chapter_id    uuid references public.chapters(id) on delete set null,
  title         text not null default '',
  note          text not null default '',
  status        text not null default 'pending'
                check (status in ('pending','accepted','held','rejected')),
  path          text not null,               -- 저장소(music-samples) 안의 경로
  file_name     text not null default '',    -- 올린 파일의 원래 이름
  size_bytes    bigint,
  duration_sec  real,
  peaks         jsonb,                       -- 파형 막대 높이(0~1) 배열. 브라우저가 못 읽은 파일은 null
  uploader_id   uuid default auth.uid() references public.profiles(id) on delete set null,
  uploader_name text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists music_samples_chapter_idx on public.music_samples(chapter_id, created_at);

-- 곡에 다는 피드백. at_sec 이 있으면 곡의 그 지점(초)에 단 것이다.
create table if not exists public.music_comments (
  id          uuid primary key default gen_random_uuid(),
  sample_id   uuid not null references public.music_samples(id) on delete cascade,
  author_id   uuid default auth.uid() references public.profiles(id) on delete set null,
  author_name text not null default '',
  body        text not null check (length(btrim(body)) > 0),
  at_sec      real check (at_sec is null or at_sec >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists music_comments_sample_idx on public.music_comments(sample_id, created_at);

alter table public.music_samples  enable row level security;
alter table public.music_comments enable row level security;
-- (Supabase 는 새 테이블 권한을 보통 자동으로 주지만, 꺼 둔 프로젝트도 있어 명시해 둔다.)
grant select, insert, update, delete on public.music_samples to authenticated;
grant select, insert, delete on public.music_comments to authenticated;

-- 곡: 조회는 전원, 올리기는 본인 이름으로만, 고치기 · 지우기는 올린 사람만.
drop policy if exists music_samples_select on public.music_samples;
create policy music_samples_select on public.music_samples
  for select to authenticated using (true);
drop policy if exists music_samples_insert on public.music_samples;
create policy music_samples_insert on public.music_samples
  for insert to authenticated with check (uploader_id = auth.uid());
drop policy if exists music_samples_update on public.music_samples;
create policy music_samples_update on public.music_samples
  for update to authenticated using (uploader_id = auth.uid()) with check (uploader_id = auth.uid());
drop policy if exists music_samples_delete on public.music_samples;
create policy music_samples_delete on public.music_samples
  for delete to authenticated using (uploader_id = auth.uid());

-- 피드백: 조회는 전원, 쓰기는 본인 이름으로만, 지우기는 쓴 사람만.
drop policy if exists music_comments_select on public.music_comments;
create policy music_comments_select on public.music_comments
  for select to authenticated using (true);
drop policy if exists music_comments_insert on public.music_comments;
create policy music_comments_insert on public.music_comments
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists music_comments_delete on public.music_comments;
create policy music_comments_delete on public.music_comments
  for delete to authenticated using (author_id = auth.uid());

-- 가입 승인제: 승인된 계정만 (2026-11-05_signup_approval.sql 의 approved_only 와 같은 정책).
drop policy if exists approved_only on public.music_samples;
create policy approved_only on public.music_samples as restrictive for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
drop policy if exists approved_only on public.music_comments;
create policy approved_only on public.music_comments as restrictive for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

-- 채택 · 보류 · 반려 · 검토중: 회의에서 누구나 바꾼다. 곡 행의 다른 칸은 올린 사람만 고치므로 함수로 우회한다.
-- SECURITY DEFINER 는 RLS 를 지나치므로 안에서 승인 여부를 따로 본다.
create or replace function public.set_music_status(p_sample_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approved() then
    raise exception '승인되지 않은 계정입니다.';
  end if;
  if p_status is null or p_status not in ('pending','accepted','held','rejected') then
    raise exception 'invalid status %', p_status;
  end if;
  update public.music_samples
     set status = p_status, updated_at = now()
   where id = p_sample_id;
end;
$$;

revoke all on function public.set_music_status(uuid, text) from public, anon;
grant execute on function public.set_music_status(uuid, text) to authenticated;

-- 음악 파일 저장소. 비공개 버킷이라 로그인한 팀원만 짧게 서명한 주소로 듣고 받는다.
-- 한 파일 20MB 까지, 오디오 파일만 받는다. (다시 실행하면 이 제한을 다시 맞춘다.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music-samples', 'music-samples', false, 20971520, array['audio/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- (서명 주소를 만들거나 파일을 지울 때 Supabase 가 그 파일을 조회하므로 조회 권한도 필요하다.)
-- storage.objects 의 approved_only 정책(승인제 SQL)이 이 버킷에도 그대로 걸린다.
drop policy if exists music_files_select on storage.objects;
create policy music_files_select on storage.objects
  for select to authenticated using (bucket_id = 'music-samples');
drop policy if exists music_files_insert on storage.objects;
create policy music_files_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'music-samples');
drop policy if exists music_files_delete on storage.objects;
create policy music_files_delete on storage.objects
  for delete to authenticated using (bucket_id = 'music-samples');
