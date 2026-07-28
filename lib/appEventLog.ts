import { insforge } from '@/lib/insforge'
import { IS_MOCK } from '@/lib/sampleData'

type EventType = 'champion_fetch' | 'round_save' | 'round_undo' | 'session_restore'

interface AppEvent {
  eventType: EventType
  status: string
  sessionId?: string | null
  roundId?: string | null
  roundNumber?: number | null
  triggerSource?: string | null
  scheduledFor?: string | null
  pageVisibility?: string | null
  candidateCount?: number | null
  matchedCount?: number | null
  durationMs?: number | null
  httpStatus?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

export function getPageVisibility() {
  if (typeof document === 'undefined') return 'unknown'
  return document.visibilityState
}

export function getEventErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && error.code) {
    return String(error.code).slice(0, 80)
  }
  if (error instanceof Error && error.name) return error.name.slice(0, 80)
  return 'UNKNOWN_ERROR'
}

export function logAppEvent(event: AppEvent) {
  if (IS_MOCK) return

  void (async () => {
    try {
      const { error } = await insforge.database.rpc('log_app_event', {
        p_event_type: event.eventType,
        p_status: event.status,
        p_session_id: event.sessionId ?? null,
        p_round_id: event.roundId ?? null,
        p_round_number: event.roundNumber ?? null,
        p_trigger_source: event.triggerSource ?? null,
        p_scheduled_for: event.scheduledFor ?? null,
        p_page_visibility: event.pageVisibility ?? getPageVisibility(),
        p_candidate_count: event.candidateCount ?? null,
        p_matched_count: event.matchedCount ?? null,
        p_duration_ms: event.durationMs ?? null,
        p_http_status: event.httpStatus ?? null,
        p_error_code: event.errorCode ?? null,
        p_error_message: event.errorMessage ?? null,
        p_metadata: event.metadata ?? {},
      })
      if (error) console.warn('진단 로그 저장 실패:', error)
    } catch (error) {
      console.warn('진단 로그 요청 실패:', error)
    }
  })()
}
