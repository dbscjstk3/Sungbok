CREATE POLICY "anyone can update player" ON players
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anyone can delete player" ON players
  FOR DELETE TO anon, authenticated
  USING (true);

GRANT UPDATE, DELETE ON players TO anon, authenticated;
