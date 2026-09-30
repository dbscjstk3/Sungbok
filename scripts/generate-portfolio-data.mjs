import { readFile, writeFile } from 'node:fs/promises'

const sourcePath = new URL('../backups/portfolio-source.json', import.meta.url)
const season1Path = new URL('../data/season1-standings.json', import.meta.url)
const outputPath = new URL('../data/portfolio-data.json', import.meta.url)

const source = JSON.parse(await readFile(sourcePath, 'utf8'))
const season1 = JSON.parse(await readFile(season1Path, 'utf8'))
const tables = source.data.tables
const livePlayers = tables.players.rows
const season2Sessions = tables.sessions.rows.filter(session => session.ended_at)
const season2SessionIds = new Set(season2Sessions.map(session => session.id))
const season2Rounds = tables.rounds.rows.filter(round => season2SessionIds.has(round.session_id))

const createdAtByPlayer = new Map(livePlayers.map(player => [player.id, player.created_at]))
const orderedPlayerIds = livePlayers.map(player => player.id).sort((left, right) => {
  const leftCreated = createdAtByPlayer.get(left) ?? '9999'
  const rightCreated = createdAtByPlayer.get(right) ?? '9999'
  return leftCreated.localeCompare(rightCreated) || left.localeCompare(right)
})
const playerIdMap = new Map(orderedPlayerIds.map((id, index) => [id, `player-${String(index + 1).padStart(2, '0')}`]))

const players = orderedPlayerIds.map((id, index) => ({
  id: playerIdMap.get(id),
  real_name: `플레이어 ${String(index + 1).padStart(2, '0')}`,
  summoner_name: null,
  created_at: createdAtByPlayer.get(id) ?? '2025-01-01T00:00:00.000Z',
}))

function sanitizeSeason(seasonNumber, sessions, rounds) {
  const orderedSessions = [...sessions].sort((left, right) => left.created_at.localeCompare(right.created_at))
  const sessionIdMap = new Map(orderedSessions.map((session, index) => [session.id, `s${seasonNumber}-session-${String(index + 1).padStart(2, '0')}`]))
  const sanitizedSessions = orderedSessions.map(session => ({
    id: sessionIdMap.get(session.id),
    created_at: session.created_at,
    ended_at: session.ended_at ?? session.created_at,
    bet_amount: Number(session.bet_amount) || 0,
  }))
  function sanitizeTeam(ids, champions) {
    const keptIndexes = ids.map((id, index) => playerIdMap.has(id) ? index : -1).filter(index => index >= 0)
    return {
      ids: keptIndexes.map(index => playerIdMap.get(ids[index])),
      champions: champions ? keptIndexes.map(index => champions[index] ?? '') : null,
    }
  }

  const sanitizedRounds = rounds
    .filter(round => sessionIdMap.has(round.session_id))
    .sort((left, right) => (left.created_at ?? '').localeCompare(right.created_at ?? ''))
    .map((round, index) => {
      const team1 = sanitizeTeam(round.team1_ids, round.team1_champions)
      const team2 = sanitizeTeam(round.team2_ids, round.team2_champions)
      return {
        id: `s${seasonNumber}-round-${String(index + 1).padStart(3, '0')}`,
        session_id: sessionIdMap.get(round.session_id),
        team1_ids: team1.ids,
        team2_ids: team2.ids,
        winner_team: round.winner_team,
        created_at: round.created_at ?? '',
        team1_champions: team1.champions,
        team2_champions: team2.champions,
      }
    })

  return { sessions: sanitizedSessions, rounds: sanitizedRounds }
}

const sanitizedSeason1 = sanitizeSeason(1, season1.sessions, season1.rounds)
const sanitizedSeason2 = sanitizeSeason(2, season2Sessions, season2Rounds)
const allSessions = [...sanitizedSeason1.sessions, ...sanitizedSeason2.sessions]

const output = {
  metadata: {
    player_count: players.length,
    session_count: allSessions.length,
    round_count: sanitizedSeason1.rounds.length + sanitizedSeason2.rounds.length,
    first_session_at: allSessions[0]?.created_at ?? null,
    last_session_at: allSessions.at(-1)?.created_at ?? null,
  },
  players,
  seasons: {
    1: sanitizedSeason1,
    2: sanitizedSeason2,
  },
}

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
console.log(`Generated portfolio data: ${output.metadata.player_count} players, ${output.metadata.session_count} sessions, ${output.metadata.round_count} rounds`)
