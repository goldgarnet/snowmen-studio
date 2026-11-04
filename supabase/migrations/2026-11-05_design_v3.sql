-- ============================================================
--  2026-11-05 · 디자인 작업 공간 v3 (시안 · 피드백 · 가이드/채색 · 마감)
--  Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여넣고 Run.
--  지금 내용은 지우지 않습니다. 여러 번 실행해도 안전합니다.
-- ============================================================

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

do $v3$
declare s1 integer; s2 integer;
begin
  if exists (select 1 from public.design_tasks where name = '플레이맵 요소 기하학적 스케치 (소민)') then
    raise notice '이미 적용된 내용입니다.';
    return;
  end if;

  -- 요소 하나는 한 사람이 맡는다. 묶여 있던 담당은 비우고 내부에서 정한다.
  update public.design_items set assignee = '' where assignee = '민준·소민';

  -- 같은 기간에 일하는 두 사람의 일정은 줄을 나눈다.
  select sort_order into s1 from public.design_tasks where name = '플레이맵 요소 기하학적 스케치';
  select sort_order into s2 from public.design_tasks where name = '기본 요소 완성 · 챕터 0 세트';
  if s1 is not null and s2 is not null then
    update public.design_tasks set sort_order = sort_order + 2 where sort_order > s2;
    update public.design_tasks set name = '플레이맵 요소 기하학적 스케치 (민준)', owner = '민준' where name = '플레이맵 요소 기하학적 스케치';
    update public.design_tasks set name = '기본 요소 완성 · 챕터 0 세트 (민준)', owner = '민준', sort_order = s2 + 1 where name = '기본 요소 완성 · 챕터 0 세트';
    insert into public.design_tasks (name, owner, start_date, end_date, category, sort_order)
      select '플레이맵 요소 기하학적 스케치 (소민)', '소민', start_date, end_date, category, s2 from public.design_tasks where name = '플레이맵 요소 기하학적 스케치 (민준)';
    insert into public.design_tasks (name, owner, start_date, end_date, category, sort_order)
      select '기본 요소 완성 · 챕터 0 세트 (소민)', '소민', start_date, end_date, category, s2 + 2 from public.design_tasks where name = '기본 요소 완성 · 챕터 0 세트 (민준)';
  end if;

  -- 항목을 타임라인에 연결한다. 일정을 옮기면 항목 마감도 따라간다.
  update public.design_items i
     set task_id = t.id, draft_task_id = d.id, split = m.split
    from (values
      ('캐릭터 · 겨울의 영혼', '겨울의 영혼', '캐릭터 18장 · 영혼 3장', '캐릭터 · 겨울의 영혼 시안'::text, false),
      ('캐릭터 · 겨울의 영혼', '플레이어 1단', '캐릭터 18장 · 영혼 3장', '캐릭터 · 겨울의 영혼 시안'::text, false),
      ('캐릭터 · 겨울의 영혼', '플레이어 2단', '캐릭터 18장 · 영혼 3장', '캐릭터 · 겨울의 영혼 시안'::text, false),
      ('캐릭터 · 겨울의 영혼', '플레이어 3단', '캐릭터 18장 · 영혼 3장', '캐릭터 · 겨울의 영혼 시안'::text, false),
      ('캐릭터 · 겨울의 영혼', '빈 눈사람 1단', '캐릭터 18장 · 영혼 3장', '캐릭터 · 겨울의 영혼 시안'::text, false),
      ('캐릭터 · 겨울의 영혼', '빈 눈사람 2단', '캐릭터 18장 · 영혼 3장', '캐릭터 · 겨울의 영혼 시안'::text, false),
      ('캐릭터 · 겨울의 영혼', '빈 눈사람 3단', '캐릭터 18장 · 영혼 3장', '캐릭터 · 겨울의 영혼 시안'::text, false),
      ('캐릭터 · 겨울의 영혼', '플레이어 3단 녹는 모습', '녹는 모습 9~12장', '캐릭터 · 겨울의 영혼 시안'::text, false),
      ('캐릭터 · 겨울의 영혼', '플레이어 2단 녹는 모습', '녹는 모습 9~12장', '캐릭터 · 겨울의 영혼 시안'::text, false),
      ('캐릭터 · 겨울의 영혼', '플레이어 1단 녹는 모습', '녹는 모습 9~12장', '캐릭터 · 겨울의 영혼 시안'::text, false),
      ('플레이맵 기본 요소 (기하학적 스케치)', '눈덩이', '기본 요소 완성 · 챕터 0 세트 (민준)', '플레이맵 요소 기하학적 스케치 (민준)'::text, false),
      ('플레이맵 기본 요소 (기하학적 스케치)', '블록', '기본 요소 완성 · 챕터 0 세트 (민준)', '플레이맵 요소 기하학적 스케치 (민준)'::text, false),
      ('플레이맵 기본 요소 (기하학적 스케치)', '나무 기본 틀', '기본 요소 완성 · 챕터 0 세트 (민준)', '플레이맵 요소 기하학적 스케치 (민준)'::text, false),
      ('플레이맵 기본 요소 (기하학적 스케치)', '벽 기본 틀', '기본 요소 완성 · 챕터 0 세트 (민준)', '플레이맵 요소 기하학적 스케치 (민준)'::text, false),
      ('플레이맵 기본 요소 (기하학적 스케치)', '차가운 타일 기본', '기본 요소 완성 · 챕터 0 세트 (민준)', '플레이맵 요소 기하학적 스케치 (민준)'::text, false),
      ('플레이맵 기본 요소 (기하학적 스케치)', '따뜻한 타일 기본', '기본 요소 완성 · 챕터 0 세트 (민준)', '플레이맵 요소 기하학적 스케치 (민준)'::text, false),
      ('플레이맵 기본 요소 (기하학적 스케치)', '목적지', '기본 요소 완성 · 챕터 0 세트 (민준)', '플레이맵 요소 기하학적 스케치 (민준)'::text, false),
      ('플레이맵 기본 요소 (기하학적 스케치)', '눈꽃 표시', '기본 요소 완성 · 챕터 0 세트 (민준)', '플레이맵 요소 기하학적 스케치 (민준)'::text, false),
      ('플레이맵 기본 요소 (기하학적 스케치)', '아치', '기본 요소 완성 · 챕터 0 세트 (민준)', '플레이맵 요소 기하학적 스케치 (민준)'::text, false),
      ('사전 준비', '컨셉아트 제작', '컨셉아트 · 레퍼런스 마무리', null::text, false),
      ('사전 준비', '레퍼런스 모음', '컨셉아트 · 레퍼런스 마무리', null::text, false),
      ('챕터 0 마을', '차가운 타일', '기본 요소 완성 · 챕터 0 세트 (민준)', null::text, false),
      ('챕터 0 마을', '따뜻한 타일', '기본 요소 완성 · 챕터 0 세트 (민준)', null::text, false),
      ('챕터 0 마을', '일반 벽 (막는 것)', '기본 요소 완성 · 챕터 0 세트 (민준)', null::text, false),
      ('챕터 0 마을', '나무 (키 큰 것)', '기본 요소 완성 · 챕터 0 세트 (민준)', null::text, false),
      ('챕터 0 마을', '챕터 배경', '기본 요소 완성 · 챕터 0 세트 (민준)', null::text, true),
      ('챕터 0 마을', '섬 꾸밈', '섬 테두리 · 밑동 · 섬 꾸밈', null::text, false),
      ('챕터 0 마을', '월드맵 2장 스케치', '챕터 0 월드맵 · 공용 표시', null::text, true),
      ('챕터 0 마을', '월드맵 길 타일', '챕터 0 월드맵 · 공용 표시', null::text, true),
      ('챕터 0 마을', '월드맵 구조물', '챕터 0 월드맵 · 공용 표시', null::text, true),
      ('챕터 0 마을', '멈춘 생명체', '챕터 0 월드맵 · 공용 표시', null::text, true),
      ('챕터 1 설원', '차가운 타일', '챕터 1·2 플레이맵 세트', null::text, false),
      ('챕터 1 설원', '따뜻한 타일', '챕터 1·2 플레이맵 세트', null::text, false),
      ('챕터 1 설원', '일반 벽 (막는 것)', '챕터 1·2 플레이맵 세트', null::text, false),
      ('챕터 1 설원', '나무 (키 큰 것)', '챕터 1·2 플레이맵 세트', null::text, false),
      ('챕터 1 설원', '챕터 배경', '챕터 1·2 플레이맵 세트', null::text, true),
      ('챕터 1 설원', '섬 꾸밈', '섬 테두리 · 밑동 · 섬 꾸밈', null::text, false),
      ('챕터 1 설원', '월드맵 2장 스케치', '챕터 1·2 월드맵', null::text, true),
      ('챕터 1 설원', '월드맵 길 타일', '챕터 1·2 월드맵', null::text, true),
      ('챕터 1 설원', '월드맵 구조물', '챕터 1·2 월드맵', null::text, true),
      ('챕터 1 설원', '멈춘 생명체', '챕터 1·2 월드맵', null::text, true),
      ('챕터 2 바위지형', '차가운 타일', '챕터 1·2 플레이맵 세트', null::text, false),
      ('챕터 2 바위지형', '따뜻한 타일', '챕터 1·2 플레이맵 세트', null::text, false),
      ('챕터 2 바위지형', '일반 벽 (막는 것)', '챕터 1·2 플레이맵 세트', null::text, false),
      ('챕터 2 바위지형', '나무 (키 큰 것)', '챕터 1·2 플레이맵 세트', null::text, false),
      ('챕터 2 바위지형', '챕터 배경', '챕터 1·2 플레이맵 세트', null::text, true),
      ('챕터 2 바위지형', '섬 꾸밈', '섬 테두리 · 밑동 · 섬 꾸밈', null::text, false),
      ('챕터 2 바위지형', '월드맵 2장 스케치', '챕터 1·2 월드맵', null::text, true),
      ('챕터 2 바위지형', '월드맵 길 타일', '챕터 1·2 월드맵', null::text, true),
      ('챕터 2 바위지형', '월드맵 구조물', '챕터 1·2 월드맵', null::text, true),
      ('챕터 2 바위지형', '멈춘 생명체', '챕터 1·2 월드맵', null::text, true),
      ('챕터 3 동굴', '차가운 타일', '챕터 3·4 플레이맵 세트', null::text, false),
      ('챕터 3 동굴', '따뜻한 타일', '챕터 3·4 플레이맵 세트', null::text, false),
      ('챕터 3 동굴', '일반 벽 (막는 것)', '챕터 3·4 플레이맵 세트', null::text, false),
      ('챕터 3 동굴', '나무 (키 큰 것)', '챕터 3·4 플레이맵 세트', null::text, false),
      ('챕터 3 동굴', '챕터 배경', '챕터 3·4 플레이맵 세트', null::text, true),
      ('챕터 3 동굴', '섬 꾸밈', '섬 테두리 · 밑동 · 섬 꾸밈', null::text, false),
      ('챕터 3 동굴', '월드맵 2장 스케치', '챕터 3·4 월드맵', null::text, true),
      ('챕터 3 동굴', '월드맵 길 타일', '챕터 3·4 월드맵', null::text, true),
      ('챕터 3 동굴', '월드맵 구조물', '챕터 3·4 월드맵', null::text, true),
      ('챕터 3 동굴', '멈춘 생명체', '챕터 3·4 월드맵', null::text, true),
      ('챕터 4 숲', '차가운 타일', '챕터 3·4 플레이맵 세트', null::text, false),
      ('챕터 4 숲', '따뜻한 타일', '챕터 3·4 플레이맵 세트', null::text, false),
      ('챕터 4 숲', '일반 벽 (막는 것)', '챕터 3·4 플레이맵 세트', null::text, false),
      ('챕터 4 숲', '나무 (키 큰 것)', '챕터 3·4 플레이맵 세트', null::text, false),
      ('챕터 4 숲', '챕터 배경', '챕터 3·4 플레이맵 세트', null::text, true),
      ('챕터 4 숲', '섬 꾸밈', '섬 테두리 · 밑동 · 섬 꾸밈', null::text, false),
      ('챕터 4 숲', '월드맵 2장 스케치', '챕터 3·4 월드맵', null::text, true),
      ('챕터 4 숲', '월드맵 길 타일', '챕터 3·4 월드맵', null::text, true),
      ('챕터 4 숲', '월드맵 구조물', '챕터 3·4 월드맵', null::text, true),
      ('챕터 4 숲', '멈춘 생명체', '챕터 3·4 월드맵', null::text, true),
      ('챕터 5 신전 외곽', '차가운 타일', '챕터 5·6 플레이맵 세트', null::text, false),
      ('챕터 5 신전 외곽', '따뜻한 타일', '챕터 5·6 플레이맵 세트', null::text, false),
      ('챕터 5 신전 외곽', '일반 벽 (막는 것)', '챕터 5·6 플레이맵 세트', null::text, false),
      ('챕터 5 신전 외곽', '나무 (키 큰 것)', '챕터 5·6 플레이맵 세트', null::text, false),
      ('챕터 5 신전 외곽', '챕터 배경', '챕터 5·6 플레이맵 세트', null::text, true),
      ('챕터 5 신전 외곽', '섬 꾸밈', '섬 테두리 · 밑동 · 섬 꾸밈', null::text, false),
      ('챕터 5 신전 외곽', '월드맵 2장 스케치', '챕터 5·6 월드맵', null::text, true),
      ('챕터 5 신전 외곽', '월드맵 길 타일', '챕터 5·6 월드맵', null::text, true),
      ('챕터 5 신전 외곽', '월드맵 구조물', '챕터 5·6 월드맵', null::text, true),
      ('챕터 5 신전 외곽', '결계 입구 · 유리 신전 입구', '챕터 5·6 월드맵', null::text, true),
      ('챕터 5 신전 외곽', 'Anne', '챕터 5·6 월드맵', null::text, true),
      ('챕터 6 신전 중심', '차가운 타일', '챕터 5·6 플레이맵 세트', null::text, false),
      ('챕터 6 신전 중심', '따뜻한 타일', '챕터 5·6 플레이맵 세트', null::text, false),
      ('챕터 6 신전 중심', '일반 벽 (막는 것)', '챕터 5·6 플레이맵 세트', null::text, false),
      ('챕터 6 신전 중심', '나무 (키 큰 것)', '챕터 5·6 플레이맵 세트', null::text, false),
      ('챕터 6 신전 중심', '챕터 배경', '챕터 5·6 플레이맵 세트', null::text, true),
      ('챕터 6 신전 중심', '섬 꾸밈', '섬 테두리 · 밑동 · 섬 꾸밈', null::text, false),
      ('챕터 6 신전 중심', '월드맵 2장 스케치', '챕터 5·6 월드맵', null::text, true),
      ('챕터 6 신전 중심', '월드맵 길 타일', '챕터 5·6 월드맵', null::text, true),
      ('챕터 6 신전 중심', '월드맵 구조물', '챕터 5·6 월드맵', null::text, true),
      ('챕터 6 신전 중심', '지구 동력 장치', '챕터 5·6 월드맵', null::text, true),
      ('기믹 요소', '초록 버튼', '기믹 16장', null::text, false),
      ('기믹 요소', '균열', '기믹 16장', null::text, false),
      ('기믹 요소', '노랑 버튼', '기믹 16장', null::text, false),
      ('기믹 요소', '노랑 벽', '기믹 16장', null::text, false),
      ('기믹 요소', '레이저 발사기', '기믹 16장', null::text, false),
      ('기믹 요소', '삼각 벽', '기믹 16장', null::text, false),
      ('기믹 요소', '영혼 발판', '기믹 16장', null::text, false),
      ('FX', '영혼 파티클', 'FX 협의 · 제작', null::text, false),
      ('FX', '눈가루 파티클', 'FX 협의 · 제작', null::text, false),
      ('FX', '반짝임 파티클', 'FX 협의 · 제작', null::text, false),
      ('FX', '물방울 파티클', 'FX 협의 · 제작', null::text, false),
      ('FX', '파편 파티클', 'FX 협의 · 제작', null::text, false),
      ('월드맵 공용', '톱니 조각', '톱니 조각 12개 · 작은 파편', null::text, false),
      ('월드맵 공용', '작은 파편', '톱니 조각 12개 · 작은 파편', null::text, false),
      ('월드맵 공용', '퍼즐 입구', '챕터 0 월드맵 · 공용 표시', null::text, false),
      ('월드맵 공용', '문', '챕터 0 월드맵 · 공용 표시', null::text, false),
      ('월드맵 공용', '출구', '챕터 0 월드맵 · 공용 표시', null::text, false),
      ('섬 테두리 · 밑동', '섬 테두리 · 밑동 · 게임판 옆면', '섬 테두리 · 밑동 · 섬 꾸밈', null::text, false),
      ('컷씬 · UI', '컷씬 영상', '컷씬 3편', null::text, false),
      ('컷씬 · UI', '타이틀 키 아트', '타이틀 · 로고 · 스토어 이미지', null::text, false),
      ('컷씬 · UI', '게임 로고', '타이틀 · 로고 · 스토어 이미지', null::text, false),
      ('컷씬 · UI', '톱니 조각 아이콘', '타이틀 · 로고 · 스토어 이미지', null::text, false),
      ('컷씬 · UI', '작은 파편 아이콘', '타이틀 · 로고 · 스토어 이미지', null::text, false),
      ('컷씬 · UI', '설정 창 UI 키트', '타이틀 · 로고 · 스토어 이미지', null::text, false),
      ('컷씬 · UI', '공용 배경 (선택)', null, null::text, false),
      ('스토어 · 플랫폼', '스팀 스토어 이미지', '타이틀 · 로고 · 스토어 이미지', null::text, false),
      ('스토어 · 플랫폼', '앱 아이콘', '타이틀 · 로고 · 스토어 이미지', null::text, false),
      ('스토어 · 플랫폼', '부트 스플래시', '타이틀 · 로고 · 스토어 이미지', null::text, false)
    ) as m(grp, item, task, draft, split)
    join public.design_groups g on g.name = m.grp
    left join public.design_tasks t on t.name = m.task
    left join public.design_tasks d on d.name = m.draft
   where i.group_id = g.id and i.name = m.item;
end $v3$;
