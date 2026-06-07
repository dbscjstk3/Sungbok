import Image from 'next/image'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: '#ECEEF0' }}>

      <nav className="px-8 py-5 flex justify-between items-center" style={{ backgroundColor: '#ECEEF0' }}>
        <span className="text-xl font-bold tracking-tight" style={{ color: '#202020' }}>성복내전</span>
        <div className="flex items-center gap-6">
          {[['/', '홈'], ['/players', '선수명단'], ['/match', '내전생성'], ['/history', '기록'], ['/roulette', '룰렛']].map(([href, label]) => (
            <a key={href} href={href} className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#202020' }}>
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="flex-1 grid grid-cols-5" style={{ height: 'calc(100vh - 72px)' }}>
        {['/hero1.jpeg', '/hero2.JPG', '/hero3.JPG', '/hero4.jpeg', '/hero5.jpeg'].map((src, i) => (
          <div key={src} className="relative overflow-hidden">
            <Image
              src={src}
              alt={`성복내전 ${i + 1}`}
              fill
              className="object-cover"
              sizes="20vw"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

    </main>
  )
}
