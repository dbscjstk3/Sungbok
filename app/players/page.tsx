'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [realName, setRealName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRealName, setEditRealName] = useState('')
  const [editError, setEditError] = useState('')

  async function fetchPlayers() {
    const { data } = await insforge.database
      .from('players')
      .select('id, real_name, created_at')
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
      .insert([{ real_name: realName.trim() }])
      .select()

    setLoading(false)

    if (insertError) {
      setError('등록 중 오류가 발생했습니다.')
      return
    }

    setRealName('')
    fetchPlayers()
  }

  function startEdit(p: Player) {
    setEditingId(p.id)
    setEditRealName(p.real_name)
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
      .update({ real_name: editRealName.trim() })
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
    <main className="min-h-screen px-12 py-16" style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
      <a href="/" className="text-sm hover:underline" style={{ color: '#202020', opacity: 0.5 }}>
        ← 홈으로
      </a>

      <h1 className="text-3xl font-bold mt-8 mb-2" style={{ color: '#202020' }}>
        선수 명단
      </h1>
      <p className="text-sm mb-10" style={{ color: '#202020', opacity: 0.5 }}>
        {players.length}명 등록됨
      </p>

      {/* 등록 폼 */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-5" style={{ color: '#202020' }}>선수 등록</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="이름 (예: 윤현석)"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            required
            className="px-4 py-3 rounded-xl text-sm outline-none w-full"
            style={{ backgroundColor: '#DEE0E2', color: '#202020' }}
          />
          {error && <p className="text-sm" style={{ color: '#e53e3e' }}>{error}</p>}
          <button type="submit" disabled={loading}
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
            {loading ? '등록 중...' : '등록하기'}
          </button>
        </form>
      </section>

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
                  style={{ backgroundColor: '#DEE0E2' }}>
                  <input
                    value={editRealName}
                    onChange={(e) => setEditRealName(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: '#ECEEF0', color: '#202020' }}
                    placeholder="이름"
                  />
                  {editError && <p className="text-xs" style={{ color: '#e53e3e' }}>{editError}</p>}
                  <div className="flex gap-2 justify-end">
                    <button onClick={cancelEdit}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
                      취소
                    </button>
                    <button onClick={() => handleUpdate(p.id)}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ backgroundColor: '#202020', color: '#ECEEF0' }}>
                      저장
                    </button>
                  </div>
                </li>
              ) : (
                <li key={p.id} className="flex justify-between items-center px-5 py-4 rounded-xl"
                  style={{ backgroundColor: '#DEE0E2' }}>
                  <span className="font-medium" style={{ color: '#202020' }}>{p.real_name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
                      수정
                    </button>
                    <button onClick={() => handleDelete(p.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ backgroundColor: '#ECEEF0', color: '#202020' }}>
                      삭제
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </section>
    </main>
  )
}
