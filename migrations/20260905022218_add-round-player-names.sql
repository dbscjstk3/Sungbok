ALTER TABLE public.rounds
  ADD COLUMN team1_names text[],
  ADD COLUMN team2_names text[];

CREATE OR REPLACE FUNCTION public.sync_round_player_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  SELECT COALESCE(
    array_agg(COALESCE(p.real_name, '[unknown player]') ORDER BY member.position),
    ARRAY[]::text[]
  )
  INTO NEW.team1_names
  FROM unnest(NEW.team1_ids) WITH ORDINALITY AS member(player_id, position)
  LEFT JOIN public.players AS p ON p.id::text = member.player_id;

  SELECT COALESCE(
    array_agg(COALESCE(p.real_name, '[unknown player]') ORDER BY member.position),
    ARRAY[]::text[]
  )
  INTO NEW.team2_names
  FROM unnest(NEW.team2_ids) WITH ORDINALITY AS member(player_id, position)
  LEFT JOIN public.players AS p ON p.id::text = member.player_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_round_player_names_before_write
BEFORE INSERT OR UPDATE OF team1_ids, team2_ids
ON public.rounds
FOR EACH ROW
EXECUTE FUNCTION public.sync_round_player_names();

REVOKE ALL ON FUNCTION public.sync_round_player_names() FROM PUBLIC;

UPDATE public.rounds
SET
  team1_ids = team1_ids,
  team2_ids = team2_ids;

ALTER TABLE public.rounds
  ALTER COLUMN team1_names SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN team1_names SET NOT NULL,
  ALTER COLUMN team2_names SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN team2_names SET NOT NULL;

COMMENT ON COLUMN public.rounds.team1_names IS
  'Player names resolved from team1_ids in the same array order.';

COMMENT ON COLUMN public.rounds.team2_names IS
  'Player names resolved from team2_ids in the same array order.';

CREATE OR REPLACE FUNCTION public.refresh_round_player_names_after_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.rounds
  SET
    team1_ids = team1_ids,
    team2_ids = team2_ids
  WHERE OLD.id::text = ANY(team1_ids)
     OR OLD.id::text = ANY(team2_ids);

  RETURN NEW;
END;
$$;

CREATE TRIGGER refresh_round_player_names_after_rename
AFTER UPDATE OF real_name
ON public.players
FOR EACH ROW
WHEN (OLD.real_name IS DISTINCT FROM NEW.real_name)
EXECUTE FUNCTION public.refresh_round_player_names_after_rename();

REVOKE ALL ON FUNCTION public.refresh_round_player_names_after_rename() FROM PUBLIC;
