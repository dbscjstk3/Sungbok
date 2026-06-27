'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'
import NavBar from '@/app/components/NavBar'
import { IS_MOCK, samplePlayers, sampleSessions, sampleRounds } from '@/lib/sampleData'

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
  team1_champions: string[] | null
  team2_champions: string[] | null
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

function getPlayerChampions(playerId: string, rounds: Round[]): { champion: string; won: boolean }[] {
  const result: { champion: string; won: boolean }[] = []
  for (const r of rounds) {
    if (r.winner_team === null) continue
    const t1Idx = r.team1_ids.indexOf(playerId)
    const t2Idx = r.team2_ids.indexOf(playerId)
    if (t1Idx >= 0 && r.team1_champions?.[t1Idx]) {
      result.push({ champion: r.team1_champions[t1Idx], won: r.winner_team === 1 })
    } else if (t2Idx >= 0 && r.team2_champions?.[t2Idx]) {
      result.push({ champion: r.team2_champions[t2Idx], won: r.winner_team === 2 })
    }
  }
  return result
}

export default function HistoryPage() {
  const [details, setDetails] = useState<SessionDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [championModal, setChampionModal] = useState<{ playerName: string; champions: { champion: string; won: boolean }[] } | null>(null)

  useEffect(() => {
    async function load() {
      if (IS_MOCK) {
        const playerMap = new Map(samplePlayers.map(p => [p.id, p]))
        const result: SessionDetail[] = [...sampleSessions].reverse().map(session => {
          const sessionRounds = sampleRounds.filter(r => r.session_id === session.id)
          const allIds = new Set<string>()
          sessionRounds.forEach(r => { r.team1_ids.forEach(id => allIds.add(id)); r.team2_ids.forEach(id => allIds.add(id)) })
          const sessionPlayers = [...allIds].map(id => playerMap.get(id)).filter(Boolean) as Player[]
          return { session, rounds: sessionRounds as Round[], stats: computeStats(sessionPlayers, sessionRounds as Round[]) }
        })
        setDetails(result)
        setLoading(false)
        return
      }

      const [{ data: sessions }, { data: rounds }, { data: players }] = await Promise.all([
        insforge.database.from('sessions').select('id, created_at, ended_at, bet_amount')
          .not('ended_at', 'is', null).order('created_at', { ascending: false }),
        insforge.database.from('rounds').select('id, session_id, team1_ids, team2_ids, winner_team, team1_champions, team2_champions'),
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
    <main className="min-h-screen px-4 sm:px-12 py-12 sm:py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
      <NavBar />

      {championModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setChampionModal(null)}>
          <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 pb-8"
            style={{ backgroundColor: '#ECEEF0' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-bold">{championModal.playerName}</h2>
              <button onClick={() => setChampionModal(null)}
                className="text-sm px-3 py-1 rounded-lg transition-opacity hover:opacity-60"
                style={{ backgroundColor: '#DEE0E2' }}>
                닫기
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {championModal.champions.map((c, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                  style={{ backgroundColor: '#DEE0E2' }}>
                  <span className="text-sm font-medium">{i + 1}판 — {c.champion}</span>
                  <span className="text-xs font-bold" style={{ color: c.won ? '#2d7a3a' : '#c0392b' }}>
                    {c.won ? '승' : '패'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                  className="w-full px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between transition-opacity hover:opacity-80"
                >
                  <div className="flex items-center gap-2 sm:gap-4">
                    <span className="text-sm sm:text-base font-bold">{formatDate(session.created_at)}</span>
                    <span className="text-xs sm:text-sm" style={{ opacity: 0.5 }}>{totalRounds}판</span>
                    {showMoney && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: '#ECEEF0', color: '#202020', opacity: 0.7 }}>
                        {session.bet_amount.toLocaleString()}원
                      </span>
                    )}
                  </div>
                  <span className="text-sm" style={{ opacity: 0.35 }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* 세션 상세 */}
                {isOpen && (
                  <div className="px-3 sm:px-6 pb-5 sm:pb-6">
                    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#ECEEF0' }}>
                      <table className="w-full text-xs sm:text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid #DEE0E2' }}>
                            <th className="text-left px-3 sm:px-5 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>이름</th>
                            <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>승</th>
                            <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>패</th>
                            <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>승률</th>
                            <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>
                              손익
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
                                <td className="px-3 sm:px-5 py-2 sm:py-3">
                                  {(() => {
                                    const champs = getPlayerChampions(s.player.id, rounds)
                                    if (champs.length > 0) {
                                      return (
                                        <button onClick={() => setChampionModal({ playerName: s.player.real_name, champions: champs })}
                                          className="font-medium underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-60">
                                          {s.player.real_name}
                                        </button>
                                      )
                                    }
                                    return <span className="font-medium">{s.player.real_name}</span>
                                  })()}
                                </td>
                                <td className="text-center px-2 sm:px-4 py-2 sm:py-3 font-bold">{s.wins}</td>
                                <td className="text-center px-2 sm:px-4 py-2 sm:py-3 font-bold">{s.losses}</td>
                                <td className="text-center px-2 sm:px-4 py-2 sm:py-3" style={{ opacity: 0.7 }}>{rate}%</td>
                                <td className="text-center px-2 sm:px-4 py-2 sm:py-3 font-bold"
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
