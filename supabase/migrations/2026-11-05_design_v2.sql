-- ============================================================
--  2026-11-05 · 디자인 작업 공간 v2 (파일 칸 · 색 · 분류 + 새 내용)
--  Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여넣고 Run.
--  ⚠ 지금 묶음 · 항목 · 일정을 지우고 새 내용으로 바꿉니다. 지운 내용은 design_backup 표에 남습니다.
--  이미 적용했다면 오류만 나고 아무것도 바뀌지 않습니다.
-- ============================================================

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

-- 지우기 전 내용을 남겨 둔다. 로그인 사용자도 읽을 수 없고 대시보드에서만 볼 수 있다.
create table if not exists public.design_backup (
  kind     text not null,
  row      jsonb not null,
  saved_at timestamptz not null default now()
);
alter table public.design_backup enable row level security;

do $seed$
declare g uuid; i uuid;
begin
  if exists (select 1 from public.design_groups where name = '캐릭터 · 겨울의 영혼') then
    raise exception '이미 v2 내용이 들어 있습니다. 바뀐 것은 없습니다.';
  end if;
  insert into public.design_backup (kind, row) select 'group', to_jsonb(t) from public.design_groups t;
  insert into public.design_backup (kind, row) select 'item', to_jsonb(t) from public.design_items t;
  insert into public.design_backup (kind, row) select 'image', to_jsonb(t) from public.design_images t;
  insert into public.design_backup (kind, row) select 'task', to_jsonb(t) from public.design_tasks t;
  delete from public.design_groups;   -- 항목 · 그림 기록도 함께 지워진다
  delete from public.design_tasks;

  insert into public.design_groups (name, note, color, sort_order) values ('캐릭터 · 겨울의 영혼', '1순위 · 시연님이 가장 먼저 작업합니다', 'blue', 0) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '겨울의 영혼', '캐릭터', '투명', '우선 제작', '시연', '이 게임의 주인공입니다. 눈사람 안에 들어가 이동하고, 영혼이 옮겨 갈 때는 몸에서 나와 다른 눈사람으로 이동하는 모습이 보입니다.
