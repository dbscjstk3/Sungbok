# 마블룰렛 팀 배정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** lazygyu/roulette를 포크해 순위 결과를 postMessage로 부모 창에 전송하고, Next.js 룰렛 페이지에서 1~5등을 1팀, 6~10등을 2팀으로 표시한다.

**Architecture:** lazygyu/roulette 레포를 포크해 roulette.ts에 postMessage 한 줄을 추가하고, GitHub Actions로 gh-pages에 자동 배포한다. Next.js 룰렛 페이지는 window 'message' 이벤트를 수신해 팀 결과 오버레이를 표시한다.

**Tech Stack:** TypeScript (lazygyu fork), Parcel 2, GitHub Pages, Next.js (App Router), Tailwind CSS

---

## File Map

| 파일 | 동작 |
|------|------|
| `lazygyu/roulette` fork → `src/roulette.ts` | 레이스 종료 시 postMessage 추가 |
| `lazygyu/roulette` fork → `.github/workflows/deploy.yml` | gh-pages 자동 배포 |
| `sungbok/app/roulette/page.tsx` | postMessage 수신 + 팀 오버레이 표시 |

---

### Task 1: 레포 포크 및 클론

**Files:**
- Clone: `~/Projects/roulette-fork/` (sungbok 프로젝트와 별도 디렉토리)

- [ ] **Step 1: GitHub에서 포크**

  브라우저에서 https://github.com/lazygyu/roulette 접속 → Fork 버튼 클릭
  `dbscjstk3/roulette` 이름으로 포크 생성

- [ ] **Step 2: 로컬에 클론**

```bash
cd ~/Projects
git clone https://github.com/dbscjstk3/roulette roulette-fork
cd roulette-fork
npm install
```

Expected: `node_modules/` 생성, `package-lock.json` 업데이트

- [ ] **Step 3: 로컬 빌드 확인**

```bash
npm run build
```

Expected: `dist/` 디렉토리 생성, 에러 없음

---

### Task 2: roulette.ts에 postMessage 추가

**Files:**
- Modify: `~/Projects/roulette-fork/src/roulette.ts`

- [ ] **Step 1: 레이스 종료 지점 찾기**

`roulette.ts`에서 `_isRunning = false`가 있는 두 번째 위치를 찾는다.
(첫 번째는 지정 순위 당첨자, 두 번째는 전체 완주 시)

전체 완주 조건은 다음과 같이 생겼다:
```typescript
if (this._winnerRank === this._totalMarbleCount - 1) {
  this._isRunning = false;
  // ... 비디오 녹화 종료 등
}
```

- [ ] **Step 2: postMessage 코드 삽입**

`_isRunning = false` 직후 (전체 완주 블록 안)에 다음을 추가한다:

```typescript
window.parent.postMessage(
  {
    type: 'roulette-result',
    rankings: this._winners.map((m) => m.name),
  },
  '*'
);
```

삽입 후 해당 블록이 아래처럼 보여야 한다:
```typescript
if (this._winnerRank === this._totalMarbleCount - 1) {
  this._isRunning = false;
  window.parent.postMessage(
    {
      type: 'roulette-result',
      rankings: this._winners.map((m) => m.name),
    },
    '*'
  );
  // ... 기존 코드 유지
}
```

- [ ] **Step 3: 빌드로 타입 오류 없는지 확인**

```bash
npm run build
```

Expected: 에러 없이 `dist/` 생성

- [ ] **Step 4: 커밋**

```bash
git add src/roulette.ts
git commit -m "feat: postMessage rankings to parent on race complete"
```

---

### Task 3: GitHub Actions 자동 배포 설정

**Files:**
- Create: `~/Projects/roulette-fork/.github/workflows/deploy.yml`

- [ ] **Step 1: 워크플로우 파일 생성**

```bash
mkdir -p ~/Projects/roulette-fork/.github/workflows
```

`.github/workflows/deploy.yml` 내용:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

