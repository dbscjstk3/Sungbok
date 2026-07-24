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
  created_at?: string
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return '알 수 없는 오류가 발생했습니다.'
}

function normalizeRiotId(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s*#\s*/, '#')
}

interface SpectatorData {
  participants: { riotId: string; championName: string }[]
}

type ChampionFetchResult =
  | { status: 'success'; count: number }
  | { status: 'not_found' | 'busy' }
  | { status: 'rate_limited' | 'fatal' | 'error'; message: string }

class SpectatorRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'SpectatorRequestError'
  }
}

async function requestSpectator(summonerNames: string[]): Promise<SpectatorData> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch('/api/spectator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summoners: summonerNames }),
      signal: controller.signal,
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new SpectatorRequestError(response.status, body?.error ?? `HTTP ${response.status}`)
    }
    return body as SpectatorData
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SpectatorRequestError(504, '챔피언 조회 응답 시간이 초과되었습니다.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
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
  const [saveError, setSaveError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [showRoulette, setShowRoulette] = useState(false)
  const [rouletteKey, setRouletteKey] = useState(0)
  const [assignments, setAssignments] = useState<Map<string, 1 | 2>>(new Map())
  const [champions, setChampions] = useState<Map<string, string>>(new Map())
  const [championLoading, setChampionLoading] = useState(false)
  const [nextFetchIn, setNextFetchIn] = useState<number | null>(null)
  const [autoFetchMessage, setAutoFetchMessage] = useState('')
  const sessionPlayersRef = useRef<Player[]>([])
  const assignmentsRef = useRef<Map<string, 1 | 2>>(new Map())
  const restoredRef = useRef(false)
  const savingRef = useRef(false)
  const championFetchRef = useRef(false)
  const autoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        .select('id, session_id, team1_ids, team2_ids, winner_team, created_at')
        .eq('session_id', stored.sessionId)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (error) {
            console.error('내전 세션 복원 실패:', error)
            setSaveError(`기존 내전을 불러오지 못했습니다. ${getErrorMessage(error)}`)
            return
          }
          const fetchedRounds = (data as Round[]) ?? []
          const fixedTeam1Ids = stored.fixedTeam1Ids ?? []
          const fixedTeam2Ids = stored.fixedTeam2Ids ?? []
          const allPlayersWereFixed = fixedTeam1Ids.length + fixedTeam2Ids.length === pool.length
          const savedTeam1Ids = stored.team1Ids.length > 0
            ? stored.team1Ids
            : allPlayersWereFixed ? fixedTeam1Ids : []
          const savedTeam2Ids = stored.team2Ids.length > 0
            ? stored.team2Ids
            : allPlayersWereFixed ? fixedTeam2Ids : []
          const t1 = savedTeam1Ids.map(id => pool.find(p => p.id === id)).filter(Boolean) as Player[]
          const t2 = savedTeam2Ids.map(id => pool.find(p => p.id === id)).filter(Boolean) as Player[]
          const restoredAssignments = new Map<string, 1 | 2>([
            ...fixedTeam1Ids.map(id => [id, 1] as [string, 1 | 2]),
            ...fixedTeam2Ids.map(id => [id, 2] as [string, 1 | 2]),
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
      const pool = sessionPlayersRef.current
      const asgn = assignmentsRef.current
      const fixed1 = pool.filter(p => asgn.get(p.id) === 1)
      const fixed2 = pool.filter(p => asgn.get(p.id) === 2)
      const roulettePool = pool.filter(p => !asgn.has(p.id))
      const rouletteTeam1Size = Math.max(0, pool.length / 2 - fixed1.length)
      const rouletteTeam1Names: string[] = (e.data.rankings ?? []).slice(0, rouletteTeam1Size)
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
    if (!canStart || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    setSaveMessage('')
    const pool = allPlayers.filter(p => selected.has(p.id))
    const asgn = assignments
    const fixed1 = pool.filter(p => asgn.get(p.id) === 1)
    const fixed2 = pool.filter(p => asgn.get(p.id) === 2)
    const roulettePool = pool.filter(p => !asgn.has(p.id))
    const teamSize = pool.length / 2
    const directTeam1 = roulettePool.length === 0
      ? fixed1
      : fixed1.length === teamSize
        ? fixed1
        : fixed2.length === teamSize
          ? [...fixed1, ...roulettePool]
          : null
    const directTeam2 = roulettePool.length === 0
      ? fixed2
      : fixed1.length === teamSize
        ? [...fixed2, ...roulettePool]
        : fixed2.length === teamSize
          ? fixed2
          : null

    try {
      let sid: string
      if (IS_MOCK) {
        sid = 'mock-session-' + Date.now()
      } else {
        const { data, error } = await insforge.database.from('sessions').insert([{
          bet_amount: betAmount === '' ? 0 : betAmount,
        }]).select()
        if (error) {
          console.error('내전 세션 생성 실패:', error)
          setSaveError(`내전을 생성하지 못했습니다. ${getErrorMessage(error)}`)
          return
        }
        if (!data?.[0]) {
          setSaveError('내전 생성 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
          return
        }
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
        team1Ids: directTeam1?.map(p => p.id) ?? [],
        team2Ids: directTeam2?.map(p => p.id) ?? [],
        betAmount: betAmount === '' ? 0 : betAmount,
        fixedTeam1Ids: fixed1.map(p => p.id),
        fixedTeam2Ids: fixed2.map(p => p.id),
      })

      if (directTeam1 && directTeam2) {
        setAutoFetchMessage('')
        setTeam1(directTeam1)
        setTeam2(directTeam2)
        setSaveMessage(roulettePool.length === 0
          ? '내전을 생성했습니다. 고정된 팀으로 첫 판을 진행합니다.'
          : '내전을 생성했습니다. 남은 자리를 자동으로 채웠습니다.')
      } else {
        openRoulette()
      }
    } catch (error) {
      console.error('내전 세션 생성 중 예외 발생:', error)
      setSaveError(`네트워크 오류로 내전을 생성하지 못했습니다. ${getErrorMessage(error)}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function clearAutoFetch() {
    autoTimersRef.current.forEach(t => clearTimeout(t))
    autoTimersRef.current = []
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    countdownIntervalRef.current = null
    setNextFetchIn(null)
  }

  async function fetchChampions(silent = false): Promise<ChampionFetchResult> {
    if (championFetchRef.current) return { status: 'busy' }
    const pool = sessionPlayersRef.current
    const candidates = pool.filter(p => p.summoner_name)
    if (candidates.length === 0) {
      if (!silent) alert('소환사명이 등록된 선수가 없습니다.')
      return { status: 'fatal', message: '소환사명이 등록된 선수가 없습니다.' }
    }
    championFetchRef.current = true
    setChampionLoading(true)
    try {
      const spectatorData = await requestSpectator(
        candidates.map(player => player.summoner_name!)
      )

      const map = new Map<string, string>()
      for (const p of spectatorData.participants) {
        const participantId = normalizeRiotId(p.riotId)
        const participantName = participantId.split('#')[0]
        const matched = pool.find(pl => {
          if (!pl.summoner_name) return false
          const registeredId = normalizeRiotId(pl.summoner_name)
          return registeredId === participantId || registeredId.split('#')[0] === participantName
        })
        if (matched) map.set(matched.id, p.championName)
      }
      setChampions(map)
      setAutoFetchMessage(map.size > 0 ? `챔피언 ${map.size}명을 자동으로 확인했습니다.` : '')
      return map.size > 0
        ? { status: 'success', count: map.size }
        : { status: 'not_found' }
    } catch (error) {
      const message = getErrorMessage(error)
      const result: ChampionFetchResult = error instanceof SpectatorRequestError
        ? error.status === 404
          ? { status: 'not_found' }
          : error.status === 401 || error.status === 403
            ? { status: 'fatal', message: error.message }
            : error.status === 429
              ? { status: 'rate_limited', message: error.message }
              : { status: 'error', message: error.message }
        : { status: 'error', message }
      if (!silent) {
        alert(result.status === 'not_found' ? '진행 중인 게임을 찾을 수 없습니다.' : `챔피언 정보를 가져오지 못했습니다. ${message}`)
      }
      return result
    } finally {
      championFetchRef.current = false
      setChampionLoading(false)
    }
  }

  useEffect(() => {
    if (phase !== 'playing' || showRoulette || team1.length === 0 || champions.size > 0) return
    clearAutoFetch()

    const FIRST_DELAY = 6 * 60
    const RETRY_DELAY = 2 * 60
    const RATE_LIMIT_RETRY_DELAY = 5 * 60
    let nextAttemptAt = Date.now() + FIRST_DELAY * 1000
    let cancelled = false

    const tick = () => {
      setNextFetchIn(Math.max(0, Math.ceil((nextAttemptAt - Date.now()) / 1000)))
    }

    const schedule = (delay: number) => {
      nextAttemptAt = Date.now() + delay * 1000
      tick()
      const timer = setTimeout(async () => {
        if (cancelled) return
        setAutoFetchMessage('자동으로 챔피언 정보를 확인하는 중입니다...')
        const result = await fetchChampions(true)
        if (cancelled) return
        if (result.status === 'success') {
          clearAutoFetch()
          return
        }
        if (result.status === 'fatal') {
          setAutoFetchMessage(result.message)
          clearAutoFetch()
          return
        }
        if (result.status === 'rate_limited') {
          setAutoFetchMessage(`${result.message} 5분 후 자동으로 다시 확인합니다.`)
          schedule(RATE_LIMIT_RETRY_DELAY)
          return
        }
        if (result.status === 'busy') {
          schedule(30)
          return
        }
        if (result.status === 'error') {
          setAutoFetchMessage(`${result.message} 2분 후 자동으로 다시 확인합니다.`)
          schedule(RETRY_DELAY)
          return
        }
        setAutoFetchMessage('진행 중인 게임을 찾지 못했습니다. 2분 후 자동으로 다시 확인합니다.')
        schedule(RETRY_DELAY)
      }, delay * 1000)
      autoTimersRef.current = [timer]
    }

    countdownIntervalRef.current = setInterval(tick, 1000)
    schedule(FIRST_DELAY)

    return () => {
      cancelled = true
      clearAutoFetch()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, showRoulette, team1.length, champions.size])

  function swapTeams() {
    if (savingRef.current || team1.length === 0 || team2.length === 0) return

    const nextTeam1 = team2
    const nextTeam2 = team1
    const nextAssignments = new Map<string, 1 | 2>()
    assignmentsRef.current.forEach((team, playerId) => {
      nextAssignments.set(playerId, team === 1 ? 2 : 1)
    })

    setTeam1(nextTeam1)
    setTeam2(nextTeam2)
    setAssignments(nextAssignments)
    assignmentsRef.current = nextAssignments
    setSaveError('')
    setSaveMessage('1팀과 2팀 위치를 바꿨습니다.')

    const storedRaw = localStorage.getItem(STORAGE_KEY)
    if (storedRaw) {
      try {
        const previous: StoredSession = JSON.parse(storedRaw)
        saveSession({
          ...previous,
          team1Ids: nextTeam1.map(player => player.id),
          team2Ids: nextTeam2.map(player => player.id),
          fixedTeam1Ids: previous.fixedTeam2Ids ?? [],
          fixedTeam2Ids: previous.fixedTeam1Ids ?? [],
        })
      } catch {
        setSaveError('팀 위치는 바뀌었지만 새로고침 복구 정보를 저장하지 못했습니다.')
      }
    }
  }

  function openRoulette() {
    setRouletteKey(k => k + 1)
    setShowRoulette(true)
  }

  function swapFixedAssignments(source: Map<string, 1 | 2>) {
    const swapped = new Map<string, 1 | 2>()
    source.forEach((team, playerId) => {
      swapped.set(playerId, team === 1 ? 2 : 1)
    })
    return swapped
  }

  async function recordWin(winner: 1 | 2) {
    if (!sessionId || savingRef.current) return
    if (team1.length === 0 || team2.length === 0 || team1.length !== team2.length) {
      setSaveError('팀 구성이 올바르지 않습니다. 팀을 다시 배정한 뒤 시도해 주세요.')
      return
    }

    savingRef.current = true
    setSaving(true)
    setSaveError('')
    setSaveMessage('')

    const t1Champs = team1.map(p => champions.get(p.id) ?? '')
    const t2Champs = team2.map(p => champions.get(p.id) ?? '')
    const hasChamps = t1Champs.some(c => c) || t2Champs.some(c => c)

    try {
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
        const { data, error } = await insforge.database.from('rounds').insert([{
          session_id: sessionId,
          team1_ids: team1.map(p => p.id),
          team2_ids: team2.map(p => p.id),
          winner_team: winner,
          ...(hasChamps ? { team1_champions: t1Champs, team2_champions: t2Champs } : {}),
        }]).select()

        if (error) {
          console.error('라운드 저장 실패:', error)
          setSaveError(`결과를 저장하지 못했습니다. ${getErrorMessage(error)}`)
          return
        }
        if (!data?.[0]) {
          console.error('라운드 저장 응답에 데이터가 없습니다.')
          setSaveError('저장 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
          return
        }
        newRound = data[0] as Round
      }

      setChampions(new Map())
      setAutoFetchMessage('')
      const newRounds = [...rounds, newRound]
      setRounds(newRounds)
      setStats(computeStats(sessionPlayersRef.current, newRounds))

      const pool = sessionPlayersRef.current
      const nextAssignments = swapFixedAssignments(assignmentsRef.current)
      const hasFixedPlayers = nextAssignments.size > 0
      const hasRoulettePlayers = pool.some(p => !nextAssignments.has(p.id))
      const nextFixedTeam1Ids = pool.filter(p => nextAssignments.get(p.id) === 1).map(p => p.id)
      const nextFixedTeam2Ids = pool.filter(p => nextAssignments.get(p.id) === 2).map(p => p.id)
      const nextTeam1 = hasRoulettePlayers ? team1 : team2
      const nextTeam2 = hasRoulettePlayers ? team2 : team1

      setAssignments(nextAssignments)
      assignmentsRef.current = nextAssignments

      try {
        const storedRaw = localStorage.getItem(STORAGE_KEY)
        if (storedRaw) {
          const previous: StoredSession = JSON.parse(storedRaw)
          saveSession({
            ...previous,
            fixedTeam1Ids: nextFixedTeam1Ids,
            fixedTeam2Ids: nextFixedTeam2Ids,
            team1Ids: nextTeam1.map(player => player.id),
            team2Ids: nextTeam2.map(player => player.id),
          })
        }
      } catch (storageError) {
        console.error('고정 선수 진영 변경 상태 저장 실패:', storageError)
        setSaveError('결과는 저장했지만 고정 선수 진영의 복구 정보를 저장하지 못했습니다.')
      }

      if (hasRoulettePlayers) {
        setSaveMessage(hasFixedPlayers
          ? `${newRounds.length}번째 판 결과를 저장했습니다. 고정 선수의 진영을 바꿨습니다.`
          : `${newRounds.length}번째 판 결과를 저장했습니다.`)
        openRoulette()
      } else {
        setTeam1(nextTeam1)
        setTeam2(nextTeam2)
        setSaveMessage(`${newRounds.length}번째 판 결과를 저장하고 양 팀의 진영을 바꿨습니다.`)
      }
    } catch (error) {
      console.error('라운드 저장 중 예외 발생:', error)
      setSaveError(`네트워크 오류로 결과를 저장하지 못했습니다. ${getErrorMessage(error)}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function undoLastRound() {
    if (!sessionId || rounds.length === 0 || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    setSaveMessage('')
    const last = rounds[rounds.length - 1]
    try {
      if (!IS_MOCK) {
        const { error } = await insforge.database.from('rounds').delete().eq('id', last.id)
        if (error) {
          console.error('마지막 판 취소 실패:', error)
          setShowRoulette(false)
          setSaveError(`마지막 판을 취소하지 못했습니다. ${getErrorMessage(error)}`)
          return
        }
      }
      const pool = sessionPlayersRef.current
      const t1 = last.team1_ids.map(id => pool.find(p => p.id === id)).filter(Boolean) as Player[]
      const t2 = last.team2_ids.map(id => pool.find(p => p.id === id)).filter(Boolean) as Player[]
      const restoredAssignments = new Map<string, 1 | 2>()
      assignmentsRef.current.forEach((currentTeam, playerId) => {
        if (last.team1_ids.includes(playerId)) {
          restoredAssignments.set(playerId, 1)
        } else if (last.team2_ids.includes(playerId)) {
          restoredAssignments.set(playerId, 2)
        } else {
          restoredAssignments.set(playerId, currentTeam)
        }
      })
      setTeam1(t1)
      setTeam2(t2)
      setAssignments(restoredAssignments)
      assignmentsRef.current = restoredAssignments
      setAutoFetchMessage('')
      setShowRoulette(false)
      const newRounds = rounds.slice(0, -1)
      setRounds(newRounds)
      setStats(computeStats(pool, newRounds))

      try {
        const storedRaw = localStorage.getItem(STORAGE_KEY)
        let previous: StoredSession | null = null
        if (storedRaw) {
          try { previous = JSON.parse(storedRaw) as StoredSession } catch { }
        }
        const fixedTeam1Ids = pool.filter(player => restoredAssignments.get(player.id) === 1).map(player => player.id)
        const fixedTeam2Ids = pool.filter(player => restoredAssignments.get(player.id) === 2).map(player => player.id)
        saveSession({
          ...(previous ?? {}),
          phase: 'playing',
          sessionId,
          sessionPlayerIds: pool.map(player => player.id),
          betAmount: betAmount === '' ? 0 : betAmount,
          fixedTeam1Ids,
          fixedTeam2Ids,
          team1Ids: t1.map(player => player.id),
          team2Ids: t2.map(player => player.id),
        })
        setSaveMessage('마지막 판 결과를 취소했습니다.')
      } catch (storageError) {
        console.error('마지막 판 취소 상태 저장 실패:', storageError)
        setSaveError('마지막 판은 취소했지만 새로고침 복구 정보를 저장하지 못했습니다.')
      }
    } catch (error) {
      console.error('마지막 판 취소 중 예외 발생:', error)
      setShowRoulette(false)
      setSaveError(`네트워크 오류로 마지막 판을 취소하지 못했습니다. ${getErrorMessage(error)}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function endSession() {
    if (!sessionId || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    setSaveMessage('')
    try {
      if (!IS_MOCK) {
        const { error } = await insforge.database.from('sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
        if (error) {
          console.error('내전 종료 실패:', error)
          setSaveError(`내전을 종료하지 못했습니다. ${getErrorMessage(error)}`)
          return
        }
      }
      setStats(computeStats(sessionPlayersRef.current, rounds))
      setPhase('ended')
      clearSession()
    } catch (error) {
      console.error('내전 종료 중 예외 발생:', error)
      setSaveError(`네트워크 오류로 내전을 종료하지 못했습니다. ${getErrorMessage(error)}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function reset() {
    savingRef.current = false
    setSaving(false)
    setSaveError('')
    setSaveMessage('')
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
    setAutoFetchMessage('')
    setShowRoulette(false)
    clearSession()
  }

  const roulettePool = sessionPlayers.filter(p => !assignments.has(p.id))
  const fixedTeam1Count = sessionPlayers.filter(p => assignments.get(p.id) === 1).length
  const rouletteTeamSize = Math.max(0, sessionPlayers.length / 2 - fixedTeam1Count)
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
                disabled={saving}
                className="text-sm px-4 py-2 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#f87171' }}
              >
                {saving ? '처리 중...' : '전판 취소'}
              </button>
            )}
            <button
              onClick={() => setShowRoulette(false)}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
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

        {saveError && (
          <div role="alert" className="mb-4 px-4 py-3 rounded-xl text-sm flex items-start justify-between gap-3"
            style={{ backgroundColor: '#f8d7da', color: '#842029' }}>
            <span>{saveError}</span>
            <button onClick={() => setSaveError('')} className="shrink-0 font-bold" aria-label="오류 메시지 닫기">×</button>
          </div>
        )}

        {saveMessage && (
          <div role="status" className="mb-4 px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: '#d1e7dd', color: '#0f5132' }}>
            {saveMessage}
          </div>
        )}

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
          const allFixed = remaining === 0
          const overCapacity = f1.length > teamSize || f2.length > teamSize
          const canConfirm = !overCapacity
          const rouletteToTeam1 = teamSize - f1.length
          const rouletteToTeam2 = teamSize - f2.length

          return (
            <div>
              <button onClick={() => setPhase('select')} disabled={saving}
                className="text-sm mb-6 transition-opacity hover:opacity-60 disabled:opacity-30" style={{ opacity: 0.5 }}>
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
                            <button key={team} onClick={() => toggleAssignment(p.id, team)} disabled={saving}
                              className="px-3 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
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
                <span className="px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#1e3a8a', color: '#fff' }}>1팀 고정 {f1.length}/{teamSize}명</span>
                <span className="px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#991b1b', color: '#fff' }}>2팀 고정 {f2.length}/{teamSize}명</span>
                <span className="px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>룰렛 {remaining}명</span>
              </div>

              {!allFixed && !overCapacity && (
                <p className="text-xs mb-4" style={{ opacity: 0.55 }}>
                  룰렛 결과에서 1팀 {rouletteToTeam1}명, 2팀 {rouletteToTeam2}명을 배정합니다.
                </p>
              )}

              {overCapacity && (
                <p className="text-xs mb-4" style={{ color: '#c0392b' }}>
                  한 팀에는 최대 {teamSize}명까지만 고정할 수 있습니다.
                </p>
              )}

              <button onClick={startSession} disabled={!canConfirm || saving}
                className="px-10 py-4 rounded-full text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
                style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
                {saving ? '내전 생성 중...' : allFixed ? '팀 확정하기' : `룰렛으로 나머지 ${remaining}명 배정`}
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
                  <button onClick={() => { if (window.confirm('마지막 판 결과를 취소할까요?')) undoLastRound() }} disabled={saving}
                    className="px-5 py-2 text-sm font-medium rounded-full transition-opacity hover:opacity-70 disabled:opacity-40"
                    style={{ backgroundColor: '#DEE0E2', color: '#c0392b' }}>
                    {saving ? '처리 중...' : '마지막 판 취소'}
                  </button>
                )}
                <button onClick={endSession} disabled={saving}
                  className="px-5 py-2 text-sm font-medium rounded-full transition-opacity hover:opacity-70 disabled:opacity-40"
                  style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
                  {saving ? '처리 중...' : '내전 종료'}
                </button>
              </div>
            </div>

            {team1.length > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 sm:gap-8 mb-6">
                {[{ team: team1, num: 1 }, { team: team2, num: 2 }].map(({ team, num }) => (
                  <div key={num} className={`row-start-1 rounded-2xl p-4 sm:p-6 ${num === 1 ? 'col-start-1' : 'col-start-3'}`}
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
                <button onClick={swapTeams} disabled={saving || team1.length === 0 || team2.length === 0}
                  aria-label="1팀과 2팀 위치 변경" title="1팀과 2팀 위치 변경"
                  className="col-start-2 row-start-1 h-11 px-3 sm:px-5 rounded-full whitespace-nowrap text-xs sm:text-sm font-bold transition-opacity hover:opacity-70 disabled:opacity-40"
                  style={{ backgroundColor: '#DEE0E2', color: '#202020' }}>
                  1팀 ↔ 2팀
                </button>
              </div>
            )}

            <div className="flex gap-3 mb-4">
              <button onClick={openRoulette} disabled={saving}
                className="flex-1 py-3 rounded-2xl text-sm font-bold transition-opacity hover:opacity-85 disabled:opacity-40"
                style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
                팀 다시 섞기
              </button>
              <button onClick={() => fetchChampions()} disabled={championLoading || saving}
                className="py-3 px-5 rounded-2xl text-sm font-bold transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{ backgroundColor: 'green', color: 'white' }}>
                {championLoading ? '가져오는 중...' : champions.size > 0 ? '챔피언 다시 가져오기' : '챔피언 가져오기'}
              </button>
            </div>

            {nextFetchIn !== null && (
              <p className="text-xs text-center mb-3" style={{ opacity: 0.4 }}>
                {nextFetchIn >= 60
                  ? `${Math.floor(nextFetchIn / 60)}분 ${nextFetchIn % 60}초 후 자동으로 챔피언을 가져옵니다`
                  : `${nextFetchIn}초 후 자동으로 챔피언을 가져옵니다`}
              </p>
            )}

            {autoFetchMessage && (
              <p className="text-xs text-center mb-3" style={{ opacity: 0.55 }}>
                {autoFetchMessage}
              </p>
            )}

            <div className="flex gap-3 mb-12">
              <button onClick={() => recordWin(1)} disabled={saving || team1.length === 0}
                className="flex-1 py-4 rounded-2xl text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
                style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}>
                {saving ? '저장 중...' : '1팀 승리'}
              </button>
              <button onClick={() => recordWin(2)} disabled={saving || team2.length === 0}
                className="flex-1 py-4 rounded-2xl text-base font-bold transition-opacity hover:opacity-85 disabled:opacity-30"
                style={{ backgroundColor: '#991b1b', color: '#ffffff' }}>
                {saving ? '저장 중...' : '2팀 승리'}
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
