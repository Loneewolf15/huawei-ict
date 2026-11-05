-- ============================================================
--  Huawei ICT Accountability Partner System
--  Supabase SQL Schema
--  Run this in your Supabase project → SQL Editor
-- ============================================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------
--  participants table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.participants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  track       TEXT        NOT NULL
                          CHECK (track IN ('Cloud', 'Network', 'Computing', 'AI')),
  number      INTEGER     NOT NULL,
  partner_id  UUID        REFERENCES public.participants(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate numbers within the same track
  UNIQUE (track, number)
);

-- Index for quick lookups by number + track
CREATE INDEX IF NOT EXISTS idx_participants_track_number
  ON public.participants (track, number);

-- ----------------------------------------------------------------
--  shuffle_state table (singleton row, id=1)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shuffle_state (
  id          INTEGER     PRIMARY KEY DEFAULT 1,
  shuffled    BOOLEAN     NOT NULL DEFAULT FALSE,
  shuffled_at TIMESTAMPTZ
);

-- Insert default state row
INSERT INTO public.shuffle_state (id, shuffled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
--  Row Level Security (RLS)
--  Allow public reads and inserts; only service role can update partners
-- ----------------------------------------------------------------
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shuffle_state ENABLE ROW LEVEL SECURITY;

-- Anyone can read participants (to look up their partner)
CREATE POLICY "Public read participants"
  ON public.participants FOR SELECT
  USING (TRUE);

-- Anyone can insert a new participant (registration)
CREATE POLICY "Public insert participants"
  ON public.participants FOR INSERT
  WITH CHECK (TRUE);

-- Only authenticated users (admin via service key) can update (pairing)
-- For the client-side admin approach, we allow updates via anon key too.
-- IMPORTANT: In production, move this to a Supabase Edge Function with service key.
CREATE POLICY "Public update participants"
  ON public.participants FOR UPDATE
  USING (TRUE);

-- Anyone can read shuffle state
CREATE POLICY "Public read shuffle_state"
  ON public.shuffle_state FOR SELECT
  USING (TRUE);

-- Allow upsert on shuffle_state (admin triggers)
CREATE POLICY "Public upsert shuffle_state"
  ON public.shuffle_state FOR ALL
  USING (TRUE);

