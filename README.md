# 성복내전

친구들끼리 즐기는 리그 오브 레전드 내전 관리 웹앱입니다.  
마블 룰렛으로 팀을 나누고, 승패를 기록하고, 수익금 전적을 확인할 수 있습니다.

## 기능

- **선수 명단** — 참가자 등록/수정/삭제
- **내전 생성** — 8명 또는 10명 선택 후 마블 룰렛으로 팀 자동 배정 (4:4 / 5:5)
- **승패 기록** — 판당 금액 설정 및 라운드별 결과 기록
- **기록** — 세션별 완료된 내전 기록 조회
- **전적** — 누적 수익금 순 개인 전적 및 명예의 전당

## 기술 스택

- **프레임워크**: Next.js 16 (App Router), React 19
- **스타일**: Tailwind CSS v4
- **백엔드/DB**: InsForge BaaS
- **룰렛**: [lazygyu/roulette](https://github.com/lazygyu/roulette) 포크 (TypeScript + Canvas + Box2D WASM)

## 시작하기

```bash
npm install
npm run dev
```

환경 변수 설정 (`.env.local`):

```
NEXT_PUBLIC_INSFORGE_URL=...
NEXT_PUBLIC_INSFORGE_ANON_KEY=...
```

## 배포

```bash
npm run deploy
```

InsForge CLI를 통해 빌드 및 배포합니다.

## DB 스키마

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `players` | `id`, `real_name` |
| `sessions` | `id`, `bet_amount`, `created_at`, `ended_at` |
| `rounds` | `id`, `session_id`, `team1_ids[]`, `team2_ids[]`, `winner_team` |
