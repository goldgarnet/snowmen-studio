-- 챕터 1~6을 사용자가 고친 챕터 0 양식에 맞춘다. 노랑 벽 설명도 게임의 새 연출에 맞춘다.
-- 글과 '가이드 / 채색 나누기'만 바꾼다. 담당, 상태, 일정 연결, 파일 칸, 참고 아이디어, 올린 그림은 그대로다.
-- 이전 글과 정확히 같은 칸만 바꾸므로 팀이 고친 칸은 건드리지 않고, 다시 실행해도 결과가 같다.
-- 라이브의 참고 사항 줄바꿈은 \r\n 이라 비교할 때 \r 을 뺀다.
-- 챕터 5의 결계 입구 · 유리 신전 입구, Anne, 챕터 6의 지구 동력 장치는 챕터 0에 없는 필수 요소라 그대로 둔다.
-- 히든 구역 줄은 챕터 0처럼 뺐다. 내용은 디자인 가이드 PDF에 남아 있다.
-- 2026-11-06 라이브 적용. 처음 쓴 임시 표 방식은 SQL Editor 에서 오류가 떠서 do 블록으로 고쳤다.

do $$
declare
  c record;
begin
  for c in
    select g.id, v.place
      from (values
        ('챕터 1 설원', '설원'),
        ('챕터 2 바위지형', '바위지형'),
        ('챕터 3 동굴', '동굴'),
        ('챕터 4 숲', '숲'),
        ('챕터 5 신전 외곽', '신전 외곽'),
        ('챕터 6 신전 중심', '신전 중심')
      ) as v(name, place)
      join public.design_groups g on g.name = v.name
  loop
    update public.design_groups
       set note = '플레이맵에 필요한 요소부터 제작하며, 그 후 월드맵 디자인을 진행합니다.'
     where id = c.id and note like '폴더 ch%';

    update public.design_items
       set description = '이 챕터의 차가운 칸입니다.', updated_at = now()
     where group_id = c.id and name = '차가운 타일'
       and description = '이 챕터의 차가운 칸입니다. 늘 안전한 칸입니다.';

    update public.design_items
       set rules = '기본 틀을 바탕으로 챕터 재질을 입힙니다.', updated_at = now()
     where group_id = c.id and name = '차가운 타일'
       and replace(rules, E'\r', '') = E'기본 틀을 바탕으로 챕터 재질을 입힙니다.\n여러 칸에 이어지는 무늬는 넣지 않습니다.';

    update public.design_items
       set rules = E'차가운 타일과 같은 재질로 그립니다.\n차가운 타일과 한눈에 구분되어야 합니다.', updated_at = now()
     where group_id = c.id and name = '따뜻한 타일'
       and replace(rules, E'\r', '') = E'차가운 타일과 같은 재질의 두 상태로 그립니다.\n차가운 타일과 한눈에 구분되어야 합니다.';

    update public.design_items
       set description = '플레이맵 뒤에 깔리는 이미지입니다.', updated_at = now()
     where group_id = c.id and name = '챕터 배경'
       and description = '플레이맵 뒤에 깔리는 이미지입니다. 가운데는 판이 덮습니다.';

    update public.design_items
       set split = false, updated_at = now()
     where group_id = c.id and name = '챕터 배경'
       and split and guide_assignee = '' and not guide_done;

    update public.design_items
       set description = '월드맵 2장이 이어져있습니다.', updated_at = now()
     where group_id = c.id and name = '월드맵 2장 스케치'
       and description = '섬이 아니라 이어진 땅입니다. 눈사람이 칸 단위로 WASD로 걷습니다.';

    update public.design_items
       set rules = E'걸을 수 있는 곳과 못 가는 곳이 한눈에 구분되어야 합니다.\n칸 수는 한 달 내에 확정 예정입니다.', updated_at = now()
     where group_id = c.id and name = '월드맵 2장 스케치'
       and replace(rules, E'\r', '') like E'걸을 수 있는 곳과 못 가는 곳이 한눈에 구분되어야 합니다.\n칸 수는 한 달 내에 확정합니다.%';

    update public.design_items
       set description = '구조물입니다.', updated_at = now()
     where group_id = c.id and name = '월드맵 구조물'
       and description = '여러 칸을 막는 큰 그림입니다. 건물 뒤로는 갈 수 없습니다.';

    update public.design_items
       set rules = c.place || '에 어울리는 구조물을 디자인합니다.', updated_at = now()
     where group_id = c.id and name = '월드맵 구조물'
       and replace(rules, E'\r', '') = E'멈춘 생명체와 합쳐 챕터당 4~6장입니다.\n배치는 팀이 칸에 맞춰 합니다.';
  end loop;

  update public.design_items
     set description = '노랑 버튼을 모두 누르고 있는 동안 바닥으로 가라앉아 열리고, 버튼에서 벗어나면 다시 솟아오릅니다. 움직임과 바닥 자국은 게임이 그리므로 닫힌 모습 한 장만 그립니다. 챕터 3에서 처음 나옵니다.',
         updated_at = now()
   where name = '노랑 벽'
     and description = '노랑 버튼을 모두 누르고 있는 동안 열립니다. 열린 모습은 자동으로 그려질 예정입니다. 챕터 3에서 처음 나옵니다.';
end $$;
