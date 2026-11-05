-- 2026-11-05: 플레이맵 2D 뷰 그림 항목. 게임 플레이 중 T 키로 바꾸는, 칸마다 평면으로 보는 화면이다.
--   · 아치 같은 물체에 가려도 2D 뷰에서는 모든 칸이 보인다. 월드맵에는 2D 뷰가 없다.
--   · 서 있는 요소만 새로 그린다. 바닥과 바닥 표식은 기존 그림을 그대로 쓴다.
--   · 기존 데이터는 지우지 않는다. 다시 실행해도 두 번 들어가지 않는다.
do $$
declare
  g uuid;
  t uuid;
  i uuid;
  at_order integer;
begin
  if exists (select 1 from public.design_groups where name = '플레이맵 2D 뷰') then
    return;
  end if;

  select coalesce(max(sort_order) + 1, 0) into at_order from public.design_groups
   where name = '플레이맵 기본 요소 (기하학적 스케치)';
  update public.design_groups set sort_order = sort_order + 1 where sort_order >= at_order;
  insert into public.design_groups (name, note, color, sort_order)
    values ('플레이맵 2D 뷰', '2순위 · 기본 요소가 끝나면 작업합니다. 플레이맵 전용이며 월드맵에는 없습니다. 바닥과 바닥 표식은 기존 그림을 그대로 씁니다.', 'teal', at_order) returning id into g;

  select coalesce(max(sort_order) + 1, (select coalesce(max(sort_order) + 1, 0) from public.design_tasks)) into at_order
    from public.design_tasks where name like '개발: 월드맵%';
  update public.design_tasks set sort_order = sort_order + 1 where sort_order >= at_order;
  insert into public.design_tasks (name, owner, start_date, end_date, category, sort_order)
    values ('개발: 2D 뷰 그림 연결', '개발', '2026-12-14', '2027-01-24', 'dev', at_order);

  select coalesce(max(sort_order) + 1, (select coalesce(max(sort_order) + 1, 0) from public.design_tasks)) into at_order
    from public.design_tasks where name like '기본 요소 완성%';
  update public.design_tasks set sort_order = sort_order + 1 where sort_order >= at_order;
  insert into public.design_tasks (name, owner, start_date, end_date, category, sort_order)
    values ('플레이맵 2D 뷰 28장', '자유롤', '2026-12-14', '2027-01-10', 'play', at_order) returning id into t;

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 0, '플레이어 2D', '캐릭터', '투명', '차순위 제작', '2D 뷰에서 조종하는 눈사람입니다. 크기 1·2·3이 칸 안에서 한눈에 구분되어야 합니다.', '칸 하나에 그림 하나만 들어갑니다. 옆 칸으로 넘치면 안 됩니다.' || chr(10) || '겨울의 영혼과 같은 두건이 보여야 합니다.' || chr(10) || '방향별로 나누지 않고 크기마다 1장입니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/player_1.png', '플레이어 크기 1', 256, 256, 150, 150, 'center', '본체 최대 150 × 150 px', ''),
    (i, 1, '2d/player_2.png', '플레이어 크기 2', 256, 256, 195, 195, 'center', '본체 최대 195 × 195 px', ''),
    (i, 2, '2d/player_3.png', '플레이어 크기 3', 256, 256, 230, 230, 'center', '본체 최대 230 × 230 px', '');

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 1, '빈 눈사람 2D', '캐릭터', '투명', '차순위 제작', '영혼이 들어 있지 않은 눈사람입니다. 플레이어와 한눈에 구분되어야 합니다.', '칸 하나에 그림 하나만 들어갑니다. 옆 칸으로 넘치면 안 됩니다.' || chr(10) || '두건이 없습니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/snowman_1.png', '빈 눈사람 크기 1', 256, 256, 150, 150, 'center', '본체 최대 150 × 150 px', ''),
    (i, 1, '2d/snowman_2.png', '빈 눈사람 크기 2', 256, 256, 195, 195, 'center', '본체 최대 195 × 195 px', ''),
    (i, 2, '2d/snowman_3.png', '빈 눈사람 크기 3', 256, 256, 230, 230, 'center', '본체 최대 230 × 230 px', '');

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 2, '겨울의 영혼 2D', '캐릭터', '투명', '차순위 제작', '영혼이 이동할 때 2D 뷰에서 보이는 모습입니다.', '칸 하나에 그림 하나만 들어갑니다. 옆 칸으로 넘치면 안 됩니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/soul.png', '겨울의 영혼', 256, 256, 150, 150, 'center', '본체 최대 150 × 150 px', '');

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 3, '눈덩이 2D', '오브젝트', '투명', '차순위 제작', '밀면 굴러가는 공입니다. 크기 1과 2가 구분되어야 합니다. 전 챕터 공용입니다.', '칸 하나에 그림 하나만 들어갑니다. 옆 칸으로 넘치면 안 됩니다.' || chr(10) || '크기는 기존 눈덩이 지름과 같습니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/snowball_1.png', '작은 눈덩이', 256, 256, 143, 143, 'center', '지름 Ø143 px', ''),
    (i, 1, '2d/snowball_2.png', '큰 눈덩이', 256, 256, 205, 205, 'center', '지름 Ø205 px', '');

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 4, '블록 2D', '오브젝트', '투명', '차순위 제작', '밀어서 옮기는 블록입니다. 벽과 한눈에 구분되어야 합니다. 전 챕터 공용입니다.', '칸 하나에 그림 하나만 들어갑니다. 옆 칸으로 넘치면 안 됩니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/block.png', '블록', 256, 256, 208, 208, 'center', '본체 208 × 208 px', '');

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 5, '벽 2D', '오브젝트', '불투명', '차순위 제작', '칸 전체를 막는 벽입니다.', '칸 하나에 그림 하나만 들어갑니다. 옆 칸으로 넘치면 안 됩니다.' || chr(10) || '챕터별로 나눌지는 협의합니다. 지금은 공용 1장입니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/wall.png', '벽', 256, 256, 256, 256, 'center', '칸 전체 256 × 256 px', '');

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 6, '노란 벽 2D', '오브젝트', '투명', '차순위 제작', '노란 버튼으로 열리는 벽입니다. 닫힌 모습입니다.', '칸 하나에 그림 하나만 들어갑니다. 옆 칸으로 넘치면 안 됩니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/wall_yellow.png', '노란 벽', 256, 256, 256, 256, 'center', '칸 전체 256 × 256 px', '');

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 7, '나무 2D', '오브젝트', '투명', '차순위 제작', '칸을 막는 나무입니다. 높이가 곧 그림자 칸 수이므로 높이 1~4가 그림에서 구분되어야 합니다.', '칸 하나에 그림 하나만 들어갑니다. 옆 칸으로 넘치면 안 됩니다.' || chr(10) || '크기로 구분하기 어려우면 표식을 넣어도 됩니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/tree_1.png', '나무 높이 1', 256, 256, null, null, 'center', '칸 안 · 높이 1', ''),
    (i, 1, '2d/tree_2.png', '나무 높이 2', 256, 256, null, null, 'center', '칸 안 · 높이 2', ''),
    (i, 2, '2d/tree_3.png', '나무 높이 3', 256, 256, null, null, 'center', '칸 안 · 높이 3', ''),
    (i, 3, '2d/tree_4.png', '나무 높이 4', 256, 256, null, null, 'center', '칸 안 · 높이 4', '');

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 8, '레이저 2D', '오브젝트', '투명', '차순위 제작', '레이저 발사대입니다. 쏘는 방향이 그림에서 읽혀야 합니다.', '칸 하나에 그림 하나만 들어갑니다. 옆 칸으로 넘치면 안 됩니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/laser_up.png', '위로 쏘는 레이저', 256, 256, 216, 216, 'center', '본체 216 × 216 px', ''),
    (i, 1, '2d/laser_down.png', '아래로 쏘는 레이저', 256, 256, 216, 216, 'center', '본체 216 × 216 px', ''),
    (i, 2, '2d/laser_left.png', '왼쪽으로 쏘는 레이저', 256, 256, 216, 216, 'center', '본체 216 × 216 px', ''),
    (i, 3, '2d/laser_right.png', '오른쪽으로 쏘는 레이저', 256, 256, 216, 216, 'center', '본체 216 × 216 px', '');

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 9, '삼각 벽 2D', '오브젝트', '투명', '차순위 제작', '칸의 절반을 막는 삼각 벽입니다. 직각이 있는 모서리 쪽이 막힙니다.', '칸 하나에 그림 하나만 들어갑니다. 옆 칸으로 넘치면 안 됩니다.' || chr(10) || '빗변은 눈덩이가 튕기는 면입니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/tri_wall_tl.png', '왼쪽 위 삼각 벽', 256, 256, null, null, 'center', '칸 절반 · 직각이 왼쪽 위', ''),
    (i, 1, '2d/tri_wall_tr.png', '오른쪽 위 삼각 벽', 256, 256, null, null, 'center', '칸 절반 · 직각이 오른쪽 위', ''),
    (i, 2, '2d/tri_wall_bl.png', '왼쪽 아래 삼각 벽', 256, 256, null, null, 'center', '칸 절반 · 직각이 왼쪽 아래', ''),
    (i, 3, '2d/tri_wall_br.png', '오른쪽 아래 삼각 벽', 256, 256, null, null, 'center', '칸 절반 · 직각이 오른쪽 아래', '');

  insert into public.design_items (group_id, sort_order, name, category, alpha, priority, description, rules, task_id, is_new)
    values (g, 10, '아치 2D', '아치', '투명', '차순위 제작', '칸과 칸 사이 경계선 위에 놓입니다. 칸 안의 물체를 가리지 않습니다. 낮은 아치와 높은 아치가 구분되어야 합니다.', '칸 안이 아니라 경계선 위에 그립니다.' || chr(10) || '낮은 아치는 크기 1, 높은 아치는 크기 2까지 지나갑니다.', t, true) returning id into i;
  insert into public.design_files (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, placement, spec_note, note) values
    (i, 0, '2d/arch_h_1.png', '낮은 가로 아치', 256, 64, null, null, 'center', '칸 위쪽 경계 · 길이 256 px', ''),
    (i, 1, '2d/arch_h_2.png', '높은 가로 아치', 256, 64, null, null, 'center', '칸 위쪽 경계 · 길이 256 px', ''),
    (i, 2, '2d/arch_v_1.png', '낮은 세로 아치', 64, 256, null, null, 'center', '칸 왼쪽 경계 · 길이 256 px', ''),
    (i, 3, '2d/arch_v_2.png', '높은 세로 아치', 64, 256, null, null, 'center', '칸 왼쪽 경계 · 길이 256 px', '');

  update public.design_items
     set rules = case when rules = '' then '앞에서 보는 화면에서는 기둥과 들보가 뒤 칸 물체를 가릴 수 있습니다. 칸 안쪽을 덮지 않도록 얇게 그립니다. 물체의 정확한 위치는 2D 뷰에서 확인합니다.' else rules || chr(10) || '앞에서 보는 화면에서는 기둥과 들보가 뒤 칸 물체를 가릴 수 있습니다. 칸 안쪽을 덮지 않도록 얇게 그립니다. 물체의 정확한 위치는 2D 뷰에서 확인합니다.' end
   where name = '아치';
end;
$$;
