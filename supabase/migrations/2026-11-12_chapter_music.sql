-- ============================================================
--  2026-11-12 · 챕터 음악 (/music)
--  Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여넣고 Run.
--  여러 번 실행해도 안전합니다. 기존 데이터는 건드리지 않습니다. (supabase/schema.sql 에도 같은 블록이 들어 있습니다.)
--  적용 전에는 /music 화면이 이 SQL 을 실행하라는 안내만 보여 줍니다.
-- ============================================================

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
