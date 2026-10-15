-- InsForge checks keyed uploads with INSERT ... ON CONFLICT DO UPDATE.
-- PostgreSQL therefore requires UPDATE privileges even when the key is new.
-- The false RLS predicates keep actual overwrites disabled for anonymous users.
CREATE POLICY storage_highlights_block_overwrite
  ON storage.objects
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

GRANT UPDATE (size, mime_type, uploaded_via)
  ON storage.objects
  TO anon, authenticated;
