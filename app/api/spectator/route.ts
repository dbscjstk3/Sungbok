import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.RIOT_API_KEY ?? ''
const REGION = 'asia'

export async function GET(req: NextRequest) {
  if (!API_KEY) return NextResponse.json({ error: 'RIOT_API_KEY가 설정되지 않았습니다.' }, { status: 500 })

  const summonerName = req.nextUrl.searchParams.get('summoner')
  if (!summonerName) return NextResponse.json({ error: 'summoner 파라미터가 필요합니다.' }, { status: 400 })

  const [gameName, tagLine] = summonerName.includes('#')
    ? summonerName.split('#')
    : [summonerName, 'KR1']

  const res = await fetch(
    `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    { headers: { 'X-Riot-Token': API_KEY } }
  )

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
