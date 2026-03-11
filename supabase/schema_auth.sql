-- ============================================================
-- Phase 2: Auth & Payment Schema
-- 기존 schema.sql 실행 후 이 파일을 추가로 실행하세요
-- ============================================================

-- ── profiles 테이블 ──────────────────────────────────────────
create table if not exists profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  nickname         text,
  avatar_url       text,
  free_usage_count int  not null default 0,  -- 무료 사용 횟수 (최대 30)
  credits          int  not null default 0,  -- 구매한 크레딧 (1크레딧 = 1회 생성)
  created_at       timestamptz default now()
);

alter table profiles enable row level security;

-- 본인 프로필만 읽기/수정 가능
create policy "Own profile read"   on profiles for select using (auth.uid() = id);
create policy "Own profile update" on profiles for update using (auth.uid() = id);

-- ── 신규 가입 시 profiles 자동 생성 트리거 ───────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── payments 테이블 (결제 내역) ──────────────────────────────
create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  payment_id    text not null unique,   -- PortOne payment_id
  credits       int  not null,          -- 구매한 크레딧 수
  amount        int  not null,          -- 결제 금액 (원)
  status        text not null default 'paid',
  created_at    timestamptz default now()
);

alter table payments enable row level security;

create policy "Own payments read" on payments for select using (auth.uid() = user_id);

-- ── 서버에서 크레딧 차감 및 무료 사용 증가용 함수 ────────────
create or replace function increment_free_usage(user_id uuid)
returns int as $$
declare
  new_count int;
begin
  update profiles
  set free_usage_count = free_usage_count + 1
  where id = user_id
  returning free_usage_count into new_count;
  return new_count;
end;
$$ language plpgsql security definer;

create or replace function deduct_credit(user_id uuid)
returns int as $$
declare
  remaining int;
begin
  update profiles
  set credits = credits - 1
  where id = user_id and credits > 0
  returning credits into remaining;
  return coalesce(remaining, -1);
end;
$$ language plpgsql security definer;

create or replace function add_credits(target_user_id uuid, amount int)
returns int as $$
declare
  new_credits int;
begin
  update profiles
  set credits = credits + amount
  where id = target_user_id
  returning credits into new_credits;
  return new_credits;
end;
$$ language plpgsql security definer;
