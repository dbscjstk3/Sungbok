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
  created_at?: string
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
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editBetAmount, setEditBetAmount] = useState<number | ''>('')
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null)
  const [editError, setEditError] = useState('')
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set())
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState('')

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
        insforge.database.from('rounds')
          .select('id, session_id, team1_ids, team2_ids, winner_team, team1_champions, team2_champions, created_at')
          .order('created_at', { ascending: true }),
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

  function startAmountEdit(session: Session) {
    setEditingSessionId(session.id)
    setEditBetAmount(session.bet_amount)
    setEditError('')
  }

  function cancelAmountEdit() {
    if (savingSessionId) return
    setEditingSessionId(null)
    setEditBetAmount('')
    setEditError('')
  }

  async function saveAmount(sessionId: string) {
    if (savingSessionId || editBetAmount === '') return
    const amount = Number(editBetAmount)
    if (!Number.isSafeInteger(amount) || amount < 0) {
      setEditError('금액은 0 이상의 정수로 입력해 주세요.')
      return
    }

    setSavingSessionId(sessionId)
    setEditError('')
    try {
      if (!IS_MOCK) {
        const { error } = await insforge.database
          .from('sessions')
          .update({ bet_amount: amount })
          .eq('id', sessionId)
        if (error) {
          console.error('내전 금액 수정 실패:', error)
          setEditError(`금액을 수정하지 못했습니다. ${error.message ?? ''}`.trim())
          return
        }
      }

      setDetails(previous => previous.map(detail =>
        detail.session.id === sessionId
          ? { ...detail, session: { ...detail.session, bet_amount: amount } }
          : detail
      ))
      setEditingSessionId(null)
      setEditBetAmount('')
    } catch (error) {
      console.error('내전 금액 수정 중 예외 발생:', error)
      setEditError('네트워크 오류로 금액을 수정하지 못했습니다.')
    } finally {
      setSavingSessionId(null)
    }
  }

  function toggleMergeSelection(sessionId: string) {
    if (merging) return
    setMergeError('')
    const next = new Set(mergeSelection)
    if (next.has(sessionId)) {
      next.delete(sessionId)
      if (mergeTargetId === sessionId) setMergeTargetId(null)
    } else {
      next.add(sessionId)
      if (!mergeTargetId) setMergeTargetId(sessionId)
    }
    setMergeSelection(next)
  }

  function applyMergedDetails(targetSessionId: string, selectedIds: Set<string>) {
    setDetails(previous => {
      const selectedDetails = previous.filter(detail => selectedIds.has(detail.session.id))
      const targetDetail = selectedDetails.find(detail => detail.session.id === targetSessionId)
      if (!targetDetail) return previous

      const mergedRounds = selectedDetails
        .flatMap(detail => detail.rounds)
        .map(round => ({ ...round, session_id: targetSessionId }))
        .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
      const playerMap = new Map<string, Player>()
      selectedDetails.forEach(detail => detail.stats.forEach(stat => playerMap.set(stat.player.id, stat.player)))
      const mergedTarget: SessionDetail = {
        ...targetDetail,
        rounds: mergedRounds,
        stats: computeStats([...playerMap.values()], mergedRounds),
      }

      return previous
        .filter(detail => !selectedIds.has(detail.session.id) || detail.session.id === targetSessionId)
        .map(detail => detail.session.id === targetSessionId ? mergedTarget : detail)
    })
  }

  async function mergeSessions() {
    if (merging || mergeSelection.size < 2 || !mergeTargetId || !mergeSelection.has(mergeTargetId)) return
    const target = details.find(detail => detail.session.id === mergeTargetId)
    if (!target) return
    const sourceIds = [...mergeSelection].filter(id => id !== mergeTargetId)
    const confirmed = window.confirm(
      `${mergeSelection.size}개 기록을 ${formatDate(target.session.created_at)} 기록으로 합칠까요?\n` +
      `금액은 ${target.session.bet_amount.toLocaleString()}원으로 통일되며 이 작업은 되돌릴 수 없습니다.`
    )
    if (!confirmed) return

    setMerging(true)
    setMergeError('')
    try {
      if (!IS_MOCK) {
        const { error } = await insforge.database.rpc('merge_match_sessions', {
          p_target_session_id: mergeTargetId,
          p_source_session_ids: sourceIds,
        })
        if (error) {
          console.error('내전 기록 합치기 실패:', error)
          setMergeError(`기록을 합치지 못했습니다. ${error.message ?? ''}`.trim())
          return
        }
      }

      applyMergedDetails(mergeTargetId, mergeSelection)
      setExpanded(previous => {
        const next = new Set(previous)
        sourceIds.forEach(id => next.delete(id))
        next.add(mergeTargetId)
        return next
      })
      setMergeSelection(new Set())
      setMergeTargetId(null)
    } catch (error) {
      console.error('내전 기록 합치기 중 예외 발생:', error)
      setMergeError('네트워크 오류로 기록을 합치지 못했습니다.')
    } finally {
      setMerging(false)
    }
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

        {!loading && details.length >= 2 && (
          <div className="mb-6 px-4 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{ backgroundColor: '#DEE0E2' }}>
            <div>
              <p className="text-sm font-semibold">기록 합치기</p>
              <p className="text-xs mt-0.5" style={{ opacity: 0.55 }}>
                기록을 2개 이상 선택하고 유지할 기준 기록을 지정하세요.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {mergeSelection.size > 0 && (
                <button onClick={() => { setMergeSelection(new Set()); setMergeTargetId(null); setMergeError('') }} disabled={merging}
                  className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
                  style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
                  선택 해제
                </button>
              )}
              <button onClick={mergeSessions}
                disabled={merging || mergeSelection.size < 2 || !mergeTargetId || !mergeSelection.has(mergeTargetId)}
                className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-30"
                style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
                {merging ? '합치는 중...' : `선택 기록 합치기 (${mergeSelection.size})`}
              </button>
            </div>
          </div>
        )}

        {mergeError && (
          <p className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ backgroundColor: '#f8d7da', color: '#842029' }}>
            {mergeError}
          </p>
        )}

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
                <div className="px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                      <input type="checkbox" checked={mergeSelection.has(session.id)}
                        onChange={() => toggleMergeSelection(session.id)} disabled={merging}
                        className="w-4 h-4 accent-[#202020]" />
                      선택
                    </label>
                    {mergeSelection.has(session.id) && (
                      <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ opacity: 0.7 }}>
                        <input type="radio" name="merge-target" checked={mergeTargetId === session.id}
                          onChange={() => { setMergeTargetId(session.id); setMergeError('') }} disabled={merging}
                          className="accent-[#202020]" />
                        기준
                      </label>
                    )}
                  </div>
                  <button
                    onClick={() => toggleExpand(session.id)}
                    className="flex-1 flex items-center justify-between transition-opacity hover:opacity-80"
                  >
                    <div className="flex items-center gap-2 sm:gap-4">
                      <span className="text-sm sm:text-base font-bold">{formatDate(session.created_at)}</span>
                      <span className="text-xs sm:text-sm" style={{ opacity: 0.5 }}>{totalRounds}판</span>
                    </div>
                    <span className="text-sm sm:mr-2" style={{ opacity: 0.35 }}>{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {editingSessionId === session.id ? (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          value={editBetAmount}
                          onChange={event => setEditBetAmount(event.target.value === '' ? '' : Number(event.target.value))}
                          onKeyDown={event => {
                            if (event.key === 'Enter') saveAmount(session.id)
                            if (event.key === 'Escape') cancelAmountEdit()
                          }}
                          autoFocus
                          disabled={savingSessionId === session.id}
                          className="w-28 pl-3 pr-7 py-2 rounded-lg text-sm text-right outline-none disabled:opacity-50"
                          style={{ backgroundColor: '#ECEEF0', color: '#202020' }}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ opacity: 0.5 }}>원</span>
                      </div>
                      <button onClick={() => saveAmount(session.id)} disabled={savingSessionId === session.id || editBetAmount === ''}
                        className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
                        style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
                        {savingSessionId === session.id ? '저장 중' : '저장'}
                      </button>
                      <button onClick={cancelAmountEdit} disabled={savingSessionId === session.id}
                        className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
                        style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full font-medium"
                        style={{ backgroundColor: '#ECEEF0', color: '#202020', opacity: 0.75 }}>
                        {session.bet_amount.toLocaleString()}원
                      </span>
                      <button onClick={() => startAmountEdit(session)} disabled={savingSessionId !== null || merging}
                        className="px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                        style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
                        금액 수정
                      </button>
                    </div>
                  )}
                </div>

                {editingSessionId === session.id && editError && (
                  <p className="px-4 sm:px-6 pb-3 text-xs" style={{ color: '#c0392b' }}>{editError}</p>
                )}

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
