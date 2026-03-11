-- ============================================================
-- Supabase: prompts 테이블 생성 및 샘플 데이터
-- Supabase SQL Editor 에서 실행하세요
-- ============================================================

create table if not exists prompts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  prompt_text text not null,
  category    text not null default '기타',
  usage_count int  not null default 0,
  created_at  timestamptz default now()
);

-- RLS: 읽기는 누구나, 쓰기는 service_role 만
alter table prompts enable row level security;

create policy "Public read" on prompts
  for select using (true);

-- usage_count 증가용 RPC 함수
create or replace function increment_usage(row_id uuid)
returns void as $$
  update prompts set usage_count = usage_count + 1 where id = row_id;
$$ language sql volatile security definer;

-- 샘플 프리셋 데이터
insert into prompts (title, prompt_text, category, usage_count) values
  (
    '🔥 요즘 터지는 쇼츠 대본',
    '지금 유튜브·릴스·틱톡에서 실제로 바이럴 중인 포맷(공감 유발, 반전 엔딩, 챌린지 등)을 분석해서 각각 다른 스타일의 쇼츠 대본 5편을 짜줘. 각 대본은 "훅 → 전개 → 반전/CTA" 3단 구조로 30초~1분 분량이어야 해. 제목, 자막 텍스트, 감정 지시어(웃음, 놀람 등)도 포함해줘.',
    '대본',
    128
  ),
  (
    '💸 월 100만원 부업 아이디어',
    '직장인이나 대학생이 퇴근 후 혼자서 시작할 수 있는 현실적인 부업 아이디어 5가지를 알려줘. 각각 시작 비용, 수익 구조, 첫 달 실행 로드맵까지 구체적으로. 유행하는 AI 도구나 플랫폼을 적극 활용하는 아이디어면 더 좋아.',
    '아이디어',
    97
  ),
  (
    '😈 소름 돋는 도시전설 소설',
    '한국을 배경으로 한 소름 돋는 도시전설 단편소설 5편을 써줘. 각 편은 "평범한 일상 → 이상한 징조 → 반전 결말" 구조로 1500자 이상. 독자가 끝까지 읽고 나서 주변을 돌아보게 만드는 분위기여야 해.',
    '소설',
    74
  ),
  (
    '🧠 천재처럼 보이는 PPT 한 장',
    '임원 보고나 PT 발표에서 "이 사람 뭔가 다르다"는 인상을 주는 슬라이드 한 장 구성 아이디어 5가지를 줘. 각각 슬라이드 제목, 핵심 메시지 한 줄, 시각화 방법(도표·아이콘·여백 전략 등), 발표 스크립트 30초 버전까지 포함해줘.',
    '아이디어',
    61
  ),
  (
    '✈️ 혼자 떠나는 2박3일 플랜',
    '국내 또는 아시아 근거리 여행지 중 혼자 여행하기 좋은 곳 5곳의 2박3일 일정을 짜줘. 각각 숙소 유형, 하루 동선, 혼자가서 외롭지 않은 포인트, 예상 총 비용(항공 제외)까지. 감성 있고 실용적으로 써줘.',
    '아이디어',
    53
  );
