import Image from 'next/image'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: '#ECEEF0' }}>

      <nav className="px-4 sm:px-8 py-4 flex justify-between items-center" style={{ backgroundColor: '#ECEEF0' }}>
        <span className="text-xl font-bold tracking-tight shrink-0 mr-2" style={{ color: '#202020' }}>성복내전</span>
        <div className="min-w-0 flex items-center gap-2 overflow-x-auto sm:gap-5">
          {[['/', '홈'], ['/players', '선수명단'], ['/match', '내전생성'], ['/history', '기록'], ['/standings', '전적'], ['/champions', '챔피언']].map(([href, label]) => (
            <Link key={href} href={href} className="text-xs sm:text-sm font-medium transition-opacity hover:opacity-60 whitespace-nowrap" style={{ color: '#202020' }}>
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="flex-1 grid grid-cols-2 sm:grid-cols-5">
        {['/hero1.jpeg', '/hero2.JPG', '/hero3.JPG', '/hero4.jpeg', '/hero5.jpeg'].map((src, i) => (
          <div key={src} className={`relative overflow-hidden h-[45vw] sm:h-auto${i >= 2 ? ' hidden sm:block' : ''}`}>
            <Image
              src={src}
              alt={`성복내전 ${i + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, 20vw"
              quality={90}
              priority={i === 0}
            />
          </div>
        ))}
      </div>

    </main>
  )
}
