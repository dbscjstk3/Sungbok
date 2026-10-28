export interface LeagueSession {
  id: string
  bet_amount: number
}

export interface LeagueRound {
  session_id: string
  team1_ids: string[]
  team2_ids: string[]
  winner_team: 1 | 2 | null
  created_at?: string
}

export type LeagueDivision = 1 | 2

const SEASON_3_DIVISION_ONE_PLAYER_IDS = new Set([
  'f7fdae10-ca2f-4fd2-b713-6e7b6abd146d', // 이승주
  '48b3b534-5fb3-4147-9b01-8ec083f0e24a', // 박재현
  '03f83fed-e888-431f-b592-527a79f641b4', // 양현모
  '110c7f18-f507-4657-8636-f492a39544fb', // 손정익
  '3aa12688-815b-4618-954a-a50564474328', // 임용섭
  '11341791-6f96-472a-a9d8-a77059c75cda', // 윤현석
])

export function computeDivisionOnePlayerIds(
  rounds: LeagueRound[],
  sessions: LeagueSession[]
): Set<string> {
  const divisionOnePlayerIds = new Set(SEASON_3_DIVISION_ONE_PLAYER_IDS)
  const profits = new Map<string, number>()
  const sessionBets = new Map(sessions.map(session => [session.id, session.bet_amount]))

  const updatePlayer = (playerId: string, profitChange: number) => {
    if (SEASON_3_DIVISION_ONE_PLAYER_IDS.has(playerId)) return

    const profit = (profits.get(playerId) ?? 0) + profitChange
    profits.set(playerId, profit)

    if (divisionOnePlayerIds.has(playerId) && profit < 0) {
      divisionOnePlayerIds.delete(playerId)
    } else if (!divisionOnePlayerIds.has(playerId) && profit > 50_000) {
      divisionOnePlayerIds.add(playerId)
    }
  }

  const completedRounds = [...rounds]
    .filter(round => round.winner_team !== null)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  for (const round of completedRounds) {
    const bet = sessionBets.get(round.session_id) ?? 0
    const winners = round.winner_team === 1 ? round.team1_ids : round.team2_ids
    const losers = round.winner_team === 1 ? round.team2_ids : round.team1_ids
    winners.forEach(playerId => updatePlayer(playerId, bet))
    losers.forEach(playerId => updatePlayer(playerId, -bet))
  }

  return divisionOnePlayerIds
}
