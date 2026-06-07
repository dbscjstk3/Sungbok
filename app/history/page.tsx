'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'

interface Session {
  id: string
  created_at: string
  ended_at: string | null
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
}

interface SessionDetail {
  session: Session
  rounds: Round[]
  stats: PlayerStat[]
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function computeStats(players: Player[], rounds: Round[]): PlayerStat[] {
  return players.map(p => {
    const decided = rounds.filter(r => r.winner_team !== null)
    const wins = decided.filter(r =>
      (r.team1_ids.includes(p.id) && r.winner_team === 1) ||
      (r.team2_ids.includes(p.id) && r.winner_team === 2)
    ).length
    const losses = decided.filter(r =>
      (r.team1_ids.includes(p.id) && r.winner_team === 2) ||
      (r.team2_ids.includes(p.id) && r.winner_team === 1)
    ).length
    return { player: p, wins, losses }
  }).filter(s => s.wins + s.losses > 0)
    .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses))
}

export default function HistoryPage() {
  const [details, setDetails] = useState<SessionDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      const [{ data: sessions }, { data: rounds }, { data: players }] = await Promise.all([
        insforge.database.from('sessions').select('id, created_at, ended_at, bet_amount')
          .not('ended_at', 'is', null).order('created_at', { ascending: false }),
        insforge.database.from('rounds').select('id, session_id, team1_ids, team2_ids, winner_team'),
        insforge.database.from('players').select('id, real_name, created_at'),
      ])

      if (!sessions || !rounds || !players) { setLoading(false); return }

      const playerMap = new Map((players as Player[]).map(p => [p.id, p]))

      const result: SessionDetail[] = (sessions as Session[]).map(session => {
        const sessionRounds = (rounds as Round[]).filter(r => r.session_id === session.id)
        const allIds = new Set<string>()
        sessionRounds.forEach(r => { r.team1_ids.forEach(id => allIds.add(id)); r.team2_ids.forEach(id => allIds.add(id)) })
        const sessionPlayers = [...allIds].map(id => playerMap.get(id)).filter(Boolean) as Player[]
        return { session, rounds: sessionRounds, stats: computeStats(sessionPlayers, sessionRounds) }
      })

      setDetails(result)
      setLoading(false)
    }
    load()
  }, [])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  return (
    <main className="min-h-screen px-12 py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
      <nav className="fixed top-0 left-0 right-0 px-8 py-4 flex justify-between items-center z-10"
        style={{ backgroundColor: '#ECEEF0', borderBottom: '1px solid #DEE0E2' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ color: '#202020' }}>성복내전</a>
        <div className="flex items-center gap-6">
          {[['/', '홈'], ['/players', '선수명단'], ['/match', '내전생성'], ['/history', '기록'], ['/standings', '전적']].map(([href, label]) => (
            <a key={href} href={href} className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#202020' }}>{label}</a>
          ))}
        </div>
      </nav>

      <div className="pt-16">
        <h1 className="text-3xl font-bold mb-2">내전 기록</h1>
        <p className="text-sm mb-10" style={{ opacity: 0.5 }}>완료된 내전 목록입니다.</p>

        {loading && (
          <p className="text-sm" style={{ opacity: 0.4 }}>불러오는 중...</p>
        )}

        {!loading && details.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-base font-medium mb-2" style={{ opacity: 0.4 }}>아직 기록이 없습니다.</p>
            <a href="/match" className="text-sm underline" style={{ opacity: 0.4 }}>내전 시작하기</a>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {details.map(({ session, rounds, stats }) => {
            const isOpen = expanded.has(session.id)
            const totalRounds = rounds.filter(r => r.winner_team !== null).length
            const showMoney = session.bet_amount > 0

            return (
              <div key={session.id} className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: '#DEE0E2' }}>

                {/* 세션 헤더 */}
                <button
                  onClick={() => toggleExpand(session.id)}
                  className="w-full px-6 py-5 flex items-center justify-between transition-opacity hover:opacity-80"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-base font-bold">{formatDate(session.created_at)}</span>
                    <span className="text-sm" style={{ opacity: 0.5 }}>{totalRounds}판</span>
                    {showMoney && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ backgroundColor: '#ECEEF0', color: '#202020', opacity: 0.7 }}>
                        판당 {session.bet_amount.toLocaleString()}원
                      </span>
                    )}
                  </div>
                  <span className="text-sm" style={{ opacity: 0.35 }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* 세션 상세 */}
                {isOpen && (
                  <div className="px-6 pb-6">
                    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#ECEEF0' }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid #DEE0E2' }}>
                            <th className="text-left px-5 py-3 font-semibold" style={{ opacity: 0.5 }}>이름</th>
                            <th className="text-center px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>승</th>
                            <th className="text-center px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>패</th>
                            <th className="text-center px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>승률</th>
                            <th className="text-center px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>
                              {showMoney ? '손익' : '손익(판)'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.map((s, i) => {
                            const net = s.wins - s.losses
                            const total = s.wins + s.losses
                            const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0
                            const money = net * session.bet_amount
                            return (
                              <tr key={s.player.id} style={{ borderTop: i > 0 ? '1px solid #DEE0E2' : undefined }}>
                                <td className="px-5 py-3">
                                  <span className="font-medium">{s.player.real_name}</span>
                                </td>
                                <td className="text-center px-4 py-3 font-bold">{s.wins}</td>
                                <td className="text-center px-4 py-3 font-bold">{s.losses}</td>
                                <td className="text-center px-4 py-3" style={{ opacity: 0.7 }}>{rate}%</td>
                                <td className="text-center px-4 py-3 font-bold"
                                  style={{ color: net > 0 ? '#2d7a3a' : net < 0 ? '#c0392b' : '#202020' }}>
                                  {showMoney
                                    ? `${money > 0 ? '+' : ''}${money.toLocaleString()}원`
                                    : `${net > 0 ? '+' : ''}${net}판`}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
