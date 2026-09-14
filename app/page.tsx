import Image from 'next/image'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'

const QUICK_LINKS = [
  { href: '/match', index: '01', label: '새 내전 만들기', note: '팀 편성과 경기 기록' },
  { href: '/standings', index: '02', label: '시즌 전적 보기', note: '승률과 누적 수익' },
  { href: '/history', index: '03', label: '지난 경기 열기', note: '세션별 상세 기록' },
]

export default function Home() {
  return (
    <main id="main-content" className="home-page">
      <NavBar />

      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-photo">
          <Image src="/hero2.JPG" alt="바닷가에 모인 성복 친구들 단체 사진" fill className="object-cover" sizes="100vw" quality={92} priority />
          <div className="home-photo-shade" />
        </div>
        <div className="home-hero-copy">
          <p className="home-kicker"><span>Since 2025</span> · Seongbok Invitational</p>
          <h1 id="home-title">따고 따이는,<br /><em>치열한 경쟁</em></h1>
          <p className="home-intro">성복 친구들의 내전 팀 편성부터 시즌 전적까지. 매 경기의 결과와 이야기를 한곳에 남깁니다.</p>
          <Link className="home-primary" href="/match">내전 시작 <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="home-issue" aria-hidden="true"><span>ARCHIVE</span><strong>NO. 02</strong></div>
      </section>

      <section className="home-directory" aria-label="빠른 메뉴">
        <header><span>경기 운영실</span><span>2026 — 현재</span></header>
        <div className="home-directory-grid">
          <div className="home-polaroid">
            <Image src="/hero1.jpeg" alt="성복 친구들의 흑백 개인 사진 모음" fill className="object-cover" sizes="(max-width: 800px) 100vw, 38vw" />
          </div>
          <div className="home-links">
            {QUICK_LINKS.map(link => (
              <Link href={link.href} key={link.href} className="home-link-row">
                <span className="home-link-index">{link.index}</span>
                <span className="home-link-title">{link.label}</span>
                <span className="home-link-note">{link.note}</span>
                <span className="home-link-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
