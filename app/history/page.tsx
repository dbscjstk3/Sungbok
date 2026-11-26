'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'
import NavBar from '@/app/components/NavBar'
import {
  IS_MOCK,
  portfolioMetadata,
  portfolioPlayers,
  portfolioRounds,
  portfolioSessions,
  samplePlayers,
  sampleSessions,
  sampleRounds,
} from '@/lib/sampleData'
import { IS_PORTFOLIO } from '@/lib/appMode'

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

const historyDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
})

function getDateKey(iso: string) {
  return historyDateFormatter.format(new Date(iso))
}

function formatDate(iso: string) {
  return getDateKey(iso).replaceAll('-', '.')
}

function getCalendarDays(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  return Array.from({ length: cellCount }, (_, index) =>
    new Date(Date.UTC(year, month - 1, index - firstWeekday + 1)).toISOString().slice(0, 10)
  )
}

function getDisplayedRoundCount(rounds: Round[]) {
  const countsByPlayerCount = new Map<number, number>()
  for (const round of rounds) {
    if (round.winner_team === null) continue
    const playerCount = round.team1_ids.length + round.team2_ids.length
    countsByPlayerCount.set(playerCount, (countsByPlayerCount.get(playerCount) ?? 0) + 1)
  }
  return Math.max(0, ...countsByPlayerCount.values())
}

