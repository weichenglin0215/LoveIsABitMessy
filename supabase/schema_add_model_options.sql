CREATE TABLE IF NOT EXISTS public.model_options (
    name text PRIMARY KEY,
    stream boolean DEFAULT true,
    temperature numeric DEFAULT 0.85,
    num_predict integer DEFAULT -1,
    num_ctx integer DEFAULT 4096,
    repeat_penalty numeric DEFAULT 1.1,
    top_k integer DEFAULT 40,
    top_p numeric DEFAULT 0.9,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);
