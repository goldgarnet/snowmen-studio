-- 2026-11-05: 눈사람 규격 정리.
--   · 눈사람은 크기 1·2·3 모두 2단(머리 + 몸통)이다. 문구의 '1단·2단·3단' 을 '크기' 로 고친다.
--     숫자 규격은 원래 2단 모양 기준이라 그대로다. 나무의 1~4단은 실제 층 수이므로 그대로 둔다.
--   · 플레이어 녹는 모습은 정면 · 옆모습 · 뒷모습을 그린다. 왼쪽은 옆모습을 뒤집어 쓴다.
--   · 빈 눈사람은 얼굴이 없어 정면만 그린다. 뒷모습 · 옆모습 칸을 없애고 녹는 모습을 더한다.
--   · 그림이 올라간 칸은 지우지 않는다. 다시 실행해도 안전하다.

-- 문구
update public.design_items
   set description = replace(replace(replace(replace(replace(description,
         '2단으로', '크기 2로'), '1단으로', '크기 1로'),
         '1단', '크기 1'), '2단', '크기 2'), '3단', '크기 3'),
       rules = replace(replace(rules, '같은 단 수의', '같은 크기의'), '1단 캔버스', '크기 1 캔버스')
 where name like '플레이어 (크기 _)'
    or name like '빈 눈사람 (크기 _)'
    or name like '플레이어 (크기 _) 녹는 모습';

update public.design_items
   set rules = case when rules = '' then '크기 1·2·3 모두 2단(머리 + 몸통)입니다. 단 수가 아니라 크기로 구분합니다.'
                    else rules || chr(10) || '크기 1·2·3 모두 2단(머리 + 몸통)입니다. 단 수가 아니라 크기로 구분합니다.' end
 where (name like '플레이어 (크기 _)' or name like '빈 눈사람 (크기 _)' or name in ('플레이어 2D', '빈 눈사람 2D'))
   and rules not like '%모두 2단%';

update public.design_files set note = '크기 1 눈사람만 지나갑니다.' where note = '1단 눈사람만 지나갑니다.';
update public.design_files set note = '크기 2 눈사람까지 지나갑니다.' where note = '2단 눈사람까지 지나갑니다.';
update public.design_files set note = '크기 1 눈덩이.' where note = '1단 눈덩이.';
update public.design_files set note = '크기 2 눈덩이.' where note = '2단 눈덩이.';

-- 빈 눈사람은 정면 1장
delete from public.design_files f
 where f.file_name ~ '^snowman_[123]_(up|right)\.png$'
   and not exists (select 1 from public.design_images i where i.file_id = f.id);

update public.design_files
   set note = '빈 눈사람은 이 그림 1장만 씁니다.'
 where file_name ~ '^snowman_[123]_down\.png$' and note = '아래로 이동할 때 보이는 모습입니다.';

update public.design_items
   set rules = rules || chr(10) || '얼굴이 없어 정면 1장만 그립니다.'
 where name like '빈 눈사람 (크기 _)' and rules not like '%정면 1장만%';

-- 플레이어 녹는 모습은 3방향
update public.design_items
   set rules = replace(rules, '정면만 그립니다. 낱장은 3~4장이고',
                       '정면, 옆모습, 뒷모습을 그립니다. 왼쪽은 옆모습을 뒤집어 씁니다. 낱장은 방향마다 3~4장이고')
 where name like '플레이어 (크기 _) 녹는 모습';

update public.design_files
   set file_name = regexp_replace(file_name, '^player_([123])_melt_', 'player_\1_down_melt_'),
       label = '정면 ' || label
 where file_name ~ '^player_[123]_melt_[1-4]\.png$';

insert into public.design_files
  (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note)
select f.item_id, f.sort_order + d.step, replace(f.file_name, '_down_melt_', '_' || d.dir || '_melt_'),
       d.label || ' ' || replace(f.label, '정면 ', ''),
       f.canvas_w, f.canvas_h, f.body_w, f.body_h, f.bottom_px, f.face_px, f.placement, f.spec_note, f.note
  from public.design_files f
 cross join (values ('right', '옆모습', 4), ('up', '뒷모습', 8)) as d(dir, label, step)
 where f.file_name ~ '^player_[123]_down_melt_[1-4]\.png$'
   and not exists (select 1 from public.design_files x
                    where x.file_name = replace(f.file_name, '_down_melt_', '_' || d.dir || '_melt_'));

-- 빈 눈사람 녹는 모습 (크기 3 · 2 · 1 순서로 플레이어 녹는 모습 뒤에 놓는다)
insert into public.design_items
  (group_id, sort_order, name, category, alpha, priority, assignee, description, rules, is_new, task_id, draft_task_id)
select p.group_id,
       (select max(m.sort_order) from public.design_items m where m.group_id = p.group_id) + 4 - substr(p.name, 10, 1)::int,
       replace(p.name, '플레이어', '빈 눈사람'), p.category, p.alpha, p.priority, p.assignee,
       replace(p.description, '플레이어가', '빈 눈사람이'),
       '얼굴, 나뭇가지, 두건이 없습니다. 몸이 녹는 모습만 그립니다.' || chr(10) || '얼굴이 없어 정면만 그립니다. 낱장은 3~4장이고 시안을 보며 계속 바꿔 나갑니다.',
       true, p.task_id, p.draft_task_id
  from public.design_items p
 where p.name like '플레이어 (크기 _) 녹는 모습'
   and not exists (select 1 from public.design_items x where x.name = replace(p.name, '플레이어', '빈 눈사람'));

insert into public.design_files
  (item_id, sort_order, file_name, label, canvas_w, canvas_h, body_w, body_h, bottom_px, face_px, placement, spec_note, note)
select i.id, f.sort_order, replace(f.file_name, 'player_', 'snowman_'), replace(f.label, '정면 ', ''),
       f.canvas_w, f.canvas_h, f.body_w, f.body_h, f.bottom_px, f.face_px, f.placement, f.spec_note, f.note
  from public.design_files f
  join public.design_items p on p.id = f.item_id
  join public.design_items i on i.name = replace(p.name, '플레이어', '빈 눈사람')
 where f.file_name ~ '^player_[123]_down_melt_[1-4]\.png$'
   and not exists (select 1 from public.design_files x where x.file_name = replace(f.file_name, 'player_', 'snowman_'));

-- 일정
update public.design_tasks set name = '캐릭터 12장 · 영혼 3장' where name = '캐릭터 18장 · 영혼 3장';
update public.design_tasks set name = '녹는 모습 36~48장', end_date = '2027-01-17' where name = '녹는 모습 9~12장';
