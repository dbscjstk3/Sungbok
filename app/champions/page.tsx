'use client'

import { useEffect, useMemo, useState } from 'react'
import NavBar from '@/app/components/NavBar'
import { insforge } from '@/lib/insforge'

interface Round {
  team1_ids: string[]
  team2_ids: string[]
  winner_team: 1 | 2 | null
  team1_champions: string[] | null
  team2_champions: string[] | null
}

interface PlayerRecord {
  id: string
  real_name: string
}

interface ChampionStat {
  name: string
  games: number
  wins: number
  losses: number
  winRate: number
  topPlayerName: string
  topPlayerGames: number
}

type SortKey = 'games' | 'wins' | 'rate'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'games', label: '픽' },
  { key: 'rate', label: '승률' },
  { key: 'wins', label: '승리' },
]

const MIN_GAME_OPTIONS = [1, 3, 5, 10]

function computeChampionStats(rounds: Round[], players: PlayerRecord[]): ChampionStat[] {
  const playerNames = new Map(players.map(player => [player.id, player.real_name]))
  const stats = new Map<string, { games: number; wins: number; playerGames: Map<string, number> }>()

  for (const round of rounds) {
    if (round.winner_team === null) continue

    const teams = [
      { ids: round.team1_ids, champions: round.team1_champions, won: round.winner_team === 1 },
      { ids: round.team2_ids, champions: round.team2_champions, won: round.winner_team === 2 },
    ]

    for (const team of teams) {
      team.champions?.forEach((champion, index) => {
        const name = champion.trim()
        if (!name) return

        const current = stats.get(name) ?? { games: 0, wins: 0, playerGames: new Map<string, number>() }
        current.games++
        if (team.won) current.wins++
        const playerId = team.ids[index]
        if (playerId) current.playerGames.set(playerId, (current.playerGames.get(playerId) ?? 0) + 1)
        stats.set(name, current)
      })
    }
  }

  return [...stats.entries()].map(([name, stat]) => {
    const [topPlayerId, topPlayerGames] = [...stat.playerGames.entries()]
      .sort((a, b) => b[1] - a[1] || (playerNames.get(a[0]) ?? '').localeCompare(playerNames.get(b[0]) ?? '', 'ko'))[0] ?? ['', 0]

    return {
      name,
      games: stat.games,
      wins: stat.wins,
      losses: stat.games - stat.wins,
      winRate: Math.round((stat.wins / stat.games) * 100),
      topPlayerName: playerNames.get(topPlayerId) ?? '알 수 없음',
      topPlayerGames,
    }
  })
}

