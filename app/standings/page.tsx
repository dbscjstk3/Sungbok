'use client'

import { useEffect, useMemo, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'
import NavBar from '@/app/components/NavBar'
import {
  IS_MOCK,
  portfolioMetadata,
  portfolioPlayers,
  portfolioSeason1Rounds,
  portfolioSeason1Sessions,
  portfolioSeason2Rounds,
  portfolioSeason2Sessions,
  samplePlayers,
  sampleSessions,
  sampleRounds,
} from '@/lib/sampleData'
import { IS_PORTFOLIO } from '@/lib/appMode'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import season1Standings from '@/data/season1-standings.json'

interface Session {
  id: string
  bet_amount: number
  created_at: string
}

interface Round {
  id: string
  session_id: string
  team1_ids: string[]
  team2_ids: string[]
  winner_team: 1 | 2 | null
  team1_champions: string[] | null
  team2_champions: string[] | null
  created_at: string
}

interface PlayerStat {
  player: Player
  wins: number
  losses: number
  profit: number
}

interface GivingPickStat {
  wellPicks: number
  recordedPicks: number
}

interface DuoStat {
  player1: Player
  player2: Player
  games: number
  wins: number
  winRate: number
}

interface PersonalDetail {
  player: Player
  totalGames: number
  wins: number
  losses: number
  winRate: number
  profit: number
  longestWinStreak: number
  longestLossStreak: number
  sessionCount: number
  teammates: { player: Player; games: number; wins: number; winRate: number }[]
  topChampions: { name: string; games: number; wins: number; winRate: number }[]
  profitTrend: { session: number; profit: number }[]
}

type SortKey = 'profit' | 'wins' | 'losses' | 'rate' | 'tank'
type Season = 1 | 2

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'profit', label: IS_PORTFOLIO ? '점수' : '수익' },
  { key: 'rate', label: '승률' },
  { key: 'tank', label: '대줌 정도' },
  { key: 'wins', label: '승리' },
  { key: 'losses', label: '패배' },
]

const WELL_GIVING_CHAMPIONS = new Set([
  '갈리오', '노틸러스', '누누와 윌럼프', '람머스', '레오나', '렐', '마오카이', '말파이트',
  '문도 박사', '브라움', '블리츠크랭크', '뽀삐', '사이온', '세주아니', '쉔', '스카너',
  '신지드', '아무무', '알리스타', '오른', '자크', '초가스', '크산테', '탐 켄치', '나미',
  '라칸', '레나타 글라스크', '룰루', '밀리오', '모르가나', '바드', '세라핀', '소나',
  '소라카', '쓰레쉬', '아이번', '유미', '잔나', '질리언', '타릭', '레넥톤', '렉사이',
  '세트', '일라오이', '요릭', '그라가스', '나서스', '모데카이저', '볼리베어', '브라이어',
  '쉬바나', '신 짜오', '아트록스', '오공', '올라프', '우르곳', '워윅', '자헨', '잭스',
  '카밀', '클레드', '트런들', '판테온', '나르'
])

function computeGivingPickStats(rounds: Round[]): Map<string, GivingPickStat> {
  const result = new Map<string, GivingPickStat>()

  for (const round of rounds) {
    if (round.winner_team === null) continue

    for (const team of [
      { ids: round.team1_ids, champions: round.team1_champions },
      { ids: round.team2_ids, champions: round.team2_champions },
    ]) {
      team.champions?.forEach((champion, index) => {
        const playerId = team.ids[index]
        const championName = champion.trim()
        if (!playerId || !championName) return

        const current = result.get(playerId) ?? { wellPicks: 0, recordedPicks: 0 }
        current.recordedPicks++
        if (WELL_GIVING_CHAMPIONS.has(championName)) current.wellPicks++
        result.set(playerId, current)
      })
    }
  }

  return result
}

function getGivingRate(stat: GivingPickStat | undefined): number | null {
  if (!stat || stat.recordedPicks === 0) return null
  return stat.wellPicks / stat.recordedPicks
}

