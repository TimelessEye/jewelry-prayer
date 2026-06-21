insert into public.classes (name, sort_order) values
  ('사랑반', 1), ('소망1반', 2), ('소망2반', 3), ('믿음1반', 4), ('믿음2반', 5)
on conflict do nothing;

insert into public.teachers (name, sort_order) values
  ('강순진', 1), ('김현진', 2), ('박옥희', 3), ('성유리', 4), ('신미경', 5),
  ('오선녀', 6), ('윤정아', 7), ('이린자', 8), ('이선예', 9), ('정은지', 10),
  ('조문경', 11), ('조선영', 12), ('홍명환', 13)
on conflict (name) do nothing;

insert into public.students (class_id, name, sort_order)
select c.id, v.name, v.ord
from public.classes c
join (values
  ('사랑반', '김채론', 1), ('사랑반', '노엘', 2), ('사랑반', '송예서', 3), ('사랑반', '안지호', 4),
  ('사랑반', '윤주로', 5), ('사랑반', '장윤슬', 6), ('사랑반', '정지호', 7),
  ('소망1반', '김아론', 1), ('소망1반', '김윤우', 2), ('소망1반', '송연서', 3), ('소망1반', '유선예', 4), ('소망1반', '유선하', 5),
  ('소망2반', '김라온', 1), ('소망2반', '김이서', 2), ('소망2반', '김하민', 3), ('소망2반', '박재준', 4),
  ('소망2반', '최지안', 5), ('소망2반', '김은율', 6), ('소망2반', '윤설', 7),
  ('믿음1반', '김다희', 1), ('믿음1반', '김은우', 2), ('믿음1반', '이서우', 3), ('믿음1반', '진소리', 4),
  ('믿음2반', '손혜린', 1), ('믿음2반', '윤태준', 2), ('믿음2반', '차예온', 3), ('믿음2반', '함이서', 4)
) as v(cls, name, ord) on v.cls = c.name
where not exists (
  select 1
  from public.students s
  where s.class_id = c.id and s.name = v.name
);

insert into public.prayer_days (day_index, prayer_date, publish_at, title)
select day_index, prayer_date, publish_at, title
from (values
  (1, date '2026-06-22', timestamptz '2026-06-22 00:00:00+09', '1일차 기도문'),
  (2, date '2026-06-23', timestamptz '2026-06-23 00:00:00+09', '2일차 기도문'),
  (3, date '2026-06-24', timestamptz '2026-06-24 00:00:00+09', '3일차 기도문'),
  (4, date '2026-06-25', timestamptz '2026-06-25 00:00:00+09', '4일차 기도문'),
  (5, date '2026-06-26', timestamptz '2026-06-26 00:00:00+09', '5일차 기도문'),
  (6, date '2026-06-27', timestamptz '2026-06-27 00:00:00+09', '6일차 기도문'),
  (7, date '2026-06-28', timestamptz '2026-06-28 00:00:00+09', '7일차 기도문'),
  (8, date '2026-06-29', timestamptz '2026-06-29 00:00:00+09', '8일차 기도문'),
  (9, date '2026-06-30', timestamptz '2026-06-30 00:00:00+09', '9일차 기도문'),
  (10, date '2026-07-01', timestamptz '2026-07-01 00:00:00+09', '10일차 기도문'),
  (11, date '2026-07-02', timestamptz '2026-07-02 00:00:00+09', '11일차 기도문'),
  (12, date '2026-07-03', timestamptz '2026-07-03 00:00:00+09', '12일차 기도문'),
  (13, date '2026-07-04', timestamptz '2026-07-04 00:00:00+09', '13일차 기도문'),
  (14, date '2026-07-05', timestamptz '2026-07-05 00:00:00+09', '14일차 기도문'),
  (15, date '2026-07-06', timestamptz '2026-07-06 00:00:00+09', '15일차 기도문'),
  (16, date '2026-07-07', timestamptz '2026-07-07 00:00:00+09', '16일차 기도문'),
  (17, date '2026-07-08', timestamptz '2026-07-08 00:00:00+09', '17일차 기도문'),
  (18, date '2026-07-09', timestamptz '2026-07-09 00:00:00+09', '18일차 기도문'),
  (19, date '2026-07-10', timestamptz '2026-07-10 00:00:00+09', '19일차 기도문'),
  (20, date '2026-07-11', timestamptz '2026-07-11 00:00:00+09', '20일차 기도문')
) as v(day_index, prayer_date, publish_at, title)
on conflict (day_index) do nothing;

