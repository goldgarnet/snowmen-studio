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
