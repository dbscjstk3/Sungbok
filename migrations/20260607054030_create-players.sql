CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  real_name TEXT NOT NULL,
  summoner_name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read players" ON players
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "anyone can add player" ON players
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT ON players TO anon, authenticated;
