DROP POLICY storage_highlights_block_overwrite ON storage.objects;

CREATE POLICY storage_highlights_block_overwrite
  ON storage.objects
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (
    bucket = 'highlights'
    AND key LIKE 'clips/%'
    AND size BETWEEN 1 AND 26214400
    AND mime_type IN ('video/mp4', 'video/webm')
  );
