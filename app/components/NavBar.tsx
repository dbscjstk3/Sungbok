import Link from 'next/link'

const NAV_LINKS = [['/', '홈'], ['/players', '선수명단'], ['/match', '내전생성'], ['/history', '기록'], ['/standings', '전적'], ['/champions', '챔피언']] as const

export default function NavBar() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 px-4 sm:px-8 py-4 flex justify-between items-center z-10"
      style={{ backgroundColor: '#ECEEF0', borderBottom: '1px solid #DEE0E2' }}
    >
      <Link href="/" className="text-xl font-bold tracking-tight shrink-0 mr-2" style={{ color: '#202020' }}>
        성복내전
      </Link>
      <div className="min-w-0 flex items-center gap-2 overflow-x-auto sm:gap-5">
        {NAV_LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="text-xs sm:text-sm font-medium transition-opacity hover:opacity-60 whitespace-nowrap"
            style={{ color: '#202020' }}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