function computeMonthlyAttendance(players: Player[], sessionsByDate: Map<string, SessionDetail[]>, dates: string[]) {
  const attendedDates = new Map(players.map(player => [player.id, new Set<string>()]))
  let totalDays = 0

  for (const date of dates) {
    const participants = new Set<string>()
    for (const detail of sessionsByDate.get(date) ?? []) {
      for (const round of detail.rounds) {
        if (round.winner_team === null) continue
        round.team1_ids.forEach(id => participants.add(id))
        round.team2_ids.forEach(id => participants.add(id))
      }
    }
    if (participants.size === 0) continue
    totalDays += 1
    participants.forEach(id => attendedDates.get(id)?.add(date))
  }

  const rows = players.map(player => {
    const days = attendedDates.get(player.id)!.size
    return { player, days, rate: totalDays > 0 ? Math.round(days / totalDays * 100) : null }
  }).sort((a, b) => b.days - a.days || a.player.real_name.localeCompare(b.player.real_name, 'ko'))

  return { totalDays, rows }
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
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [visibleMonth, setVisibleMonth] = useState<string | null>(null)
  const [championModal, setChampionModal] = useState<{ playerName: string; champions: { champion: string; won: boolean }[] } | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editBetAmount, setEditBetAmount] = useState<number | ''>('')
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null)
  const [editError, setEditError] = useState('')
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set())
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState('')

  const sessionsByDate = new Map<string, SessionDetail[]>()
  for (const detail of details) {
    const date = getDateKey(detail.session.created_at)
    const sessions = sessionsByDate.get(date) ?? []
    sessions.push(detail)
    sessionsByDate.set(date, sessions)
  }
  const recordedDates = [...sessionsByDate.keys()].sort()
  const today = getDateKey(new Date().toISOString())
  const activeDate = selectedDate ?? today
  const activeMonth = visibleMonth ?? activeDate.slice(0, 7)
  const [calendarYear, calendarMonth] = activeMonth.split('-').map(Number)
  const monthDates = recordedDates.filter(date => date.startsWith(activeMonth))
  const monthSessionCount = monthDates.reduce((count, date) => count + sessionsByDate.get(date)!.length, 0)
  const visibleDetails = sessionsByDate.get(activeDate) ?? []
  const attendance = computeMonthlyAttendance(allPlayers, sessionsByDate, monthDates)

  const championModalWins = championModal?.champions.filter(champion => champion.won).length ?? 0
  const championModalGames = championModal?.champions.length ?? 0
  const championModalLosses = championModalGames - championModalWins
  const championModalWinRate = championModalGames > 0
    ? Math.round((championModalWins / championModalGames) * 100)
    : 0

  useEffect(() => {
    async function load() {
      if (IS_MOCK) {
        const mockPlayers = IS_PORTFOLIO ? portfolioPlayers : samplePlayers
        const mockSessions = IS_PORTFOLIO ? portfolioSessions : sampleSessions
        const mockRounds = IS_PORTFOLIO ? portfolioRounds : sampleRounds
        const playerMap = new Map(mockPlayers.map(p => [p.id, p]))
        const result: SessionDetail[] = [...mockSessions].reverse().map(session => {
          const sessionRounds = mockRounds.filter(r => r.session_id === session.id)
          const allIds = new Set<string>()
          sessionRounds.forEach(r => { r.team1_ids.forEach(id => allIds.add(id)); r.team2_ids.forEach(id => allIds.add(id)) })
          const sessionPlayers = [...allIds].map(id => playerMap.get(id)).filter(Boolean) as Player[]
          return { session, rounds: sessionRounds as Round[], stats: computeStats(sessionPlayers, sessionRounds as Round[]) }
        })
        setDetails(result)
        setAllPlayers(mockPlayers)
        setExpanded(new Set(result.map(detail => detail.session.id)))
        setLoading(false)
        return
      }

      const [{ data: sessions, error: sessionsError }, { data: rounds, error: roundsError }, { data: players, error: playersError }] = await Promise.all([
        insforge.database.from('sessions').select('id, created_at, ended_at, bet_amount')
          .not('ended_at', 'is', null).order('created_at', { ascending: false }),
        insforge.database.from('rounds')
          .select('id, session_id, team1_ids, team2_ids, winner_team, team1_champions, team2_champions, created_at')
          .order('created_at', { ascending: true }),
        insforge.database.from('players').select('id, real_name, created_at'),
      ])

      if (sessionsError || roundsError || playersError || !sessions || !rounds || !players) {
        setLoadError('내전 기록을 불러오지 못했습니다. 연결 상태를 확인한 후 다시 시도해 주세요.')
        setLoading(false)
        return
      }

      const playerMap = new Map((players as Player[]).map(p => [p.id, p]))

      const result: SessionDetail[] = (sessions as Session[]).map(session => {
        const sessionRounds = (rounds as Round[]).filter(r => r.session_id === session.id)
        const allIds = new Set<string>()
        sessionRounds.forEach(r => { r.team1_ids.forEach(id => allIds.add(id)); r.team2_ids.forEach(id => allIds.add(id)) })
        const sessionPlayers = [...allIds].map(id => playerMap.get(id)).filter(Boolean) as Player[]
        return { session, rounds: sessionRounds, stats: computeStats(sessionPlayers, sessionRounds) }
      })

      setDetails(result)
      setAllPlayers(players as Player[])
      setExpanded(new Set(result.map(detail => detail.session.id)))
      setLoading(false)
    }
    load().catch(() => {
      setLoadError('내전 기록을 불러오지 못했습니다. 연결 상태를 확인한 후 다시 시도해 주세요.')
      setLoading(false)
    })
  }, [])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function selectDate(date: string) {
    setSelectedDate(date)
    setVisibleMonth(date.slice(0, 7))
    setExpanded(previous => new Set([
      ...previous,
      ...(sessionsByDate.get(date) ?? []).map(detail => detail.session.id),
    ]))
  }

  function selectMonth(month: string) {
    selectDate(recordedDates.filter(date => date.startsWith(month)).at(-1) ?? `${month}-01`)
  }

  function changeMonth(offset: number) {
    selectMonth(new Date(Date.UTC(calendarYear, calendarMonth - 1 + offset, 1)).toISOString().slice(0, 7))
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
      setEditError(`${IS_PORTFOLIO ? '포인트' : '금액'}는 0 이상의 정수로 입력해 주세요.`)
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
      `${IS_PORTFOLIO ? '점수' : '금액'}는 ${target.session.bet_amount.toLocaleString()}${IS_PORTFOLIO ? 'P' : '원'}으로 통일되며 이 작업은 되돌릴 수 없습니다.`
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
      setSelectedDate(getDateKey(target.session.created_at))
      setVisibleMonth(getDateKey(target.session.created_at).slice(0, 7))
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
    <main id="main-content" className="app-page min-h-screen px-4 sm:px-12 py-12 sm:py-16" style={{ backgroundColor: 'var(--canvas)', color: 'var(--ink)' }}>
      <NavBar />

      {championModal && (
        <div
          className="history-champion-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          onClick={() => setChampionModal(null)}
        >
          <section
            className="history-champion-modal w-full overflow-hidden sm:max-w-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="champion-log-title"
            onClick={event => event.stopPropagation()}
            onKeyDown={event => {
              if (event.key === 'Escape') setChampionModal(null)
            }}
          >
            <header className="history-champion-header">
              <div>
                <p className="history-champion-kicker">PLAYER MATCH LOG</p>
                <h2 id="champion-log-title" className="history-champion-name">{championModal.playerName}</h2>
                <p className="history-champion-subtitle">플레이 챔피언 기록</p>
              </div>
              <button
                type="button"
                className="history-champion-close"
                onClick={() => setChampionModal(null)}
                aria-label="챔피언 기록 닫기"
                autoFocus
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <dl className="history-champion-summary">
              <div>
                <dt>PLAYED</dt>
                <dd>{championModalGames}</dd>
              </div>
              <div>
                <dt>RECORD</dt>
                <dd className="history-champion-record">
                  <span>{championModalWins}<small>W</small></span>
                  <span>{championModalLosses}<small>L</small></span>
                </dd>
              </div>
              <div>
                <dt>WIN RATE</dt>
                <dd>{championModalWinRate}<small>%</small></dd>
              </div>
            </dl>

            <div className="history-champion-log">
              <div className="history-champion-columns" aria-hidden="true">
                <span>ROUND</span>
                <span>CHAMPION</span>
                <span>RESULT</span>
              </div>
              <ol className="history-champion-list">
                {championModal.champions.map((champion, index) => (
                  <li key={`${champion.champion}-${index}`}>
                    <span className="history-champion-round">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{champion.champion}</strong>
                    <span className={champion.won ? 'history-result history-result-win' : 'history-result history-result-loss'}>
                      {champion.won ? 'WIN' : 'LOSS'}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      )}

      <div className="pt-16">
        <h1 className="text-3xl font-bold mb-2">내전 기록</h1>
        <p className="text-sm mb-10" style={{ opacity: 0.5 }}>
          {IS_PORTFOLIO
            ? `실제 운영 기록 ${portfolioMetadata.session_count}개 세션 · ${portfolioMetadata.round_count}라운드 · 개인정보 비식별 처리`
            : '달력에서 날짜를 선택해 완료된 내전 기록을 확인하세요.'}
        </p>

        <section className="history-calendar" aria-label="내전 기록 달력" aria-busy={loading}>
          <header className="history-calendar-header">
            <div>
              <h2 id="history-calendar-month" aria-live="polite">{calendarYear}년 {calendarMonth}월</h2>
              <p>
                {loading ? '기록 불러오는 중...' : loadError ? '기록을 불러오지 못했습니다.' : `내전 ${monthSessionCount}회 · ${monthDates.length}일 진행`}
                <span> · 한국 시간 기준</span>
              </p>
            </div>
            <div className="history-calendar-controls">
              <label className="history-calendar-month-picker">
                연월 선택
                <input
                  type="month"
                  value={activeMonth}
                  onChange={event => { if (event.target.value) selectMonth(event.target.value) }}
                  aria-label="이동할 연월"
                />
              </label>
              <button type="button" onClick={() => changeMonth(-1)} aria-label="이전 달">이전 달</button>
              <button type="button" onClick={() => selectDate(today)}>오늘</button>
              <button type="button" onClick={() => changeMonth(1)} aria-label="다음 달">다음 달</button>
            </div>
          </header>
          <div className="history-calendar-weekdays" aria-hidden="true">
            {['일', '월', '화', '수', '목', '금', '토'].map(day => <span key={day}>{day}</span>)}
          </div>
          <div className="history-calendar-days" role="group" aria-labelledby="history-calendar-month">
            {getCalendarDays(activeMonth).map(date => {
              const daySessions = sessionsByDate.get(date) ?? []
              const rounds = daySessions.reduce((count, detail) => count + getDisplayedRoundCount(detail.rounds), 0)
              const selectionCount = daySessions.filter(detail => mergeSelection.has(detail.session.id)).length
              return (
                <button
                  type="button"
                  key={date}
                  className="history-calendar-day"
                  data-outside={date.slice(0, 7) !== activeMonth || undefined}
                  data-recorded={daySessions.length > 0 || undefined}
                  data-selected={date === activeDate || undefined}
                  aria-pressed={date === activeDate}
                  aria-current={date === today ? 'date' : undefined}
                  aria-controls="history-day-records"
                  aria-label={`${date.replaceAll('-', '.')} ${date === today ? '오늘, ' : ''}내전 ${daySessions.length}회, ${rounds}판${selectionCount ? `, 합칠 기록 ${selectionCount}개 선택됨` : ''}`}
                  onClick={() => selectDate(date)}
                >
                  <span className="history-calendar-date">
                    <time dateTime={date}>{Number(date.slice(-2))}</time>
                    {selectionCount > 0 && <span className="history-calendar-selection">선택</span>}
                  </span>
                  {daySessions.length > 0 && (
                    <span className="history-calendar-record">
                      <strong>내전 {daySessions.length}회</strong>
                      <span>{rounds}판</span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        <div className="history-day-heading" id="history-day-records" aria-live="polite">
          <h2>{activeDate.replaceAll('-', '.')}</h2>
          <p>{loading ? '불러오는 중...' : loadError ? '조회 실패' : `내전 ${visibleDetails.length}회`}</p>
        </div>

        {!loading && details.length >= 2 && (
          <div className="mb-6 px-4 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{ backgroundColor: 'var(--surface)' }}>
            <div>
              <p className="text-sm font-semibold">기록 합치기</p>
              <p className="text-xs mt-0.5" style={{ opacity: 0.55 }}>
                기록을 2개 이상 선택하고 유지할 기준 기록을 지정하세요. 다른 날짜로 이동해도 선택은 유지됩니다.
              </p>
              {mergeSelection.size > 0 && (
                <div className="history-merge-dates">
                  {details.filter(detail => mergeSelection.has(detail.session.id)).map(({ session }) => (
                    <button key={session.id} type="button" onClick={() => selectDate(getDateKey(session.created_at))}>
                      {formatDate(session.created_at)}{mergeTargetId === session.id ? ' · 기준' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {mergeSelection.size > 0 && (
                <button onClick={() => { setMergeSelection(new Set()); setMergeTargetId(null); setMergeError('') }} disabled={merging}
                  className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
                  style={{ backgroundColor: 'var(--canvas)', color: 'var(--ink)' }}>
                  선택 해제
                </button>
              )}
              <button onClick={mergeSessions}
                disabled={merging || mergeSelection.size < 2 || !mergeTargetId || !mergeSelection.has(mergeTargetId)}
                className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-30"
                style={{ backgroundColor: 'var(--ink)', color: 'var(--on-ink)' }}>
                {merging ? '합치는 중...' : `선택 기록 합치기 (${mergeSelection.size})`}
              </button>
            </div>
          </div>
        )}

        {mergeError && (
          <p className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ backgroundColor: 'var(--negative-surface)', color: 'var(--negative-on-surface)' }}>
            {mergeError}
          </p>
        )}

        {loadError && (
          <div className="history-day-empty" role="alert">
            <p>{loadError}</p>
            <button type="button" onClick={() => window.location.reload()}>다시 불러오기</button>
          </div>
        )}

        {!loading && !loadError && details.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-base font-medium mb-2" style={{ opacity: 0.4 }}>아직 기록이 없습니다.</p>
            <a href="/match" className="text-sm underline" style={{ opacity: 0.4 }}>내전 시작하기</a>
          </div>
        )}

        {!loading && details.length > 0 && visibleDetails.length === 0 && (
          <div className="history-day-empty">
            <p>선택한 날짜에는 내전 기록이 없습니다.</p>
            <button type="button" onClick={() => selectDate(recordedDates.at(-1)!)}>최근 기록 보기</button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {visibleDetails.map(({ session, rounds, stats }) => {
            const isOpen = expanded.has(session.id)
            const totalRounds = getDisplayedRoundCount(rounds)
            const showMoney = session.bet_amount > 0

            return (
              <div key={session.id} className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: 'var(--surface)' }}>

                {/* 세션 헤더 */}
                <div className="px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                      <input type="checkbox" checked={mergeSelection.has(session.id)}
                        onChange={() => toggleMergeSelection(session.id)} disabled={merging}
                        className="w-4 h-4 accent-[var(--ink)]" />
                      선택
                    </label>
                    {mergeSelection.has(session.id) && (
                      <label className="flex items-center gap-1 text-xs cursor-pointer" style={{ opacity: 0.7 }}>
                        <input type="radio" name="merge-target" checked={mergeTargetId === session.id}
                          onChange={() => { setMergeTargetId(session.id); setMergeError('') }} disabled={merging}
                          className="accent-[var(--ink)]" />
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
                          step={IS_PORTFOLIO ? 10 : 1000}
                          value={editBetAmount}
                          onChange={event => setEditBetAmount(event.target.value === '' ? '' : Number(event.target.value))}
                          onKeyDown={event => {
                            if (event.key === 'Enter') saveAmount(session.id)
                            if (event.key === 'Escape') cancelAmountEdit()
                          }}
                          autoFocus
                          disabled={savingSessionId === session.id}
                          className="w-28 pl-3 pr-7 py-2 rounded-lg text-sm text-right outline-none disabled:opacity-50"
                          style={{ backgroundColor: 'var(--canvas)', color: 'var(--ink)' }}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ opacity: 0.5 }}>{IS_PORTFOLIO ? 'P' : '원'}</span>
                      </div>
                      <button onClick={() => saveAmount(session.id)} disabled={savingSessionId === session.id || editBetAmount === ''}
                        className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
                        style={{ backgroundColor: 'var(--ink)', color: 'var(--on-ink)' }}>
                        {savingSessionId === session.id ? '저장 중' : '저장'}
                      </button>
                      <button onClick={cancelAmountEdit} disabled={savingSessionId === session.id}
                        className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
                        style={{ backgroundColor: 'var(--canvas)', color: 'var(--ink)' }}>
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full font-medium"
                        style={{ backgroundColor: 'var(--canvas)', color: 'var(--ink)', opacity: 0.75 }}>
                        {session.bet_amount.toLocaleString()}{IS_PORTFOLIO ? 'P' : '원'}
                      </span>
                      <button onClick={() => startAmountEdit(session)} disabled={savingSessionId !== null || merging}
                        className="px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                        style={{ backgroundColor: 'var(--canvas)', color: 'var(--ink)' }}>
                        {IS_PORTFOLIO ? '점수 수정' : '금액 수정'}
                      </button>
                    </div>
                  )}
                </div>

                {editingSessionId === session.id && editError && (
                  <p className="px-4 sm:px-6 pb-3 text-xs" style={{ color: 'var(--negative)' }}>{editError}</p>
                )}

                {/* 세션 상세 */}
                {isOpen && (
                  <div className="px-3 sm:px-6 pb-5 sm:pb-6">
                    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--canvas)' }}>
                      <table className="w-full text-xs sm:text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--surface)' }}>
                            <th className="text-left px-3 sm:px-5 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>이름</th>
                            <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>승</th>
                            <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>패</th>
                            <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>승률</th>
                            <th className="text-center px-2 sm:px-4 py-2.5 sm:py-3 font-semibold" style={{ opacity: 0.5 }}>
                              {IS_PORTFOLIO ? '점수 변동' : '손익'}
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
                              <tr key={s.player.id} style={{ borderTop: i > 0 ? '1px solid var(--surface)' : undefined }}>
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
                                  style={{ color: net > 0 ? 'var(--positive)' : net < 0 ? 'var(--negative)' : 'var(--ink)' }}>
                                  {showMoney
                                    ? `${money > 0 ? '+' : ''}${money.toLocaleString()}${IS_PORTFOLIO ? 'P' : '원'}`
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

        <section className="history-attendance" aria-labelledby="history-attendance-title" aria-busy={loading}>
          <header className="history-attendance-header">
            <div>
              <h2 id="history-attendance-title">{calendarYear}년 {calendarMonth}월 참여율</h2>
              <p>참여일수 ÷ 내전 진행일수 · 승패가 확정된 경기 기준</p>
            </div>
            {!loading && !loadError && <span>내전 {attendance.totalDays}일 기준</span>}
          </header>
          {loading ? (
            <p className="history-attendance-empty" role="status">참여율을 불러오는 중...</p>
          ) : loadError ? (
            <p className="history-attendance-empty">기록을 불러온 후 참여율을 확인할 수 있습니다.</p>
          ) : attendance.totalDays === 0 ? (
            <p className="history-attendance-empty">이달에는 집계할 완료 경기가 없습니다.</p>
          ) : (
            <>
              <div className="history-attendance-scroll">
                <table className="history-attendance-table">
                  <caption className="sr-only">{calendarYear}년 {calendarMonth}월 등록 선수별 내전 참여율</caption>
                  <thead>
                    <tr>
                      <th scope="col">선수</th>
                      <th scope="col">참여일수</th>
                      <th scope="col">참여율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.rows.map(({ player, days, rate }) => (
                      <tr key={player.id}>
                        <th scope="row">{player.real_name}</th>
                        <td>{days}<span> / {attendance.totalDays}일</span></td>
                        <td>
                          <div className="history-attendance-rate">
                            <span className="history-attendance-track" aria-hidden="true">
                              <span style={{ width: `${rate ?? 0}%` }} />
                            </span>
                            <strong>{rate}%</strong>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="history-attendance-note">같은 날 여러 기록에 참여해도 1일로 계산합니다. 날짜는 달력과 동일하게 한국 시간 기준입니다.</p>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
