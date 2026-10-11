-- =======================================================
-- Ez-Elearning Survey: Script tạo bảng cho Supabase
-- Copy toàn bộ nội dung này và chạy trong Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xcfoxiwyvytfnlymnihh/sql/new
-- =======================================================

-- 1. Tạo bảng submissions
CREATE TABLE IF NOT EXISTS public.submissions (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    answers JSONB NOT NULL
);

-- 2. Bật Row Level Security (RLS)
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- 3. Tạo chính sách cho phép gửi khảo sát (INSERT)
CREATE POLICY "Cho phép gửi khảo sát" ON public.submissions
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- 4. Tạo chính sách cho phép đọc dữ liệu (SELECT)
CREATE POLICY "Cho phép đọc dữ liệu khảo sát" ON public.submissions
    FOR SELECT TO anon, authenticated
    USING (true);