insert into public.teacher_completion_gems (sort_order, slug, name_ko, name_en, description, image_path)
values
  (1, 'pink-diamond', '핑크 다이아몬드', 'Pink Diamond', '너무 적게 눌리면 투명하고, 너무 많이 눌리면 갈색이 되어 버리는 까다로운 분홍빛이라 가치가 높다.', 'images/teacher/gems/01-pink-diamond.png'),
  (2, 'blue-diamond', '블루 다이아몬드', 'Blue Diamond', '푸른빛은 극미량의 붕소가 만든다; 깊고 선명한 푸른 다이아일수록 자연이 거의 허락하지 않은 색이다.', 'images/teacher/gems/02-blue-diamond.png'),
  (3, 'red-diamond', '레드 다이아몬드', 'Red Diamond', '붉은빛을 주된 색으로 띠는 다이아몬드는 컬러 다이아몬드 중에서도 손에 꼽히게 드물다.', 'images/teacher/gems/03-red-diamond.png'),
  (4, 'alexandrite', '알렉산드라이트', 'Alexandrite', '낮에는 초록빛, 밤에는 붉은빛으로 변해 ''낮의 에메랄드, 밤의 루비''라 불린다.', 'images/teacher/gems/04-alexandrite.png'),
  (5, 'paraiba-tourmaline', '파라이바 투어멀린', 'Paraiba Tourmaline', '구리 성분이 만든 전기 같은 네온 블루그린 빛 때문에, 보석 안에 작은 번개가 든 것처럼 보인다.', 'images/teacher/gems/05-paraiba-tourmaline.png'),
  (6, 'imperial-jade', '임페리얼 제이드', 'Imperial Jade', '반투명한 에메랄드빛 경옥은 중국 왕실이 탐냈던 최상급 옥으로 알려져 있다.', 'images/teacher/gems/06-imperial-jade.png'),
  (7, 'padparadscha-sapphire', '파파라차 사파이어', 'Padparadscha Sapphire', '연꽃을 뜻하는 이름처럼, 분홍과 주황 사이의 보기 드문 노을빛을 품은 사파이어다.', 'images/teacher/gems/07-padparadscha-sapphire.png'),
  (8, 'tanzanite', '탄자나이트', 'Tanzanite', '현재 알려진 산지는 탄자니아 메렐라니 언덕 한 곳뿐이라, 태어난 곳부터 특별한 보석이다.', 'images/teacher/gems/08-tanzanite.png'),
  (9, 'black-opal', '블랙 오팔', 'Black Opal', '어두운 바탕이 무지개빛을 더 선명하게 살려, 작은 밤하늘을 품은 보석처럼 보인다.', 'images/teacher/gems/09-black-opal.png'),
  (10, 'ruby', '루비', 'Ruby', '크롬이 붉은색과 형광을 함께 만들어, 빛을 받을수록 속에서 불꽃처럼 타오른다.', 'images/teacher/gems/10-ruby.png'),
  (11, 'emerald', '에메랄드', 'Emerald', '내부의 포용물은 ''자르댕'', 곧 정원이라 불리며, 흠마저 하나뿐인 풍경이 된다.', 'images/teacher/gems/11-emerald.png'),
  (12, 'grandidierite', '그란디디어라이트', 'Grandidierite', '맑게 세공할 수 있는 원석이 매우 드물어, 바다빛을 지닌 숨은 보석으로 통한다.', 'images/teacher/gems/12-grandidierite.png'),
  (13, 'taaffeite', '타파이트', 'Taaffeite', '처음부터 원석이 아니라 이미 세공된 보석에서 발견된, 보석계의 반전 주인공이다.', 'images/teacher/gems/13-taaffeite.png')
on conflict (sort_order) do nothing;
