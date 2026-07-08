'use client'

import { useEffect, useRef, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'
import NavBar from '@/app/components/NavBar'
import { IS_MOCK, samplePlayers } from '@/lib/sampleData'

interface Round {
  id: string
  session_id: string
  team1_ids: string[]
  team2_ids: string[]
  winner_team: 1 | 2 | null
  team1_champions: string[] | null
  team2_champions: string[] | null
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

type Phase = 'select' | 'assign' | 'playing' | 'ended'

const STORAGE_KEY = 'sungbok_match_session'

interface StoredSession {
  phase: Phase
  sessionId: string
  sessionPlayerIds: string[]
  team1Ids: string[]
  team2Ids: string[]
  betAmount: number
  fixedTeam1Ids: string[]
  fixedTeam2Ids: string[]
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
  const [assignments, setAssignments] = useState<Map<string, 1 | 2>>(new Map())
  const [champions, setChampions] = useState<Map<string, string>>(new Map())
  const [championLoading, setChampionLoading] = useState(false)
  const sessionPlayersRef = useRef<Player[]>([])
  const assignmentsRef = useRef<Map<string, 1 | 2>>(new Map())
  const restoredRef = useRef(false)

  useEffect(() => { assignmentsRef.current = assignments }, [assignments])

  useEffect(() => {
    if (IS_MOCK) { setAllPlayers(samplePlayers); return }
    insforge.database
      .from('players')
      .select('id, real_name, summoner_name, created_at')
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
          const restoredAssignments = new Map<string, 1 | 2>([
            ...(stored.fixedTeam1Ids ?? []).map(id => [id, 1] as [string, 1 | 2]),
            ...(stored.fixedTeam2Ids ?? []).map(id => [id, 2] as [string, 1 | 2]),
          ])
          setAssignments(restoredAssignments)
          assignmentsRef.current = restoredAssignments
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
      const rouletteTeam1Names: string[] = e.data.rankings ?? []
      const pool = sessionPlayersRef.current
      const asgn = assignmentsRef.current
      const fixed1 = pool.filter(p => asgn.get(p.id) === 1)
      const fixed2 = pool.filter(p => asgn.get(p.id) === 2)
      const roulettePool = pool.filter(p => !asgn.has(p.id))
      const rouletteT1 = roulettePool.filter(p => rouletteTeam1Names.includes(p.real_name))
      const rouletteT2 = roulettePool.filter(p => !rouletteTeam1Names.includes(p.real_name))
      const t1 = [...fixed1, ...rouletteT1]
      const t2 = [...fixed2, ...rouletteT2]
      setTeam1(t1)
      setTeam2(t2)
      setShowRoulette(false)
      const storedRaw = localStorage.getItem(STORAGE_KEY)
      if (storedRaw) {
        try {
          const prev: StoredSession = JSON.parse(storedRaw)
          saveSession({ ...prev, team1Ids: t1.map(p => p.id), team2Ids: t2.map(p => p.id) })
        } catch { }
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

  function goToAssign() {
    if (!canStart) return
    setAssignments(new Map())
    setPhase('assign')
  }

  function toggleAssignment(id: string, team: 1 | 2) {
    setAssignments(prev => {
      const next = new Map(prev)
      if (next.get(id) === team) { next.delete(id) } else { next.set(id, team) }
      return next
    })
  }

  async function startSession() {
    if (!canStart) return
    const pool = allPlayers.filter(p => selected.has(p.id))
    const asgn = assignments
    const fixed1 = pool.filter(p => asgn.get(p.id) === 1)
    const fixed2 = pool.filter(p => asgn.get(p.id) === 2)
    const roulettePool = pool.filter(p => !asgn.has(p.id))

    let sid: string
    if (IS_MOCK) {
      sid = 'mock-session-' + Date.now()
    } else {
      const { data } = await insforge.database.from('sessions').insert([{
        bet_amount: betAmount === '' ? 0 : betAmount,
      }]).select()
      if (!data?.[0]) return
      sid = (data[0] as { id: string }).id
    }
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
      fixedTeam1Ids: fixed1.map(p => p.id),
      fixedTeam2Ids: fixed2.map(p => p.id),
    })

    if (roulettePool.length === 0) {
      setTeam1(fixed1)
      setTeam2(fixed2)
    } else {
      openRoulette()
    }
  }

  async function fetchChampions() {
    const pool = sessionPlayersRef.current
    const candidates = pool.filter(p => p.summoner_name)
    if (candidates.length === 0) { alert('소환사명이 등록된 선수가 없습니다.'); return }
    setChampionLoading(true)
    try {
      const results = await Promise.allSettled(
        candidates.map(player =>
          fetch(`${window.location.origin}/api/spectator?summoner=${encodeURIComponent(player.summoner_name!)}`)
            .then(r => r.ok ? r.json() : Promise.reject())
        )
      )

      let bestData = null
      let bestCount = 0
      for (const r of results) {
        if (r.status !== 'fulfilled') continue
        const count = r.value.participants.filter((p: { riotId: string }) =>
          pool.some(pl => pl.summoner_name === p.riotId || pl.summoner_name === p.riotId.split('#')[0])
        ).length
        if (count > bestCount) { bestCount = count; bestData = r.value }
      }

      if (!bestData) {
        alert('진행 중인 게임을 찾을 수 없습니다.')
      } else {
        const map = new Map<string, string>()
        for (const p of bestData.participants) {
          const matched = pool.find(pl => pl.summoner_name === p.riotId || pl.summoner_name === p.riotId.split('#')[0])
          if (matched) map.set(matched.id, p.championName)
        }
        setChampions(map)
      }
    } catch {
      alert('챔피언 정보를 가져오지 못했습니다.')
    }
    setChampionLoading(false)
  }

  function openRoulette() {
    setRouletteKey(k => k + 1)
    setShowRoulette(true)
  }

  async function recordWin(winner: 1 | 2) {
    if (!sessionId || saving) return
    setSaving(true)

    const t1Champs = team1.map(p => champions.get(p.id) ?? '')
    const t2Champs = team2.map(p => champions.get(p.id) ?? '')
    const hasChamps = t1Champs.some(c => c) || t2Champs.some(c => c)

    let newRound: Round
    if (IS_MOCK) {
      newRound = {
        id: 'mock-round-' + Date.now(),
        session_id: sessionId,
        team1_ids: team1.map(p => p.id),
        team2_ids: team2.map(p => p.id),
        winner_team: winner,
        team1_champions: hasChamps ? t1Champs : null,
        team2_champions: hasChamps ? t2Champs : null,
      }
    } else {
      const { data } = await insforge.database.from('rounds').insert([{
        session_id: sessionId,
        team1_ids: team1.map(p => p.id),
        team2_ids: team2.map(p => p.id),
        winner_team: winner,
        ...(hasChamps ? { team1_champions: t1Champs, team2_champions: t2Champs } : {}),
      }]).select()
      if (!data?.[0]) { setSaving(false); return }
      newRound = data[0] as Round
    }

    setSaving(false)
    setChampions(new Map())
    const newRounds = [...rounds, newRound]
    setRounds(newRounds)
    setStats(computeStats(sessionPlayersRef.current, newRounds))
    openRoulette()
  }

  async function undoLastRound() {
    if (rounds.length === 0) return
    const last = rounds[rounds.length - 1]
    if (!IS_MOCK) {
      await insforge.database.from('rounds').delete().eq('id', last.id)
    }
    const pool = sessionPlayersRef.current
    const t1 = last.team1_ids.map(id => pool.find(p => p.id === id)).filter(Boolean) as Player[]
    const t2 = last.team2_ids.map(id => pool.find(p => p.id === id)).filter(Boolean) as Player[]
    setTeam1(t1)
    setTeam2(t2)
    setShowRoulette(false)
    const newRounds = rounds.slice(0, -1)
    setRounds(newRounds)
    setStats(computeStats(pool, newRounds))
  }

  async function endSession() {
    if (!sessionId) return
    if (!IS_MOCK) {
      await insforge.database.from('sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
    }
    setStats(computeStats(sessionPlayersRef.current, rounds))
    setPhase('ended')
    clearSession()
  }

  function reset() {
    setPhase('select')
    setSessionId(null)
    setSelected(new Set())
    setAssignments(new Map())
    setSessionPlayers([])
    sessionPlayersRef.current = []
    setRounds([])
    setStats([])
    setTeam1([])
    setTeam2([])
    setShowRoulette(false)
    clearSession()
  }

  const roulettePool = sessionPlayers.filter(p => !assignments.has(p.id))
  const rouletteTeamSize = roulettePool.length / 2
  const rouletteSrc = roulettePool.length >= 2
    ? `/roulette/index.html?names=${encodeURIComponent(roulettePool.map(p => p.real_name).join(','))}&teamSize=${rouletteTeamSize}`
    : ''

  const roundCount = rounds.length

  return (
    <main className="min-h-screen px-4 sm:px-12 py-12 sm:py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>

      {/* 마블 룰렛 오버레이 */}
      {showRoulette && rouletteSrc && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#202020' }}>
          <div className="shrink-0 px-6 py-3 flex justify-end gap-2">
            {roundCount > 0 && (
              <button
                onClick={() => { if (window.confirm('마지막 판 결과를 취소할까요?')) undoLastRound() }}
                className="text-sm px-4 py-2 rounded-lg transition-opacity hover:opacity-70"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#f87171' }}
              >
                전판 취소
              </button>
            )}
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

      <NavBar />

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

            <div className="flex flex-col gap-2 mb-8">
              <label className="text-sm font-medium" style={{ opacity: 0.6 }}>판당 금액</label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={betAmount}
                    onChange={e => setBetAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-32 pl-4 pr-9 py-2 rounded-xl text-sm font-medium text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ backgroundColor: '#DEE0E2', color: '#202020' }}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ opacity: 0.4 }}>원</span>
                </div>
                {[1000, 2000, 3000, 5000].map(v => (
                  <button key={v} onClick={() => setBetAmount(v)}
                    className="px-3 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ backgroundColor: betAmount === v ? '#202020' : '#DEE0E2', color: betAmount === v ? '#ECEEF0' : '#202020' }}>
                    {v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={goToAssign} disabled={!canStart}
              className="px-10 py-4 rounded-full text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
              style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
              다음 — 팀 배정 {canStart && `(${selected.size / 2}:${selected.size / 2})`}
            </button>
          </div>
        )}

        {/* 팀 배정 */}
        {phase === 'assign' && (() => {
          const pool = allPlayers.filter(p => selected.has(p.id))
          const teamSize = selected.size / 2
          const f1 = pool.filter(p => assignments.get(p.id) === 1)
          const f2 = pool.filter(p => assignments.get(p.id) === 2)
          const remaining = pool.length - f1.length - f2.length
          const balanced = f1.length === f2.length
          const allFixed = remaining === 0
          const canConfirm = balanced && f1.length <= teamSize

          return (
            <div>
              <button onClick={() => setPhase('select')} className="text-sm mb-6 transition-opacity hover:opacity-60" style={{ opacity: 0.5 }}>
                ← 뒤로
              </button>
              <h1 className="text-3xl font-bold mb-2">팀 고정 배치</h1>
              <p className="text-sm mb-8" style={{ opacity: 0.5 }}>
                팀에 고정할 선수를 선택하세요. 나머지 {remaining}명은 룰렛으로 배정됩니다.
              </p>

              <div className="flex flex-col gap-2 mb-8">
                {pool.map(p => {
                  const assigned = assignments.get(p.id)
                  return (
                    <div key={p.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{ backgroundColor: '#DEE0E2' }}>
                      <span className="font-medium text-sm">{p.real_name}</span>
                      <div className="flex gap-2">
                        {([1, 2] as const).map(team => {
                          const active = assigned === team
                          return (
                            <button key={team} onClick={() => toggleAssignment(p.id, team)}
                              className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                              style={{
                                backgroundColor: active ? (team === 1 ? '#1e3a8a' : '#991b1b') : '#ECEEF0',
                                color: active ? '#ffffff' : '#202020',
                              }}>
                              {team}팀
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-3 mb-6 text-sm" style={{ opacity: 0.6 }}>
                <span className="px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#1e3a8a', color: '#fff' }}>1팀 고정 {f1.length}명</span>
                <span className="px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#991b1b', color: '#fff' }}>2팀 고정 {f2.length}명</span>
                <span className="px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>룰렛 {remaining}명</span>
              </div>

              {!balanced && f1.length + f2.length > 0 && (
                <p className="text-xs mb-4" style={{ color: '#c0392b' }}>
                  1팀과 2팀 고정 인원이 같아야 합니다. (현재 {f1.length}명 vs {f2.length}명)
                </p>
              )}

              <button onClick={startSession} disabled={!canConfirm}
                className="px-10 py-4 rounded-full text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
                style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
                {allFixed ? '팀 확정하기' : `룰렛으로 나머지 ${remaining}명 배정`}
              </button>
            </div>
          )
        })()}

        {/* 진행 중 */}
        {phase === 'playing' && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold">{roundCount + 1}번째 판</h1>
                <p className="text-sm mt-1" style={{ opacity: 0.5 }}>총 {roundCount}판 완료</p>
              </div>
              <div className="flex gap-2">
                {roundCount > 0 && (
                  <button onClick={() => { if (window.confirm('마지막 판 결과를 취소할까요?')) undoLastRound() }}
                    className="px-5 py-2 text-sm font-medium rounded-full transition-opacity hover:opacity-70"
                    style={{ backgroundColor: '#DEE0E2', color: '#c0392b' }}>
                    마지막 판 취소
                  </button>
                )}
                <button onClick={endSession}
                  className="px-5 py-2 text-sm font-medium rounded-full transition-opacity hover:opacity-70"
                  style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
                  내전 종료
                </button>
              </div>
            </div>

            {team1.length > 0 && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                {[{ team: team1, num: 1 }, { team: team2, num: 2 }].map(({ team, num }) => (
                  <div key={num} className="rounded-2xl p-6"
                    style={{ backgroundColor: num === 1 ? '#1e3a8a' : '#991b1b' }}>
                    <h2 className="text-base font-bold mb-4" style={{ color: '#ffffff' }}>{num}팀</h2>
                    <ul className="flex flex-col gap-2">
                      {team.map(p => (
                        <li key={p.id} className="flex items-center gap-2">
                          <span className="text-lg font-bold" style={{ color: '#ffffff' }}>{p.real_name}</span>
                          {champions.get(p.id) && (
                            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{champions.get(p.id)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 mb-4">
              <button onClick={openRoulette}
                className="flex-1 py-3 rounded-2xl text-sm font-bold transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
                팀 다시 섞기
              </button>
              <button onClick={fetchChampions} disabled={championLoading}
                className="py-3 px-5 rounded-2xl text-sm font-bold transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{ backgroundColor: 'green', color: 'white' }}>
                {championLoading ? '가져오는 중...' : champions.size > 0 ? '챔피언 다시 가져오기' : '챔피언 가져오기'}
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
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #ECEEF0' }}>
              <th className="text-left px-3 sm:px-5 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>이름</th>
              <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>승</th>
              <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>패</th>
              <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>승률</th>
              {showSettlement && (
                <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>
                  손익
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
                  <td className="px-3 sm:px-5 py-2 sm:py-3">
                    <span className="font-medium">{s.player.real_name}</span>
                  </td>
                  <td className="text-center px-2 sm:px-4 py-2 sm:py-3 font-bold">{s.wins}</td>
                  <td className="text-center px-2 sm:px-4 py-2 sm:py-3 font-bold">{s.losses}</td>
                  <td className="text-center px-2 sm:px-4 py-2 sm:py-3" style={{ opacity: 0.7 }}>{rate}%</td>
                  {showSettlement && (
                    <td className="text-center px-2 sm:px-4 py-2 sm:py-3 font-bold"
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
