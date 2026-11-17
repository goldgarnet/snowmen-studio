-- 맵 내용이나 상세 정보가 실제로 바뀌면 같은 트랜잭션에서 직접 체크를 초기화한다.
create or replace function public.reset_map_clears_on_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.map_clears where map_id = new.id;
  return new;
end;
$$;

revoke all on function public.reset_map_clears_on_edit() from public, anon, authenticated;

drop trigger if exists reset_map_clears_on_edit on public.maps;
create trigger reset_map_clears_on_edit
  after update on public.maps
  for each row
  when (
    (old.code, old.title, old.author_name, old.comment, old.author_difficulty, old.created_at)
    is distinct from
    (new.code, new.title, new.author_name, new.comment, new.author_difficulty, new.created_at)
  )
  execute function public.reset_map_clears_on_edit();
