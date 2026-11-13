-- ============================================================
--  2026-11-13 · 음악 탭 개편 (/music)
--  · 곡을 올리고 고치고 지우는 것은 김정훈(luffy84) · 황정빈(jbin1003) 두 계정만.
--  · 채택 · 보류 · 반려와 피드백은 없앤다. 곡은 누구나 듣는다.
--  · 각자 자기 플레이리스트를 만든다(만든 사람만 보고 고친다).
--  Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여넣고 Run.
--  2026-11-12_chapter_music.sql 뒤에 실행한다. 여러 번 실행해도 안전하다. 올린 곡은 그대로 둔다.
--  (supabase/schema.sql 끝의 음악 블록은 이 파일까지 반영한 모습이다.)
-- ============================================================

-- 음악을 올리는 계정. src/lib/members.ts 의 MUSIC_UPLOADER_IDS 와 같다.
-- NULL 을 돌려주지 않는다(로그인하지 않았으면 false).
create or replace function public.is_music_uploader()
returns boolean
language sql
stable
as $$
  select coalesce(auth.uid() = any (array[
    'b807cfa1-b912-4a27-a0a5-af2a302e4577',   -- luffy84 김정훈
    '01bf932f-c8f4-4837-8ed1-417a3e1ee791'    -- jbin1003 황정빈
  ]::uuid[]), false);
$$;

revoke all on function public.is_music_uploader() from public, anon;
grant execute on function public.is_music_uploader() to authenticated;

-- 곡: 조회는 전원. 올리기 · 고치기 · 지우기는 두 계정만(서로 올린 곡도 고치고 지운다).
drop policy if exists music_samples_insert on public.music_samples;
create policy music_samples_insert on public.music_samples
  for insert to authenticated with check ((select public.is_music_uploader()) and uploader_id = auth.uid());
drop policy if exists music_samples_update on public.music_samples;
create policy music_samples_update on public.music_samples
  for update to authenticated using ((select public.is_music_uploader())) with check ((select public.is_music_uploader()));
drop policy if exists music_samples_delete on public.music_samples;
create policy music_samples_delete on public.music_samples
  for delete to authenticated using ((select public.is_music_uploader()));

-- 음악 파일도 두 계정만 올리고 지운다. 듣기(서명 주소)는 로그인한 팀원 전원.
drop policy if exists music_files_insert on storage.objects;
create policy music_files_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'music-samples' and (select public.is_music_uploader()));
drop policy if exists music_files_delete on storage.objects;
create policy music_files_delete on storage.objects
  for delete to authenticated using (bucket_id = 'music-samples' and (select public.is_music_uploader()));

-- 채택 · 피드백은 없앤다. music_samples.status 칸은 남지만 쓰지 않는다.
drop function if exists public.set_music_status(uuid, text);
-- 피드백 표는 비어 있을 때만 지운다(2026-11-13 라이브는 0줄). 글이 있으면 그대로 두고 화면에서만 쓰지 않는다.
do $$
begin
  if to_regclass('public.music_comments') is not null then
    if not exists (select 1 from public.music_comments) then
      drop table public.music_comments;
    end if;
  end if;
end;
$$;

-- ---------- 내 플레이리스트(music_playlists / music_playlist_items) ----------
-- 플레이리스트는 만든 사람만 보고 고친다. 곡을 지우면 플레이리스트에서도 빠진다.
create table if not exists public.music_playlists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name       text not null default '' check (length(name) <= 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists music_playlists_owner_idx on public.music_playlists(owner_id, sort_order);

create table if not exists public.music_playlist_items (
  id          uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.music_playlists(id) on delete cascade,
  sample_id   uuid not null references public.music_samples(id) on delete cascade,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (playlist_id, sample_id)
);
create index if not exists music_playlist_items_playlist_idx on public.music_playlist_items(playlist_id, sort_order);

alter table public.music_playlists      enable row level security;
alter table public.music_playlist_items enable row level security;
grant select, insert, update, delete on public.music_playlists to authenticated;
grant select, insert, update, delete on public.music_playlist_items to authenticated;

drop policy if exists music_playlists_own on public.music_playlists;
create policy music_playlists_own on public.music_playlists
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists music_playlist_items_own on public.music_playlist_items;
create policy music_playlist_items_own on public.music_playlist_items
  for all to authenticated
  using (exists (select 1 from public.music_playlists p where p.id = playlist_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.music_playlists p where p.id = playlist_id and p.owner_id = auth.uid()));

-- 가입 승인제: 승인된 계정만 (2026-11-05_signup_approval.sql 의 approved_only 와 같은 정책).
drop policy if exists approved_only on public.music_playlists;
create policy approved_only on public.music_playlists as restrictive for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
drop policy if exists approved_only on public.music_playlist_items;
create policy approved_only on public.music_playlist_items as restrictive for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));
