'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'
import { IS_MOCK, portfolioPlayers, samplePlayers } from '@/lib/sampleData'
import { IS_PORTFOLIO } from '@/lib/appMode'
import NavBar from '@/app/components/NavBar'

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [realName, setRealName] = useState('')
  const [summonerName, setSummonerName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRealName, setEditRealName] = useState('')
  const [editSummonerName, setEditSummonerName] = useState('')
  const [editError, setEditError] = useState('')

  async function fetchPlayers() {
    if (IS_MOCK) {
      const mockPlayers = IS_PORTFOLIO ? portfolioPlayers : samplePlayers
      setPlayers([...mockPlayers].sort((a, b) => a.real_name.localeCompare(b.real_name)))
      return
    }
    const { data } = await insforge.database
      .from('players')
      .select('id, real_name, summoner_name, created_at')
      .order('real_name', { ascending: true })
    if (data) setPlayers(data as Player[])
  }

  useEffect(() => { fetchPlayers() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: insertError } = await insforge.database
      .from('players')
      .insert([{ real_name: realName.trim(), summoner_name: summonerName.trim() || null }])
      .select()

    setLoading(false)

    if (insertError) {
      setError('등록 중 오류가 발생했습니다.')
      return
    }

    setRealName('')
    setSummonerName('')
    fetchPlayers()
  }

  function startEdit(p: Player) {
    setEditingId(p.id)
    setEditRealName(p.real_name)
    setEditSummonerName(p.summoner_name ?? '')
    setEditError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError('')
  }

  async function handleUpdate(id: string) {
    setEditError('')
    const { error: updateError } = await insforge.database
      .from('players')
      .update({ real_name: editRealName.trim(), summoner_name: editSummonerName.trim() || null })
      .eq('id', id)

    if (updateError) {
      setEditError('수정 중 오류가 발생했습니다.')
      return
    }

    setEditingId(null)
    fetchPlayers()
  }

  async function handleDelete(id: string) {
    if (!window.confirm('정말 삭제하시겠습니까?')) return
    await insforge.database.from('players').delete().eq('id', id)
    fetchPlayers()
  }

  return (
    <main id="main-content" className="app-page min-h-screen px-4 sm:px-12 py-12 sm:py-16" style={{ backgroundColor: '#FFFFFF', color: '#202020' }}>
      <NavBar />

      <h1 className="text-3xl font-bold mt-16 mb-2" style={{ color: '#202020' }}>
        선수 명단
      </h1>
      <p className="text-sm mb-10" style={{ color: '#202020', opacity: 0.5 }}>
        {players.length}명 등록됨{IS_PORTFOLIO && ' · 실제 운영 데이터 비식별 처리'}
      </p>

      {/* 등록 폼 */}
      {!IS_PORTFOLIO && <section className="mb-10">
        <h2 className="text-lg font-bold mb-5" style={{ color: '#202020' }}>선수 등록</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="이름 (예: 윤현석)"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            required
            className="px-4 py-3 rounded-xl text-sm outline-none w-full"
            style={{ backgroundColor: '#F0F1F2', color: '#202020' }}
          />
          <input
            type="text"
            placeholder="소환사명 (선택)"
            value={summonerName}
            onChange={(e) => setSummonerName(e.target.value)}
            className="px-4 py-3 rounded-xl text-sm outline-none w-full"
            style={{ backgroundColor: '#F0F1F2', color: '#202020' }}
          />
          {error && <p className="text-sm" style={{ color: '#e53e3e' }}>{error}</p>}
          <button type="submit" disabled={loading}
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ backgroundColor: '#202020', color: '#FFFFFF' }}>
            {loading ? '등록 중...' : '등록하기'}
          </button>
        </form>
      </section>}

      {/* 목록 */}
      <section className="mb-12">
        {players.length === 0 ? (
          <p className="text-sm" style={{ color: '#202020', opacity: 0.4 }}>
            아직 등록된 참가자가 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {players.map((p) =>
              editingId === p.id ? (
                <li key={p.id} className="flex flex-col gap-2 px-5 py-4 rounded-xl"
                  style={{ backgroundColor: '#F0F1F2' }}>
                  <input
                    value={editRealName}
                    onChange={(e) => setEditRealName(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: '#FFFFFF', color: '#202020' }}
                    placeholder="이름"
                  />
                  <input
                    value={editSummonerName}
                    onChange={(e) => setEditSummonerName(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: '#FFFFFF', color: '#202020' }}
                    placeholder="소환사명 (선택)"
                  />
                  {editError && <p className="text-xs" style={{ color: '#e53e3e' }}>{editError}</p>}
                  <div className="flex gap-2 justify-end">
                    <button onClick={cancelEdit}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ backgroundColor: '#FFFFFF', color: '#202020' }}>
                      취소
                    </button>
                    <button onClick={() => handleUpdate(p.id)}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ backgroundColor: '#202020', color: '#FFFFFF' }}>
                      저장
                    </button>
                  </div>
                </li>
              ) : (
                <li key={p.id} className="flex justify-between items-center px-5 py-4 rounded-xl"
                  style={{ backgroundColor: '#F0F1F2' }}>
                  <div>
                    <span className="font-medium" style={{ color: '#202020' }}>{p.real_name}</span>
                    {p.summoner_name && (
                      <span className="ml-2 text-xs" style={{ opacity: 0.4 }}>{p.summoner_name}</span>
                    )}
                  </div>
                  {!IS_PORTFOLIO && <div className="flex gap-2">
                    <button onClick={() => startEdit(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ backgroundColor: '#FFFFFF', color: '#202020' }}>
                      수정
                    </button>
                    <button onClick={() => handleDelete(p.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ backgroundColor: '#FFFFFF', color: '#202020' }}>
                      삭제
                    </button>
                  </div>}
                </li>
              )
            )}
          </ul>
        )}
      </section>
    </main>
  )
}
