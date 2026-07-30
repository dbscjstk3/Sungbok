'use client'

import { useEffect, useMemo, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'
import NavBar from '@/app/components/NavBar'
import { IS_MOCK, samplePlayers, sampleSessions, sampleRounds } from '@/lib/sampleData'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'

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
  topTeammate: { player: Player; games: number; wins: number } | null
  topChampions: { name: string; games: number; wins: number; winRate: number }[]
  profitTrend: { session: number; profit: number }[]
}

type SortKey = 'profit' | 'wins' | 'losses' | 'rate'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'profit', label: '수익' },
  { key: 'rate', label: '승률' },
  { key: 'wins', label: '승리' },
  { key: 'losses', label: '패배' },
]

function computeDuoStats(players: Player[], rounds: Round[]): DuoStat[] {
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
    .filter(([, s]) => s.games >= 50)
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

  let topTeammate: PersonalDetail['topTeammate'] = null
  const threshold = playerRounds.length >= 20 ? 20 : 3
  const allEntries = [...teammateCount.entries()]
  const qualified = (allEntries.filter(([, s]) => s.games >= threshold).length > 0
    ? allEntries.filter(([, s]) => s.games >= threshold)
    : allEntries.filter(([, s]) => s.games >= 5)
  ).sort((a, b) => (b[1].wins / b[1].games) - (a[1].wins / a[1].games) || b[1].games - a[1].games)
  if (qualified.length > 0) {
    const [tmId, tmStat] = qualified[0]
    const tmPlayer = players.find(p => p.id === tmId)
    if (tmPlayer) topTeammate = { player: tmPlayer, ...tmStat }
  }

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
    .slice(0, 5)
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
    topTeammate,
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

  const sortedStats = useMemo(() => [...stats].sort((a, b) => {
    const ra = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0
    const rb = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0
    switch (sortBy) {
      case 'profit': return b.profit - a.profit
      case 'wins': return b.wins - a.wins
      case 'losses': return b.losses - a.losses
      case 'rate': return rb - ra
    }
  }), [stats, sortBy])

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

  const duoStats = useMemo(() => computeDuoStats(allPlayers, allRounds), [allPlayers, allRounds])

  const personalDetail = useMemo(() => {
    if (!selectedPlayerId) return null
    return computePersonalDetail(selectedPlayerId, allPlayers, allRounds, stats, allSessions)
  }, [selectedPlayerId, allPlayers, allRounds, stats, allSessions])

  useEffect(() => {
    async function load() {
      if (IS_MOCK) {
        setAllPlayers(samplePlayers)
        setAllSessions(sampleSessions)
        setAllRounds(sampleRounds.map(r => ({ ...r, created_at: '' })) as Round[])
        const totals = new Map<string, { wins: number; losses: number; profit: number }>()
        for (const round of sampleRounds) {
          if (round.winner_team === null) continue
          const session = sampleSessions.find(s => s.id === round.session_id)
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
        const result: PlayerStat[] = samplePlayers
          .filter(p => totals.has(p.id))
          .map(p => { const t = totals.get(p.id)!; return { player: p, wins: t.wins, losses: t.losses, profit: t.profit } })
          .sort((a, b) => b.profit - a.profit)
        setStats(result)
        setLoading(false)
        return
      }

      const [{ data: sessions }, { data: rounds }, { data: players }] = await Promise.all([
        insforge.database.from('sessions').select('id, bet_amount, created_at').not('ended_at', 'is', null),
        insforge.database.from('rounds').select('id, session_id, team1_ids, team2_ids, winner_team, team1_champions, team2_champions, created_at'),
        insforge.database.from('players').select('id, real_name, created_at'),
      ])

      if (!sessions || !rounds || !players) { setLoading(false); return }

      setAllPlayers(players as Player[])
      setAllRounds(rounds as Round[])
      setAllSessions(sessions as Session[])

      const sessionMap = new Map((sessions as Session[]).map(s => [s.id, s]))
      const totals = new Map<string, { wins: number; losses: number; profit: number }>()

      for (const round of rounds as Round[]) {
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
  }, [])

  return (
    <main className="min-h-screen px-4 sm:px-12 py-12 sm:py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
      <NavBar />

      {/* 개인 하이라이트 모달 */}
      {personalDetail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSelectedPlayerId(null)}>
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 pb-8 overflow-y-auto max-h-[90vh]"
            style={{ backgroundColor: '#ECEEF0' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">{personalDetail.player.real_name}</h2>
              <button onClick={() => setSelectedPlayerId(null)}
                className="text-sm px-3 py-1 rounded-lg transition-opacity hover:opacity-60"
                style={{ backgroundColor: '#DEE0E2' }}>
                닫기
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: '참여', value: `${personalDetail.totalGames}판 (${personalDetail.sessionCount}세션)` },
                { label: '승률', value: `${personalDetail.winRate}% (${personalDetail.wins}승 ${personalDetail.losses}패)` },
                { label: '최다 연승', value: `${personalDetail.longestWinStreak}연승` },
                { label: '최다 연패', value: `${personalDetail.longestLossStreak}연패` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl px-4 py-3" style={{ backgroundColor: '#DEE0E2' }}>
                  <p className="text-xs mb-1" style={{ opacity: 0.5 }}>{label}</p>
                  <p className="text-sm font-bold">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: '#DEE0E2' }}>
              <p className="text-xs mb-1" style={{ opacity: 0.5 }}>누적 수익</p>
              <p className="text-lg font-bold" style={{ color: personalDetail.profit > 0 ? '#2d7a3a' : personalDetail.profit < 0 ? '#c0392b' : '#202020' }}>
                {personalDetail.profit > 0 ? '+' : ''}{personalDetail.profit.toLocaleString()}원
              </p>
            </div>

            {personalDetail.profitTrend.length > 1 && (() => {
              const trend = personalDetail.profitTrend
              const maxVal = Math.max(0, ...trend.map(d => d.profit))
              const minVal = Math.min(0, ...trend.map(d => d.profit))
              const range = maxVal - minVal
              const zeroOffset = range > 0 ? Math.round((maxVal / range) * 100) : 50
              const gradId = `pg-${selectedPlayerId}`
              return (
                <div className="rounded-xl px-4 pt-3 pb-2 mb-4" style={{ backgroundColor: '#DEE0E2' }}>
                  <p className="text-xs mb-3" style={{ opacity: 0.5 }}>수익 추이</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset={`${zeroOffset}%`} stopColor="#2d7a3a" />
                          <stop offset={`${zeroOffset}%`} stopColor="#c0392b" />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="session" tick={{ fontSize: 10, fill: '#20202066' }} tickLine={false} axisLine={false} />
                      <YAxis hide domain={[minVal, maxVal]} />
                      <Tooltip
                        formatter={(v) => [`${Number(v) > 0 ? '+' : ''}${Number(v).toLocaleString()}원`, '수익']}
                        contentStyle={{ backgroundColor: '#ECEEF0', border: 'none', borderRadius: 8, fontSize: 12 }}
                        cursor={{ stroke: '#20202033' }}
                      />
                      <ReferenceLine y={0} stroke="#20202033" strokeDasharray="3 3" />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        dot={false}
                        strokeWidth={2}
                        stroke={`url(#${gradId})`}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            })()}

            {personalDetail.topTeammate && (
              <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: '#DEE0E2' }}>
                <p className="text-xs mb-1" style={{ opacity: 0.5 }}>베스트 파트너</p>
                <p className="text-sm font-bold">
                  {personalDetail.topTeammate.player.real_name}
                  <span className="font-normal ml-2" style={{ opacity: 0.5 }}>
                    {personalDetail.topTeammate.games}판 함께 · 승률 {Math.round((personalDetail.topTeammate.wins / personalDetail.topTeammate.games) * 100)}%
                  </span>
                </p>
              </div>
            )}

            {personalDetail.topChampions.length > 0 && (
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: '#DEE0E2' }}>
                <p className="text-xs mb-2" style={{ opacity: 0.5 }}>많이 플레이한 챔피언 TOP5</p>
                <div className="flex flex-col gap-1.5">
                  {personalDetail.topChampions.map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between">
                      <span className="text-sm font-bold">{i + 1}. {c.name}</span>
                      <span className="text-xs" style={{ opacity: 0.5 }}>
                        {c.games}판 · <span style={{ color: c.winRate >= 50 ? '#2d7a3a' : '#c0392b', opacity: 1 }}>{c.winRate}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="pt-16">
        <h1 className="text-3xl font-bold mb-2">전적</h1>
        <p className="text-sm mb-6" style={{ opacity: 0.5 }}>
          {{ profit: '누적 수익', rate: '승률', wins: '승리 수', losses: '패배 수' }[sortBy]} 순으로 정렬됩니다.
        </p>

        <div className="flex gap-2 mb-8 flex-wrap">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className="px-4 py-1.5 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
              style={{
                backgroundColor: sortBy === key ? '#202020' : '#DEE0E2',
                color: sortBy === key ? '#ECEEF0' : '#202020',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm" style={{ opacity: 0.4 }}>불러오는 중...</p>}

        {!loading && stats.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-base font-medium" style={{ opacity: 0.4 }}>아직 기록이 없습니다.</p>
          </div>
        )}

        {!loading && stats.length > 0 && (
          <>
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <div className="flex-1 rounded-2xl px-7 py-6" style={{ backgroundColor: '#2d7a3a' }}>
                <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>가장 많이 빤 사람</p>
                <p className="text-2xl font-bold text-white mb-1">{stats[0].player.real_name}</p>
                <p className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  +{stats[0].profit.toLocaleString()}원
                </p>
              </div>
              {(() => {
                const worst = [...stats].sort((a, b) => a.profit - b.profit)[0]
                return (
                  <div className="flex-1 rounded-2xl px-7 py-6" style={{ backgroundColor: '#c0392b' }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>가장 많이 빨린 사람</p>
                    <p className="text-2xl font-bold text-white mb-1">{worst.player.real_name}</p>
                    <p className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                      {worst.profit.toLocaleString()}원
                    </p>
                  </div>
                )
              })()}
            </div>

            {/* 전적 테이블 */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#DEE0E2' }}>
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #ECEEF0' }}>
                    <th className="text-center px-2 sm:px-5 py-3 sm:py-4 font-semibold w-8 sm:w-12" style={{ opacity: 0.5 }}>#</th>
                    <th className="text-left px-2 sm:px-5 py-3 sm:py-4 font-semibold" style={{ opacity: 0.5 }}>이름</th>
                    {([['wins', '승'], ['losses', '패'], ['rate', '승률'], ['profit', '수익']] as [SortKey, string][]).map(([key, label]) => (
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
                    const profitColor = s.profit > 0 ? '#2d7a3a' : s.profit < 0 ? '#c0392b' : '#202020'
                    return (
                      <tr key={s.player.id} style={{ borderTop: '1px solid #ECEEF0' }}>
                        <td className="text-center px-2 sm:px-5 py-2.5 sm:py-4 font-medium" style={{ opacity: 0.35 }}>{i + 1}</td>
                        <td className="px-2 sm:px-5 py-2.5 sm:py-4 font-bold">
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
                        <td className="text-center px-2 sm:px-4 py-2.5 sm:py-4 font-bold">{s.wins}</td>
                        <td className="text-center px-2 sm:px-4 py-2.5 sm:py-4 font-bold">{s.losses}</td>
                        <td className="text-center px-2 sm:px-4 py-2.5 sm:py-4" style={{ opacity: 0.7 }}>{rate}%</td>
                        <td className="text-center px-2 sm:px-4 py-2.5 sm:py-4 font-bold" style={{ color: profitColor }}>
                          {s.profit > 0 ? '+' : ''}{s.profit.toLocaleString()}원
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
                <p className="text-sm mb-6" style={{ opacity: 0.5 }}>50판 이상 함께한 조합만 표시됩니다.</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[
                    { title: '베스트 듀오', list: duoStats.slice(0, 10) },
                    { title: '쓰레기 듀오', list: [...duoStats].reverse().slice(0, 10) },
                  ].map(({ title, list }) => (
                    <div key={title}>
                      <p className="text-sm font-semibold mb-3" style={{ opacity: 0.6 }}>{title}</p>
                      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#DEE0E2' }}>
                        <table className="w-full text-xs sm:text-sm">
                          <thead>
                            <tr style={{ borderBottom: '1px solid #ECEEF0' }}>
                              <th className="text-center px-2 sm:px-4 py-3 font-semibold w-8" style={{ opacity: 0.5 }}>#</th>
                              <th className="text-left px-2 sm:px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>조합</th>
                              <th className="text-center px-2 sm:px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>판수</th>
                              <th className="text-center px-2 sm:px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>승률</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((d, i) => (
                              <tr key={`${d.player1.id}-${d.player2.id}`} style={{ borderTop: '1px solid #ECEEF0' }}>
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