- [ ] **Step 2: 커밋 및 푸시**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Pages deploy workflow"
git push origin main
```

- [ ] **Step 3: GitHub Pages 설정**

브라우저에서 `https://github.com/dbscjstk3/roulette/settings/pages` 접속
→ Source: `Deploy from a branch`
→ Branch: `gh-pages` / `/ (root)`
→ Save

- [ ] **Step 4: 배포 완료 확인**

Actions 탭에서 워크플로우 성공 후
`https://dbscjstk3.github.io/roulette/` 접속 확인

Expected: 룰렛 앱 정상 로드

---

### Task 4: Next.js 룰렛 페이지 업데이트

**Files:**
- Modify: `sungbok/app/roulette/page.tsx`

- [ ] **Step 1: 기존 파일 확인**

현재 `app/roulette/page.tsx`:
- iframe src: `https://lazygyu.github.io/roulette?names=...` (DB에서 선수 불러옴)
- `'use client'` + `useEffect` + `useState` 이미 사용 중

- [ ] **Step 2: 전체 파일 교체**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { insforge, Player } from '@/lib/insforge'

interface RouletteResult {
  team1: string[]
  team2: string[]
}

export default function RoulettePage() {
  const [src, setSrc] = useState('https://dbscjstk3.github.io/roulette/')
  const [result, setResult] = useState<RouletteResult | null>(null)

  useEffect(() => {
    insforge.database.from('players').select('*').then(({ data }: { data: Player[] | null }) => {
      if (!data || data.length === 0) return
      const names = data.map(p => p.real_name).join(',')
      setSrc(`https://dbscjstk3.github.io/roulette/?names=${encodeURIComponent(names)}`)
    })
  }, [])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== 'roulette-result') return
      const rankings: string[] = e.data.rankings ?? []
      setResult({
        team1: rankings.slice(0, 5),
        team2: rankings.slice(5, 10),
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: '#202020' }}>
      <nav className="px-8 py-4 flex justify-between items-center shrink-0" style={{ backgroundColor: '#202020' }}>
        <a href="/" className="text-xl font-bold tracking-tight" style={{ color: '#ECEEF0' }}>
          성복내전
        </a>
        <div className="flex items-center gap-6">
          <a href="/" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>홈</a>
          <a href="/players" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>선수명단</a>
          <a href="/match" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>내전생성</a>
          <a href="/history" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>기록</a>
          <a href="/roulette" className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: '#ECEEF0' }}>룰렛</a>
        </div>
      </nav>

      <div className="flex-1 relative">
        <iframe
          src={src}
          className="w-full h-full border-0 absolute inset-0"
          allow="autoplay"
        />

        {result && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
            onClick={() => setResult(null)}
          >
            <div
              className="rounded-2xl p-8 flex gap-8"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={e => e.stopPropagation()}
            >
              <TeamCard title="1팀" players={result.team1} color="#4A90D9" />
              <TeamCard title="2팀" players={result.team2} color="#E8734A" />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function TeamCard({ title, players, color }: { title: string; players: string[]; color: string }) {
  return (
    <div className="flex flex-col items-center gap-4 min-w-36">
      <span className="text-lg font-bold" style={{ color }}>{title}</span>
      <ul className="flex flex-col gap-2 w-full">
        {players.map((name, i) => (
          <li
            key={name}
            className="flex items-center gap-3 px-4 py-2 rounded-lg"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            <span className="text-xs w-4" style={{ color: 'rgba(255,255,255,0.35)' }}>{i + 1}</span>
            <span className="text-sm font-medium" style={{ color: '#ECEEF0' }}>{name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: 타입 체크**

```bash
cd /Users/dbscjstk3/Projects/sungbok
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add app/roulette/page.tsx
git commit -m "feat: show team split overlay after roulette finishes"
```

- [ ] **Step 5: 배포**

```bash
npm run deploy
```

Expected: `https://4h9mkzd9.insforge.site` 에 반영
