CREATE OR REPLACE VIEW public.rounds_readable
WITH (security_invoker = true)
AS
SELECT
  r.id,
  r.session_id,
  r.created_at,
  r.winner_team,
  COALESCE(team1.names, ARRAY[]::text[]) AS team1_names,
  COALESCE(team2.names, ARRAY[]::text[]) AS team2_names,
  r.team1_champions,
  r.team2_champions,
  r.team1_ids,
  r.team2_ids
FROM public.rounds AS r
LEFT JOIN LATERAL (
  SELECT array_agg(
    COALESCE(p.real_name, '[unknown player]')
    ORDER BY member.position
  ) AS names
  FROM unnest(r.team1_ids) WITH ORDINALITY AS member(player_id, position)
  LEFT JOIN public.players AS p ON p.id::text = member.player_id
) AS team1 ON true
LEFT JOIN LATERAL (
  SELECT array_agg(
    COALESCE(p.real_name, '[unknown player]')
    ORDER BY member.position
  ) AS names
  FROM unnest(r.team2_ids) WITH ORDINALITY AS member(player_id, position)
  LEFT JOIN public.players AS p ON p.id::text = member.player_id
) AS team2 ON true;

COMMENT ON VIEW public.rounds_readable IS
  'Human-readable round data with player names resolved in team order.';

GRANT SELECT ON public.rounds_readable TO anon, authenticated;
