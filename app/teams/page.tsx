'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'

type Phase = 'idle' | 'spinning' | 'done'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function TeamsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [phase, setPhase] = useState<Phase>('idle')
  const [spinDisplay, setSpinDisplay] = useState<Player[]>([])
  const [result, setResult] = useState<Player[]>([])

  useEffect(() => {
    insforge.database
      .from('players')
      .select('id, real_name, summoner_name, created_at')
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setPlayers(data as Player[]) })
  }, [])

  function toggleSelect(id: string) {
    if (phase !== 'idle') return
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

  function selectAll() {
    if (phase !== 'idle') return
    const ids = players.slice(0, 10).map(p => p.id)
    setSelected(new Set(ids))
  }

  async function startRoulette() {
    if (selected.size !== 10) return
    const pool = players.filter(p => selected.has(p.id))

    setPhase('spinning')
    setResult([])

    // 셔플 애니메이션: 30번 빠르게 섞어서 보여줌
    for (let i = 0; i < 30; i++) {
      setSpinDisplay(shuffle(pool))
      await new Promise(r => setTimeout(r, i < 20 ? 60 : i < 27 ? 120 : 220))
    }

    const final = shuffle(pool)
    setResult(final)
    setSpinDisplay(final)
    setPhase('done')
  }

  function reset() {
    setPhase('idle')
    setResult([])
    setSpinDisplay([])
    setSelected(new Set())
  }

  const team1 = result.slice(0, 5)
  const team2 = result.slice(5, 10)

  return (
    <main className="min-h-screen px-12 py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 px-8 py-4 flex justify-between items-center z-10" style={{ backgroundColor: '#ECEEF0' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ color: '#202020' }}>성복내전</a>
        <div className="flex items-center gap-6">
          <a href="/" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#202020' }}>홈</a>
          <a href="/players" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#202020' }}>참가자 명단</a>
          <a href="/teams" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#202020' }}>팀 배정</a>
          <a href="/roulette" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#202020' }}>룰렛</a>
        </div>
      </nav>

      <div className="pt-16">
        <h1 className="text-3xl font-bold mb-2" style={{ color: '#202020' }}>팀 배정</h1>
        <p className="text-sm mb-10" style={{ color: '#202020', opacity: 0.5 }}>
          10명을 선택하고 룰렛을 돌리면 1~5등이 1팀, 6~10등이 2팀이 됩니다.
        </p>

        {/* 참가자 선택 */}
        {phase === 'idle' && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold" style={{ color: '#202020' }}>
                참가자 선택 <span style={{ color: '#202020', opacity: 0.4 }}>({selected.size}/10)</span>
              </h2>
              <button
                onClick={selectAll}
                className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ backgroundColor: '#DEE0E2', color: '#202020' }}
              >
                상위 10명 선택
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {players.map(p => {
                const isSelected = selected.has(p.id)
                const isDisabled = !isSelected && selected.size >= 10
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleSelect(p.id)}
                    disabled={isDisabled}
                    className="px-4 py-3 rounded-xl text-left transition-all"
                    style={{
                      backgroundColor: isSelected ? '#202020' : '#DEE0E2',
                      color: isSelected ? '#ECEEF0' : '#202020',
                      opacity: isDisabled ? 0.35 : 1,
                    }}
                  >
                    <div className="text-sm font-medium">{p.real_name}</div>
                    <div className="text-xs mt-0.5" style={{ opacity: 0.6 }}>{p.summoner_name}</div>
                  </button>
                )
              })}
            </div>

            <button
              onClick={startRoulette}
              disabled={selected.size !== 10}
              className="mt-8 px-10 py-4 rounded-full text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
              style={{ backgroundColor: '#202020', color: '#ECEEF0' }}
            >
              룰렛 돌리기
            </button>
          </section>
        )}

        {/* 스핀 중 */}
        {phase === 'spinning' && (
          <section className="mb-10">
            <p className="text-sm font-medium mb-6 animate-pulse" style={{ color: '#202020', opacity: 0.6 }}>
              추첨 중...
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {spinDisplay.map((p, i) => (
                <div
                  key={p.id}
                  className="px-4 py-3 rounded-xl"
                  style={{ backgroundColor: '#DEE0E2', color: '#202020' }}
                >
                  <div className="text-xs font-bold mb-1" style={{ opacity: 0.4 }}>{i + 1}등</div>
                  <div className="text-sm font-medium">{p.real_name}</div>
                  <div className="text-xs mt-0.5" style={{ opacity: 0.55 }}>{p.summoner_name}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 결과 */}
        {phase === 'done' && (
          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              {/* 1팀 */}
              <div className="rounded-2xl p-6" style={{ backgroundColor: '#202020' }}>
                <h2 className="text-lg font-bold mb-5" style={{ color: '#ECEEF0' }}>1팀</h2>
                <ul className="flex flex-col gap-3">
                  {team1.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: '#ECEEF0', color: '#202020' }}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <div className="text-sm font-medium" style={{ color: '#ECEEF0' }}>{p.real_name}</div>
                        <div className="text-xs" style={{ color: '#ECEEF0', opacity: 0.5 }}>{p.summoner_name}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 2팀 */}
              <div className="rounded-2xl p-6" style={{ backgroundColor: '#DEE0E2' }}>
                <h2 className="text-lg font-bold mb-5" style={{ color: '#202020' }}>2팀</h2>
                <ul className="flex flex-col gap-3">
                  {team2.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: '#202020', color: '#ECEEF0' }}
                      >
                        {i + 6}
                      </span>
                      <div>
                        <div className="text-sm font-medium" style={{ color: '#202020' }}>{p.real_name}</div>
                        <div className="text-xs" style={{ color: '#202020', opacity: 0.55 }}>{p.summoner_name}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <button
              onClick={reset}
              className="px-8 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#DEE0E2', color: '#202020' }}
            >
              다시 뽑기
            </button>
          </section>
        )}
      </div>
    </main>
  )
}
