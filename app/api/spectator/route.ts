import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.RIOT_API_KEY ?? ''
const REGION = 'asia'
const PLATFORM = 'kr'

async function getChampionMap(): Promise<Map<number, string>> {
  const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  const versions = await versionsRes.json()
  const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/ko_KR/champion.json`)
  const champData = await champRes.json()
  const map = new Map<number, string>()
  for (const champ of Object.values(champData.data) as { key: string; name: string }[]) {
    map.set(Number(champ.key), champ.name)
  }
  return map
}

export async function GET(req: NextRequest) {
  if (!API_KEY) return NextResponse.json({ error: 'RIOT_API_KEY가 설정되지 않았습니다.' }, { status: 500 })

  const summonerName = req.nextUrl.searchParams.get('summoner')
  if (!summonerName) return NextResponse.json({ error: 'summoner 파라미터가 필요합니다.' }, { status: 400 })

  const [gameName, tagLine] = summonerName.includes('#')
    ? summonerName.split('#')
    : [summonerName, 'KR1']

  // 1. Account API로 PUUID 조회
  const accountRes = await fetch(
    `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    { headers: { 'X-Riot-Token': API_KEY } }
  )
  if (!accountRes.ok) return NextResponse.json({ error: `${summonerName} 계정을 찾을 수 없습니다.` }, { status: 404 })
  const { puuid } = await accountRes.json()

  // 2. Spectator API로 현재 게임 조회
  const gameRes = await fetch(
    `https://${PLATFORM}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`,
    { headers: { 'X-Riot-Token': API_KEY } }
  )
  if (!gameRes.ok) return NextResponse.json({ error: '진행 중인 게임을 찾을 수 없습니다.' }, { status: 404 })
  const game = await gameRes.json()

  // 3. Data Dragon으로 챔피언 ID → 이름 변환
  const champMap = await getChampionMap()
  const participants = (game.participants as { riotId: string; championId: number }[]).map(p => ({
    riotId: p.riotId,
    championId: p.championId,
    championName: champMap.get(p.championId) ?? String(p.championId),
  }))

  return NextResponse.json({ participants })
}
