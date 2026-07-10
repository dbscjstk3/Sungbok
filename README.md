# 성복내전

https://sungboktime.insforge.site/

리그오브레전드 내전(사용자 설정 게임) 전적 조회 및 관리 웹앱입니다.
마블 룰렛으로 팀을 나누고, 승패를 기록하고, 수익금 전적을 확인할 수 있습니다.

## 기능

- **선수 명단** — 참가자 등록/수정/삭제, 소환사명 연동
- **내전 생성** — 8명 또는 10명 선택, 팀 고정 배치 + 마블 룰렛으로 자동 배정 (4:4 / 5:5)
- **챔피언 기록** — Riot Spectator API로 현재 게임 챔피언 자동 수집, 팀 확정 후 6분 뒤 자동 가져오기 (최대 3회 재시도)
- **승패 기록** — 판당 금액 설정 및 라운드별 결과 기록, 잘못 선택 시 취소 기능
- **기록** — 세션별 완료된 내전 기록 조회, 선수별 챔피언 목록 확인
- **전적** — 누적 수익금 순 개인 전적, 최근 폼, 연승/연패, 베스트 파트너, 챔피언 통계, 세션별 수익 추이 그래프
- **듀오 랭킹** — 10판 이상 함께한 조합의 베스트/쓰레기 듀오 순위

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
