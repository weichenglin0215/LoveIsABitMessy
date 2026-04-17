-- LoveIsABitMessy - Supabase schema (v1)
-- 目的：存角色卡、LPAS 測驗（session/answers/results）、日記、圖片生成紀錄。
-- 使用方式：Supabase Dashboard -> SQL Editor -> 貼上整份執行。

-- Extensions
create extension if not exists "pgcrypto";

-- ====== Core tables ======

-- 角色卡（可由 LPAS 產生或人工維護）
create table if not exists public.characters (
  id text primary key,
  name text not null,
  card_json jsonb not null,
  source text not null default 'manual', -- manual | lpas | import
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- LPAS 測驗 session（基本資料與時間）
create table if not exists public.lpas_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique, -- 前端產生（可用 uuid or sess_...）
  alias text,
  age_range text not null,
  relationship_experience text not null, -- yes | no
  schema_version int not null default 1,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- LPAS 逐題答案（作答過程）
create table if not exists public.lpas_answers (
  id uuid primary key default gen_random_uuid(),
  lpas_session_id uuid not null references public.lpas_sessions(id) on delete cascade,
  question_id text not null,  -- e.g. Q01
  score int not null check (score >= 1 and score <= 7),
  period int,
  dimension int,
  direction int,
  question_text text,
  answered_at timestamptz,
  time_spent_ms int,
  created_at timestamptz not null default now()
);

create index if not exists idx_lpas_answers_session on public.lpas_answers(lpas_session_id);
create index if not exists idx_lpas_answers_qid on public.lpas_answers(question_id);

-- LPAS 最終結果（分析快照 + 角色卡快照）
create table if not exists public.lpas_results (
  id uuid primary key default gen_random_uuid(),
  lpas_session_id uuid not null unique references public.lpas_sessions(id) on delete cascade,
  type_code text not null,
  type_name text not null,
  type_desc text not null,
  averages jsonb,   -- [dim1..dim4]
  radar_data jsonb, -- chart.js data snapshot
  character_card jsonb not null, -- 角色卡快照（避免後續角色卡被改動影響歷史）
  created_at timestamptz not null default now()
);

create index if not exists idx_lpas_results_type on public.lpas_results(type_code);

-- 日記（由 generate_story.py 產生）
create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  character_id text references public.characters(id) on delete set null,
  character_name text,
  story text not null,
  full_prompt text,
  image_prompt text,
  story_filename text, -- e.g. 2026-04-15_abc-001.json
  html_filename text,  -- e.g. 2026-04-15_abc-001.html
  image_filename text, -- e.g. 2026-04-15_abc-001.png
  created_at timestamptz not null default now()
);

create index if not exists idx_diary_entries_date on public.diary_entries(entry_date desc);
create index if not exists idx_diary_entries_character on public.diary_entries(character_id);

-- 圖片生成（ComfyUI / 其他）
create table if not exists public.image_generations (
  id uuid primary key default gen_random_uuid(),
  diary_entry_id uuid references public.diary_entries(id) on delete cascade,
  prompt text not null,
  image_filename text,
  status text not null default 'requested', -- requested | completed | failed
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_image_generations_diary on public.image_generations(diary_entry_id);

-- ====== updated_at trigger ======
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_characters_updated_at on public.characters;
create trigger trg_characters_updated_at
before update on public.characters
for each row execute function public.set_updated_at();

-- ====== RLS ======
alter table public.characters enable row level security;
alter table public.lpas_sessions enable row level security;
alter table public.lpas_answers enable row level security;
alter table public.lpas_results enable row level security;
alter table public.diary_entries enable row level security;
alter table public.image_generations enable row level security;

-- 策略設計：
-- - 後台管理（登入使用者）可 read/write 全部表
-- - 公開頁面（匿名）僅允許 read：characters（active）、diary_entries（全部或你可再加欄位控管）、lpas 統計若要開再說

-- Authenticated full access
drop policy if exists p_characters_auth_all on public.characters;
create policy p_characters_auth_all
on public.characters
for all
to authenticated
using (true)
with check (true);

drop policy if exists p_lpas_sessions_auth_all on public.lpas_sessions;
create policy p_lpas_sessions_auth_all
on public.lpas_sessions
for all
to authenticated
using (true)
with check (true);

drop policy if exists p_lpas_answers_auth_all on public.lpas_answers;
create policy p_lpas_answers_auth_all
on public.lpas_answers
for all
to authenticated
using (true)
with check (true);

drop policy if exists p_lpas_results_auth_all on public.lpas_results;
create policy p_lpas_results_auth_all
on public.lpas_results
for all
to authenticated
using (true)
with check (true);

drop policy if exists p_diary_entries_auth_all on public.diary_entries;
create policy p_diary_entries_auth_all
on public.diary_entries
for all
to authenticated
using (true)
with check (true);

drop policy if exists p_image_generations_auth_all on public.image_generations;
create policy p_image_generations_auth_all
on public.image_generations
for all
to authenticated
using (true)
with check (true);

-- Anonymous read access (public)
drop policy if exists p_characters_anon_read on public.characters;
create policy p_characters_anon_read
on public.characters
for select
to anon
using (is_active = true);

drop policy if exists p_diary_entries_anon_read on public.diary_entries;
create policy p_diary_entries_anon_read
on public.diary_entries
for select
to anon
using (true);

