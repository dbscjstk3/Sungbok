'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [realName, setRealName] = useState('')
  const [summonerName, setSummonerName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function fetchPlayers() {
    const { data } = await insforge.database
      .from('players')
      .select('id, real_name, summoner_name, created_at')
      .order('created_at', { ascending: true })
    if (data) setPlayers(data as Player[])
  }

  useEffect(() => { fetchPlayers() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: insertError } = await insforge.database
      .from('players')
      .insert([{ real_name: realName.trim(), summoner_name: summonerName.trim() }])
      .select()

    setLoading(false)

    if (insertError) {
      if (insertError.message?.includes('unique') || insertError.message?.includes('duplicate')) {
        setError('이미 등록된 소환사명입니다.')
      } else {
        setError('등록 중 오류가 발생했습니다.')
      }
      return
    }

    setRealName('')
    setSummonerName('')
    fetchPlayers()
  }

  return (
    <main className="min-h-screen px-6 py-16 max-w-2xl mx-auto" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
      <a href="/" className="text-sm hover:underline" style={{ color: '#202020', opacity: 0.5 }}>
        ← 홈으로
      </a>

      <h1 className="text-3xl font-bold mt-8 mb-2" style={{ color: '#202020' }}>
        참가자 명단
      </h1>
      <p className="text-sm mb-10" style={{ color: '#202020', opacity: 0.5 }}>
        {players.length}명 등록됨
      </p>

      {/* 목록 */}
      <section className="mb-12">
        {players.length === 0 ? (
          <p className="text-sm" style={{ color: '#202020', opacity: 0.4 }}>
            아직 등록된 참가자가 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex justify-between items-center px-5 py-4 rounded-xl"
                style={{ backgroundColor: '#DEE0E2' }}
              >
                <span className="font-medium" style={{ color: '#202020' }}>
                  {p.real_name}
                </span>
                <span className="text-sm" style={{ color: '#202020', opacity: 0.55 }}>
                  {p.summoner_name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 등록 폼 */}
      <section>
        <h2 className="text-lg font-bold mb-5" style={{ color: '#202020' }}>
          참가자 등록
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="실명 (예: 윤현석)"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            required
            className="px-4 py-3 rounded-xl text-sm outline-none w-full"
            style={{ backgroundColor: '#DEE0E2', color: '#202020', border: 'none' }}
          />
          <input
            type="text"
            placeholder="소환사명 (예: Hide on bush)"
            value={summonerName}
            onChange={(e) => setSummonerName(e.target.value)}
            required
            className="px-4 py-3 rounded-xl text-sm outline-none w-full"
            style={{ backgroundColor: '#DEE0E2', color: '#202020', border: 'none' }}
          />
          {error && (
            <p className="text-sm" style={{ color: '#e53e3e' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ backgroundColor: '#202020', color: '#ECEEF0' }}
          >
            {loading ? '등록 중...' : '등록하기'}
          </button>
        </form>
      </section>
    </main>
  )
}