function computeDuoStats(players: Player[], rounds: Round[], minGames: number): DuoStat[] {
  const duoMap = new Map<string, { games: number; wins: number }>()

  for (const r of rounds) {
    if (r.winner_team === null) continue
    for (const team of [{ ids: r.team1_ids, won: r.winner_team === 1 }, { ids: r.team2_ids, won: r.winner_team === 2 }]) {
      for (let i = 0; i < team.ids.length; i++) {
        for (let j = i + 1; j < team.ids.length; j++) {
          const key = [team.ids[i], team.ids[j]].sort().join(':')
          const prev = duoMap.get(key) ?? { games: 0, wins: 0 }
          prev.games++
          if (team.won) prev.wins++
          duoMap.set(key, prev)
        }
      }
    }
  }

  const playerMap = new Map(players.map(p => [p.id, p]))
  return [...duoMap.entries()]
    .filter(([, s]) => s.games >= minGames)
    .map(([key, s]) => {
      const [id1, id2] = key.split(':')
      return { player1: playerMap.get(id1)!, player2: playerMap.get(id2)!, games: s.games, wins: s.wins, winRate: Math.round((s.wins / s.games) * 100) }
    })
    .filter(d => d.player1 && d.player2)
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games)
}

function computePersonalDetail(playerId: string, players: Player[], rounds: Round[], stats: PlayerStat[], sessions: Session[]): PersonalDetail | null {
  const player = players.find(p => p.id === playerId)
  if (!player) return null

  const stat = stats.find(s => s.player.id === playerId)
  const playerRounds = rounds
    .filter(r => r.winner_team !== null && (r.team1_ids.includes(playerId) || r.team2_ids.includes(playerId)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0

  for (const r of playerRounds) {
    const won = (r.team1_ids.includes(playerId) && r.winner_team === 1) || (r.team2_ids.includes(playerId) && r.winner_team === 2)
    if (won) { curWin++; curLoss = 0; maxWin = Math.max(maxWin, curWin) }
    else { curLoss++; curWin = 0; maxLoss = Math.max(maxLoss, curLoss) }
  }

  const teammateCount = new Map<string, { games: number; wins: number }>()
  for (const r of playerRounds) {
    const myTeam = r.team1_ids.includes(playerId) ? r.team1_ids : r.team2_ids
    const won = (r.team1_ids.includes(playerId) && r.winner_team === 1) || (r.team2_ids.includes(playerId) && r.winner_team === 2)
    for (const tid of myTeam) {
      if (tid === playerId) continue
      const prev = teammateCount.get(tid) ?? { games: 0, wins: 0 }
      prev.games++
      if (won) prev.wins++
      teammateCount.set(tid, prev)
    }
  }

  const teammates = [...teammateCount.entries()]
    .map(([teammateId, teammateStat]) => {
      const teammate = players.find(player => player.id === teammateId)
      if (!teammate) return null
      return {
        player: teammate,
        ...teammateStat,
        winRate: Math.round((teammateStat.wins / teammateStat.games) * 100),
      }
    })
    .filter((teammate): teammate is NonNullable<typeof teammate> => teammate !== null)
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate || a.player.real_name.localeCompare(b.player.real_name, 'ko'))

  const champMap = new Map<string, { games: number; wins: number }>()
  for (const r of playerRounds) {
    const t1Idx = r.team1_ids.indexOf(playerId)
    const t2Idx = r.team2_ids.indexOf(playerId)
    let champ = ''
    let won = false
    if (t1Idx >= 0 && r.team1_champions?.[t1Idx]) {
      champ = r.team1_champions[t1Idx]
      won = r.winner_team === 1
    } else if (t2Idx >= 0 && r.team2_champions?.[t2Idx]) {
      champ = r.team2_champions[t2Idx]
      won = r.winner_team === 2
    }
    if (champ) {
      const prev = champMap.get(champ) ?? { games: 0, wins: 0 }
      prev.games++
      if (won) prev.wins++
      champMap.set(champ, prev)
    }
  }
  const topChampions = [...champMap.entries()]
    .sort((a, b) => b[1].games - a[1].games || (b[1].wins / b[1].games) - (a[1].wins / a[1].games))
    .map(([name, s]) => ({ name, games: s.games, wins: s.wins, winRate: Math.round((s.wins / s.games) * 100) }))

  const sessionBetMap = new Map(sessions.map(s => [s.id, s.bet_amount]))
  const sortedSessions = [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at))
  let cumProfit = 0
  const profitTrend = sortedSessions.flatMap((s, i) => {
    const sRounds = playerRounds.filter(r => r.session_id === s.id)
    if (sRounds.length === 0) return []
    const bet = sessionBetMap.get(s.id) ?? 0
    for (const r of sRounds) {
      const won = (r.team1_ids.includes(playerId) && r.winner_team === 1) || (r.team2_ids.includes(playerId) && r.winner_team === 2)
      cumProfit += won ? bet : -bet
    }
    return [{ session: i + 1, profit: cumProfit }]
  })

  return {
    player,
    totalGames: playerRounds.length,
    wins: stat?.wins ?? 0,
    losses: stat?.losses ?? 0,
    winRate: playerRounds.length > 0 ? Math.round(((stat?.wins ?? 0) / playerRounds.length) * 100) : 0,
    profit: stat?.profit ?? 0,
    longestWinStreak: maxWin,
    longestLossStreak: maxLoss,
    sessionCount: new Set(playerRounds.map(r => r.session_id)).size,
    teammates,
    topChampions,
    profitTrend,
  }
}

