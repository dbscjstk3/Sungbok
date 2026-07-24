import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.RIOT_API_KEY ?? ''
const REGION = 'asia'
const PLATFORM = 'kr'
const RIOT_TIMEOUT_MS = 8_000
const DATA_DRAGON_TIMEOUT_MS = 8_000
const CHAMPION_MAP_TTL_MS = 24 * 60 * 60 * 1000
const ACCOUNT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_SUMMONERS = 10
const LOOKUP_BATCH_SIZE = 2

let championMapPromise: Promise<Map<number, string>> | null = null
let championMapExpiresAt = 0
const accountCache = new Map<string, { puuid: string; expiresAt: number }>()

class RiotRequestError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'RiotRequestError'
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = RIOT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function parseRiotId(value: string) {
  const [gameName, tagLine] = (value.includes('#')
    ? value.split('#', 2)
    : [value, 'KR1']).map(part => part.trim())

  if (!gameName || !tagLine) {
    throw new RiotRequestError(400, '소환사명 형식이 올바르지 않습니다.')
  }

  return { gameName, tagLine }
}

function accountCacheKey(gameName: string, tagLine: string) {
  return `${gameName.toLocaleLowerCase()}#${tagLine.toLocaleLowerCase()}`
}

async function getPuuid(summonerName: string) {
  const { gameName, tagLine } = parseRiotId(summonerName)
  const cacheKey = accountCacheKey(gameName, tagLine)
  const cached = accountCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.puuid
  if (cached) accountCache.delete(cacheKey)

  const response = await fetchWithTimeout(
    `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    { headers: { 'X-Riot-Token': API_KEY } }
  )
  if (!response.ok) {
    throw new RiotRequestError(
      response.status,
      response.status === 404
        ? `${summonerName} 계정을 찾을 수 없습니다.`
        : riotErrorMessage(response.status)
    )
  }

  const { puuid } = await response.json() as { puuid?: string }
  if (!puuid) throw new RiotRequestError(502, 'Riot 계정 응답에서 PUUID를 확인할 수 없습니다.')

  accountCache.set(cacheKey, {
    puuid,
    expiresAt: Date.now() + ACCOUNT_CACHE_TTL_MS,
  })
  return puuid
}

async function getActiveGame(summonerName: string) {
  const puuid = await getPuuid(summonerName)
  const response = await fetchWithTimeout(
    `https://${PLATFORM}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`,
    { headers: { 'X-Riot-Token': API_KEY } }
  )
  if (!response.ok) {
    throw new RiotRequestError(
      response.status,
      response.status === 404
        ? '진행 중인 게임을 찾을 수 없습니다.'
        : riotErrorMessage(response.status)
    )
  }
  return response.json()
}

async function findActiveGame(summonerNames: string[]) {
  let lastError: RiotRequestError | null = null

  for (let i = 0; i < summonerNames.length; i += LOOKUP_BATCH_SIZE) {
    const batch = summonerNames.slice(i, i + LOOKUP_BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(getActiveGame))

    const activeGame = results.find(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof getActiveGame>>> =>
        result.status === 'fulfilled'
    )
    if (activeGame) return activeGame.value

    for (const result of results) {
      if (result.status !== 'rejected' || !(result.reason instanceof RiotRequestError)) continue
      lastError = result.reason
      if ([401, 403, 429].includes(result.reason.status)) throw result.reason
    }
  }

  if (lastError && lastError.status !== 404) throw lastError
  throw new RiotRequestError(404, '진행 중인 게임을 찾을 수 없습니다.')
}

async function getChampionMap(): Promise<Map<number, string>> {
  if (!championMapPromise || Date.now() >= championMapExpiresAt) {
    championMapExpiresAt = Number.POSITIVE_INFINITY
    championMapPromise = (async () => {
      const versionsRes = await fetchWithTimeout(
        'https://ddragon.leagueoflegends.com/api/versions.json',
        { next: { revalidate: 86_400 } } as RequestInit,
        DATA_DRAGON_TIMEOUT_MS
      )
      if (!versionsRes.ok) throw new Error(`Data Dragon versions HTTP ${versionsRes.status}`)
      const versions = await versionsRes.json() as string[]
      if (!versions[0]) throw new Error('Data Dragon 버전을 확인할 수 없습니다.')

      const champRes = await fetchWithTimeout(
        `https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/ko_KR/champion.json`,
        { next: { revalidate: 86_400 } } as RequestInit,
        DATA_DRAGON_TIMEOUT_MS
      )
      if (!champRes.ok) throw new Error(`Data Dragon champions HTTP ${champRes.status}`)
      const champData = await champRes.json()
      const map = new Map<number, string>()
      for (const champ of Object.values(champData.data) as { key: string; name: string }[]) {
        map.set(Number(champ.key), champ.name)
      }
      championMapExpiresAt = Date.now() + CHAMPION_MAP_TTL_MS
      return map
    })().catch(error => {
      championMapPromise = null
      championMapExpiresAt = 0
      throw error
    })
  }
  return championMapPromise
}

function riotErrorMessage(status: number) {
  if (status === 401 || status === 403) return 'Riot API 키가 만료되었거나 유효하지 않습니다.'
  if (status === 429) return 'Riot API 호출 제한에 도달했습니다.'
  return `Riot API 요청에 실패했습니다. (HTTP ${status})`
}

function errorResponse(error: unknown) {
  if (error instanceof RiotRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  const timedOut = error instanceof Error && error.name === 'AbortError'
  console.error('Riot 관전 API 요청 실패:', error)
  return NextResponse.json(
    { error: timedOut ? 'Riot API 응답 시간이 초과되었습니다.' : 'Riot API 요청 중 서버 오류가 발생했습니다.' },
    { status: timedOut ? 504 : 502 }
  )
}

async function spectatorResponse(summonerNames: string[]) {
  if (!API_KEY) return NextResponse.json({ error: 'RIOT_API_KEY가 설정되지 않았습니다.' }, { status: 500 })

  const uniqueNames = [...new Set(summonerNames.map(name => name.trim()).filter(Boolean))]
    .slice(0, MAX_SUMMONERS)
  if (uniqueNames.length === 0) {
    return NextResponse.json({ error: '조회할 소환사명이 필요합니다.' }, { status: 400 })
  }

  try {
    const game = await findActiveGame(uniqueNames)
    const champMap = await getChampionMap()
    const participants = (game.participants as { riotId: string; championId: number }[]).map(p => ({
      riotId: p.riotId,
      championId: p.championId,
      championName: champMap.get(p.championId) ?? String(p.championId),
    }))
    return NextResponse.json({ participants })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function GET(req: NextRequest) {
  return spectatorResponse([req.nextUrl.searchParams.get('summoner') ?? ''])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { summoners?: unknown }
    if (!Array.isArray(body.summoners) || !body.summoners.every(name => typeof name === 'string')) {
      return NextResponse.json({ error: 'summoners는 문자열 배열이어야 합니다.' }, { status: 400 })
    }
    return spectatorResponse(body.summoners)
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 })
  }
}
