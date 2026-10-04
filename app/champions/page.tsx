'use client'

import { useEffect, useMemo, useState } from 'react'
import NavBar from '@/app/components/NavBar'
import { insforge } from '@/lib/insforge'
import {
  IS_MOCK,
  portfolioPlayers,
  portfolioSeason1Rounds,
  portfolioSeason2Rounds,
  samplePlayers,
  sampleRounds,
} from '@/lib/sampleData'
import { IS_PORTFOLIO } from '@/lib/appMode'
import season1Standings from '@/data/season1-standings.json'

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

interface ChampionPlayerStat {
  id: string
  name: string
  games: number
  wins: number
  losses: number
  winRate: number
}

interface ChampionStat {
  name: string
  games: number
  wins: number
  losses: number
  winRate: number
  topPlayerName: string
  topPlayerGames: number
  topPlayerWins: number
  topPlayerLosses: number
  playerStats: ChampionPlayerStat[]
}

type SortKey = 'games' | 'wins' | 'rate'
type Season = 1 | 2

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'games', label: '픽' },
  { key: 'rate', label: '승률' },
  { key: 'wins', label: '승리' },
]

const MIN_GAME_OPTIONS = [1, 3, 5, 10]

function computeChampionStats(rounds: Round[], players: PlayerRecord[]): ChampionStat[] {
  const playerNames = new Map(players.map(player => [player.id, player.real_name]))
  const stats = new Map<string, {
    games: number
    wins: number
    playerRecords: Map<string, { games: number; wins: number }>
  }>()

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

        const current = stats.get(name) ?? { games: 0, wins: 0, playerRecords: new Map<string, { games: number; wins: number }>() }
        current.games++
        if (team.won) current.wins++
        const playerId = team.ids[index]
        if (playerId) {
          const playerRecord = current.playerRecords.get(playerId) ?? { games: 0, wins: 0 }
          playerRecord.games++
          if (team.won) playerRecord.wins++
          current.playerRecords.set(playerId, playerRecord)
        }
        stats.set(name, current)
      })
    }
  }

  return [...stats.entries()].map(([name, stat]) => {
    const playerStats = [...stat.playerRecords.entries()]
      .map(([id, record]) => ({
        id,
        name: playerNames.get(id) ?? '알 수 없음',
        games: record.games,
        wins: record.wins,
        losses: record.games - record.wins,
        winRate: Math.round((record.wins / record.games) * 100),
      }))
      .sort((a, b) => b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name, 'ko'))
    const topPlayer = playerStats[0]

    return {
      name,
      games: stat.games,
      wins: stat.wins,
      losses: stat.games - stat.wins,
      winRate: Math.round((stat.wins / stat.games) * 100),
      topPlayerName: topPlayer?.name ?? '알 수 없음',
      topPlayerGames: topPlayer?.games ?? 0,
      topPlayerWins: topPlayer?.wins ?? 0,
      topPlayerLosses: topPlayer?.losses ?? 0,
      playerStats,
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
  const [season, setSeason] = useState<Season>(2)
  const [selectedChampionName, setSelectedChampionName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setErrorMessage('')

      if (IS_MOCK) {
        setRounds((IS_PORTFOLIO
          ? (season === 1 ? portfolioSeason1Rounds : portfolioSeason2Rounds)
          : sampleRounds) as Round[])
        setPlayers(IS_PORTFOLIO ? portfolioPlayers : samplePlayers)
        setLoading(false)
        return
      }

      const playerResult = await insforge.database
        .from('players')
        .select('id, real_name')

      if (cancelled) return

      if (playerResult.error) {
        setErrorMessage('챔피언 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
        setLoading(false)
        return
      }

      let nextRounds: Round[]

      if (season === 1) {
        nextRounds = season1Standings.rounds as unknown as Round[]
      } else {
        const roundResult = await insforge.database
          .from('rounds')
          .select('team1_ids, team2_ids, winner_team, team1_champions, team2_champions')

        if (cancelled) return

        if (roundResult.error) {
          setErrorMessage('챔피언 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
          setLoading(false)
          return
        }

        nextRounds = (roundResult.data ?? []) as Round[]
      }

      setRounds(nextRounds)
      setPlayers((playerResult.data ?? []) as PlayerRecord[])
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [season])

  const allStats = useMemo(() => computeChampionStats(rounds, players), [rounds, players])
  const selectedChampion = useMemo(
    () => allStats.find(stat => stat.name === selectedChampionName) ?? null,
    [allStats, selectedChampionName],
  )

  useEffect(() => {
    if (!selectedChampion) return

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedChampionName(null)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedChampion])

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
    <main id="main-content" className="app-page min-h-[100dvh] px-4 py-12 sm:px-12 sm:py-16" style={{ backgroundColor: 'var(--canvas)', color: 'var(--ink)' }}>
      <NavBar />

      {selectedChampion && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(32,32,32,0.28)] backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setSelectedChampionName(null)}
        >
          <section
            className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--canvas)] text-[var(--ink)] shadow-[0_30px_100px_rgba(32,32,32,0.22)] sm:max-w-3xl sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="champion-player-record-title"
            onClick={event => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-start justify-between gap-6 border-b border-[var(--line)] px-5 pb-6 pt-6 sm:px-9 sm:pb-8 sm:pt-9">
              <div className="min-w-0">
                <p className="mb-3 font-mono text-[0.62rem] font-semibold tracking-[0.18em] text-[var(--muted)] sm:text-xs">
                  CHAMPION / PLAYER RECORDS
                </p>
                <h2
                  id="champion-player-record-title"
                  className="truncate text-[clamp(2.25rem,9vw,4.5rem)] font-black leading-[0.9] tracking-[-0.065em]"
                >
                  {selectedChampion.name}
                </h2>
                <p className="mt-4 text-sm font-medium text-[var(--muted)]">시즌 {season} · 플레이 선수 전체 전적</p>
              </div>
              <button
                type="button"
                className="grid size-12 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-2xl leading-none text-[var(--ink)] transition-colors hover:border-[var(--ink)] hover:bg-[var(--accent)] hover:text-[#171913] sm:size-14"
                onClick={() => setSelectedChampionName(null)}
                aria-label={`${selectedChampion.name} 선수 전적 닫기`}
                autoFocus
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <dl className="grid shrink-0 grid-cols-3 border-b border-[var(--line)] bg-[var(--surface)]">
              <div className="px-4 py-5 sm:px-8 sm:py-6">
                <dt className="mb-2 font-mono text-[0.58rem] font-semibold tracking-[0.15em] text-[var(--muted)] sm:text-[0.68rem]">PLAYED</dt>
                <dd className="m-0 text-2xl font-black tabular-nums tracking-[-0.04em] sm:text-4xl">{selectedChampion.games}</dd>
              </div>
              <div className="border-l border-[var(--line)] px-4 py-5 sm:px-8 sm:py-6">
                <dt className="mb-2 font-mono text-[0.58rem] font-semibold tracking-[0.15em] text-[var(--muted)] sm:text-[0.68rem]">RECORD</dt>
                <dd className="m-0 flex items-baseline gap-2 text-2xl font-black tabular-nums tracking-[-0.04em] sm:text-4xl">
                  <span>{selectedChampion.wins}<small className="ml-0.5 text-xs text-[var(--positive)] sm:text-sm">W</small></span>
                  <span>{selectedChampion.losses}<small className="ml-0.5 text-xs text-[var(--negative)] sm:text-sm">L</small></span>
                </dd>
              </div>
              <div className="border-l border-[var(--line)] px-4 py-5 sm:px-8 sm:py-6">
                <dt className="mb-2 font-mono text-[0.58rem] font-semibold tracking-[0.15em] text-[var(--muted)] sm:text-[0.68rem]">WIN RATE</dt>
                <dd className={`m-0 text-2xl font-black tabular-nums tracking-[-0.04em] sm:text-4xl ${selectedChampion.winRate >= 50 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                  {selectedChampion.winRate}<small className="ml-0.5 text-xs sm:text-sm">%</small>
                </dd>
              </div>
            </dl>

            <div className="flex min-h-0 flex-1 flex-col px-5 pb-7 pt-6 sm:px-9 sm:pb-9">
              <div
                className="grid shrink-0 grid-cols-[minmax(6rem,1fr)_3.2rem_5rem_3.5rem] items-center gap-x-2 border-b border-[var(--line)] pb-3 font-mono text-[0.56rem] font-semibold tracking-[0.1em] text-[var(--muted)] sm:grid-cols-[3rem_minmax(8rem,1fr)_4.25rem_7rem_4rem] sm:gap-x-4 sm:text-[0.65rem]"
                aria-hidden="true"
              >
                <span className="hidden sm:block">#</span>
                <span>PLAYER</span>
                <span className="text-center">PLAYED</span>
                <span className="text-center">RECORD</span>
                <span className="text-right">RATE</span>
              </div>
              <ol className="min-h-0 overflow-y-auto [scrollbar-color:var(--surface-strong)_transparent]">
                {selectedChampion.playerStats.map((player, index) => (
                  <li
                    key={player.id}
                    className="grid min-h-16 grid-cols-[minmax(6rem,1fr)_3.2rem_5rem_3.5rem] items-center gap-x-2 border-b border-[var(--line)] text-sm tabular-nums transition-colors hover:bg-[var(--surface)] sm:min-h-20 sm:grid-cols-[3rem_minmax(8rem,1fr)_4.25rem_7rem_4rem] sm:gap-x-4"
                  >
                    <span className="hidden font-mono text-xs text-[var(--muted)] sm:block">{String(index + 1).padStart(2, '0')}</span>
                    <strong className="truncate text-base font-bold tracking-[-0.025em] sm:text-lg">{player.name}</strong>
                    <span className="text-center font-semibold text-[var(--muted)]">{player.games}</span>
                    <span className="text-center font-bold">{player.wins}승 <span className="text-[var(--muted)]">{player.losses}패</span></span>
                    <b className={`text-right font-extrabold ${player.winRate >= 50 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                      {player.winRate}%
                    </b>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      )}

      <div className="mx-auto max-w-6xl pt-16">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">챔피언 통계</h1>
          <div className="flex gap-2" aria-label="시즌 선택">
            {([2, 1] as const).map(value => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSeason(value)
                  setSelectedChampionName(null)
                }}
                className="rounded-full px-4 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: season === value ? 'var(--ink)' : 'var(--surface-strong)',
                  color: season === value ? 'var(--on-ink)' : 'var(--ink)',
                }}
              >
                시즌 {value}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-8 text-sm" style={{ opacity: 0.5 }}>
          시즌 {season} · 챔피언 정보가 저장된 경기만 집계합니다.
        </p>

        {loading && (
          <div className="space-y-3" aria-label="챔피언 통계를 불러오는 중">
            <div className="h-20 animate-pulse rounded-2xl" style={{ backgroundColor: 'var(--surface)' }} />
            <div className="h-64 animate-pulse rounded-2xl" style={{ backgroundColor: 'var(--surface)' }} />
          </div>
        )}

        {!loading && errorMessage && (
          <div className="rounded-2xl px-5 py-4 text-sm" role="alert" style={{ backgroundColor: 'var(--negative-surface)', color: 'var(--negative-on-surface)' }}>
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
            <section className="mb-8 grid grid-cols-2 overflow-hidden rounded-2xl sm:grid-cols-4" style={{ backgroundColor: 'var(--surface)' }}>
              {[
                { label: '챔피언', value: `${allStats.length}종` },
                { label: '집계된 픽 수', value: `${summary.totalPicks}회` },
                { label: '최다 픽', value: summary.mostPlayed ? `${summary.mostPlayed.name} ${summary.mostPlayed.games}회` : '-' },
                { label: '최고 승률 (3회+)', value: summary.highestRate ? `${summary.highestRate.name} ${summary.highestRate.winRate}%` : '-' },
              ].map(({ label, value }, index) => (
                <div
                  key={label}
                  className={`px-4 py-5 sm:border-t-0 sm:px-6 ${index > 0 ? 'sm:border-l' : ''} ${index % 2 === 1 ? 'border-l' : ''} ${index >= 2 ? 'border-t' : ''}`}
                  style={{ borderColor: 'var(--canvas)' }}
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
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--ink)]"
                  style={{ backgroundColor: 'var(--surface)', color: 'var(--ink)' }}
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
                        style={{ backgroundColor: minimumGames === value ? 'var(--ink)' : 'var(--surface)', color: minimumGames === value ? 'var(--on-ink)' : 'var(--ink)' }}
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
                        style={{ backgroundColor: sortBy === key ? 'var(--ink)' : 'var(--surface)', color: sortBy === key ? 'var(--on-ink)' : 'var(--ink)' }}
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
              <div className="overflow-x-auto rounded-2xl" style={{ backgroundColor: 'var(--surface)' }}>
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--canvas)' }}>
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
                      <tr key={stat.name} style={{ borderTop: '1px solid var(--canvas)' }}>
                        <td className="px-4 py-3 text-center font-medium" style={{ opacity: 0.35 }}>{index + 1}</td>
                        <td className="px-4 py-3 font-bold">
                          <button
                            type="button"
                            className="group inline-flex items-center gap-2 text-left font-bold hover:opacity-60"
                            onClick={() => setSelectedChampionName(stat.name)}
                            aria-haspopup="dialog"
                          >
                            <span className="border-b border-current">{stat.name}</span>
                            <span className="text-xs opacity-30 transition-transform group-hover:translate-x-1" aria-hidden="true">↗</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center font-bold">{stat.games}</td>
                        <td className="px-4 py-3 text-center">{stat.wins}</td>
                        <td className="px-4 py-3 text-center">{stat.losses}</td>
                        <td className="px-4 py-3 text-center font-bold" style={{ color: stat.winRate >= 50 ? 'var(--positive)' : 'var(--negative)' }}>
                          {stat.winRate}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-medium">{stat.topPlayerName}</span>
                          <span className="ml-1" style={{ opacity: 0.45 }}>
                            {stat.topPlayerGames}회 · {stat.topPlayerWins}승 {stat.topPlayerLosses}패
                          </span>
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
