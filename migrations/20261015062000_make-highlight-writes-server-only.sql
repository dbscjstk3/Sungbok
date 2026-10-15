DROP POLICY IF EXISTS "anyone can add highlights" ON public.highlights;
REVOKE INSERT ON public.highlights FROM anon, authenticated;

DROP POLICY IF EXISTS storage_highlights_public_read ON storage.objects;
DROP POLICY IF EXISTS storage_highlights_public_insert ON storage.objects;
DROP POLICY IF EXISTS storage_highlights_allow_update_probe ON storage.objects;

-- These grants may have been attempted by earlier migrations, but only the
-- storage owner can change them. The production setup also revokes them with
-- the owner connection when this migration is introduced.
REVOKE SELECT, INSERT, UPDATE ON storage.objects FROM anon, authenticated;
REVOKE USAGE ON SCHEMA storage FROM anon, authenticated;
