'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  ['/', '홈'],
  ['/players', '선수'],
  ['/match', '내전 생성'],
  ['/history', '기록'],
  ['/standings', '전적'],
  ['/champions', '챔피언'],
] as const

export default function NavBar() {
  const pathname = usePathname()

  return (
    <nav className="site-nav" aria-label="주요 메뉴">
      <Link href="/" className="site-brand" aria-label="성복내전 홈">
        <span className="site-brand-mark">SB</span>
        <span>성복내전</span>
      </Link>
      <div className="site-nav-links">
        {NAV_LINKS.map(([href, label], index) => {
          const active = pathname === href
          return (
            <Link key={href} href={href} className="site-nav-link" data-active={active || undefined} aria-current={active ? 'page' : undefined}>
              <span className="site-nav-index">0{index + 1}</span>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
