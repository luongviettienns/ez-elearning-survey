-- Ez-Elearning: migration bảo vệ dữ liệu + giới hạn gửi chung giữa các server.
-- Chạy sau khi đã đặt SUPABASE_SECRET_KEY trên Vercel; xem docs/ROLLOUT.md.
-- Có thể chạy lại. Không xóa phản hồi đang có.
BEGIN;

CREATE TABLE IF NOT EXISTS public.submissions (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  answers JSONB NOT NULL
);
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
-- Dữ liệu legacy có thể thiếu ngày gửi; gán thời điểm migration cho các dòng đó.
UPDATE public.submissions SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.submissions ALTER COLUMN created_at SET NOT NULL;
DROP POLICY IF EXISTS "Cho phép gửi khảo sát" ON public.submissions;
DROP POLICY IF EXISTS "Cho phép đọc dữ liệu khảo sát" ON public.submissions;
REVOKE ALL ON TABLE public.submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.submissions TO service_role;
CREATE INDEX IF NOT EXISTS submissions_created_id_idx
  ON public.submissions (created_at DESC, id DESC);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
CREATE TABLE IF NOT EXISTS private.survey_rate_limits (
  client_hash TEXT PRIMARY KEY CHECK (client_hash ~ '^[0-9a-f]{64}$'),
  last_submitted_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE private.survey_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.survey_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.survey_rate_limits TO service_role;
CREATE INDEX IF NOT EXISTS survey_rate_limits_time_idx
  ON private.survey_rate_limits (last_submitted_at);

-- SECURITY INVOKER: quyền gọi và quyền ghi đều thuộc service_role, không nâng quyền.
-- Upsert giữ khóa trên client_hash, nên các instance không cùng vượt cooldown.
-- Nếu INSERT phản hồi lỗi, PostgreSQL rollback cả việc giữ cooldown.
CREATE OR REPLACE FUNCTION public.submit_survey(
  p_id TEXT, p_created_at TIMESTAMPTZ, p_answers JSONB, p_client_hash TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_allowed BOOLEAN;
BEGIN
  IF p_client_hash IS NULL OR p_client_hash !~ '^[0-9a-f]{64}$'
     OR p_id IS NULL OR p_created_at IS NULL
     OR p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_SURVEY_INPUT' USING ERRCODE = '22023';
  END IF;

  DELETE FROM private.survey_rate_limits
    WHERE last_submitted_at < v_now - INTERVAL '1 hour';
  INSERT INTO private.survey_rate_limits (client_hash, last_submitted_at)
    VALUES (p_client_hash, v_now)
    ON CONFLICT (client_hash) DO UPDATE
      SET last_submitted_at = EXCLUDED.last_submitted_at
      WHERE private.survey_rate_limits.last_submitted_at <= v_now - INTERVAL '15 seconds'
    RETURNING TRUE INTO v_allowed;
  IF v_allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'SURVEY_RATE_LIMITED' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.submissions (id, created_at, answers)
    VALUES (p_id, p_created_at, p_answers);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_survey(TEXT, TIMESTAMPTZ, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_survey(TEXT, TIMESTAMPTZ, JSONB, TEXT)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
