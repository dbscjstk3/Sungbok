import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.RIOT_API_KEY ?? ''
const REGION = 'asia'
const PLATFORM = 'kr'
const RIOT_TIMEOUT_MS = 8_000
const DATA_DRAGON_TIMEOUT_MS = 8_000
const CHAMPION_MAP_TTL_MS = 24 * 60 * 60 * 1000

let championMapPromise: Promise<Map<number, string>> | null = null
let championMapExpiresAt = 0

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = RIOT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
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

function riotError(status: number, notFoundMessage: string) {
  if (status === 404) return NextResponse.json({ error: notFoundMessage }, { status: 404 })
  if (status === 401 || status === 403) {
    return NextResponse.json({ error: 'Riot API 키가 만료되었거나 유효하지 않습니다.' }, { status })
  }
  if (status === 429) {
    return NextResponse.json({ error: 'Riot API 호출 제한에 도달했습니다.' }, { status: 429 })
  }
  return NextResponse.json({ error: `Riot API 요청에 실패했습니다. (HTTP ${status})` }, { status })
}

export async function GET(req: NextRequest) {
  if (!API_KEY) return NextResponse.json({ error: 'RIOT_API_KEY가 설정되지 않았습니다.' }, { status: 500 })

  const summonerName = req.nextUrl.searchParams.get('summoner')
  if (!summonerName) return NextResponse.json({ error: 'summoner 파라미터가 필요합니다.' }, { status: 400 })

  const [gameName, tagLine] = (summonerName.includes('#')
    ? summonerName.split('#', 2)
    : [summonerName, 'KR1']).map(value => value.trim())
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: '소환사명 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    // 1. Account API로 PUUID 조회
    const accountRes = await fetchWithTimeout(
      `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { 'X-Riot-Token': API_KEY } }
    )
    if (!accountRes.ok) return riotError(accountRes.status, `${summonerName} 계정을 찾을 수 없습니다.`)
    const { puuid } = await accountRes.json()

    // 2. Spectator API로 현재 게임 조회
    const gameRes = await fetchWithTimeout(
      `https://${PLATFORM}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`,
      { headers: { 'X-Riot-Token': API_KEY } }
    )
    if (!gameRes.ok) return riotError(gameRes.status, '진행 중인 게임을 찾을 수 없습니다.')
    const game = await gameRes.json()

    // 3. Data Dragon으로 챔피언 ID → 이름 변환
    const champMap = await getChampionMap()
    const participants = (game.participants as { riotId: string; championId: number }[]).map(p => ({
      riotId: p.riotId,
      championId: p.championId,
      championName: champMap.get(p.championId) ?? String(p.championId),
    }))

    return NextResponse.json({ participants })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    console.error('Riot 관전 API 요청 실패:', error)
    return NextResponse.json(
      { error: timedOut ? 'Riot API 응답 시간이 초과되었습니다.' : 'Riot API 요청 중 서버 오류가 발생했습니다.' },
      { status: timedOut ? 504 : 502 }
    )
  }
}
