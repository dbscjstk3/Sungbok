'use client'

import { useEffect, useRef, useState } from 'react'
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

const STORAGE_KEY = 'sungbok_match_session'

interface StoredSession {
  phase: Phase
  sessionId: string
  sessionPlayerIds: string[]
  team1Ids: string[]
  team2Ids: string[]
  betAmount: number
}

function saveSession(data: StoredSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}

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
  const [betAmount, setBetAmount] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [showRoulette, setShowRoulette] = useState(false)
  const [rouletteKey, setRouletteKey] = useState(0)
  const sessionPlayersRef = useRef<Player[]>([])
  const restoredRef = useRef(false)

  useEffect(() => {
    insforge.database
      .from('players')
      .select('id, real_name, created_at')
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setAllPlayers(data as Player[]) })
  }, [])

  // 새로고침 후 세션 복원
  useEffect(() => {
    if (allPlayers.length === 0 || restoredRef.current) return
    restoredRef.current = true

    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const stored: StoredSession = JSON.parse(raw)
      const pool = stored.sessionPlayerIds
        .map(id => allPlayers.find(p => p.id === id))
        .filter(Boolean) as Player[]
      if (pool.length === 0) { clearSession(); return }

      insforge.database.from('rounds')
        .select('id, session_id, team1_ids, team2_ids, winner_team')
        .eq('session_id', stored.sessionId)
        .then(({ data }) => {
          const fetchedRounds = (data as Round[]) ?? []
          const t1 = stored.team1Ids.map(id => pool.find(p => p.id === id)).filter(Boolean) as Player[]
          const t2 = stored.team2Ids.map(id => pool.find(p => p.id === id)).filter(Boolean) as Player[]
          setSessionId(stored.sessionId)
          setSessionPlayers(pool)
          sessionPlayersRef.current = pool
          setRounds(fetchedRounds)
          setStats(computeStats(pool, fetchedRounds))
          setTeam1(t1)
          setTeam2(t2)
          setBetAmount(stored.betAmount || '')
          setPhase(stored.phase)
        })
    } catch {
      clearSession()
    }
  }, [allPlayers])

  // 마블 룰렛 postMessage 수신
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type !== 'roulette-result') return
      const team1Names: string[] = e.data.rankings ?? []
      const pool = sessionPlayersRef.current
      const t1 = pool.filter(p => team1Names.includes(p.real_name))
      const t2 = pool.filter(p => !team1Names.includes(p.real_name))
      setTeam1(t1)
      setTeam2(t2)
      setShowRoulette(false)
      const storedRaw = localStorage.getItem(STORAGE_KEY)
      if (storedRaw) {
        try {
          const prev: StoredSession = JSON.parse(storedRaw)
          saveSession({ ...prev, team1Ids: t1.map(p => p.id), team2Ids: t2.map(p => p.id) })
        } catch {}
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < 10) {
        next.add(id)
      }
      return next
    })
  }

  const canStart = selected.size === 8 || selected.size === 10

  async function startSession() {
    if (!canStart) return
    const pool = allPlayers.filter(p => selected.has(p.id))

    const { data } = await insforge.database.from('sessions').insert([{
      bet_amount: betAmount === '' ? 0 : betAmount,
    }]).select()
    if (!data?.[0]) return

    const sid = (data[0] as { id: string }).id
    setSessionId(sid)
    setSessionPlayers(pool)
    sessionPlayersRef.current = pool
    setRounds([])
    setStats(pool.map(p => ({ player: p, wins: 0, losses: 0 })))
    setPhase('playing')
    saveSession({
      phase: 'playing',
      sessionId: sid,
      sessionPlayerIds: pool.map(p => p.id),
      team1Ids: [],
      team2Ids: [],
      betAmount: betAmount === '' ? 0 : betAmount,
    })
    openRoulette()
  }

  function openRoulette() {
    setRouletteKey(k => k + 1)
    setShowRoulette(true)
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
    setStats(computeStats(sessionPlayersRef.current, newRounds))
    openRoulette()
  }

  async function endSession() {
    if (!sessionId) return
    await insforge.database.from('sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
    setStats(computeStats(sessionPlayersRef.current, rounds))
    setPhase('ended')
    clearSession()
  }

  function reset() {
    setPhase('select')
    setSessionId(null)
    setSelected(new Set())
    setSessionPlayers([])
    sessionPlayersRef.current = []
    setRounds([])
    setStats([])
    setTeam1([])
    setTeam2([])
    setShowRoulette(false)
    clearSession()
  }

  const teamSize = sessionPlayers.length / 2
  const rouletteSrc = sessionPlayers.length > 0
    ? `/roulette/index.html?names=${encodeURIComponent(sessionPlayers.map(p => p.real_name).join(','))}&teamSize=${teamSize}`
    : ''

  const roundCount = rounds.length

  return (
    <main className="min-h-screen px-12 py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>

      {/* 마블 룰렛 오버레이 */}
      {showRoulette && rouletteSrc && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#202020' }}>
          <div className="shrink-0 px-6 py-3 flex justify-end">
            <button
              onClick={() => setShowRoulette(false)}
              className="text-sm px-4 py-2 rounded-lg transition-opacity hover:opacity-70"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#ECEEF0' }}
            >
              닫기
            </button>
          </div>
          <iframe
            key={rouletteKey}
            src={rouletteSrc}
            className="flex-1 w-full border-0"
            allow="autoplay"
          />
        </div>
      )}

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

        {/* 선택 */}
        {phase === 'select' && (
          <div>
            <h1 className="text-3xl font-bold mb-2">내전 생성</h1>
            <p className="text-sm mb-8" style={{ opacity: 0.5 }}>참가할 인원을 선택하세요. (8명 또는 10명)</p>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium" style={{ opacity: 0.6 }}>{selected.size}명 선택됨</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(new Set(allPlayers.slice(0, 8).map(p => p.id)))}
                  className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                  style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
                  상위 8명
                </button>
                <button
                  onClick={() => setSelected(new Set(allPlayers.slice(0, 10).map(p => p.id)))}
                  className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                  style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
                  상위 10명
                </button>
              </div>
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
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-3 mb-8">
              <label className="text-sm font-medium shrink-0" style={{ opacity: 0.6 }}>판당 금액</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={betAmount}
                  onChange={e => setBetAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-36 pl-4 pr-9 py-2 rounded-xl text-sm font-medium text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{ backgroundColor: '#DEE0E2', color: '#202020' }}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ opacity: 0.4 }}>원</span>
              </div>
              <div className="flex gap-2">
                {[1000, 2000, 3000, 5000].map(v => (
                  <button key={v} onClick={() => setBetAmount(v)}
                    className="px-3 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ backgroundColor: betAmount === v ? '#202020' : '#DEE0E2', color: betAmount === v ? '#ECEEF0' : '#202020' }}>
                    {v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={startSession} disabled={!canStart}
              className="px-10 py-4 rounded-full text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
              style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
              룰렛으로 팀 정하기 {canStart && `(${selected.size / 2}:${selected.size / 2})`}
            </button>
          </div>
        )}

        {/* 진행 중 */}
        {phase === 'playing' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold">{roundCount + 1}번째 판</h1>
                <p className="text-sm mt-1" style={{ opacity: 0.5 }}>총 {roundCount}판 완료</p>
              </div>
              <button onClick={endSession}
                className="px-5 py-2 text-sm font-medium rounded-full transition-opacity hover:opacity-70"
                style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
                내전 종료
              </button>
            </div>

            {team1.length > 0 && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                {[{ team: team1, num: 1 }, { team: team2, num: 2 }].map(({ team, num }) => (
                  <div key={num} className="rounded-2xl p-6"
                    style={{ backgroundColor: num === 1 ? '#1e3a8a' : '#991b1b' }}>
                    <h2 className="text-base font-bold mb-4" style={{ color: '#ffffff' }}>{num}팀</h2>
                    <ul className="flex flex-col gap-2">
                      {team.map(p => (
                        <li key={p.id}>
                          <span className="text-lg font-bold" style={{ color: '#ffffff' }}>{p.real_name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-4">
              <button onClick={openRoulette}
                className="w-full py-3 rounded-2xl text-sm font-bold transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
                팀 다시 섞기
              </button>
            </div>

            <div className="flex gap-3 mb-12">
              <button onClick={() => recordWin(1)} disabled={saving || team1.length === 0}
                className="flex-1 py-4 rounded-2xl text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
                style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}>
                1팀 승리
              </button>
              <button onClick={() => recordWin(2)} disabled={saving || team2.length === 0}
                className="flex-1 py-4 rounded-2xl text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
                style={{ backgroundColor: '#991b1b', color: '#ffffff' }}>
                2팀 승리
              </button>
            </div>

            {roundCount > 0 && <Standings stats={stats} roundCount={roundCount} />}
          </div>
        )}

        {/* 종료 */}
        {phase === 'ended' && (
          <div>
            <h1 className="text-3xl font-bold mb-2">내전 종료</h1>
            <p className="text-sm mb-8" style={{ opacity: 0.5 }}>총 {roundCount}판 진행</p>
            <Standings stats={stats} roundCount={roundCount} showSettlement betAmount={betAmount === '' ? 0 : betAmount} />
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

function Standings({ stats, roundCount, showSettlement = false, betAmount = 0 }: {
  stats: Stat[]
  roundCount: number
  showSettlement?: boolean
  betAmount?: number
}) {
  const showMoney = showSettlement && betAmount > 0

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">{showSettlement ? '최종 전적' : '현재 전적'}</h2>
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#DEE0E2' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #ECEEF0' }}>
              <th className="text-left px-5 py-3 font-semibold" style={{ opacity: 0.5 }}>이름</th>
              <th className="text-center px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>승</th>
              <th className="text-center px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>패</th>
              <th className="text-center px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>승률</th>
              {showSettlement && (
                <th className="text-center px-4 py-3 font-semibold" style={{ opacity: 0.5 }}>
                  {showMoney ? '손익' : '손익(판)'}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => {
              const net = s.wins - s.losses
              const total = s.wins + s.losses
              const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0
              const money = net * betAmount
              return (
                <tr key={s.player.id} style={{ borderTop: i > 0 ? '1px solid #ECEEF0' : undefined }}>
                  <td className="px-5 py-3">
                    <span className="font-medium">{s.player.real_name}</span>
                  </td>
                  <td className="text-center px-4 py-3 font-bold">{s.wins}</td>
                  <td className="text-center px-4 py-3 font-bold">{s.losses}</td>
                  <td className="text-center px-4 py-3" style={{ opacity: 0.7 }}>{rate}%</td>
                  {showSettlement && (
                    <td className="text-center px-4 py-3 font-bold"
                      style={{ color: net > 0 ? '#2d7a3a' : net < 0 ? '#c0392b' : '#202020' }}>
                      {showMoney
                        ? `${money > 0 ? '+' : ''}${money.toLocaleString()}원`
                        : `${net > 0 ? '+' : ''}${net}판`}
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
          {showMoney
            ? `판당 ${betAmount.toLocaleString()}원 기준 · 양수면 받을 금액, 음수면 줄 금액`
            : '판당 금액을 입력하면 정산액을 확인할 수 있습니다.'}
        </p>
      )}
    </div>
  )
}