export default function ChampionsPage() {
  const [rounds, setRounds] = useState<Round[]>([])
  const [players, setPlayers] = useState<PlayerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [query, setQuery] = useState('')
  const [minimumGames, setMinimumGames] = useState(1)
  const [sortBy, setSortBy] = useState<SortKey>('games')

  useEffect(() => {
    async function load() {
      const [roundResult, playerResult] = await Promise.all([
        insforge.database
          .from('rounds')
          .select('team1_ids, team2_ids, winner_team, team1_champions, team2_champions'),
        insforge.database
          .from('players')
          .select('id, real_name'),
      ])

      if (roundResult.error || playerResult.error) {
        setErrorMessage('챔피언 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      } else {
        setRounds((roundResult.data ?? []) as Round[])
        setPlayers((playerResult.data ?? []) as PlayerRecord[])
      }
      setLoading(false)
    }

    load()
  }, [])

  const allStats = useMemo(() => computeChampionStats(rounds, players), [rounds, players])

  const visibleStats = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
    return allStats
      .filter(stat => stat.games >= minimumGames)
      .filter(stat => !normalizedQuery || stat.name.toLocaleLowerCase('ko-KR').includes(normalizedQuery))
      .sort((a, b) => {
        if (sortBy === 'rate') return b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name, 'ko')
        if (sortBy === 'wins') return b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name, 'ko')
        return b.games - a.games || b.winRate - a.winRate || a.name.localeCompare(b.name, 'ko')
      })
  }, [allStats, minimumGames, query, sortBy])

  const summary = useMemo(() => {
    const totalPicks = allStats.reduce((sum, stat) => sum + stat.games, 0)
    const mostPlayed = [...allStats].sort((a, b) => b.games - a.games || b.winRate - a.winRate)[0]
    const qualified = allStats.filter(stat => stat.games >= 3)
    const highestRate = [...qualified].sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0]
    return { totalPicks, mostPlayed, highestRate }
  }, [allStats])

  return (
    <main className="min-h-[100dvh] px-4 py-12 sm:px-12 sm:py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
      <NavBar />

      <div className="mx-auto max-w-6xl pt-16">
        <h1 className="mb-2 text-3xl font-bold">챔피언 통계</h1>
        <p className="mb-8 text-sm" style={{ opacity: 0.5 }}>
          챔피언 정보가 저장된 경기만 집계합니다.
        </p>

        {loading && (
          <div className="space-y-3" aria-label="챔피언 통계를 불러오는 중">
            <div className="h-20 animate-pulse rounded-2xl" style={{ backgroundColor: '#DEE0E2' }} />
            <div className="h-64 animate-pulse rounded-2xl" style={{ backgroundColor: '#DEE0E2' }} />
          </div>
        )}

        {!loading && errorMessage && (
          <div className="rounded-2xl px-5 py-4 text-sm" role="alert" style={{ backgroundColor: '#F1D8D5', color: '#8B2F25' }}>
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && allStats.length === 0 && (
          <div className="py-20 text-center">
            <p className="mb-2 text-base font-semibold">아직 챔피언 기록이 없습니다.</p>
            <p className="text-sm" style={{ opacity: 0.5 }}>내전에서 챔피언을 불러온 뒤 결과를 저장하면 통계가 표시됩니다.</p>
          </div>
        )}

        {!loading && !errorMessage && allStats.length > 0 && (
          <>
            <section className="mb-8 grid grid-cols-2 overflow-hidden rounded-2xl sm:grid-cols-4" style={{ backgroundColor: '#DEE0E2' }}>
              {[
                { label: '챔피언', value: `${allStats.length}종` },
                { label: '집계된 픽 수', value: `${summary.totalPicks}회` },
                { label: '최다 픽', value: summary.mostPlayed ? `${summary.mostPlayed.name} ${summary.mostPlayed.games}회` : '-' },
                { label: '최고 승률 (3회+)', value: summary.highestRate ? `${summary.highestRate.name} ${summary.highestRate.winRate}%` : '-' },
              ].map(({ label, value }, index) => (
                <div
                  key={label}
                  className={`px-4 py-5 sm:border-t-0 sm:px-6 ${index > 0 ? 'sm:border-l' : ''} ${index % 2 === 1 ? 'border-l' : ''} ${index >= 2 ? 'border-t' : ''}`}
                  style={{ borderColor: '#ECEEF0' }}
                >
                  <p className="mb-1 text-xs" style={{ opacity: 0.5 }}>{label}</p>
                  <p className="truncate text-base font-bold sm:text-lg" title={value}>{value}</p>
                </div>
              ))}
            </section>

            <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="w-full lg:max-w-xs">
                <label htmlFor="champion-search" className="mb-2 block text-sm font-semibold">챔피언 검색</label>
                <input
                  id="champion-search"
                  type="search"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="이름 입력"
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[#202020]"
                  style={{ backgroundColor: '#DEE0E2', color: '#202020' }}
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="mb-2 text-sm font-semibold">최소 픽</p>
                  <div className="flex flex-wrap gap-2">
                    {MIN_GAME_OPTIONS.map(value => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMinimumGames(value)}
                        className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80 active:scale-[0.98]"
                        style={{ backgroundColor: minimumGames === value ? '#202020' : '#DEE0E2', color: minimumGames === value ? '#ECEEF0' : '#202020' }}
                      >
                        {value}회 이상
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold">정렬</p>
                  <div className="flex gap-2">
                    {SORT_OPTIONS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSortBy(key)}
                        className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80 active:scale-[0.98]"
                        style={{ backgroundColor: sortBy === key ? '#202020' : '#DEE0E2', color: sortBy === key ? '#ECEEF0' : '#202020' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {visibleStats.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm font-medium" style={{ opacity: 0.5 }}>조건에 맞는 챔피언이 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl" style={{ backgroundColor: '#DEE0E2' }}>
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #ECEEF0' }}>
                      <th className="w-14 px-4 py-4 text-center font-semibold" style={{ opacity: 0.5 }}>#</th>
                      <th className="px-4 py-4 text-left font-semibold" style={{ opacity: 0.5 }}>챔피언</th>
                      <th className="px-4 py-4 text-center font-semibold" style={{ opacity: 0.5 }}>픽</th>
                      <th className="px-4 py-4 text-center font-semibold" style={{ opacity: 0.5 }}>승</th>
                      <th className="px-4 py-4 text-center font-semibold" style={{ opacity: 0.5 }}>패</th>
                      <th className="px-4 py-4 text-center font-semibold" style={{ opacity: 0.5 }}>승률</th>
                      <th className="px-4 py-4 text-center font-semibold" style={{ opacity: 0.5 }}>최다 플레이 선수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStats.map((stat, index) => (
                      <tr key={stat.name} style={{ borderTop: '1px solid #ECEEF0' }}>
                        <td className="px-4 py-3 text-center font-medium" style={{ opacity: 0.35 }}>{index + 1}</td>
                        <td className="px-4 py-3 font-bold">{stat.name}</td>
                        <td className="px-4 py-3 text-center font-bold">{stat.games}</td>
                        <td className="px-4 py-3 text-center">{stat.wins}</td>
                        <td className="px-4 py-3 text-center">{stat.losses}</td>
                        <td className="px-4 py-3 text-center font-bold" style={{ color: stat.winRate >= 50 ? '#2d7a3a' : '#c0392b' }}>
                          {stat.winRate}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-medium">{stat.topPlayerName}</span>
                          <span className="ml-1" style={{ opacity: 0.45 }}>{stat.topPlayerGames}회</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
