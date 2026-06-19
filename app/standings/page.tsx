'use client'

import { useEffect, useMemo, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'
import NavBar from '@/app/components/NavBar'
import { IS_MOCK, samplePlayers, sampleSessions, sampleRounds } from '@/lib/sampleData'

interface Session {
  id: string
  bet_amount: number
}

interface Round {
  id: string
  session_id: string
  team1_ids: string[]
  team2_ids: string[]
  winner_team: 1 | 2 | null
}

interface PlayerStat {
  player: Player
  wins: number
  losses: number
  profit: number
}

type SortKey = 'profit' | 'wins' | 'losses' | 'rate'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'profit', label: '수익' },
  { key: 'rate',   label: '승률' },
  { key: 'wins',   label: '승리' },
  { key: 'losses', label: '패배' },
]

export default function StandingsPage() {
  const [stats, setStats] = useState<PlayerStat[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortKey>('profit')

  const sortedStats = useMemo(() => [...stats].sort((a, b) => {
    const ra = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0
    const rb = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0
    switch (sortBy) {
      case 'profit':  return b.profit - a.profit
      case 'wins':    return b.wins - a.wins
      case 'losses':  return b.losses - a.losses
      case 'rate':    return rb - ra
    }
  }), [stats, sortBy])

  useEffect(() => {
    async function load() {
      if (IS_MOCK) {
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
        insforge.database.from('sessions').select('id, bet_amount').not('ended_at', 'is', null),
        insforge.database.from('rounds').select('id, session_id, team1_ids, team2_ids, winner_team'),
        insforge.database.from('players').select('id, real_name, created_at'),
      ])

      if (!sessions || !rounds || !players) { setLoading(false); return }

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
        .map(p => {
          const t = totals.get(p.id)!
          return { player: p, wins: t.wins, losses: t.losses, profit: t.profit }
        })
        .sort((a, b) => b.profit - a.profit)

      setStats(result)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <main className="min-h-screen px-4 sm:px-12 py-12 sm:py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
      <NavBar />

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
            {/* 가장 많이 빤 사람 */}
            <div className="flex-1 rounded-2xl px-7 py-6" style={{ backgroundColor: '#2d7a3a' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>가장 많이 빤 사람</p>
              <p className="text-2xl font-bold text-white mb-1">{stats[0].player.real_name}</p>
              <p className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                +{stats[0].profit.toLocaleString()}원
              </p>
            </div>
            {/* 가장 많이 빨린 사람 */}
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
                      <td className="px-2 sm:px-5 py-2.5 sm:py-4 font-bold">{s.player.real_name}</td>
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
          </>
        )}
      </div>
    </main>
  )
}
