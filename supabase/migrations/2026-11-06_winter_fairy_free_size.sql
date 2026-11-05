-- 2026-11-06: 겨울의 요정 크기 자유.
--   · 영혼은 룰에 크기가 없고, 게임은 그린 크기 그대로 보여 준다(256px = 한 칸).
--   · 캔버스·본체 값을 비우면 보드에 '크기 자유'로 보이고 크기 경고가 뜨지 않는다.
--   · 다시 실행해도 안전하다.

update public.design_files
   set canvas_w = null, canvas_h = null, body_w = null, body_h = null,
       spec_note = '크기는 자유입니다. 그린 크기 그대로 게임에 나옵니다(256px = 한 칸). 세 장의 캔버스 크기만 같게 맞춰 주세요.'
 where file_name in ('soul_down.png', 'soul_up.png', 'soul_right.png');