옮겨 갈 눈사람이 없으면 몸에서 나와 위로 떠오릅니다.', '푸른 요정입니다. 불꽃 느낌보다 겨울에 어울리는 요정 같은 디자인으로 그립니다.
다리는 없습니다.
항상 두건을 씁니다. 두건만 따로 만들지 않고 캐릭터 전체를 디자인합니다.
영혼이 든 눈사람(플레이어)과 같은 두건이어야 합니다.
그림체는 카툰체도 가능합니다. 최종 판단은 디자인팀 의견을 따릅니다.', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'soul_down.png', '정면', 256, 256, 120, 168, null, null, 'center', '본체는 최대 크기입니다.', '아래로 이동할 때 보이는 모습입니다.'),
    (i, 1, 'soul_up.png', '뒷모습', 256, 256, 120, 168, null, null, 'center', '본체는 최대 크기입니다.', '위로 이동할 때 보이는 모습입니다.'),
    (i, 2, 'soul_right.png', '옆모습', 256, 256, 120, 168, null, null, 'center', '본체는 최대 크기입니다.', '오른쪽으로 이동할 때 보이는 모습입니다. 왼쪽은 이 그림을 뒤집어 씁니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '플레이어 1단', '캐릭터', '투명', '우선 제작', '시연', '영혼이 든 1단 눈사람입니다. 얼굴, 나뭇가지, 두건이 있습니다.', '두건은 영혼과 같은 모양으로, 몸 크기에 맞춥니다.
같은 단 수의 플레이어와 빈 눈사람은 몸 위치가 같아야 합니다. 영혼이 옮겨 갈 때 두 그림이 겹쳐 바뀝니다.
본체 폭은 나뭇가지까지 포함한 크기입니다.
1단 캔버스는 머리 위 여유가 12 px뿐입니다. 시안을 본 뒤 필요하면 캔버스를 키웁니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'player_1_down.png', '정면', 256, 288, 150, 166, 110, null, 'stand', '아래 공 Ø110 · 머리 Ø79', '아래로 이동할 때 보이는 모습입니다.'),
    (i, 1, 'player_1_up.png', '뒷모습', 256, 288, 150, 166, 110, null, 'stand', '아래 공 Ø110 · 머리 Ø79', '위로 이동할 때 보이는 모습입니다.'),
    (i, 2, 'player_1_right.png', '옆모습', 256, 288, 150, 166, 110, null, 'stand', '아래 공 Ø110 · 머리 Ø79', '오른쪽으로 이동할 때 보이는 모습입니다. 왼쪽은 이 그림을 뒤집어 씁니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '플레이어 2단', '캐릭터', '투명', '우선 제작', '시연', '영혼이 든 2단 눈사람입니다. 얼굴, 나뭇가지, 두건이 있습니다. 월드맵을 걷는 모습에도 이 그림을 씁니다.', '두건은 영혼과 같은 모양으로, 몸 크기에 맞춥니다.
같은 단 수의 플레이어와 빈 눈사람은 몸 위치가 같아야 합니다. 영혼이 옮겨 갈 때 두 그림이 겹쳐 바뀝니다.
본체 폭은 나뭇가지까지 포함한 크기입니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'player_2_down.png', '정면', 320, 448, 204, 251, 110, null, 'stand', '아래 공 Ø166 · 머리 Ø120', '아래로 이동할 때 보이는 모습입니다.'),
    (i, 1, 'player_2_up.png', '뒷모습', 320, 448, 204, 251, 110, null, 'stand', '아래 공 Ø166 · 머리 Ø120', '위로 이동할 때 보이는 모습입니다.'),
    (i, 2, 'player_2_right.png', '옆모습', 320, 448, 204, 251, 110, null, 'stand', '아래 공 Ø166 · 머리 Ø120', '오른쪽으로 이동할 때 보이는 모습입니다. 왼쪽은 이 그림을 뒤집어 씁니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '플레이어 3단', '캐릭터', '투명', '우선 제작', '시연', '영혼이 든 3단 눈사람입니다. 얼굴, 나뭇가지, 두건이 있습니다.', '두건은 영혼과 같은 모양으로, 몸 크기에 맞춥니다.
같은 단 수의 플레이어와 빈 눈사람은 몸 위치가 같아야 합니다. 영혼이 옮겨 갈 때 두 그림이 겹쳐 바뀝니다.
본체 폭은 나뭇가지까지 포함한 크기입니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'player_3_down.png', '정면', 384, 640, 244, 336, 110, null, 'stand', '아래 공 Ø222 · 머리 Ø160', '아래로 이동할 때 보이는 모습입니다.'),
    (i, 1, 'player_3_up.png', '뒷모습', 384, 640, 244, 336, 110, null, 'stand', '아래 공 Ø222 · 머리 Ø160', '위로 이동할 때 보이는 모습입니다.'),
    (i, 2, 'player_3_right.png', '옆모습', 384, 640, 244, 336, 110, null, 'stand', '아래 공 Ø222 · 머리 Ø160', '오른쪽으로 이동할 때 보이는 모습입니다. 왼쪽은 이 그림을 뒤집어 씁니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '빈 눈사람 1단', '캐릭터', '투명', '우선 제작', '시연', '영혼이 없는 1단 눈사람입니다. 얼굴, 나뭇가지, 두건이 없는 진짜 빈 눈사람입니다.', '같은 단 수의 플레이어와 빈 눈사람은 몸 위치가 같아야 합니다. 영혼이 옮겨 갈 때 두 그림이 겹쳐 바뀝니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'snowman_1_down.png', '정면', 256, 288, 150, 166, 110, null, 'stand', '아래 공 Ø110 · 머리 Ø79', '아래로 이동할 때 보이는 모습입니다.'),
    (i, 1, 'snowman_1_up.png', '뒷모습', 256, 288, 150, 166, 110, null, 'stand', '아래 공 Ø110 · 머리 Ø79', '위로 이동할 때 보이는 모습입니다.'),
    (i, 2, 'snowman_1_right.png', '옆모습', 256, 288, 150, 166, 110, null, 'stand', '아래 공 Ø110 · 머리 Ø79', '오른쪽으로 이동할 때 보이는 모습입니다. 왼쪽은 이 그림을 뒤집어 씁니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '빈 눈사람 2단', '캐릭터', '투명', '우선 제작', '시연', '영혼이 없는 2단 눈사람입니다. 얼굴, 나뭇가지, 두건이 없는 진짜 빈 눈사람입니다.', '같은 단 수의 플레이어와 빈 눈사람은 몸 위치가 같아야 합니다. 영혼이 옮겨 갈 때 두 그림이 겹쳐 바뀝니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'snowman_2_down.png', '정면', 320, 448, 204, 251, 110, null, 'stand', '아래 공 Ø166 · 머리 Ø120', '아래로 이동할 때 보이는 모습입니다.'),
    (i, 1, 'snowman_2_up.png', '뒷모습', 320, 448, 204, 251, 110, null, 'stand', '아래 공 Ø166 · 머리 Ø120', '위로 이동할 때 보이는 모습입니다.'),
    (i, 2, 'snowman_2_right.png', '옆모습', 320, 448, 204, 251, 110, null, 'stand', '아래 공 Ø166 · 머리 Ø120', '오른쪽으로 이동할 때 보이는 모습입니다. 왼쪽은 이 그림을 뒤집어 씁니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '빈 눈사람 3단', '캐릭터', '투명', '우선 제작', '시연', '영혼이 없는 3단 눈사람입니다. 얼굴, 나뭇가지, 두건이 없는 진짜 빈 눈사람입니다.', '같은 단 수의 플레이어와 빈 눈사람은 몸 위치가 같아야 합니다. 영혼이 옮겨 갈 때 두 그림이 겹쳐 바뀝니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'snowman_3_down.png', '정면', 384, 640, 244, 336, 110, null, 'stand', '아래 공 Ø222 · 머리 Ø160', '아래로 이동할 때 보이는 모습입니다.'),
    (i, 1, 'snowman_3_up.png', '뒷모습', 384, 640, 244, 336, 110, null, 'stand', '아래 공 Ø222 · 머리 Ø160', '위로 이동할 때 보이는 모습입니다.'),
    (i, 2, 'snowman_3_right.png', '옆모습', 384, 640, 244, 336, 110, null, 'stand', '아래 공 Ø222 · 머리 Ø160', '오른쪽으로 이동할 때 보이는 모습입니다. 왼쪽은 이 그림을 뒤집어 씁니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 7, '플레이어 3단 녹는 모습', '캐릭터', '투명', '우선 제작', '시연', '3단 플레이어가 따뜻한 타일에서 2단으로 줄어드는 장면입니다. 게임이 낱장을 순서대로 재생합니다.', '중요: 얼굴과 나뭇가지가 주륵 흘러내리는 모습이 명확하게 보여야 합니다.
두건은 줄어든 몸 크기에 맞게 작아집니다.
정면만 그립니다. 낱장은 3~4장이고 시안을 보며 계속 바꿔 나갑니다.', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'player_3_melt_1.png', '낱장 1', 384, 640, 244, 336, 110, null, 'stand', '', '녹기 시작하는 순간.'),
    (i, 1, 'player_3_melt_2.png', '낱장 2', 384, 640, 244, 336, 110, null, 'stand', '', '얼굴과 나뭇가지가 흘러내리는 중간.'),
    (i, 2, 'player_3_melt_3.png', '낱장 3', 384, 640, 244, 336, 110, null, 'stand', '', '거의 다 녹은 모습.'),
    (i, 3, 'player_3_melt_4.png', '낱장 4', 384, 640, 244, 336, 110, null, 'stand', '', '선택. 필요할 때만 그립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 8, '플레이어 2단 녹는 모습', '캐릭터', '투명', '우선 제작', '시연', '2단 플레이어가 따뜻한 타일에서 1단으로 줄어드는 장면입니다. 게임이 낱장을 순서대로 재생합니다.', '중요: 얼굴과 나뭇가지가 주륵 흘러내리는 모습이 명확하게 보여야 합니다.
두건은 줄어든 몸 크기에 맞게 작아집니다.
정면만 그립니다. 낱장은 3~4장이고 시안을 보며 계속 바꿔 나갑니다.', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'player_2_melt_1.png', '낱장 1', 320, 448, 204, 251, 110, null, 'stand', '', '녹기 시작하는 순간.'),
    (i, 1, 'player_2_melt_2.png', '낱장 2', 320, 448, 204, 251, 110, null, 'stand', '', '얼굴과 나뭇가지가 흘러내리는 중간.'),
    (i, 2, 'player_2_melt_3.png', '낱장 3', 320, 448, 204, 251, 110, null, 'stand', '', '거의 다 녹은 모습.'),
    (i, 3, 'player_2_melt_4.png', '낱장 4', 320, 448, 204, 251, 110, null, 'stand', '', '선택. 필요할 때만 그립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 9, '플레이어 1단 녹는 모습', '캐릭터', '투명', '우선 제작', '시연', '1단 플레이어가 따뜻한 타일에서 완전히 녹아 사라지는 장면입니다. 게임이 낱장을 순서대로 재생합니다.', '중요: 얼굴과 나뭇가지가 주륵 흘러내리는 모습이 명확하게 보여야 합니다.
두건은 줄어든 몸 크기에 맞게 작아집니다.
정면만 그립니다. 낱장은 3~4장이고 시안을 보며 계속 바꿔 나갑니다.', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'player_1_melt_1.png', '낱장 1', 256, 288, 150, 166, 110, null, 'stand', '', '녹기 시작하는 순간.'),
    (i, 1, 'player_1_melt_2.png', '낱장 2', 256, 288, 150, 166, 110, null, 'stand', '', '얼굴과 나뭇가지가 흘러내리는 중간.'),
    (i, 2, 'player_1_melt_3.png', '낱장 3', 256, 288, 150, 166, 110, null, 'stand', '', '거의 다 녹은 모습.'),
    (i, 3, 'player_1_melt_4.png', '낱장 4', 256, 288, 150, 166, 110, null, 'stand', '', '선택. 필요할 때만 그립니다.');
  insert into public.design_groups (name, note, color, sort_order) values ('플레이맵 기본 요소 (기하학적 스케치)', '1순위 · 민준님, 소민님이 작업합니다. 눈덩이, 블록, 나무처럼 플레이맵에 필요한 요소의 기본 틀', 'orange', 1) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '눈덩이', '오브젝트', '투명', '우선 제작', '민준·소민', '밀면 굴러가는 공입니다. 전 챕터에서 같은 그림을 씁니다.', '전 챕터 공용입니다. 챕터마다 모양이 바뀌면 크기 차이를 다시 익혀야 합니다.
구르는 모습은 게임이 만듭니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'snowball_1.png', '작은 눈덩이', 288, 288, 143, 143, 110, null, 'stand', '지름 Ø143 px', '1단 눈덩이.'),
    (i, 1, 'snowball_2.png', '큰 눈덩이', 288, 352, 205, 205, 110, null, 'stand', '지름 Ø205 px', '2단 눈덩이.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '블록', '오브젝트', '투명', '우선 제작', '민준·소민', '밀어서 옮기는 블록(상자)입니다. 칸보다 조금 작습니다. 전 챕터에서 같은 그림을 씁니다.', '벽과 한눈에 구분되어야 합니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'block.png', '블록', 288, 352, 208, 275, null, 78, 'solid', '윗면 깊이 197 · 앞면 높이 78 · 튀어나온 부분 포함 최대 높이 299', '밀 수 있다는 느낌이 벽과 분명히 달라야 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '나무 기본 틀', '오브젝트', '투명', '우선 제작', '민준·소민', '지나갈 수 없는 키 큰 오브젝트입니다. 플레이맵 요소의 기본 틀입니다. 챕터 그림은 이 틀을 바탕으로 합니다.', '기본 크기와 높이를 통일합니다. 나중에 챕터에 따라 눈, 자갈 등을 더합니다.
퍼즐에서 1~4단으로 쓰이므로 단 수가 세어지는 모양이어야 합니다.
그림자는 그리지 않습니다. 하드엣지 그림자를 엔진이 그립니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'tree_1.png', '1단', 288, 352, 256, 195, 110, null, 'stand', '폭은 256 px 이내', '1단 높이. 그림자가 1칸 드리웁니다(엔진이 그림).'),
    (i, 1, 'tree_2.png', '2단', 288, 448, 256, 280, 110, null, 'stand', '폭은 256 px 이내', '2단 높이. 그림자가 2칸 드리웁니다(엔진이 그림).'),
    (i, 2, 'tree_3.png', '3단', 288, 544, 256, 365, 110, null, 'stand', '폭은 256 px 이내', '3단 높이. 그림자가 3칸 드리웁니다(엔진이 그림).'),
    (i, 3, 'tree_4.png', '4단', 288, 640, 256, 450, 110, null, 'stand', '폭은 256 px 이내', '4단 높이. 그림자가 4칸 드리웁니다(엔진이 그림).');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '벽 기본 틀', '오브젝트', '투명', '우선 제작', '민준·소민', '한 칸에 고정되어 움직일 수 없는 벽입니다. 플레이맵 요소의 기본 틀입니다. 챕터 그림은 이 틀을 바탕으로 합니다.', '기본 크기와 높이를 통일합니다. 나중에 챕터에 따라 눈, 자갈 등을 더합니다.
밀 수 있는 블록이나 눈덩이처럼 보이지 않게 합니다.
배치는 팀이 칸에 맞춰 합니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'wall.png', '기본 벽', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '그림자가 없는 오브젝트입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '차가운 타일 기본', '타일', '불투명', '우선 제작', '민준·소민', '늘 안전한 칸입니다. 플레이맵 요소의 기본 틀입니다. 챕터 그림은 이 틀을 바탕으로 합니다.', '여러 칸에 이어지는 무늬는 넣지 않습니다.
어느 칸끼리 붙어도 이음매가 보이지 않게 합니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'tile_cold.png', '기본 타일', 256, 256, null, null, null, null, 'tile', '', '챕터 타일이 없을 때 쓰이는 기본 그림입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '따뜻한 타일 기본', '타일', '불투명', '우선 제작', '민준·소민', '빛을 받아 달궈진 칸입니다. 볕을 받는 동안 위에 선 눈덩이와 눈사람이 녹습니다. 플레이맵 요소의 기본 틀입니다. 챕터 그림은 이 틀을 바탕으로 합니다.', '차가운 타일과 같은 재질의 두 상태로 그립니다.
차가운 타일과 한눈에 구분되어야 합니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'tile_warm.png', '기본 타일', 256, 256, null, null, null, null, 'tile', '', '챕터 타일이 없을 때 쓰이는 기본 그림입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '목적지', '타일', '불투명', '우선 제작', '민준·소민', '플레이어가 도착해야 하는 칸입니다. 전 챕터에서 같은 그림을 씁니다.', '표시까지 한 장에 그립니다.
초록 버튼이 꼭 초록색일 필요는 없습니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'goal.png', '열린 목적지', 256, 256, null, null, null, null, 'tile', '', '도착할 수 있는 목적지.'),
    (i, 1, 'goal_locked.png', '잠긴 목적지', 256, 256, null, null, null, null, 'tile', '', '버튼을 누르면 열리는 잠긴 목적지. 열린 목적지와 한눈에 구분되어야 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 7, '눈꽃 표시', '타일 표식', '투명', '우선 제작', '민준·소민', '눈꽃 칸임을 표시합니다. 눈덩이와 눈사람이 올라가면 한 칸 커집니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'deco_flake.png', '눈꽃 표식', 256, 256, 154, 132, null, null, 'mark', '본체는 권장 크기입니다. 최대 205 × 220 px', '표식이 아닌 칸 전체 타일로 그린다면 파일명은 tile_flake.png이고 불투명으로 제작합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 8, '아치', '아치', '투명', '우선 제작', '민준·소민', '칸 경계에 서는 돌문입니다. 크기에 따라 지나갈 수 있는 눈사람이 정해집니다. 통과 높이가 그림에서 읽혀야 합니다.', '낮은 아치는 일단 유지합니다. 틈새로 변경될 수 있습니다.
크기는 협의 가능합니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'arch_h_1.png', '낮은 가로 아치', 320, 320, 256, 218, null, null, 'arch', '통과 높이 218 px · 기둥 간격 256 px', '1단 눈사람만 지나갑니다.'),
    (i, 1, 'arch_v_1.png', '낮은 세로 아치', 288, 544, null, null, null, null, 'arch', '통과 높이 218 px · 앞뒤 기둥 발 높이 차 241 px', '낮은 아치의 세로 방향입니다.'),
    (i, 2, 'arch_h_2.png', '높은 가로 아치', 320, 416, 256, 313, null, null, 'arch', '통과 높이 313 px · 기둥 간격 256 px', '2단 눈사람까지 지나갑니다.'),
    (i, 3, 'arch_v_2.png', '높은 세로 아치', 288, 640, null, null, null, null, 'arch', '통과 높이 313 px · 앞뒤 기둥 발 높이 차 241 px', '높은 아치의 세로 방향입니다.');
  insert into public.design_groups (name, note, color, sort_order) values ('사전 준비', '전원 · 모든 작업의 기준이 되는 자료', 'gray', 2) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '컨셉아트 제작', '준비', '', '우선 제작', '전원', '10월 말 목표였던 컨셉아트입니다. 팀이 그림 방향을 맞추는 자료입니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '컨셉아트', null, null, null, null, null, null, 'free', '', '자유 형식으로 올립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '레퍼런스 모음', '준비', '', '우선 제작', '전원', '참고 자료 모음입니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '레퍼런스', null, null, null, null, null, null, 'free', '', '자유 형식으로 올립니다.');
  insert into public.design_groups (name, note, color, sort_order) values ('챕터 0 마을', '폴더 ch1/ · 기본 요소가 끝나면 작업합니다', 'brown', 3) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '차가운 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 차가운 칸입니다. 늘 안전한 칸입니다.', '기본 틀을 바탕으로 챕터 재질을 입힙니다.
여러 칸에 이어지는 무늬는 넣지 않습니다.', '눈 덮인 돌길', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch1/tile_cold.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch1/tile_cold_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch1/tile_cold_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '따뜻한 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 달궈진 칸입니다. 볕을 받는 동안 위에 선 눈덩이와 눈사람이 녹습니다.', '차가운 타일과 같은 재질의 두 상태로 그립니다.
차가운 타일과 한눈에 구분되어야 합니다.', '눈 녹은 돌길', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch1/tile_warm.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch1/tile_warm_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch1/tile_warm_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '일반 벽 (막는 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터에서 한 칸을 막는 오브젝트입니다. 그림자가 없습니다.', '기본 크기와 높이는 통일하고, 챕터에 따라 눈, 자갈 등을 더합니다.
밀 수 있는 블록이나 눈덩이처럼 보이지 않게 합니다.', '집, 울타리, 우물, 장작더미', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch1/wall.png', '기본', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch1/wall_1.png', '변형 1', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '기본과 크기, 높이가 같아야 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '나무 (키 큰 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터의 키 큰 오브젝트 한 종류입니다. 퍼즐에서 1~4단으로 쓰입니다.', '단 수가 세어지는 모양이어야 합니다.
그림자는 그리지 않습니다.', '마을 나무', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch1/tree_1.png', '1단', 288, 352, 256, 195, 110, null, 'stand', '폭은 256 px 이내', '1단 높이. 그림자가 1칸 드리웁니다(엔진이 그림).'),
    (i, 1, 'ch1/tree_2.png', '2단', 288, 448, 256, 280, 110, null, 'stand', '폭은 256 px 이내', '2단 높이. 그림자가 2칸 드리웁니다(엔진이 그림).'),
    (i, 2, 'ch1/tree_3.png', '3단', 288, 544, 256, 365, 110, null, 'stand', '폭은 256 px 이내', '3단 높이. 그림자가 3칸 드리웁니다(엔진이 그림).'),
    (i, 3, 'ch1/tree_4.png', '4단', 288, 640, 256, 450, 110, null, 'stand', '폭은 256 px 이내', '4단 높이. 그림자가 4칸 드리웁니다(엔진이 그림).');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '챕터 배경', '배경', '불투명', '제작 가능', '', '플레이맵 뒤에 깔리는 이미지입니다. 가운데는 판이 덮습니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch1/play_bg.png', '배경', 1920, 1080, null, null, null, null, 'screen', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '섬 꾸밈', '오브젝트', '투명', '차순위 제작', '', '섬 테두리와 밑동에만 놓는 소품입니다.', '판을 가리지 않게 합니다.', '썰매, 수레, 우편함, 벤치', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch1/island_prop_1.png', '소품', 288, 352, null, null, 110, null, 'stand', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '월드맵 2장 스케치', '월드맵', '', '차순위 제작', '', '섬이 아니라 이어진 땅입니다. 눈사람이 칸 단위로 WASD로 걷습니다.', '걸을 수 있는 곳과 못 가는 곳이 한눈에 구분되어야 합니다.
칸 수는 한 달 내에 확정합니다.
히든 구역: 볕이 드는 광장 한쪽 → 시계탑 그림자', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '첫 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.'),
    (i, 1, '', '두 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 7, '월드맵 길 타일', '월드맵', '불투명', '차순위 제작', '', '길, 광장을 따로 그린 뒤 타일 단위로 잘라 넣습니다.', '', '눈 덮인 돌길, 마을 광장, 골목', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch1/world_tile.png', '기본', 256, 256, null, null, null, null, 'tile', '', ''),
    (i, 1, 'ch1/world_tile_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 8, '월드맵 구조물', '월드맵', '투명', '차순위 제작', '', '여러 칸을 막는 큰 그림입니다. 건물 뒤로는 갈 수 없습니다.', '멈춘 생명체와 합쳐 챕터당 4~6장입니다.
배치는 팀이 칸에 맞춰 합니다.', '굴뚝 있는 집들, 빵집, 우물, 울타리, 장작더미, 가로등, 광장의 시계탑(12시)', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '구조물 1', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px · 높이 자유(32 배수)', '영문 이름과 칸 수로 파일명을 짓습니다. 예: world_clocktower_2x2.png');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 9, '멈춘 생명체', '월드맵', '투명', '차순위 제작', '', '하던 동작 그대로 멈춘 사람과 동물입니다. 칸을 막습니다.', '얼음에 갇힌 모습이 아닙니다.
전부 그릴 필요는 없습니다. 괜찮은 것을 골라 씁니다.', '꼬리를 흔들던 강아지, 눈을 치우던 사람, 장작을 나르던 사람 등', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '생명체 1', 288, 352, null, null, 110, null, 'stand', '더 크면 구조물 규격을 씁니다.', '영문 이름으로 파일명을 짓습니다. 예: world_dog.png');
  insert into public.design_groups (name, note, color, sort_order) values ('챕터 1 설원', '폴더 ch2/ · 기본 요소가 끝나면 작업합니다', 'teal', 4) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '차가운 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 차가운 칸입니다. 늘 안전한 칸입니다.', '기본 틀을 바탕으로 챕터 재질을 입힙니다.
여러 칸에 이어지는 무늬는 넣지 않습니다.', '쌓인 눈', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch2/tile_cold.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch2/tile_cold_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch2/tile_cold_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '따뜻한 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 달궈진 칸입니다. 볕을 받는 동안 위에 선 눈덩이와 눈사람이 녹습니다.', '차가운 타일과 같은 재질의 두 상태로 그립니다.
차가운 타일과 한눈에 구분되어야 합니다.', '눈이 녹아 드러난 흙과 마른 풀', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch2/tile_warm.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch2/tile_warm_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch2/tile_warm_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '일반 벽 (막는 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터에서 한 칸을 막는 오브젝트입니다. 그림자가 없습니다.', '기본 크기와 높이는 통일하고, 챕터에 따라 눈, 자갈 등을 더합니다.
밀 수 있는 블록이나 눈덩이처럼 보이지 않게 합니다.', '눈 덮인 바위, 마른 덤불, 이글루, 무너진 울타리', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch2/wall.png', '기본', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch2/wall_1.png', '변형 1', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '기본과 크기, 높이가 같아야 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '나무 (키 큰 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터의 키 큰 오브젝트 한 종류입니다. 퍼즐에서 1~4단으로 쓰입니다.', '단 수가 세어지는 모양이어야 합니다.
그림자는 그리지 않습니다.', '앙상한 나무', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch2/tree_1.png', '1단', 288, 352, 256, 195, 110, null, 'stand', '폭은 256 px 이내', '1단 높이. 그림자가 1칸 드리웁니다(엔진이 그림).'),
    (i, 1, 'ch2/tree_2.png', '2단', 288, 448, 256, 280, 110, null, 'stand', '폭은 256 px 이내', '2단 높이. 그림자가 2칸 드리웁니다(엔진이 그림).'),
    (i, 2, 'ch2/tree_3.png', '3단', 288, 544, 256, 365, 110, null, 'stand', '폭은 256 px 이내', '3단 높이. 그림자가 3칸 드리웁니다(엔진이 그림).'),
    (i, 3, 'ch2/tree_4.png', '4단', 288, 640, 256, 450, 110, null, 'stand', '폭은 256 px 이내', '4단 높이. 그림자가 4칸 드리웁니다(엔진이 그림).');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '챕터 배경', '배경', '불투명', '제작 가능', '', '플레이맵 뒤에 깔리는 이미지입니다. 가운데는 판이 덮습니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch2/play_bg.png', '배경', 1920, 1080, null, null, null, null, 'screen', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '섬 꾸밈', '오브젝트', '투명', '차순위 제작', '', '섬 테두리와 밑동에만 놓는 소품입니다.', '판을 가리지 않게 합니다.', '흩어진 나뭇가지, 녹다 만 눈사람, 섬 밑동의 고드름', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch2/island_prop_1.png', '소품', 288, 352, null, null, 110, null, 'stand', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '월드맵 2장 스케치', '월드맵', '', '차순위 제작', '', '섬이 아니라 이어진 땅입니다. 눈사람이 칸 단위로 WASD로 걷습니다.', '걸을 수 있는 곳과 못 가는 곳이 한눈에 구분되어야 합니다.
칸 수는 한 달 내에 확정합니다.
히든 구역: 볕에 눈이 녹은 언덕 → 앙상한 나무 그림자', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '첫 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.'),
    (i, 1, '', '두 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 7, '월드맵 길 타일', '월드맵', '불투명', '차순위 제작', '', '길, 광장을 따로 그린 뒤 타일 단위로 잘라 넣습니다.', '', '넓은 눈밭, 썰매 자국이 난 눈길', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch2/world_tile.png', '기본', 256, 256, null, null, null, null, 'tile', '', ''),
    (i, 1, 'ch2/world_tile_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 8, '월드맵 구조물', '월드맵', '투명', '차순위 제작', '', '여러 칸을 막는 큰 그림입니다. 건물 뒤로는 갈 수 없습니다.', '멈춘 생명체와 합쳐 챕터당 4~6장입니다.
배치는 팀이 칸에 맞춰 합니다.', '이글루, 눈 덮인 바위, 앙상한 나무, 무너진 울타리, 이정표, 얼어붙은 호수, 바위지형으로 이어지는 오르막', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '구조물 1', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px · 높이 자유(32 배수)', '영문 이름과 칸 수로 파일명을 짓습니다. 예: world_clocktower_2x2.png');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 9, '멈춘 생명체', '월드맵', '투명', '차순위 제작', '', '하던 동작 그대로 멈춘 사람과 동물입니다. 칸을 막습니다.', '얼음에 갇힌 모습이 아닙니다.
전부 그릴 필요는 없습니다. 괜찮은 것을 골라 씁니다.', '달리던 순록 무리, 눈 속으로 뛰어들던 여우', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '생명체 1', 288, 352, null, null, 110, null, 'stand', '더 크면 구조물 규격을 씁니다.', '영문 이름으로 파일명을 짓습니다. 예: world_dog.png');
  insert into public.design_groups (name, note, color, sort_order) values ('챕터 2 바위지형', '폴더 ch3/ · 기본 요소가 끝나면 작업합니다', 'yellow', 5) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '차가운 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 차가운 칸입니다. 늘 안전한 칸입니다.', '기본 틀을 바탕으로 챕터 재질을 입힙니다.
여러 칸에 이어지는 무늬는 넣지 않습니다.', '얇게 눈 덮인 돌바닥, 자갈, 조약돌, 풀 포기', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch3/tile_cold.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch3/tile_cold_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch3/tile_cold_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '따뜻한 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 달궈진 칸입니다. 볕을 받는 동안 위에 선 눈덩이와 눈사람이 녹습니다.', '차가운 타일과 같은 재질의 두 상태로 그립니다.
차가운 타일과 한눈에 구분되어야 합니다.', '눈이 녹은 맨바위', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch3/tile_warm.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch3/tile_warm_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch3/tile_warm_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '일반 벽 (막는 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터에서 한 칸을 막는 오브젝트입니다. 그림자가 없습니다.', '기본 크기와 높이는 통일하고, 챕터에 따라 눈, 자갈 등을 더합니다.
밀 수 있는 블록이나 눈덩이처럼 보이지 않게 합니다.', '큰 바위, 광석이 박힌 바위, 돌무더기, 갱목', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch3/wall.png', '기본', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch3/wall_1.png', '변형 1', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '기본과 크기, 높이가 같아야 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '나무 (키 큰 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터의 키 큰 오브젝트 한 종류입니다. 퍼즐에서 1~4단으로 쓰입니다.', '단 수가 세어지는 모양이어야 합니다.
그림자는 그리지 않습니다.', '바위 기둥', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch3/tree_1.png', '1단', 288, 352, 256, 195, 110, null, 'stand', '폭은 256 px 이내', '1단 높이. 그림자가 1칸 드리웁니다(엔진이 그림).'),
    (i, 1, 'ch3/tree_2.png', '2단', 288, 448, 256, 280, 110, null, 'stand', '폭은 256 px 이내', '2단 높이. 그림자가 2칸 드리웁니다(엔진이 그림).'),
    (i, 2, 'ch3/tree_3.png', '3단', 288, 544, 256, 365, 110, null, 'stand', '폭은 256 px 이내', '3단 높이. 그림자가 3칸 드리웁니다(엔진이 그림).'),
    (i, 3, 'ch3/tree_4.png', '4단', 288, 640, 256, 450, 110, null, 'stand', '폭은 256 px 이내', '4단 높이. 그림자가 4칸 드리웁니다(엔진이 그림).');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '챕터 배경', '배경', '불투명', '제작 가능', '', '플레이맵 뒤에 깔리는 이미지입니다. 가운데는 판이 덮습니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch3/play_bg.png', '배경', 1920, 1080, null, null, null, null, 'screen', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '섬 꾸밈', '오브젝트', '투명', '차순위 제작', '', '섬 테두리와 밑동에만 놓는 소품입니다.', '판을 가리지 않게 합니다.', '철로 끝, 곡괭이와 랜턴, 섬 가장자리로 흐르다 얼어붙은 개울', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch3/island_prop_1.png', '소품', 288, 352, null, null, 110, null, 'stand', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '월드맵 2장 스케치', '월드맵', '', '차순위 제작', '', '섬이 아니라 이어진 땅입니다. 눈사람이 칸 단위로 WASD로 걷습니다.', '걸을 수 있는 곳과 못 가는 곳이 한눈에 구분되어야 합니다.
칸 수는 한 달 내에 확정합니다.
히든 구역: 볕이 드는 맨바위 비탈 → 바위 기둥 그림자', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '첫 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.'),
    (i, 1, '', '두 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 7, '월드맵 길 타일', '월드맵', '불투명', '차순위 제작', '', '길, 광장을 따로 그린 뒤 타일 단위로 잘라 넣습니다.', '', '자갈길, 바위 협곡, 철로를 따라 난 길', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch3/world_tile.png', '기본', 256, 256, null, null, null, null, 'tile', '', ''),
    (i, 1, 'ch3/world_tile_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 8, '월드맵 구조물', '월드맵', '투명', '차순위 제작', '', '여러 칸을 막는 큰 그림입니다. 건물 뒤로는 갈 수 없습니다.', '멈춘 생명체와 합쳐 챕터당 4~6장입니다.
배치는 팀이 칸에 맞춰 합니다.', '큰 바위, 바위 기둥, 철로, 광석 더미, 무너진 돌다리, 얼어붙은 개울과 폭포(징검다리로 건넘), 광산 입구(동굴로 가는 곳)', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '구조물 1', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px · 높이 자유(32 배수)', '영문 이름과 칸 수로 파일명을 짓습니다. 예: world_clocktower_2x2.png');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 9, '멈춘 생명체', '월드맵', '투명', '차순위 제작', '', '하던 동작 그대로 멈춘 사람과 동물입니다. 칸을 막습니다.', '얼음에 갇힌 모습이 아닙니다.
전부 그릴 필요는 없습니다. 괜찮은 것을 골라 씁니다.', '바위를 오르던 산양', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '생명체 1', 288, 352, null, null, 110, null, 'stand', '더 크면 구조물 규격을 씁니다.', '영문 이름으로 파일명을 짓습니다. 예: world_dog.png');
  insert into public.design_groups (name, note, color, sort_order) values ('챕터 3 동굴', '폴더 ch4/ · 기본 요소가 끝나면 작업합니다', 'purple', 6) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '차가운 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 차가운 칸입니다. 늘 안전한 칸입니다.', '기본 틀을 바탕으로 챕터 재질을 입힙니다.
여러 칸에 이어지는 무늬는 넣지 않습니다.', '서리 낀 동굴 바닥, 물웅덩이가 얼어붙은 자국', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch4/tile_cold.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch4/tile_cold_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch4/tile_cold_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '따뜻한 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 달궈진 칸입니다. 볕을 받는 동안 위에 선 눈덩이와 눈사람이 녹습니다.', '차가운 타일과 같은 재질의 두 상태로 그립니다.
차가운 타일과 한눈에 구분되어야 합니다.', '천장 틈 빛을 받아 달궈진 바닥', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch4/tile_warm.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch4/tile_warm_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch4/tile_warm_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '일반 벽 (막는 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터에서 한 칸을 막는 오브젝트입니다. 그림자가 없습니다.', '기본 크기와 높이는 통일하고, 챕터에 따라 눈, 자갈 등을 더합니다.
밀 수 있는 블록이나 눈덩이처럼 보이지 않게 합니다.', '동굴 바위, 석순, 수정 무리, 무너진 돌', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch4/wall.png', '기본', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch4/wall_1.png', '변형 1', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '기본과 크기, 높이가 같아야 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '나무 (키 큰 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터의 키 큰 오브젝트 한 종류입니다. 퍼즐에서 1~4단으로 쓰입니다.', '단 수가 세어지는 모양이어야 합니다.
그림자는 그리지 않습니다.', '수정 기둥', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch4/tree_1.png', '1단', 288, 352, 256, 195, 110, null, 'stand', '폭은 256 px 이내', '1단 높이. 그림자가 1칸 드리웁니다(엔진이 그림).'),
    (i, 1, 'ch4/tree_2.png', '2단', 288, 448, 256, 280, 110, null, 'stand', '폭은 256 px 이내', '2단 높이. 그림자가 2칸 드리웁니다(엔진이 그림).'),
    (i, 2, 'ch4/tree_3.png', '3단', 288, 544, 256, 365, 110, null, 'stand', '폭은 256 px 이내', '3단 높이. 그림자가 3칸 드리웁니다(엔진이 그림).'),
    (i, 3, 'ch4/tree_4.png', '4단', 288, 640, 256, 450, 110, null, 'stand', '폭은 256 px 이내', '4단 높이. 그림자가 4칸 드리웁니다(엔진이 그림).');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '챕터 배경', '배경', '불투명', '제작 가능', '', '플레이맵 뒤에 깔리는 이미지입니다. 가운데는 판이 덮습니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch4/play_bg.png', '배경', 1920, 1080, null, null, null, null, 'screen', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '섬 꾸밈', '오브젝트', '투명', '차순위 제작', '', '섬 테두리와 밑동에만 놓는 소품입니다.', '판을 가리지 않게 합니다.', '고드름, 종유석, 랜턴', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch4/island_prop_1.png', '소품', 288, 352, null, null, 110, null, 'stand', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '월드맵 2장 스케치', '월드맵', '', '차순위 제작', '', '섬이 아니라 이어진 땅입니다. 눈사람이 칸 단위로 WASD로 걷습니다.', '걸을 수 있는 곳과 못 가는 곳이 한눈에 구분되어야 합니다.
칸 수는 한 달 내에 확정합니다.
히든 구역: 천장 구멍 빛이 드는 바닥 → 수정 기둥 그림자', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '첫 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.'),
    (i, 1, '', '두 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 7, '월드맵 길 타일', '월드맵', '불투명', '차순위 제작', '', '길, 광장을 따로 그린 뒤 타일 단위로 잘라 넣습니다.', '', '동굴 통로, 서리 낀 바닥, 지하 웅덩이 가장자리', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch4/world_tile.png', '기본', 256, 256, null, null, null, null, 'tile', '', ''),
    (i, 1, 'ch4/world_tile_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 8, '월드맵 구조물', '월드맵', '투명', '차순위 제작', '', '여러 칸을 막는 큰 그림입니다. 건물 뒤로는 갈 수 없습니다.', '멈춘 생명체와 합쳐 챕터당 4~6장입니다.
배치는 팀이 칸에 맞춰 합니다.', '석순, 종유석, 수정 무리, 무너진 돌, 수정 기둥, 천장 구멍과 빛줄기, 얼어붙은 지하 웅덩이', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '구조물 1', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px · 높이 자유(32 배수)', '영문 이름과 칸 수로 파일명을 짓습니다. 예: world_clocktower_2x2.png');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 9, '멈춘 생명체', '월드맵', '투명', '차순위 제작', '', '하던 동작 그대로 멈춘 사람과 동물입니다. 칸을 막습니다.', '얼음에 갇힌 모습이 아닙니다.
전부 그릴 필요는 없습니다. 괜찮은 것을 골라 씁니다.', '날던 박쥐 떼, 등불을 든 광부', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '생명체 1', 288, 352, null, null, 110, null, 'stand', '더 크면 구조물 규격을 씁니다.', '영문 이름으로 파일명을 짓습니다. 예: world_dog.png');
  insert into public.design_groups (name, note, color, sort_order) values ('챕터 4 숲', '폴더 ch5/ · 기본 요소가 끝나면 작업합니다', 'green', 7) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '차가운 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 차가운 칸입니다. 늘 안전한 칸입니다.', '기본 틀을 바탕으로 챕터 재질을 입힙니다.
여러 칸에 이어지는 무늬는 넣지 않습니다.', '눈 쌓인 숲길', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch5/tile_cold.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch5/tile_cold_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch5/tile_cold_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '따뜻한 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 달궈진 칸입니다. 볕을 받는 동안 위에 선 눈덩이와 눈사람이 녹습니다.', '차가운 타일과 같은 재질의 두 상태로 그립니다.
차가운 타일과 한눈에 구분되어야 합니다.', '눈이 녹아 젖은 흙과 낙엽', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch5/tile_warm.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch5/tile_warm_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch5/tile_warm_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '일반 벽 (막는 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터에서 한 칸을 막는 오브젝트입니다. 그림자가 없습니다.', '기본 크기와 높이는 통일하고, 챕터에 따라 눈, 자갈 등을 더합니다.
밀 수 있는 블록이나 눈덩이처럼 보이지 않게 합니다.', '쓰러진 통나무, 그루터기, 덤불, 이끼 낀 바위', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch5/wall.png', '기본', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch5/wall_1.png', '변형 1', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '기본과 크기, 높이가 같아야 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '나무 (키 큰 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터의 키 큰 오브젝트 한 종류입니다. 퍼즐에서 1~4단으로 쓰입니다.', '단 수가 세어지는 모양이어야 합니다.
그림자는 그리지 않습니다.', '침엽수', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch5/tree_1.png', '1단', 288, 352, 256, 195, 110, null, 'stand', '폭은 256 px 이내', '1단 높이. 그림자가 1칸 드리웁니다(엔진이 그림).'),
    (i, 1, 'ch5/tree_2.png', '2단', 288, 448, 256, 280, 110, null, 'stand', '폭은 256 px 이내', '2단 높이. 그림자가 2칸 드리웁니다(엔진이 그림).'),
    (i, 2, 'ch5/tree_3.png', '3단', 288, 544, 256, 365, 110, null, 'stand', '폭은 256 px 이내', '3단 높이. 그림자가 3칸 드리웁니다(엔진이 그림).'),
    (i, 3, 'ch5/tree_4.png', '4단', 288, 640, 256, 450, 110, null, 'stand', '폭은 256 px 이내', '4단 높이. 그림자가 4칸 드리웁니다(엔진이 그림).');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '챕터 배경', '배경', '불투명', '제작 가능', '', '플레이맵 뒤에 깔리는 이미지입니다. 가운데는 판이 덮습니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch5/play_bg.png', '배경', 1920, 1080, null, null, null, null, 'screen', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '섬 꾸밈', '오브젝트', '투명', '차순위 제작', '', '섬 테두리와 밑동에만 놓는 소품입니다.', '판을 가리지 않게 합니다.', '버섯, 솔방울, 새 둥지', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch5/island_prop_1.png', '소품', 288, 352, null, null, 110, null, 'stand', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '월드맵 2장 스케치', '월드맵', '', '차순위 제작', '', '섬이 아니라 이어진 땅입니다. 눈사람이 칸 단위로 WASD로 걷습니다.', '걸을 수 있는 곳과 못 가는 곳이 한눈에 구분되어야 합니다.
칸 수는 한 달 내에 확정합니다.
히든 구역: 볕이 드는 숲 속 공터 → 침엽수 그림자', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '첫 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.'),
    (i, 1, '', '두 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 7, '월드맵 길 타일', '월드맵', '불투명', '차순위 제작', '', '길, 광장을 따로 그린 뒤 타일 단위로 잘라 넣습니다.', '', '눈 쌓인 숲길, 숲 속 공터', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch5/world_tile.png', '기본', 256, 256, null, null, null, null, 'tile', '', ''),
    (i, 1, 'ch5/world_tile_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 8, '월드맵 구조물', '월드맵', '투명', '차순위 제작', '', '여러 칸을 막는 큰 그림입니다. 건물 뒤로는 갈 수 없습니다.', '멈춘 생명체와 합쳐 챕터당 4~6장입니다.
배치는 팀이 칸에 맞춰 합니다.', '빽빽한 침엽수, 쓰러진 통나무, 그루터기, 덤불, 나무꾼의 오두막, 폭포도 가능, 결계(숲 끝, 신전 외곽으로 들어가는 곳)', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '구조물 1', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px · 높이 자유(32 배수)', '영문 이름과 칸 수로 파일명을 짓습니다. 예: world_clocktower_2x2.png');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 9, '멈춘 생명체', '월드맵', '투명', '차순위 제작', '', '하던 동작 그대로 멈춘 사람과 동물입니다. 칸을 막습니다.', '얼음에 갇힌 모습이 아닙니다.
전부 그릴 필요는 없습니다. 괜찮은 것을 골라 씁니다.', '나무를 오르던 다람쥐, 풀을 뜯던 사슴', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '생명체 1', 288, 352, null, null, 110, null, 'stand', '더 크면 구조물 규격을 씁니다.', '영문 이름으로 파일명을 짓습니다. 예: world_dog.png');
  insert into public.design_groups (name, note, color, sort_order) values ('챕터 5 신전 외곽', '폴더 ch6/ · 기본 요소가 끝나면 작업합니다', 'pink', 8) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '차가운 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 차가운 칸입니다. 늘 안전한 칸입니다.', '기본 틀을 바탕으로 챕터 재질을 입힙니다.
여러 칸에 이어지는 무늬는 넣지 않습니다.', '눈 덮인 판석', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch6/tile_cold.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch6/tile_cold_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch6/tile_cold_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '따뜻한 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 달궈진 칸입니다. 볕을 받는 동안 위에 선 눈덩이와 눈사람이 녹습니다.', '차가운 타일과 같은 재질의 두 상태로 그립니다.
차가운 타일과 한눈에 구분되어야 합니다.', '눈이 녹은 판석', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch6/tile_warm.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch6/tile_warm_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch6/tile_warm_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '일반 벽 (막는 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터에서 한 칸을 막는 오브젝트입니다. 그림자가 없습니다.', '기본 크기와 높이는 통일하고, 챕터에 따라 눈, 자갈 등을 더합니다.
밀 수 있는 블록이나 눈덩이처럼 보이지 않게 합니다.', '낮은 돌담, 화단, 분수대, 나무 울타리', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch6/wall.png', '기본', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch6/wall_1.png', '변형 1', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '기본과 크기, 높이가 같아야 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '나무 (키 큰 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터의 키 큰 오브젝트 한 종류입니다. 퍼즐에서 1~4단으로 쓰입니다.', '단 수가 세어지는 모양이어야 합니다.
그림자는 그리지 않습니다.', '결계 기둥', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch6/tree_1.png', '1단', 288, 352, 256, 195, 110, null, 'stand', '폭은 256 px 이내', '1단 높이. 그림자가 1칸 드리웁니다(엔진이 그림).'),
    (i, 1, 'ch6/tree_2.png', '2단', 288, 448, 256, 280, 110, null, 'stand', '폭은 256 px 이내', '2단 높이. 그림자가 2칸 드리웁니다(엔진이 그림).'),
    (i, 2, 'ch6/tree_3.png', '3단', 288, 544, 256, 365, 110, null, 'stand', '폭은 256 px 이내', '3단 높이. 그림자가 3칸 드리웁니다(엔진이 그림).'),
    (i, 3, 'ch6/tree_4.png', '4단', 288, 640, 256, 450, 110, null, 'stand', '폭은 256 px 이내', '4단 높이. 그림자가 4칸 드리웁니다(엔진이 그림).');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '챕터 배경', '배경', '불투명', '제작 가능', '', '플레이맵 뒤에 깔리는 이미지입니다. 가운데는 판이 덮습니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch6/play_bg.png', '배경', 1920, 1080, null, null, null, null, 'screen', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '섬 꾸밈', '오브젝트', '투명', '차순위 제작', '', '섬 테두리와 밑동에만 놓는 소품입니다.', '판을 가리지 않게 합니다.', '정원 의자, 화분, 등불', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch6/island_prop_1.png', '소품', 288, 352, null, null, 110, null, 'stand', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '월드맵 2장 스케치', '월드맵', '', '차순위 제작', '', '섬이 아니라 이어진 땅입니다. 눈사람이 칸 단위로 WASD로 걷습니다.', '걸을 수 있는 곳과 못 가는 곳이 한눈에 구분되어야 합니다.
칸 수는 한 달 내에 확정합니다.', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '첫 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.'),
    (i, 1, '', '두 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 7, '월드맵 길 타일', '월드맵', '불투명', '차순위 제작', '', '길, 광장을 따로 그린 뒤 타일 단위로 잘라 넣습니다.', '', '판석 길, 신전 뜰, 정원', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch6/world_tile.png', '기본', 256, 256, null, null, null, null, 'tile', '', ''),
    (i, 1, 'ch6/world_tile_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 8, '월드맵 구조물', '월드맵', '투명', '차순위 제작', '', '여러 칸을 막는 큰 그림입니다. 건물 뒤로는 갈 수 없습니다.', '멈춘 생명체와 합쳐 챕터당 4~6장입니다.
배치는 팀이 칸에 맞춰 합니다.', 'Anne의 집, 낮은 돌담, 화단, 분수대, 결계 기둥, 유리 신전 외벽', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '구조물 1', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px · 높이 자유(32 배수)', '영문 이름과 칸 수로 파일명을 짓습니다. 예: world_clocktower_2x2.png');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 9, '결계 입구 · 유리 신전 입구', '월드맵', '투명', '차순위 제작', '', '필수 요소입니다. 숲에서 들어오는 결계 입구와 신전 중심으로 가는 유리 신전 입구입니다.', '', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '결계 입구', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px', ''),
    (i, 1, '', '유리 신전 입구', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 10, 'Anne', '월드맵', '투명', '차순위 제작', '', '필수 요소입니다. 결계로 들어와 처음 만나는 인물입니다.', '하던 동작 그대로 멈춘 모습입니다. 얼음에 갇힌 모습이 아닙니다.', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch6/world_anne.png', 'Anne', 288, 352, null, null, 110, null, 'stand', '', '');
  insert into public.design_groups (name, note, color, sort_order) values ('챕터 6 신전 중심', '폴더 ch7/ · 기본 요소가 끝나면 작업합니다', 'red', 9) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '차가운 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 차가운 칸입니다. 늘 안전한 칸입니다.', '기본 틀을 바탕으로 챕터 재질을 입힙니다.
여러 칸에 이어지는 무늬는 넣지 않습니다.', '유리 바닥, 금속 판', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch7/tile_cold.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch7/tile_cold_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch7/tile_cold_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '따뜻한 타일', '타일', '불투명', '차순위 제작', '', '이 챕터의 달궈진 칸입니다. 볕을 받는 동안 위에 선 눈덩이와 눈사람이 녹습니다.', '차가운 타일과 같은 재질의 두 상태로 그립니다.
차가운 타일과 한눈에 구분되어야 합니다.', '빛을 받아 달궈진 유리 바닥', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch7/tile_warm.png', '기본', 256, 256, null, null, null, null, 'tile', '', '3종이 칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch7/tile_warm_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.'),
    (i, 2, 'ch7/tile_warm_2.png', '변형 2', 256, 256, null, null, null, null, 'tile', '', '기본 타일과 같은 재질의 변형입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '일반 벽 (막는 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터에서 한 칸을 막는 오브젝트입니다. 그림자가 없습니다.', '기본 크기와 높이는 통일하고, 챕터에 따라 눈, 자갈 등을 더합니다.
밀 수 있는 블록이나 눈덩이처럼 보이지 않게 합니다.', '멈춘 톱니바퀴, 기계 받침대, 부서진 톱니 더미', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch7/wall.png', '기본', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '칸마다 무작위로 섞입니다.'),
    (i, 1, 'ch7/wall_1.png', '변형 1', 288, 384, 256, 325, null, 83, 'solid', '윗면 깊이 242 · 앞면 높이 83 · 눈 등 포함 최대 높이 337', '기본과 크기, 높이가 같아야 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '나무 (키 큰 것)', '오브젝트', '투명', '차순위 제작', '', '이 챕터의 키 큰 오브젝트 한 종류입니다. 퍼즐에서 1~4단으로 쓰입니다.', '단 수가 세어지는 모양이어야 합니다.
그림자는 그리지 않습니다.', '톱니가 층층이 끼워진 축 기둥', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch7/tree_1.png', '1단', 288, 352, 256, 195, 110, null, 'stand', '폭은 256 px 이내', '1단 높이. 그림자가 1칸 드리웁니다(엔진이 그림).'),
    (i, 1, 'ch7/tree_2.png', '2단', 288, 448, 256, 280, 110, null, 'stand', '폭은 256 px 이내', '2단 높이. 그림자가 2칸 드리웁니다(엔진이 그림).'),
    (i, 2, 'ch7/tree_3.png', '3단', 288, 544, 256, 365, 110, null, 'stand', '폭은 256 px 이내', '3단 높이. 그림자가 3칸 드리웁니다(엔진이 그림).'),
    (i, 3, 'ch7/tree_4.png', '4단', 288, 640, 256, 450, 110, null, 'stand', '폭은 256 px 이내', '4단 높이. 그림자가 4칸 드리웁니다(엔진이 그림).');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '챕터 배경', '배경', '불투명', '제작 가능', '', '플레이맵 뒤에 깔리는 이미지입니다. 가운데는 판이 덮습니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch7/play_bg.png', '배경', 1920, 1080, null, null, null, null, 'screen', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '섬 꾸밈', '오브젝트', '투명', '차순위 제작', '', '섬 테두리와 밑동에만 놓는 소품입니다.', '판을 가리지 않게 합니다.', '흩어진 작은 톱니와 나사, 깨진 유리 조각', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch7/island_prop_1.png', '소품', 288, 352, null, null, 110, null, 'stand', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '월드맵 2장 스케치', '월드맵', '', '차순위 제작', '', '섬이 아니라 이어진 땅입니다. 눈사람이 칸 단위로 WASD로 걷습니다.', '걸을 수 있는 곳과 못 가는 곳이 한눈에 구분되어야 합니다.
칸 수는 한 달 내에 확정합니다.', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '첫 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.'),
    (i, 1, '', '두 번째 지역', null, null, null, null, null, null, 'free', '20 × 12칸(변경 예정)', '스케치를 올립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 7, '월드맵 길 타일', '월드맵', '불투명', '차순위 제작', '', '길, 광장을 따로 그린 뒤 타일 단위로 잘라 넣습니다.', '', '유리 바닥 복도, 금속 바닥', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'ch7/world_tile.png', '기본', 256, 256, null, null, null, null, 'tile', '', ''),
    (i, 1, 'ch7/world_tile_1.png', '변형 1', 256, 256, null, null, null, null, 'tile', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 8, '월드맵 구조물', '월드맵', '투명', '차순위 제작', '', '여러 칸을 막는 큰 그림입니다. 건물 뒤로는 갈 수 없습니다.', '멈춘 생명체와 합쳐 챕터당 4~6장입니다.
배치는 팀이 칸에 맞춰 합니다.', '멈춘 톱니바퀴들, 유리 기둥, 톱니 축 기둥, 기계 받침대 등', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '구조물 1', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px · 높이 자유(32 배수)', '영문 이름과 칸 수로 파일명을 짓습니다. 예: world_clocktower_2x2.png');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 9, '지구 동력 장치', '월드맵', '투명', '차순위 제작', '', '필수 요소입니다. 마지막 맵 끝에서 톱니 조각을 끼우는 곳입니다.', '', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '조각이 빠진 모습', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px', ''),
    (i, 1, '', '조각을 끼웠지만 가운데가 빈 모습', null, null, null, null, null, null, 'free', '폭 = 가로 칸 수 × 256 + 32 px', '톱니 조각이 합쳐진 모습입니다.');
  insert into public.design_groups (name, note, color, sort_order) values ('기믹 요소', '차순위 · 뒤 챕터에서 처음 나오는 공용 그림', 'yellow', 10) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '초록 버튼', '타일 표식', '투명', '차순위 제작', '', '맵의 초록 버튼을 모두 누르고 있으면 목적지가 열립니다. 꼭 초록색이 아니어도 됩니다. 챕터 3 동굴에서 처음 나옵니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'deco_button_key.png', '안 눌림', 256, 256, 154, 132, null, null, 'mark', '본체는 권장 크기입니다. 최대 205 × 220 px', ''),
    (i, 1, 'deco_button_key_pressed.png', '눌림', 256, 256, 154, 132, null, null, 'mark', '본체는 권장 크기입니다. 최대 205 × 220 px', '늘 물체에 덮인 채 보이므로 눌린 표시는 가장자리까지 보이게 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '균열', '타일 표식', '투명', '차순위 제작', '', '물체가 올라서거나 눈덩이가 굴러 지나가면 다음 턴에 무너져 구멍이 됩니다. 챕터 3 동굴에서 처음 나옵니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'deco_crack.png', '균열', 256, 256, null, null, null, null, 'tile', '', '금 간 칸 표시.'),
    (i, 1, 'deco_crack_armed.png', '붕괴 직전', 256, 256, null, null, null, null, 'tile', '', '다음 턴에 구멍이 됩니다. 균열 그림과 한눈에 구별되어야 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '노랑 버튼', '타일 표식', '투명', '차순위 제작', '', '노랑 버튼을 모두 누르고 있는 동안만 노랑 벽이 열립니다. 챕터 4 숲에서 처음 나옵니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'deco_button_yellow.png', '안 눌림', 256, 256, 154, 132, null, null, 'mark', '본체는 권장 크기입니다. 최대 205 × 220 px', ''),
    (i, 1, 'deco_button_yellow_pressed.png', '눌림', 256, 256, 154, 132, null, null, 'mark', '본체는 권장 크기입니다. 최대 205 × 220 px', '늘 물체에 덮인 채 보이므로 눌린 표시는 가장자리까지 보이게 합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '노랑 벽', '오브젝트', '투명', '차순위 제작', '', '노랑 버튼을 모두 누르고 있는 동안 열립니다. 열린 모습은 엔진이 그립니다. 챕터 4 숲에서 처음 나옵니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'wall_yellow.png', '닫힌 벽', 288, 384, 256, 330, null, 88, 'solid', '윗면 깊이 242 · 앞면 높이 88 · 최대 높이 330', '안에 갇힌 물체가 보이게 몸통은 반투명으로 그립니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '레이저 발사기', '오브젝트', '투명', '차순위 제작', '', '방향에 따라 레이저를 쏘는 발사기입니다. 레이저 빔은 엔진이 그립니다. 챕터 5 신전 외곽에서 처음 나옵니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'laser_down.png', '아래', 288, 480, 256, 323, 110, 80, 'stand', '윗면 깊이 242 · 앞면 높이 80', ''),
    (i, 1, 'laser_up.png', '위', 288, 480, 256, 323, 110, 80, 'stand', '윗면 깊이 242 · 앞면 높이 80', ''),
    (i, 2, 'laser_right.png', '오른쪽', 288, 480, 256, 323, 110, 80, 'stand', '윗면 깊이 242 · 앞면 높이 80', ''),
    (i, 3, 'laser_left.png', '왼쪽', 288, 480, 256, 323, 110, 80, 'stand', '윗면 깊이 242 · 앞면 높이 80', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '삼각 벽', '오브젝트', '투명', '차순위 제작', '', '칸의 절반만 막는 벽입니다. 굴러온 눈덩이를 90° 꺾습니다. 챕터 2 바위지형에서 처음 나옵니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'tri_wall_tl.png', '왼쪽 위 ◤', 288, 352, 256, 306, null, 64, 'solid', '윗면 깊이 242 · 앞면 높이 64 · 튀어나온 부분 포함 최대 높이 315', '막힌 코너가 왼쪽 위 ◤입니다.'),
    (i, 1, 'tri_wall_tr.png', '오른쪽 위 ◥', 288, 352, 256, 306, null, 64, 'solid', '윗면 깊이 242 · 앞면 높이 64 · 튀어나온 부분 포함 최대 높이 315', '막힌 코너가 오른쪽 위 ◥입니다.'),
    (i, 2, 'tri_wall_bl.png', '왼쪽 아래 ◣', 288, 352, 256, 306, null, 64, 'solid', '윗면 깊이 242 · 앞면 높이 64 · 튀어나온 부분 포함 최대 높이 315', '막힌 코너가 왼쪽 아래 ◣입니다.'),
    (i, 3, 'tri_wall_br.png', '오른쪽 아래 ◢', 288, 352, 256, 306, null, 64, 'solid', '윗면 깊이 242 · 앞면 높이 64 · 튀어나온 부분 포함 최대 높이 315', '막힌 코너가 오른쪽 아래 ◢입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '영혼 발판', '타일 표식', '투명', '차순위 제작', '', '플레이어가 두 턴 연속 서 있으면 가장 가까운 눈사람으로 영혼이 옮겨 갑니다. 챕터 6 신전 중심에서 처음 나옵니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'deco_soulplate.png', '발판', 256, 256, 154, 132, null, null, 'mark', '본체는 권장 크기입니다. 최대 205 × 220 px', '');
  insert into public.design_groups (name, note, color, sort_order) values ('FX', '차순위 · 협의 후 제작', 'purple', 11) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '영혼 파티클', 'FX', '투명', '차순위 제작', '', '빛 입자 하나. 눈사람이 만들어질 때, 월드맵에서 톱니 조각을 얻을 때 쓰입니다. 겨울의 영혼 캐릭터 그림과는 다릅니다.', '흰색~회백색 한 개로 그립니다. 색은 게임이 입힙니다. 색을 그림에 넣으려면 개발과 협의합니다.
FX는 전체적으로 협의가 필요합니다. 지금 내용은 예시입니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'fx_soul.png', '파티클', 256, 256, 120, 168, null, null, 'center', '본체는 최대 크기입니다.', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '눈가루 파티클', 'FX', '투명', '차순위 제작', '', '눈가루 한 덩이. 눈덩이가 부딪히거나 부서지거나 쪼개질 때, 눈사람을 만들 때, 녹을 때, 구멍에 빠질 때, 금 간 칸이 무너질 때 피어오릅니다.', '흰색~회백색 한 개로 그립니다. 색은 게임이 입힙니다. 색을 그림에 넣으려면 개발과 협의합니다.
FX는 전체적으로 협의가 필요합니다. 지금 내용은 예시입니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'fx_snow_puff.png', '파티클', 256, 256, 128, 120, null, null, 'center', '가로는 정확히 128 px, 세로는 120 px 이내', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '반짝임 파티클', 'FX', '투명', '차순위 제작', '', '반짝임 하나. 눈꽃을 먹고 커질 때, 눈사람이 만들어질 때, 영혼이 날아가고 도착할 때 쓰입니다.', '흰색~회백색 한 개로 그립니다. 색은 게임이 입힙니다. 색을 그림에 넣으려면 개발과 협의합니다.
FX는 전체적으로 협의가 필요합니다. 지금 내용은 예시입니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'fx_sparkle.png', '파티클', 256, 256, 168, 172, null, null, 'center', '본체는 최대 크기입니다.', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '물방울 파티클', 'FX', '투명', '차순위 제작', '', '물방울 하나. 플레이어, 눈덩이, 눈사람이 녹을 때 떨어집니다.', '흰색~회백색 한 개로 그립니다. 색은 게임이 입힙니다. 색을 그림에 넣으려면 개발과 협의합니다.
FX는 전체적으로 협의가 필요합니다. 지금 내용은 예시입니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'fx_drip.png', '파티클', 256, 256, 80, 128, null, null, 'center', '본체는 최대 크기입니다.', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '파편 파티클', 'FX', '투명', '차순위 제작', '', '파편 하나. 눈덩이가 벽에 눌려 부서질 때, 금 간 칸이 무너질 때 쓰입니다.', '흰색~회백색 한 개로 그립니다. 색은 게임이 입힙니다. 색을 그림에 넣으려면 개발과 협의합니다.
FX는 전체적으로 협의가 필요합니다. 지금 내용은 예시입니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'fx_debris.png', '파티클', 256, 256, 100, 128, null, null, 'center', '본체는 최대 크기입니다.', '');
  insert into public.design_groups (name, note, color, sort_order) values ('월드맵 공용', '차순위 · 챕터마다 따로 그리지 않는 월드맵 그림', 'green', 12) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '톱니 조각', '월드맵', '투명', '차순위 제작', '', '빛가루를 대신하는 오브젝트입니다. 월드맵에 놓이고, 나중에 하나로 합쳐집니다.', '개수는 미정입니다. 일단 12개로 잡았습니다.
조각마다 모양이 다릅니다.
합쳐진 모습은 지구 동력 장치의 가운데가 빈 모습이고, 합쳐지는 장면은 컷씬입니다.', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'world_gear_piece_1.png', '조각 1', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 1, 'world_gear_piece_2.png', '조각 2', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 2, 'world_gear_piece_3.png', '조각 3', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 3, 'world_gear_piece_4.png', '조각 4', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 4, 'world_gear_piece_5.png', '조각 5', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 5, 'world_gear_piece_6.png', '조각 6', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 6, 'world_gear_piece_7.png', '조각 7', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 7, 'world_gear_piece_8.png', '조각 8', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 8, 'world_gear_piece_9.png', '조각 9', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 9, 'world_gear_piece_10.png', '조각 10', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 10, 'world_gear_piece_11.png', '조각 11', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.'),
    (i, 11, 'world_gear_piece_12.png', '조각 12', 288, 352, null, null, 110, null, 'stand', '', '조각마다 모양이 다릅니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '작은 파편', '월드맵', '투명', '차순위 제작', '', '히든 구역에 있는 히든 오브제입니다. 히든 구역은 챕터 0~4의 5곳을 생각 중입니다.', '', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'world_fragment.png', '파편', 288, 352, null, null, 110, null, 'stand', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '퍼즐 입구', '월드맵', '투명', '차순위 제작', '', '월드맵에서 퍼즐로 들어가는 칸입니다. 지금은 엔진이 임시로 그립니다.', '', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'world_entry.png', '입구', 256, 256, 154, 132, null, null, 'mark', '본체는 권장 크기입니다. 최대 205 × 220 px', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '문', '월드맵', '투명', '차순위 제작', '', '조건을 채우면 열리는 칸입니다. 지금은 엔진이 임시로 그립니다.', '', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'world_gate.png', '문', 288, 384, null, null, null, null, 'solid', '', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '출구', '월드맵', '투명', '차순위 제작', '', '다른 월드맵이나 챕터로 가는 칸입니다. 지금은 엔진이 임시로 그립니다.', '', '', true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'world_exit.png', '출구', 288, 384, null, null, null, null, 'solid', '', '');
  insert into public.design_groups (name, note, color, sort_order) values ('섬 테두리 · 밑동', '토의 후 확정 · 디자인이 그리며 방식은 나중에 정합니다', 'teal', 13) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '섬 테두리 · 밑동 · 게임판 옆면', '오브젝트', '투명', '차순위 제작', '', '플레이맵 판 둘레의 섬 그림입니다. 공용 9장을 가정했습니다. 그리는 방식은 토의해서 확정합니다.', '', '', true) returning id into i;
  insert into public.design_groups (name, note, color, sort_order) values ('컷씬 · UI', '제작 보류 · 내용과 게임 이름이 정해진 뒤 시작합니다', 'pink', 14) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '컷씬 영상', '컷씬', '불투명', '제작 보류', '', '영상으로 제작합니다. 자세한 내용은 제작 시점에 맞추어 스토리 부서에서 제공합니다.', '글자와 로고는 영상 안에 넣습니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'cut_intro.ogv', '인트로', 1920, 1080, null, null, null, null, 'screen', 'Ogg Theora(.ogv) · 30fps', '새 게임을 시작하면 나오는 영상입니다.'),
    (i, 1, 'cut_sun.ogv', '태양', 1920, 1080, null, null, null, null, 'screen', 'Ogg Theora(.ogv) · 30fps', '태양이 기울다 45°에서 멈추는 장면이 들어갑니다.'),
    (i, 2, 'cut_ending.ogv', '엔딩', 1920, 1080, null, null, null, null, 'screen', 'Ogg Theora(.ogv) · 30fps', '마지막 영상입니다. 톱니 조각이 합쳐지는 장면도 컷씬으로 넣습니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '타이틀 키 아트', 'UI', '불투명', '제작 보류', '', '타이틀 화면 배경 그림입니다. 로고(위 가운데)와 메뉴(왼쪽 아래)는 엔진이 얹으니 그 자리는 비워 둡니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'title_bg.png', '키 아트', 1920, 1080, 1728, 800, null, null, 'center', '핵심 영역 가운데 1728 × 800 px', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '게임 로고', 'UI', '투명', '제작 보류', '', '게임 로고입니다. 게임 이름은 12월 초에 확정합니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'logo.png', '로고', 1040, 203, null, null, null, null, 'center', '4K용은 2080 × 406 px', '');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 3, '톱니 조각 아이콘', 'UI', '투명', '제작 보류', '', '모은 톱니 조각 아이콘입니다. 월드맵과 저장 슬롯에서 개수 옆에 붙습니다. 색까지 그림에 넣습니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'icon_dust.png', '아이콘', 64, 64, null, null, null, null, 'center', '', '파일명은 개발이 바꿀 때까지 유지합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 4, '작은 파편 아이콘', 'UI', '투명', '제작 보류', '', '작은 파편 개수 옆에 붙는 아이콘입니다. 색까지 그림에 넣습니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'icon_dust_hidden.png', '아이콘', 64, 64, null, null, null, null, 'center', '', '파일명은 개발이 바꿀 때까지 유지합니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 5, '설정 창 UI 키트', 'UI', '투명', '제작 보류', '', '설정 창의 슬라이더, 토글, 목록 화살표, 버튼(보통, 마우스 올림, 누름)입니다. 엔진 연결 때 파일명과 크기를 확정합니다.', '', '', false) returning id into i;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 6, '공용 배경 (선택)', '배경', '불투명', '제작 가능', '', '챕터가 정해지지 않은 화면에 깔리는 배경입니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'play_bg.png', '배경', 1920, 1080, null, null, null, null, 'screen', '', '');
  insert into public.design_groups (name, note, color, sort_order) values ('스토어 · 플랫폼', '제작 보류 · 스토어 이미지는 3/5까지 끝나야 합니다', 'gray', 15) returning id into g;
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 0, '스팀 스토어 이미지', '스토어', '불투명', '제작 보류', '', '스팀 관리 화면에 직접 올리는 그림입니다. 크기는 정확히 맞춰야 합니다.', '2026-10-04 스팀웍스 공식 문서 기준입니다.
공식 템플릿은 partner.steamgames.com/doc/store/assets 에 있습니다.', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, '', '헤더 캡슐', 920, 430, null, null, null, null, 'screen', '필수', '게임 로고 필수. 게임 이름 · 공식 부제 외 글자 금지'),
    (i, 1, '', '작은 캡슐', 462, 174, null, null, null, null, 'screen', '필수', '120 × 45까지 줄어도 로고가 읽혀야 함'),
    (i, 2, '', '메인 캡슐', 1232, 706, null, null, null, null, 'screen', '필수', '게임 로고 필수'),
    (i, 3, '', '세로 캡슐', 748, 896, null, null, null, null, 'screen', '필수', '게임 로고 필수'),
    (i, 4, '', '스크린샷', 1920, 1080, null, null, null, null, 'screen', '필수 5장+', '게임 화면 캡처만. 컨셉 아트 · 홍보 문구 금지'),
    (i, 5, '', '스토어 페이지 배경', 1438, 810, null, null, null, null, 'screen', '선택', '없으면 스크린샷으로 자동 생성'),
    (i, 6, '', '라이브러리 캡슐', 600, 900, null, null, null, null, 'screen', '필수', '게임 로고 필수. 가장자리는 가려질 수 있음'),
    (i, 7, '', '라이브러리 헤더', 920, 430, null, null, null, null, 'screen', '필수', '게임 로고 필수'),
    (i, 8, '', '라이브러리 히어로', 3840, 1240, null, null, null, null, 'screen', '필수', 'PNG. 글자 금지. 창 폭에 따라 잘림'),
    (i, 9, '', '라이브러리 로고', 1280, 720, null, null, null, null, 'screen', '필수', 'PNG 투명. 게임 로고만'),
    (i, 10, '', '바로가기 아이콘', 256, 256, null, null, null, null, 'screen', '필수', 'ICO 또는 PNG. 앱 아이콘 원본으로 제작 가능'),
    (i, 11, '', '앱 아이콘(스팀)', 184, 184, null, null, null, null, 'screen', '필수', 'JPG'),
    (i, 12, '', '도전과제 아이콘', 256, 256, null, null, null, null, 'screen', '있으면', 'JPG. 도전과제마다 달성 · 미달성 2장'),
    (i, 13, '', '이벤트 커버', 800, 450, null, null, null, null, 'screen', '이벤트 때', '이벤트마다 1장'),
    (i, 14, '', '이벤트 헤더', 1920, 622, null, null, null, null, 'screen', '선택', '중요 글자는 가운데 1752 × 381 안'),
    (i, 15, '', '스토어 설명 이미지', null, null, null, null, null, null, 'free', '선택 · 가로 1170 권장', '움직이는 그림은 최대 12초');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 1, '앱 아이콘', '스토어', '투명 가능', '제작 보류', '', '게임 실행 파일, 창, 바로가기 아이콘입니다. 엔진 연결 전이라 보류입니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'app_icon.png', '아이콘', 512, 512, null, null, null, null, 'center', '', '파일명은 가칭입니다.');
  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, ideas, is_new) values (g, 2, '부트 스플래시', '스토어', '투명 가능', '제작 보류', '', '게임을 켤 때 처음 잠깐 보이는 화면입니다. 엔진 연결 전이라 보류입니다.', '', '', false) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note) values
    (i, 0, 'boot_splash.png', '스플래시', 1920, 1080, 1728, 1080, null, null, 'center', '핵심 영역 가운데 1728 × 1080 px', '파일명은 가칭입니다.');
  insert into public.design_tasks (name, owner, start_date, end_date, category, sort_order) values
    ('컨셉아트 · 레퍼런스 마무리', '전원', '2026-11-02', '2026-11-08', 'base', 0),
    ('캐릭터 · 겨울의 영혼 시안', '시연', '2026-11-09', '2026-11-22', 'char', 1),
    ('캐릭터 18장 · 영혼 3장', '시연', '2026-11-23', '2027-01-03', 'char', 2),
    ('녹는 모습 9~12장', '시연', '2027-01-04', '2027-01-24', 'char', 3),
    ('플레이맵 요소 기하학적 스케치', '민준·소민', '2026-11-09', '2026-11-22', 'play', 4),
    ('기본 요소 완성 · 챕터 0 세트', '민준·소민', '2026-11-23', '2026-12-13', 'play', 5),
    ('챕터 1·2 플레이맵 세트', '자유롤', '2026-12-14', '2027-01-10', 'play', 6),
    ('챕터 3·4 플레이맵 세트', '자유롤', '2027-01-11', '2027-02-07', 'play', 7),
    ('챕터 5·6 플레이맵 세트', '자유롤', '2027-02-08', '2027-03-07', 'play', 8),
    ('섬 테두리 · 밑동 · 섬 꾸밈', '자유롤', '2027-01-11', '2027-02-07', 'play', 9),
    ('챕터 0 월드맵 · 공용 표시', '자유롤', '2026-12-14', '2027-01-10', 'world', 10),
    ('챕터 1·2 월드맵', '자유롤', '2027-01-11', '2027-02-07', 'world', 11),
    ('챕터 3·4 월드맵', '자유롤', '2027-02-08', '2027-03-07', 'world', 12),
    ('챕터 5·6 월드맵', '자유롤', '2027-03-08', '2027-03-31', 'world', 13),
    ('톱니 조각 12개 · 작은 파편', '자유롤', '2027-02-08', '2027-03-07', 'world', 14),
    ('기믹 16장', '자유롤', '2027-01-25', '2027-02-21', 'late', 15),
    ('FX 협의 · 제작', '자유롤', '2027-02-22', '2027-03-07', 'late', 16),
    ('타이틀 · 로고 · 스토어 이미지', '자유롤', '2027-02-01', '2027-03-05', 'late', 17),
    ('컷씬 3편', '자유롤', '2027-01-25', '2027-03-31', 'late', 18),
    ('개발: PNG 켜기 · 섬 · 바닥 섞기', '개발', '2026-11-09', '2026-12-11', 'dev', 19),
    ('개발: 월드맵 · 구조물 · 영혼 · 녹는 모습', '개발', '2026-12-14', '2027-01-24', 'dev', 20),
    ('전체 수정 · 출시 준비', '전원', '2027-03-08', '2027-03-31', 'base', 21),
    ('확인: 캐릭터 · 스케치를 게임에 넣어 보기', '', '2026-11-20', '2026-11-20', 'mile', 22),
    ('확정: 게임 이름', '', '2026-12-04', '2026-12-04', 'mile', 23),
    ('확인: 챕터 0 플레이', '', '2026-12-11', '2026-12-11', 'mile', 24),
    ('확인: 챕터 0 월드맵', '', '2027-01-08', '2027-01-08', 'mile', 25),
    ('스토어 심사 제출', '', '2027-03-05', '2027-03-05', 'mile', 26),
    ('전 챕터 플레이맵 완성', '', '2027-03-07', '2027-03-07', 'mile', 27),
    ('스토어 공개', '', '2027-03-17', '2027-03-17', 'mile', 28),
    ('디자인 마무리 · 출시 목표', '', '2027-03-31', '2027-03-31', 'mile', 29);
end $seed$;