export default function StandingsPage() {
  const [stats, setStats] = useState<PlayerStat[]>([])
  const [allRounds, setAllRounds] = useState<Round[]>([])
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortKey>('profit')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [season, setSeason] = useState<Season>(2)

  const givingPickStats = useMemo(() => computeGivingPickStats(allRounds), [allRounds])

  const sortedStats = useMemo(() => [...stats].sort((a, b) => {
    const ra = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0
    const rb = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0
    switch (sortBy) {
      case 'profit': return b.profit - a.profit
      case 'wins': return b.wins - a.wins
      case 'losses': return b.losses - a.losses
      case 'rate': return rb - ra
      case 'tank': {
        const aGivingRate = getGivingRate(givingPickStats.get(a.player.id)) ?? -1
        const bGivingRate = getGivingRate(givingPickStats.get(b.player.id)) ?? -1
        return bGivingRate - aGivingRate
      }
    }
  }), [stats, sortBy, givingPickStats])

  const recentForm = useMemo(() => {
    const map = new Map<string, boolean[]>()
    const sorted = [...allRounds].filter(r => r.winner_team !== null).sort((a, b) => a.created_at.localeCompare(b.created_at))
    for (const r of sorted) {
      const allIds = [...r.team1_ids, ...r.team2_ids]
      for (const id of allIds) {
        const won = (r.team1_ids.includes(id) && r.winner_team === 1) || (r.team2_ids.includes(id) && r.winner_team === 2)
        const arr = map.get(id) ?? []
        arr.push(won)
        map.set(id, arr)
      }
    }
    const result = new Map<string, boolean[]>()
    for (const [id, arr] of map) {
      result.set(id, arr.slice(-5))
    }
    return result
  }, [allRounds])

  const duoMinGames = season === 2 ? 10 : 50
  const duoStats = useMemo(
    () => computeDuoStats(allPlayers, allRounds, duoMinGames),
    [allPlayers, allRounds, duoMinGames]
  )

  const personalDetail = useMemo(() => {
    if (!selectedPlayerId) return null
    return computePersonalDetail(selectedPlayerId, allPlayers, allRounds, stats, allSessions)
  }, [selectedPlayerId, allPlayers, allRounds, stats, allSessions])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setSelectedPlayerId(null)

      if (IS_MOCK) {
        const mockPlayers = IS_PORTFOLIO ? portfolioPlayers : samplePlayers
        const mockSessions = IS_PORTFOLIO
          ? (season === 1 ? portfolioSeason1Sessions : portfolioSeason2Sessions)
          : sampleSessions
        const mockRounds = IS_PORTFOLIO
          ? (season === 1 ? portfolioSeason1Rounds : portfolioSeason2Rounds)
          : sampleRounds
        setAllPlayers(mockPlayers)
        setAllSessions(mockSessions)
        setAllRounds(mockRounds.map(r => ({
          ...r,
          created_at: 'created_at' in r ? r.created_at ?? '' : '',
        })) as unknown as Round[])
        const totals = new Map<string, { wins: number; losses: number; profit: number }>()
        for (const round of mockRounds) {
          if (round.winner_team === null) continue
          const session = mockSessions.find(s => s.id === round.session_id)
          const bet = session?.bet_amount ?? 0
          const winners = round.winner_team === 1 ? round.team1_ids : round.team2_ids
          const losers = round.winner_team === 1 ? round.team2_ids : round.team1_ids
          for (const id of winners) {
            const prev = totals.get(id) ?? { wins: 0, losses: 0, profit: 0 }
            totals.set(id, { ...prev, wins: prev.wins + 1, profit: prev.profit + bet })
          }
          for (const id of losers) {
            const prev = totals.get(id) ?? { wins: 0, losses: 0, profit: 0 }
            totals.set(id, { ...prev, losses: prev.losses + 1, profit: prev.profit - bet })
          }
        }
        const result: PlayerStat[] = mockPlayers
          .filter(p => totals.has(p.id))
          .map(p => { const t = totals.get(p.id)!; return { player: p, wins: t.wins, losses: t.losses, profit: t.profit } })
          .sort((a, b) => b.profit - a.profit)
        setStats(result)
        setLoading(false)
        return
      }

      const { data: players } = await insforge.database.from('players').select('id, real_name, created_at')
      if (!players) { setLoading(false); return }

      let sessions: Session[]
      let rounds: Round[]

      if (season === 1) {
        sessions = season1Standings.sessions as Session[]
        rounds = season1Standings.rounds as unknown as Round[]
      } else {
        const [{ data: currentSessions }, { data: currentRounds }] = await Promise.all([
          insforge.database.from('sessions').select('id, bet_amount, created_at').not('ended_at', 'is', null),
          insforge.database.from('rounds').select('id, session_id, team1_ids, team2_ids, winner_team, team1_champions, team2_champions, created_at'),
        ])
        if (!currentSessions || !currentRounds) { setLoading(false); return }
        sessions = currentSessions as Session[]
        rounds = currentRounds as Round[]
      }

      setAllPlayers(players as Player[])
      setAllRounds(rounds)
      setAllSessions(sessions)

      const sessionMap = new Map(sessions.map(s => [s.id, s]))
      const totals = new Map<string, { wins: number; losses: number; profit: number }>()

      for (const round of rounds) {
        if (round.winner_team === null) continue
        const session = sessionMap.get(round.session_id)
        const bet = session?.bet_amount ?? 0
        const winners = round.winner_team === 1 ? round.team1_ids : round.team2_ids
        const losers = round.winner_team === 1 ? round.team2_ids : round.team1_ids
        for (const id of winners) {
          const prev = totals.get(id) ?? { wins: 0, losses: 0, profit: 0 }
          totals.set(id, { ...prev, wins: prev.wins + 1, profit: prev.profit + bet })
        }
        for (const id of losers) {
          const prev = totals.get(id) ?? { wins: 0, losses: 0, profit: 0 }
          totals.set(id, { ...prev, losses: prev.losses + 1, profit: prev.profit - bet })
        }
      }

      const result: PlayerStat[] = (players as Player[])
        .filter(p => totals.has(p.id))
        .map(p => { const t = totals.get(p.id)!; return { player: p, wins: t.wins, losses: t.losses, profit: t.profit } })
        .sort((a, b) => b.profit - a.profit)

      setStats(result)
      setLoading(false)
    }
    load()
  }, [season])

  return (
    <main id="main-content" className="app-page min-h-screen px-4 sm:px-12 py-12 sm:py-16" style={{ backgroundColor: '#FFFFFF', color: '#202020' }}>
      <NavBar />

      {/* 개인 하이라이트 모달 */}
      {personalDetail && (
        <div
          className="standings-player-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          onClick={() => setSelectedPlayerId(null)}
        >
          <section
            className="standings-player-modal w-full sm:max-w-3xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="standings-player-title"
            onClick={event => event.stopPropagation()}
            onKeyDown={event => {
              if (event.key === 'Escape') setSelectedPlayerId(null)
            }}
          >
            <div className="standings-player-scroll">
              <header className="standings-player-header">
                <div>
                  <p className="standings-player-kicker">PLAYER RECORD</p>
                  <h2 id="standings-player-title" className="standings-player-name">{personalDetail.player.real_name}</h2>
                  <p className="standings-player-subtitle">시즌 {season} 개인 전적</p>
                </div>
                <button
                  type="button"
                  className="standings-player-close"
                  onClick={() => setSelectedPlayerId(null)}
                  aria-label="선수 상세 닫기"
                  autoFocus
                >
                  <span aria-hidden="true">×</span>
                </button>
              </header>

              <dl className="standings-player-streaks">
                <div>
                  <dt>최다 연승</dt>
                  <dd>{personalDetail.longestWinStreak}<small>연승</small></dd>
                </div>
                <div>
                  <dt>최다 연패</dt>
                  <dd>{personalDetail.longestLossStreak}<small>연패</small></dd>
                </div>
              </dl>

              {personalDetail.profitTrend.length > 1 && (() => {
                const trend = personalDetail.profitTrend
                const maxVal = Math.max(0, ...trend.map(d => d.profit))
                const minVal = Math.min(0, ...trend.map(d => d.profit))
                const range = maxVal - minVal
                const zeroOffset = range > 0 ? Math.round((maxVal / range) * 100) : 50
                const gradId = `pg-${selectedPlayerId}`
                return (
                  <section className="standings-player-trend" aria-labelledby="profit-trend-title">
                    <div className="standings-player-section-heading">
                      <h3 id="profit-trend-title">{IS_PORTFOLIO ? '점수 추이' : '수익 추이'}</h3>
                      <span>{trend.length}개 세션</span>
                    </div>
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={trend} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset={`${zeroOffset}%`} stopColor="#2f6b48" />
                            <stop offset={`${zeroOffset}%`} stopColor="#a44335" />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="session" tick={{ fontSize: 10, fill: '#68695f' }} tickLine={false} axisLine={false} />
                        <YAxis hide domain={[minVal, maxVal]} />
                        <Tooltip
                          formatter={(value) => [`${Number(value) > 0 ? '+' : ''}${Number(value).toLocaleString()}${IS_PORTFOLIO ? 'P' : '원'}`, IS_PORTFOLIO ? '점수' : '수익']}
                          contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(23,25,19,.14)', borderRadius: 5, fontSize: 12 }}
                          cursor={{ stroke: '#17191333' }}
                        />
                        <ReferenceLine y={0} stroke="#17191333" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="profit" dot={false} strokeWidth={2.5} stroke={`url(#${gradId})`} />
                      </LineChart>
                    </ResponsiveContainer>
                  </section>
                )
              })()}

              <div className="standings-player-lists">
                {personalDetail.teammates.length > 0 && (
                  <section className="standings-player-list-section" aria-labelledby="teammate-list-title">
                    <div className="standings-player-section-heading">
                      <h3 id="teammate-list-title">함께한 선수</h3>
                      <span>{personalDetail.teammates.length}명</span>
                    </div>
                    <ol className="standings-player-list">
                      {personalDetail.teammates.map((teammate, index) => (
                        <li key={teammate.player.id}>
                          <span className="standings-player-rank">{String(index + 1).padStart(2, '0')}</span>
                          <strong>{teammate.player.real_name}</strong>
                          <span className="standings-player-list-meta">
                            <span>{teammate.games}판</span>
                            <b className={teammate.winRate >= 50 ? 'is-positive' : 'is-negative'}>{teammate.winRate}%</b>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                {personalDetail.topChampions.length > 0 && (
                  <section className="standings-player-list-section" aria-labelledby="champion-list-title">
                    <div className="standings-player-section-heading">
                      <h3 id="champion-list-title">플레이한 챔피언</h3>
                      <span>{personalDetail.topChampions.length}종</span>
                    </div>
                    <ol className="standings-player-list">
                      {personalDetail.topChampions.map((champion, index) => (
                        <li key={champion.name}>
                          <span className="standings-player-rank">{String(index + 1).padStart(2, '0')}</span>
                          <strong>{champion.name}</strong>
                          <span className="standings-player-list-meta">
                            <span>{champion.games}판</span>
                            <b className={champion.winRate >= 50 ? 'is-positive' : 'is-negative'}>{champion.winRate}%</b>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      <div className="pt-16">
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold">전적</h1>
          <div className="flex gap-2" aria-label="시즌 선택">
            {([2, 1] as const).map(value => (
              <button
                key={value}
                onClick={() => setSeason(value)}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: season === value ? '#202020' : '#F0F1F2',
                  color: season === value ? '#FFFFFF' : '#202020',
                }}
              >
                시즌 {value}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm mb-6" style={{ opacity: 0.5 }}>
          {IS_PORTFOLIO && `실제 운영 기록 ${portfolioMetadata.session_count}개 세션 · ${portfolioMetadata.round_count}라운드 · `}
          시즌 {season} · {{ profit: IS_PORTFOLIO ? '누적 점수' : '누적 수익', rate: '승률', tank: '대줌 정도', wins: '승리 수', losses: '패배 수' }[sortBy]} 순으로 정렬됩니다.
        </p>

        <div className="flex gap-2 mb-8 flex-wrap">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className="px-4 py-1.5 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
              style={{
                backgroundColor: sortBy === key ? '#202020' : '#F0F1F2',
                color: sortBy === key ? '#FFFFFF' : '#202020',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm" style={{ opacity: 0.4 }}>불러오는 중...</p>}

        {!loading && stats.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-base font-medium" style={{ opacity: 0.4 }}>시즌 {season} 기록이 없습니다.</p>
          </div>
        )}

        {!loading && stats.length > 0 && (
          <>
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <div className="flex-1 rounded-2xl px-7 py-6" style={{ backgroundColor: '#2d7a3a' }}>
                <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{IS_PORTFOLIO ? '최고 누적 점수' : '가장 많이 빤 사람'}</p>
                <p className="text-2xl font-bold text-white mb-1">{stats[0].player.real_name}</p>
                <p className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  +{stats[0].profit.toLocaleString()}{IS_PORTFOLIO ? 'P' : '원'}
                </p>
              </div>
              {(() => {
                const worst = [...stats].sort((a, b) => a.profit - b.profit)[0]
                return (
                  <div className="flex-1 rounded-2xl px-7 py-6" style={{ backgroundColor: '#c0392b' }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{IS_PORTFOLIO ? '최저 누적 점수' : '가장 많이 빨린 사람'}</p>
                    <p className="text-2xl font-bold text-white mb-1">{worst.player.real_name}</p>
                    <p className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                      {worst.profit.toLocaleString()}{IS_PORTFOLIO ? 'P' : '원'}
                    </p>
                  </div>
                )
              })()}
            </div>

            {/* 전적 테이블 */}
            <div className="rounded-2xl overflow-x-auto" style={{ backgroundColor: '#F0F1F2' }}>
              <table className="w-full min-w-[620px] text-xs sm:text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #FFFFFF' }}>
                    <th className="text-center px-2 sm:px-5 py-3 sm:py-4 font-semibold w-8 sm:w-12" style={{ opacity: 0.5 }}>#</th>
                    <th className="w-px whitespace-nowrap text-left px-2 sm:px-5 py-3 sm:py-4 font-semibold" style={{ opacity: 0.5 }}>이름</th>
                    {([["total", "전적"], ['wins', '승'], ['losses', '패'], ['rate', '승률'], ['tank', '대줌 정도'], ['profit', IS_PORTFOLIO ? '점수' : '수익']] as [SortKey, string][]).map(([key, label]) => (
                      <th key={key}
                        onClick={() => setSortBy(key)}
                        className="text-center px-2 sm:px-4 py-3 sm:py-4 font-semibold cursor-pointer select-none transition-opacity hover:opacity-100"
                        style={{ opacity: sortBy === key ? 1 : 0.5 }}
                      >
                        {label}{sortBy === key && ' ↓'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((s, i) => {
                    const total = s.wins + s.losses
                    const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0
                    const givingRate = getGivingRate(givingPickStats.get(s.player.id))
                    const profitColor = s.profit > 0 ? '#2d7a3a' : s.profit < 0 ? '#c0392b' : '#202020'
                    return (
                      <tr key={s.player.id} style={{ borderTop: '1px solid #FFFFFF' }}>
                        <td className="text-center px-2 sm:px-5 py-2.5 sm:py-4 font-medium" style={{ opacity: 0.35 }}>{i + 1}</td>
                        <td className="w-px whitespace-nowrap px-2 sm:px-5 py-2.5 sm:py-4 font-bold">
                          <button onClick={() => setSelectedPlayerId(s.player.id)}
                            className="underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-60">
                            {s.player.real_name}
                          </button>
                          {recentForm.has(s.player.id) && (
                            <span className="ml-2 inline-flex gap-0.5 align-middle">
                              {recentForm.get(s.player.id)!.map((won, j) => (
                                <span key={j} className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: won ? '#2d7a3a' : '#c0392b' }} />
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="text-center px-2 sm:px-4 py2.5 sm:py-4 font-bold">{total}</td>
                        <td className="text-center px-2 sm:px-4 py-2.5 sm:py-4 font-bold">{s.wins}</td>
                        <td className="text-center px-2 sm:px-4 py-2.5 sm:py-4 font-bold">{s.losses}</td>
                        <td className="text-center px-2 sm:px-4 py-2.5 sm:py-4" style={{ opacity: 0.7 }}>{rate}%</td>
                        <td
                          className="text-center px-2 sm:px-4 py-2.5 sm:py-4 font-bold whitespace-nowrap"
                        >
                          {givingRate === null ? '-' : `${Math.round(givingRate * 100)}%`}
                        </td>
                        <td className="text-center px-2 sm:px-4 py-2.5 sm:py-4 font-bold" style={{ color: profitColor }}>
                          {s.profit > 0 ? '+' : ''}{s.profit.toLocaleString()}{IS_PORTFOLIO ? 'P' : '원'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* 듀오 승률 랭킹 */}
            {duoStats.length > 0 && (
              <div className="mt-12">
                <h2 className="text-lg font-bold mb-2">듀오 승률 랭킹</h2>
                <p className="text-sm mb-6" style={{ opacity: 0.5 }}>{duoMinGames}판 이상 함께한 조합만 표시됩니다.</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[
                    { title: '베스트 듀오', list: duoStats.slice(0, 10) },
                    { title: '쓰레기 듀오', list: [...duoStats].reverse().slice(0, 10) },
                  ].map(({ title, list }) => (
                    <div key={title}>
                      <p className="text-sm font-semibold mb-3" style={{ opacity: 0.6 }}>{title}</p>
                      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#F0F1F2' }}>
                        <table className="w-full text-xs sm:text-sm">
                          <thead>
                            <tr style={{ borderBottom: '1px solid #FFFFFF' }}>
                              <th className="text-center px-2 sm:px-4 py-3 font-semibold w-8" style={{ opacity: 0.5 }}>#</th>
                              <th className="text-left px-2 sm:px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>조합</th>
                              <th className="text-center px-2 sm:px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>판수</th>
                              <th className="text-center px-2 sm:px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>승률</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((d, i) => (
                              <tr key={`${d.player1.id}-${d.player2.id}`} style={{ borderTop: '1px solid #FFFFFF' }}>
                                <td className="text-center px-2 sm:px-4 py-2.5 font-medium" style={{ opacity: 0.35 }}>{i + 1}</td>
                                <td className="px-2 sm:px-4 py-2.5 font-bold">
                                  {d.player1.real_name} + {d.player2.real_name}
                                </td>
                                <td className="text-center px-2 sm:px-4 py-2.5">{d.games}</td>
                                <td className="text-center px-2 sm:px-4 py-2.5 font-bold"
                                  style={{ color: d.winRate >= 60 ? '#2d7a3a' : d.winRate <= 40 ? '#c0392b' : '#202020' }}>
                                  {d.winRate}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
