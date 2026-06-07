export default function Home() {
  return (
    <main className="min-h-screen font-sans" style={{ backgroundColor: "#ECEEF0", color: "#202020" }}>

      {/* Nav */}
      <nav className="px-8 py-5 flex justify-between items-center" style={{ backgroundColor: "#ECEEF0" }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ color: "#202020" }}>
          성복내전
        </a>
        <div className="flex items-center gap-6">
          <a href="/" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: "#202020" }}>
            홈
          </a>
          <a href="/players" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: "#202020" }}>
            참가자 명단
          </a>
          <a href="/match" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: "#202020" }}>
            내전 기록
          </a>
          <a href="/teams" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: "#202020" }}>
            팀 배정
          </a>
          <a href="/roulette" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: "#202020" }}>
            룰렛
          </a>
          <a
            href="/players"
            className="px-5 py-2 text-sm font-medium rounded-full transition-opacity hover:opacity-80"
            style={{ backgroundColor: "#202020", color: "#ECEEF0" }}
          >
            시작하기
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-8 pt-24 pb-32 text-center max-w-4xl mx-auto">
        <p className="text-sm font-medium tracking-widest uppercase mb-6" style={{ color: "#202020", opacity: 0.4 }}>
          League of Legends 내전
        </p>
        <h1 className="text-5xl font-bold leading-tight mb-6" style={{ color: "#202020" }}>
          친구들과의 내전,<br />이제 제대로 즐기세요
        </h1>
        <p className="text-lg max-w-xl mx-auto mb-10" style={{ color: "#202020", opacity: 0.55 }}>
          팀 밸런싱부터 통계, MVP 투표까지—<br />
          매 내전이 기억에 남는 경험이 됩니다.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <a
            href="/players"
            className="px-8 py-3 text-base font-semibold rounded-full transition-opacity hover:opacity-85"
            style={{ backgroundColor: "#202020", color: "#ECEEF0" }}
          >
            무료로 시작하기
          </a>
          <a
            href="/players"
            className="px-8 py-3 text-base font-semibold rounded-full transition-opacity hover:opacity-80"
            style={{ backgroundColor: "#DEE0E2", color: "#202020" }}
          >
            둘러보기
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="px-8 py-24" style={{ backgroundColor: "#DEE0E2" }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4" style={{ color: "#202020" }}>
            내전을 더 재밌게 만드는 기능들
          </h2>
          <p className="text-center mb-16 text-base" style={{ color: "#202020", opacity: 0.5 }}>
            불균형한 팀 구성, 흐지부지 끝나는 결과—이제 그런 내전은 없습니다.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: "⚖️",
                title: "자동 팀 밸런싱",
                desc: "소환사 티어와 전적 데이터를 기반으로 최대한 균등한 팀을 자동으로 구성합니다.",
              },
              {
                icon: "📊",
                title: "내전 전용 통계",
                desc: "KDA, 승률, 챔피언별 성과를 한눈에. 친구들 사이 숨은 고수를 찾아보세요.",
              },
              {
                icon: "🏆",
                title: "MVP 투표",
                desc: "경기가 끝나면 팀원들이 직접 MVP를 선정합니다. 매 판의 주인공이 기록됩니다.",
              },
              {
                icon: "📅",
                title: "내전 일정 관리",
                desc: "다음 내전 날짜를 정하고, 참가자를 모집하고, 알림까지 한 곳에서 해결하세요.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl p-8"
                style={{ backgroundColor: "#ECEEF0" }}
              >
                <span className="text-3xl mb-4 block">{f.icon}</span>
                <h3 className="text-lg font-bold mb-2" style={{ color: "#202020" }}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#202020", opacity: 0.55 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-8 py-24" style={{ backgroundColor: "#ECEEF0" }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4" style={{ color: "#202020" }}>
            3단계로 시작하세요
          </h2>
          <p className="text-center mb-16" style={{ color: "#202020", opacity: 0.5 }}>
            복잡한 설정 없이 바로 내전을 시작할 수 있습니다.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "방 만들기", desc: "친구들을 초대할 내전 방을 생성하고 링크를 공유하세요." },
              { step: "02", title: "팀 구성", desc: "참가자가 모이면 자동 밸런싱으로 팀을 나눕니다." },
              { step: "03", title: "경기 & 기록", desc: "경기가 끝나면 결과를 기록하고 통계를 확인하세요." },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-5"
                  style={{ backgroundColor: "#DEE0E2", color: "#202020" }}
                >
                  {s.step}
                </div>
                <h3 className="text-base font-bold mb-2" style={{ color: "#202020" }}>
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#202020", opacity: 0.55 }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="px-8 py-28 text-center"
        style={{ backgroundColor: "#202020" }}
      >
        <h2 className="text-4xl font-bold mb-5" style={{ color: "#ECEEF0" }}>
          다음 내전, 성복으로 잡아보세요
        </h2>
        <p className="text-base mb-10 max-w-sm mx-auto" style={{ color: "#ECEEF0", opacity: 0.5 }}>
          지금 바로 무료로 시작하고, 친구들에게 공유하세요.
        </p>
        <a
          href="/players"
          className="px-8 py-3 text-base font-semibold rounded-full transition-opacity hover:opacity-85"
          style={{ backgroundColor: "#ECEEF0", color: "#202020" }}
        >
          무료로 시작하기
        </a>
      </section>

      {/* Footer */}
      <footer
        className="px-8 py-8 text-center text-xs"
        style={{ backgroundColor: "#202020", color: "#ECEEF0", opacity: 1 }}
      >
        <span style={{ opacity: 0.3 }}>© 2026 성복. All rights reserved.</span>
      </footer>

    </main>
  );
}
