# 성복내전

성복 친구들의 롤 내전 기록을 관리하는 웹앱입니다. 마블 룰렛으로 팀을 편성하고, 라운드별 승패와 챔피언을 기록해 개인·듀오·챔피언 통계를 확인할 수 있습니다.

서비스: [sungboktime.insforge.site](https://sungboktime.insforge.site/)

## 주요 기능

- **선수 관리** — 참가자와 Riot ID(소환사명) 등록·수정·삭제
- **팀 편성** — 8명 또는 10명 선택, 고정 선수 배치 후 마블 룰렛으로 4:4 또는 5:5 팀 구성
- **내전 진행** — 판당 금액 설정, 라운드별 팀 재편성·진영 교대·승패 저장·마지막 결과 취소
- **진행 상태 복구** — 브라우저 로컬 스토리지를 이용해 진행 중인 내전 복원
- **챔피언 자동 기록** — Riot Spectator API로 현재 게임의 챔피언을 자동 조회
- **내전 기록** — 완료된 세션의 라운드·손익·챔피언 기록 조회, 판당 금액 수정 및 여러 세션 합치기
- **시즌 전적** — 시즌 1 보관 데이터와 시즌 2 실시간 데이터 전환, 승·패·승률·누적 수익·최근 폼·연승/연패·파트너·수익 추이 확인
- **듀오 랭킹** — 시즌 1은 50판 이상, 시즌 2는 1판 이상 함께한 조합의 승률 비교
- **챔피언 통계** — 시즌별 픽·승·패·승률·최다 플레이 선수 집계와 검색·필터·정렬

## 기술 스택

- Next.js 16 App Router
- React 19, TypeScript
- Tailwind CSS 4
- Recharts
- InsForge BaaS (Postgres, RLS, 배포)
- [lazygyu/roulette](https://github.com/lazygyu/roulette) 기반 마블 룰렛 (Canvas, Box2D WASM)

## 로컬 실행

요구 사항은 Node.js와 npm입니다.

```bash
npm install
```

프로젝트 루트에 `.env.local`을 만들고 다음 값을 설정합니다.

```dotenv
NEXT_PUBLIC_INSFORGE_URL=https://<project-id>.<region>.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=<insforge-anon-key>
RIOT_API_KEY=<riot-api-key>
# 공개 데모에서만 설정: NEXT_PUBLIC_APP_MODE=portfolio
```

- `NEXT_PUBLIC_INSFORGE_URL`, `NEXT_PUBLIC_INSFORGE_ANON_KEY`: 실제 데이터 조회·저장에 필요합니다.
- `RIOT_API_KEY`: 진행 중인 게임과 챔피언 조회에 필요하며 서버에서만 사용됩니다.
- `NEXT_PUBLIC_APP_MODE=portfolio`: 실제 백엔드 대신 비식별 처리한 실제 운영 데이터를 사용하고 금액을 포인트로 표시합니다.

포트폴리오 데이터를 갱신할 때는 실제 DB 원본을 Git에서 제외된 `backups/portfolio-source.json`으로 내보낸 뒤 `npm run portfolio:data`를 실행합니다. 생성 결과에는 실명, Riot ID, 원본 ID와 실제 금액이 포함되지 않습니다.
- `NEXT_PUBLIC_INSFORGE_URL`을 설정하지 않으면 선수·기록·전적 화면이 샘플 데이터 모드로 동작합니다.

개발 서버를 실행합니다.

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

## 명령어

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 생성 |
| `npm run start` | 프로덕션 서버 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run deploy` | 빌드 후 InsForge에 배포 |

## 화면 구성

| 경로 | 설명 |
| --- | --- |
| `/players` | 선수 명단 관리 |
| `/match` | 팀 편성 및 내전 진행 |
| `/history` | 완료된 내전 기록 조회·수정·병합 |
| `/standings` | 시즌별 개인 및 듀오 전적 |
| `/champions` | 시즌별 챔피언 통계 |

## 데이터 구조

| 테이블·뷰 | 용도 | 주요 필드 |
| --- | --- | --- |
| `players` | 선수 정보 | `id`, `real_name`, `summoner_name`, `created_at` |
| `sessions` | 내전 세션 | `id`, `bet_amount`, `created_at`, `ended_at` |
| `rounds` | 라운드 결과 | `session_id`, `team1_ids`, `team2_ids`, `winner_team`, `team1_champions`, `team2_champions`, `team1_names`, `team2_names` |
| `rounds_readable` | 선수명이 포함된 읽기용 라운드 뷰 | 팀별 선수명·챔피언·승리 팀 |
| `app_event_logs` | 챔피언 조회와 라운드 저장 등의 진단 로그 | `event_type`, `status`, `session_id`, `round_id`, `metadata` |

DB 변경 이력은 [`migrations`](./migrations) 디렉터리에서 관리합니다. 시즌 1 전적은 [`data/season1-standings.json`](./data/season1-standings.json)에 보관되어 있습니다.

## 배포

InsForge 프로젝트 연결과 CLI 인증을 마친 뒤 다음 명령을 실행합니다.

```bash
npm run deploy
```
