'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'

interface RouletteResult {
  team1: string[]
  team2: string[]
}

export default function RoulettePage() {
  const [src, setSrc] = useState('https://dbscjstk3.github.io/roulette/')
  const [result, setResult] = useState<RouletteResult | null>(null)

  useEffect(() => {
    insforge.database.from('players').select('*').then(({ data }: { data: Player[] | null }) => {
      if (!data || data.length === 0) return
      const names = data.map(p => p.real_name).join(',')
      setSrc(`https://dbscjstk3.github.io/roulette/?names=${encodeURIComponent(names)}`)
    })
  }, [])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== 'https://dbscjstk3.github.io') return
      if (e.data?.type !== 'roulette-result') return
      const rankings: string[] = e.data.rankings ?? []
      const half = Math.ceil(rankings.length / 2)
      setResult({
        team1: rankings.slice(0, half),
        team2: rankings.slice(half),
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: '#202020' }}>
      <nav className="px-8 py-4 flex justify-between items-center shrink-0" style={{ backgroundColor: '#202020' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ color: '#ECEEF0' }}>
          성복내전
        </a>
        <div className="flex items-center gap-6">
          <a href="/" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>홈</a>
          <a href="/players" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>선수명단</a>
          <a href="/match" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>내전생성</a>
          <a href="/history" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>기록</a>
          <a href="/roulette" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>룰렛</a>
        </div>
      </nav>

      <div className="flex-1 relative">
        <iframe
          src={src}
          className="w-full h-full border-0 absolute inset-0"
          allow="autoplay"
        />

        {result && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
            onClick={() => setResult(null)}
          >
            <div
              className="rounded-2xl p-8 flex gap-8"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={e => e.stopPropagation()}
            >
              <TeamCard title="1팀" players={result.team1} color="#4A90D9" />
              <TeamCard title="2팀" players={result.team2} color="#E8734A" />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function TeamCard({ title, players, color }: { title: string; players: string[]; color: string }) {
  return (
    <div className="flex flex-col items-center gap-4 min-w-36">
      <span className="text-lg font-bold" style={{ color }}>{title}</span>
      <ul className="flex flex-col gap-2 w-full">
        {players.map((name, i) => (
          <li
            key={`${i}-${name}`}
            className="flex items-center gap-3 px-4 py-2 rounded-lg"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            <span className="text-xs w-4" style={{ color: 'rgba(255,255,255,0.35)' }}>{i + 1}</span>
            <span className="text-sm font-medium" style={{ color: '#ECEEF0' }}>{name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
