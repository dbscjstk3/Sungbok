CREATE TABLE public.highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_name text NOT NULL,
  title text NOT NULL,
  video_url text NOT NULL,
  video_key text NOT NULL UNIQUE,
  file_size integer NOT NULL,
  duration_seconds numeric(5, 2) NOT NULL,
  content_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT highlights_uploader_name_check CHECK (
    length(btrim(uploader_name)) BETWEEN 1 AND 30
  ),
  CONSTRAINT highlights_title_check CHECK (
    length(btrim(title)) BETWEEN 1 AND 80
  ),
  CONSTRAINT highlights_file_size_check CHECK (
    file_size BETWEEN 1 AND 26214400
  ),
  CONSTRAINT highlights_duration_check CHECK (
    duration_seconds > 0 AND duration_seconds <= 30
  ),
  CONSTRAINT highlights_content_type_check CHECK (
    content_type IN ('video/mp4', 'video/webm')
  )
);

CREATE INDEX highlights_created_at_idx
  ON public.highlights (created_at DESC);

ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read highlights"
  ON public.highlights
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anyone can add highlights"
  ON public.highlights
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT ON public.highlights TO anon, authenticated;

CREATE POLICY storage_highlights_public_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket = 'highlights');

CREATE POLICY storage_highlights_public_insert
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket = 'highlights'
    AND key LIKE 'clips/%'
    AND size BETWEEN 1 AND 26214400
    AND mime_type IN ('video/mp4', 'video/webm')
  );

GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT SELECT, INSERT ON storage.objects TO anon, authenticated;
