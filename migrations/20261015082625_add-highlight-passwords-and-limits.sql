ALTER TABLE public.highlights
  DROP CONSTRAINT highlights_file_size_check,
  DROP CONSTRAINT highlights_duration_check;

ALTER TABLE public.highlights
  ADD CONSTRAINT highlights_file_size_check CHECK (
    file_size BETWEEN 1 AND 52428800
  ),
  ADD CONSTRAINT highlights_duration_check CHECK (
    duration_seconds > 0 AND duration_seconds <= 60
  );

CREATE TABLE public.highlight_passwords (
  highlight_id uuid PRIMARY KEY
    REFERENCES public.highlights(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.highlight_passwords ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.highlight_passwords FROM PUBLIC, anon, authenticated;
