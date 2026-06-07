export default function RoulettePage() {
  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: '#202020' }}>
      <nav className="px-8 py-4 flex justify-between items-center shrink-0" style={{ backgroundColor: '#202020' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ color: '#ECEEF0' }}>
          성복내전
        </a>
        <div className="flex items-center gap-6">
          <a href="/" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>
            홈
          </a>
          <a href="/players" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>
            참가자 명단
          </a>
          <a href="/roulette" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>
            룰렛
          </a>
        </div>
      </nav>

      <iframe
        src="https://lazygyu.github.io/roulette"
        className="w-full flex-1 border-0"
        allow="autoplay"
      />
    </main>
  )
}
