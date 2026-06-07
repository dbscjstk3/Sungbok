# Players 참가자 명단 설계

## 개요

롤 내전 참가자 명단을 저장하고 조회하는 기능. 인증 없이 누구나 자신을 등록할 수 있으며, 소환사명 중복은 허용하지 않는다.

## 데이터베이스

**테이블: `players`**

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `id` | `uuid` | PK, 자동 생성 |
| `real_name` | `text` | NOT NULL |
| `summoner_name` | `text` | UNIQUE, NOT NULL |
| `created_at` | `timestamptz` | DEFAULT now() |

**RLS 정책:**
- SELECT: 누구나 가능 (anon 포함)
- INSERT: 누구나 가능 (anon 포함)
- UPDATE/DELETE: 비활성화 (현재 불필요)

## UI

**신규 페이지: `/players`**

- 상단: 등록된 참가자 목록 (실명 + 소환사명 표시)
- 하단: 참가자 등록 폼
  - 입력 필드: 실명, 소환사명
  - 제출 시 InsForge insert
  - 소환사명 중복 시 에러 메시지 표시
- 색상: 기존 랜딩페이지와 동일한 팔레트 (#ECEEF0, #DEE0E2, #202020)

**기존 페이지: `/` (랜딩)**
- 변경 없음

## 기술 스택

- 백엔드: InsForge Postgres (`@insforge/sdk`)
- 프론트엔드: Next.js App Router, Tailwind CSS
- 인증: 없음
