'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'

interface Round {
  id: string
  session_id: string
  team1_ids: string[]
  team2_ids: string[]
  winner_team: 1 | 2 | null
}

interface Stat {
  player: Player
  wins: number
  losses: number
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function computeStats(players: Player[], rounds: Round[]): Stat[] {
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
  }).sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses))
}

type Phase = 'select' | 'playing' | 'ended'

export default function MatchPage() {
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [phase, setPhase] = useState<Phase>('select')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionPlayers, setSessionPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [team1, setTeam1] = useState<Player[]>([])
  const [team2, setTeam2] = useState<Player[]>([])
  const [stats, setStats] = useState<Stat[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    insforge.database
      .from('players')
      .select('id, real_name, summoner_name, created_at')
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setAllPlayers(data as Player[]) })
  }, [])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else if (next.size < 10) { next.add(id) }
      return next
    })
  }

  function assignTeams(pool: Player[]) {
    const s = shuffle(pool)
    setTeam1(s.slice(0, 5))
    setTeam2(s.slice(5, 10))
  }

  async function startSession() {
    if (selected.size !== 10) return
    const pool = allPlayers.filter(p => selected.has(p.id))

    const { data } = await insforge.database.from('sessions').insert([{}]).select()
    if (!data?.[0]) return

    const sid = (data[0] as { id: string }).id
    setSessionId(sid)
    setSessionPlayers(pool)
    setRounds([])
    setStats(pool.map(p => ({ player: p, wins: 0, losses: 0 })))
    assignTeams(pool)
    setPhase('playing')
  }

  async function recordWin(winner: 1 | 2) {
    if (!sessionId || saving) return
    setSaving(true)

    const { data } = await insforge.database.from('rounds').insert([{
      session_id: sessionId,
      team1_ids: team1.map(p => p.id),
      team2_ids: team2.map(p => p.id),
      winner_team: winner,
    }]).select()

    setSaving(false)
    if (!data?.[0]) return

    const newRounds = [...rounds, data[0] as Round]
    setRounds(newRounds)
    setStats(computeStats(sessionPlayers, newRounds))
    assignTeams(sessionPlayers)
  }

  async function endSession() {
    if (!sessionId) return
    await insforge.database.from('sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
    setStats(computeStats(sessionPlayers, rounds))
    setPhase('ended')
  }

  function reset() {
    setPhase('select')
    setSessionId(null)
    setSelected(new Set())
    setSessionPlayers([])
    setRounds([])
    setStats([])
  }

  const roundCount = rounds.length

  return (
    <main className="min-h-screen px-12 py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 px-8 py-4 flex justify-between items-center z-10" style={{ backgroundColor: '#ECEEF0', borderBottom: '1px solid #DEE0E2' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ color: '#202020' }}>성복내전</a>
        <div className="flex items-center gap-6">
          {(['/', '/players', '/match', '/roulette'] as const).map((href, i) => (
            <a key={href} href={href} className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#202020' }}>
              {['홈', '참가자 명단', '내전 기록', '룰렛'][i]}
            </a>
          ))}
        </div>
      </nav>

      <div className="pt-16">

        {/* ── 선택 화면 ── */}
        {phase === 'select' && (
          <div>
            <h1 className="text-3xl font-bold mb-2">내전 시작</h1>
            <p className="text-sm mb-8" style={{ opacity: 0.5 }}>오늘 내전에 참가할 10명을 선택하세요.</p>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium" style={{ opacity: 0.6 }}>{selected.size}/10명 선택됨</span>
              <button
                onClick={() => setSelected(new Set(allPlayers.slice(0, 10).map(p => p.id)))}
                className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ backgroundColor: '#DEE0E2', color: '#202020' }}
              >
                상위 10명 선택
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
              {allPlayers.map(p => {
                const on = selected.has(p.id)
                const off = !on && selected.size >= 10
                return (
                  <button key={p.id} onClick={() => toggleSelect(p.id)} disabled={off}
                    className="px-4 py-3 rounded-xl text-left transition-all"
                    style={{ backgroundColor: on ? '#202020' : '#DEE0E2', color: on ? '#ECEEF0' : '#202020', opacity: off ? 0.3 : 1 }}>
                    <div className="text-sm font-medium">{p.real_name}</div>
                    <div className="text-xs mt-0.5" style={{ opacity: 0.6 }}>{p.summoner_name}</div>
                  </button>
                )
              })}
            </div>

            <button onClick={startSession} disabled={selected.size !== 10}
              className="px-10 py-4 rounded-full text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
              style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
              내전 시작
            </button>
          </div>
        )}

        {/* ── 진행 중 ── */}
        {phase === 'playing' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold">{roundCount + 1}판</h1>
                <p className="text-sm mt-1" style={{ opacity: 0.5 }}>총 {roundCount}판 완료</p>
              </div>
              <button onClick={endSession}
                className="px-5 py-2 text-sm font-medium rounded-full transition-opacity hover:opacity-70"
                style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
                내전 종료
              </button>
            </div>

            {/* 팀 배치 */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {[{ team: team1, num: 1 }, { team: team2, num: 2 }].map(({ team, num }) => (
                <div key={num} className="rounded-2xl p-6" style={{ backgroundColor: num === 1 ? '#202020' : '#DEE0E2' }}>
                  <h2 className="text-base font-bold mb-4" style={{ color: num === 1 ? '#ECEEF0' : '#202020' }}>{num}팀</h2>
                  <ul className="flex flex-col gap-2">
                    {team.map(p => (
                      <li key={p.id} className="flex justify-between items-center">
                        <span className="text-sm font-medium" style={{ color: num === 1 ? '#ECEEF0' : '#202020' }}>{p.real_name}</span>
                        <span className="text-xs" style={{ color: num === 1 ? '#ECEEF0' : '#202020', opacity: 0.5 }}>{p.summoner_name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* 결과 버튼 */}
            <div className="flex gap-4 mb-12">
              <button onClick={() => recordWin(1)} disabled={saving}
                className="flex-1 py-4 rounded-2xl text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-40"
                style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
                1팀 승리
              </button>
              <button onClick={() => recordWin(2)} disabled={saving}
                className="flex-1 py-4 rounded-2xl text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-40"
                style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
                2팀 승리
              </button>
            </div>

            {/* 현재 전적 */}
            {roundCount > 0 && <Standings stats={stats} roundCount={roundCount} />}
          </div>
        )}

        {/* ── 종료 ── */}
        {phase === 'ended' && (
          <div>
            <h1 className="text-3xl font-bold mb-2">내전 종료</h1>
            <p className="text-sm mb-8" style={{ opacity: 0.5 }}>총 {roundCount}판 진행</p>
            <Standings stats={stats} roundCount={roundCount} showSettlement />
            <button onClick={reset}
              className="mt-8 px-8 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
              새 내전 시작
            </button>
          </div>
        )}

      </div>
    </main>
  )
}

function Standings({ stats, roundCount, showSettlement = false }: {
  stats: Stat[]
  roundCount: number
  showSettlement?: boolean
}) {
  return (
    <div>
      <h2 className="text-lg font-bold mb-4" style={{ color: '#202020' }}>
        {showSettlement ? '최종 전적' : '현재 전적'}
      </h2>
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#DEE0E2' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #ECEEF0' }}>
              <th className="text-left px-5 py-3 font-semibold" style={{ color: '#202020', opacity: 0.5 }}>이름</th>
              <th className="text-center px-4 py-3 font-semibold" style={{ color: '#202020', opacity: 0.5 }}>승</th>
              <th className="text-center px-4 py-3 font-semibold" style={{ color: '#202020', opacity: 0.5 }}>패</th>
              <th className="text-center px-4 py-3 font-semibold" style={{ color: '#202020', opacity: 0.5 }}>승률</th>
              {showSettlement && <th className="text-center px-4 py-3 font-semibold" style={{ color: '#202020', opacity: 0.5 }}>손익</th>}
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => {
              const net = s.wins - s.losses
              const total = s.wins + s.losses
              const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0
              return (
                <tr key={s.player.id} style={{ borderTop: i > 0 ? '1px solid #ECEEF0' : undefined }}>
                  <td className="px-5 py-3">
                    <span className="font-medium">{s.player.real_name}</span>
                    <span className="text-xs ml-2" style={{ opacity: 0.45 }}>{s.player.summoner_name}</span>
                  </td>
                  <td className="text-center px-4 py-3 font-bold" style={{ color: '#202020' }}>{s.wins}</td>
                  <td className="text-center px-4 py-3 font-bold" style={{ color: '#202020' }}>{s.losses}</td>
                  <td className="text-center px-4 py-3" style={{ color: '#202020', opacity: 0.7 }}>{rate}%</td>
                  {showSettlement && (
                    <td className="text-center px-4 py-3 font-bold"
                      style={{ color: net > 0 ? '#2d7a3a' : net < 0 ? '#c0392b' : '#202020' }}>
                      {net > 0 ? `+${net}` : net}판
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showSettlement && (
        <p className="text-xs mt-3" style={{ opacity: 0.4 }}>
          손익 = (승 - 패)판. 판당 금액을 곱하면 최종 정산액이 됩니다.
        </p>
      )}
    </div>
  )
}
