// Route C: individual licence, spec §4.7 and §5.1 (C3, C4). Pure: no I/O.
import type { ClientAction } from './types'

export type RouteCStepId = 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8'
export type RescreenScope = 'new_parties' | 'all_parties'
// Working days. §4.7 mixes day-of-case markers (C1–C4, counted from quote approval = Day 0)
// with durations (C5 48h, C6 ~4 weeks), so each target says what it counts from.
export type TargetDays = { min: number; max: number; from: 'quote_approved' | 'step_start' }

type StepDef = {
  step: RouteCStepId
  name: string
  clientAction: ClientAction
  ifNeeded: boolean // §4.7 "(if needed)": WAIT when nothing is pending
  rescreen: RescreenScope | null
  target: TargetDays | null
}

export const ROUTE_C_STEPS: readonly StepDef[] = [
  { step: 'C0', name: 'Quote', clientAction: 'APPROVE', ifNeeded: false, rescreen: null, target: null },
  { step: 'C1', name: 'End-user certificate', clientAction: 'WAIT', ifNeeded: false, rescreen: null, target: { min: 0, max: 0, from: 'quote_approved' } },
  { step: 'C2', name: 'Application prepared', clientAction: 'ANSWER', ifNeeded: true, rescreen: null, target: { min: 1, max: 2, from: 'quote_approved' } },
  { step: 'C3', name: 'Certificate received', clientAction: 'WAIT', ifNeeded: false, rescreen: 'new_parties', target: { min: 3, max: 4, from: 'quote_approved' } },
  { step: 'C4', name: 'Sign and file', clientAction: 'SIGN', ifNeeded: false, rescreen: 'all_parties', target: { min: 4, max: 5, from: 'quote_approved' } },
  { step: 'C5', name: 'Regulator queries', clientAction: 'ANSWER', ifNeeded: true, rescreen: null, target: { min: 0, max: 2, from: 'step_start' } },
  { step: 'C6', name: 'Decision', clientAction: 'WAIT', ifNeeded: false, rescreen: null, target: { min: 20, max: 20, from: 'step_start' } },
  { step: 'C7', name: 'Granted', clientAction: 'NONE', ifNeeded: false, rescreen: null, target: null },
  { step: 'C8', name: 'Refused', clientAction: 'SELECT', ifNeeded: false, rescreen: null, target: null },
]

const BY_ID = Object.fromEntries(ROUTE_C_STEPS.map((s) => [s.step, s])) as Record<RouteCStepId, StepDef>

export type RouteCState = { step: RouteCStepId; regulatorQuery?: boolean; decision?: 'granted' | 'refused' }

// null = route finished (C7 hands over to monitoring; C8's choice opens a new path).
export function nextRouteCStep(s: RouteCState): RouteCStepId | null {
  switch (s.step) {
    case 'C4':
      return s.regulatorQuery ? 'C5' : 'C6'
    case 'C5':
      return 'C6'
    case 'C6':
      return s.decision === 'granted' ? 'C7' : s.decision === 'refused' ? 'C8' : 'C6'
    case 'C7':
    case 'C8':
      return null
    default:
      return `C${Number(s.step[1]) + 1}` as RouteCStepId
  }
}

export function clientActionForRouteC(step: RouteCStepId, questionPending = true): ClientAction {
  const d = BY_ID[step]
  return d.ifNeeded && !questionPending ? 'WAIT' : d.clientAction
}

// Truthy at C3 (new parties on the certificate) and C4 (all parties before filing), §5.1.
export const rescreenRequiredAt = (step: RouteCStepId): RescreenScope | null => BY_ID[step].rescreen

export const targetDays = (step: RouteCStepId): TargetDays | null => BY_ID[step].target
