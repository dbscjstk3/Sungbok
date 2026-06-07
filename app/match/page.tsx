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

// ── 룰렛 오버레이 ──────────────────────────────────────────
type RouletteStep = 'spin' | 'freeze' | 'reveal'

function RouletteOverlay({ players, onDone }: {
  players: Player[]
  onDone: (t1: Player[], t2: Player[]) => void
}) {
  const [spinDisplay, setSpinDisplay] = useState<Player[]>(() => shuffle(players))
  const [step, setStep] = useState<RouletteStep>('spin')
  const [final, setFinal] = useState<Player[]>([])
  const [revealedCount, setRevealedCount] = useState(0)
  const [label, setLabel] = useState('')
  const doneRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function run() {
      // 1단계: 빠른 셔플
      const intervals = [
        ...Array(12).fill(45),
        ...Array(8).fill(80),
        ...Array(6).fill(130),
        ...Array(4).fill(200),
        ...Array(3).fill(300),
      ]
      for (const ms of intervals) {
        if (cancelled) return
        setSpinDisplay(shuffle(players))
        await new Promise(r => setTimeout(r, ms))
      }

      // 2단계: 정지 + 짧은 긴장 구간
      if (cancelled) return
      const result = shuffle(players)
      setFinal(result)
      setStep('freeze')
      setLabel('결과 발표')
      await new Promise(r => setTimeout(r, 600))

      // 3단계: 1~10번 순서대로 공개 (뒤로 갈수록 느려짐)
      setStep('reveal')
      const revealDelays = [150, 130, 130, 130, 280, 200, 200, 250, 350, 500]
      for (let i = 0; i < result.length; i++) {
        if (cancelled) return
        await new Promise(r => setTimeout(r, revealDelays[i]))
        setRevealedCount(i + 1)

        if (i === 4) {
          setLabel('1팀 확정')
          await new Promise(r => setTimeout(r, 300))
          setLabel('')
        }
      }

      if (cancelled) return
      setLabel('2팀 확정')
      await new Promise(r => setTimeout(r, 500))

      if (!doneRef.current) {
        doneRef.current = true
        onDone(result.slice(0, 5), result.slice(5, 10))
      }
    }

    run()
    return () => { cancelled = true }
  }, [])

  const displayList = step === 'spin' ? spinDisplay : final

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'rgba(10,10,10,0.97)' }}
    >
      {/* 타이틀 */}
      <div className="mb-10 text-center" style={{ minHeight: 40 }}>
        {label ? (
          <p
            className="text-2xl font-bold tracking-widest uppercase"
            style={{
              color: label === '1팀 확정' ? '#ECEEF0' : label === '2팀 확정' ? '#DEE0E2' : '#ECEEF0',
              opacity: 0.9,
              animation: 'pulse 0.6s ease',
            }}
          >
            {label}
          </p>
        ) : step === 'spin' ? (
          <p className="text-sm tracking-widest uppercase" style={{ color: '#ECEEF0', opacity: 0.3 }}>
            팀 배정 중...
          </p>
        ) : null}
      </div>

      {/* 카드 그리드: 위 5장(1팀) + 아래 5장(2팀) */}
      <div className="flex flex-col gap-4 w-full max-w-4xl px-8">
        {[0, 1].map(row => (
          <div key={row} className="grid grid-cols-5 gap-3">
            {displayList.slice(row * 5, row * 5 + 5).map((p, colIdx) => {
              const globalIdx = row * 5 + colIdx
              const isRevealed = step === 'reveal' && revealedCount > globalIdx
              const isTeam1 = globalIdx < 5

              return (
                <div
                  key={step === 'spin' ? colIdx : p.id}
                  className="rounded-2xl text-center flex flex-col items-center justify-center"
                  style={{
                    height: 100,
                    backgroundColor: isRevealed
                      ? (isTeam1 ? '#ECEEF0' : '#DEE0E2')
                      : step === 'freeze'
                        ? 'rgba(255,255,255,0.06)'
                        : 'rgba(255,255,255,0.05)',
                    border: isRevealed
                      ? 'none'
                      : step === 'freeze' && globalIdx === revealedCount
                        ? '1px solid rgba(255,255,255,0.25)'
                        : '1px solid rgba(255,255,255,0.07)',
                    transform: isRevealed ? 'scale(1.04)' : 'scale(1)',
                    transition: 'background-color 0.3s ease, transform 0.3s ease, border 0.3s ease',
                    boxShadow: isRevealed ? '0 4px 24px rgba(0,0,0,0.4)' : 'none',
                  }}
                >
                  {step === 'spin' ? (
                    <span className="text-sm font-medium px-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {p.real_name}
                    </span>
                  ) : isRevealed ? (
                    <>
                      <span className="text-xs font-bold mb-1" style={{ color: '#202020', opacity: 0.35 }}>
                        {globalIdx + 1}번 · {isTeam1 ? '1팀' : '2팀'}
                      </span>
                      <span className="text-base font-bold px-2" style={{ color: '#202020' }}>
                        {p.real_name}
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold" style={{ color: 'rgba(255,255,255,0.12)' }}>?</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* 팀 구분선 라벨 */}
      <div className="flex gap-10 mt-8">
        {[{ label: '1팀', color: '#ECEEF0' }, { label: '2팀', color: '#DEE0E2' }].map(t => (
          <div key={t.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color, opacity: 0.6 }} />
            <span className="text-xs" style={{ color: '#ECEEF0', opacity: 0.35 }}>{t.label} (위 줄 / 아래 줄)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 메인 페이지 ────────────────────────────────────────────
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
  const [betAmount, setBetAmount] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [rouletteKey, setRouletteKey] = useState(0)
  const [showRoulette, setShowRoulette] = useState(false)

  useEffect(() => {
    insforge.database
      .from('players')
      .select('id, real_name, created_at')
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

  async function startSession() {
    if (selected.size !== 10) return
    const pool = allPlayers.filter(p => selected.has(p.id))

    const { data } = await insforge.database.from('sessions').insert([{ bet_amount: betAmount === '' ? 0 : betAmount }]).select()
    if (!data?.[0]) return

    const sid = (data[0] as { id: string }).id
    setSessionId(sid)
    setSessionPlayers(pool)
    setRounds([])
    setStats(pool.map(p => ({ player: p, wins: 0, losses: 0 })))
    setPhase('playing')
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
    setStats(computeStats(sessionPlayers, newRounds))
  }

  function openRoulette() {
    setRouletteKey(k => k + 1)
    setShowRoulette(true)
  }

  function handleRouletteDone(t1: Player[], t2: Player[]) {
    setTeam1(t1)
    setTeam2(t2)
    setShowRoulette(false)
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
    setShowRoulette(false)
  }

  const roundCount = rounds.length

  return (
    <main className="min-h-screen px-12 py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>

      {showRoulette && sessionPlayers.length > 0 && (
        <RouletteOverlay key={rouletteKey} players={sessionPlayers} onDone={handleRouletteDone} />
      )}

      <nav className="fixed top-0 left-0 right-0 px-8 py-4 flex justify-between items-center z-10"
        style={{ backgroundColor: '#ECEEF0', borderBottom: '1px solid #DEE0E2' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ color: '#202020' }}>성복내전</a>
        <div className="flex items-center gap-6">
          {[['/', '홈'], ['/players', '참가자 명단'], ['/match', '내전'], ['/history', '기록'], ['/roulette', '룰렛']].map(([href, label]) => (
            <a key={href} href={href} className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#202020' }}>{label}</a>
          ))}
        </div>
      </nav>

      <div className="pt-16">

        {/* 선택 */}
        {phase === 'select' && (
          <div>
            <h1 className="text-3xl font-bold mb-2">내전 시작</h1>
            <p className="text-sm mb-8" style={{ opacity: 0.5 }}>오늘 내전에 참가할 10명을 선택하세요.</p>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium" style={{ opacity: 0.6 }}>{selected.size}/10명 선택됨</span>
              <button onClick={() => setSelected(new Set(allPlayers.slice(0, 10).map(p => p.id)))}
                className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
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
                  </button>
                )
              })}
            </div>

            {/* 베팅 금액 */}
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

            <button onClick={startSession} disabled={selected.size !== 10}
              className="px-10 py-4 rounded-full text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
              style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
              내전 시작
            </button>
          </div>
        )}

        {/* 진행 중 */}
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

            {/* 현재 팀 */}
            {team1.length > 0 && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                {[{ team: team1, num: 1 }, { team: team2, num: 2 }].map(({ team, num }) => (
                  <div key={num} className="rounded-2xl p-6"
                    style={{ backgroundColor: num === 1 ? '#202020' : '#DEE0E2' }}>
                    <h2 className="text-base font-bold mb-4"
                      style={{ color: num === 1 ? '#ECEEF0' : '#202020' }}>{num}팀</h2>
                    <ul className="flex flex-col gap-2">
                      {team.map(p => (
                        <li key={p.id} className="flex justify-between items-center">
                          <span className="text-sm font-medium"
                            style={{ color: num === 1 ? '#ECEEF0' : '#202020' }}>{p.real_name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* 팀 섞기 버튼 */}
            <div className="mb-4">
              <button onClick={openRoulette}
                className="w-full py-3 rounded-2xl text-sm font-bold transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
                팀 섞기
              </button>
            </div>

            {/* 승리 버튼 */}
            <div className="flex gap-3 mb-12">
              <button onClick={() => recordWin(1)} disabled={saving || team1.length === 0}
                className="flex-1 py-4 rounded-2xl text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
                style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
                1팀 승리
              </button>
              <button onClick={() => recordWin(2)} disabled={saving || team2.length === 0}
                className="flex-1 py-4 rounded-2xl text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
                style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
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
