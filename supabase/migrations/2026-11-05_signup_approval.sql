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
