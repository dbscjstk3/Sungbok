CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read sessions" ON sessions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anyone can insert sessions" ON sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anyone can update sessions" ON sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON sessions TO anon, authenticated;

CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  team1_ids TEXT[] NOT NULL,
  team2_ids TEXT[] NOT NULL,
  winner_team SMALLINT CHECK (winner_team IN (1, 2)),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read rounds" ON rounds FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anyone can insert rounds" ON rounds FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT SELECT, INSERT ON rounds TO anon, authenticated;
