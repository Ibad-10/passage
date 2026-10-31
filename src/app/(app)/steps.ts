import type { CaseState } from '@/domain/types'
import { CASE_STEPS, type TimelineStep } from '@/components/passage/case-timeline'
import type { ScreeningStatus } from '@/components/passage/chips'

// Which of the 7 timeline steps a case state sits on (0-based). Closed states mark everything done up to them.
const STEP_OF: Record<CaseState, number> = {
  Draft: 0, IntakeIncomplete: 0,
  SanctionsCheck: 1, SanctionsReview: 1, AwaitingClient: 1,
  Classifying: 2, AwaitingClient2: 2, EmergingQuote: 2, EmergingReview: 2,
  OfficerReview: 3,
  RouteQuote: 4, RouteInProgress: 5, AwaitingClient3: 5, Filed: 5,
  Granted: 6, Refused: 5, Active: 6, Monitoring: 6,
  ClosedNotControlled: 3, ClosedDoNotProceed: 3, Closed: 4,
}
const FINISHED: CaseState[] = ['Granted', 'Active', 'Monitoring', 'ClosedNotControlled', 'ClosedDoNotProceed', 'Closed', 'Refused']

export function timelineFor(state: CaseState, activeSub?: string): TimelineStep[] {
  const at = STEP_OF[state]
  const finished = FINISHED.includes(state)
  return CASE_STEPS.map((s, i) => ({
    ...s,
    sub: i === at && activeSub ? activeSub : s.sub,
    status: i < at || (finished && i === at) ? 'done' : i === at ? 'active' : 'todo',
  }))
}

export const verdictStatus = (r: { result: string; decision: string | null; proposed_by?: string | null }): ScreeningStatus =>
  r.decision === 'cleared' ? 'clear' : r.decision === 'confirmed' ? 'match' : r.result === 'clear' ? 'clear' : r.proposed_by ? 'review' : (r.result as ScreeningStatus)
