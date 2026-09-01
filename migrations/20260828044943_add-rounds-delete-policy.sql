DROP POLICY IF EXISTS "anyone can delete rounds" ON public.rounds;

CREATE POLICY "anyone can delete rounds"
  ON public.rounds
  FOR DELETE
  TO anon, authenticated
  USING (true);

GRANT DELETE ON public.rounds TO anon, authenticated;
