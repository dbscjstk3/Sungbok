'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'

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

const NAV = [['/', '홈'], ['/players', '선수명단'], ['/match', '내전생성'], ['/history', '기록'], ['/standings', '전적']] as const

export default function StandingsPage() {
  const [stats, setStats] = useState<PlayerStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
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
    <main className="min-h-screen px-12 py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
      <nav className="fixed top-0 left-0 right-0 px-8 py-4 flex justify-between items-center z-10"
        style={{ backgroundColor: '#ECEEF0', borderBottom: '1px solid #DEE0E2' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ color: '#202020' }}>성복내전</a>
        <div className="flex items-center gap-6">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#202020' }}>{label}</a>
          ))}
        </div>
      </nav>

      <div className="pt-16">
        <h1 className="text-3xl font-bold mb-2">전적</h1>
        <p className="text-sm mb-10" style={{ opacity: 0.5 }}>누적 수익금 순으로 정렬됩니다.</p>

        {loading && <p className="text-sm" style={{ opacity: 0.4 }}>불러오는 중...</p>}

        {!loading && stats.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-base font-medium" style={{ opacity: 0.4 }}>아직 기록이 없습니다.</p>
          </div>
        )}

        {!loading && stats.length > 0 && (
          <>
          <div className="flex gap-4 mb-8">
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
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #ECEEF0' }}>
                  <th className="text-center px-5 py-4 font-semibold w-12" style={{ opacity: 0.5 }}>#</th>
                  <th className="text-left px-5 py-4 font-semibold" style={{ opacity: 0.5 }}>이름</th>
                  <th className="text-center px-4 py-4 font-semibold" style={{ opacity: 0.5 }}>승</th>
                  <th className="text-center px-4 py-4 font-semibold" style={{ opacity: 0.5 }}>패</th>
                  <th className="text-center px-4 py-4 font-semibold" style={{ opacity: 0.5 }}>승률</th>
                  <th className="text-center px-4 py-4 font-semibold" style={{ opacity: 0.5 }}>누적 수익</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => {
                  const total = s.wins + s.losses
                  const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0
                  const profitColor = s.profit > 0 ? '#2d7a3a' : s.profit < 0 ? '#c0392b' : '#202020'
                  return (
                    <tr key={s.player.id} style={{ borderTop: '1px solid #ECEEF0' }}>
                      <td className="text-center px-5 py-4 font-medium" style={{ opacity: 0.35 }}>{i + 1}</td>
                      <td className="px-5 py-4 font-bold">{s.player.real_name}</td>
                      <td className="text-center px-4 py-4 font-bold">{s.wins}</td>
                      <td className="text-center px-4 py-4 font-bold">{s.losses}</td>
                      <td className="text-center px-4 py-4" style={{ opacity: 0.7 }}>{rate}%</td>
                      <td className="text-center px-4 py-4 font-bold" style={{ color: profitColor }}>
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
