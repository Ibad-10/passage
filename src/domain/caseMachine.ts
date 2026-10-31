// Case state machine, spec §6. Pure: no I/O.
import type { CaseState, ClientAction, Route, ScreeningVerdict } from './types'

export type CaseEvent =
  | { type: 'submit'; complete: boolean }
  | { type: 'filesAdded' }
  | { type: 'screened'; verdict: ScreeningVerdict }
  | { type: 'askClient' }
  | { type: 'clientAnswered' }
  | { type: 'sanctionsCleared' }
  | { type: 'sanctionsConfirmed' }
  | { type: 'emergingFlag' }
  | { type: 'classified' }
  | { type: 'approve' }
  | { type: 'decline' }
  | { type: 'emergingDone' }
  | { type: 'officerRoute'; route: Route }
  | { type: 'needClient'; kind: 'ANSWER' | 'SIGN' }
  | { type: 'filed' }
  | { type: 'granted' }
  | { type: 'refused' }
  | { type: 'routeBLive' }
  | { type: 'licenceActive' } // Granted -> Active; §6 has the edge, the plan's event list did not
  | { type: 'startMonitoring' }
  | { type: 'newListHit' }

export class IllegalTransition extends Error {
  constructor(
    public readonly state: CaseState,
    public readonly event: CaseEvent['type'],
  ) {
    super(`Illegal transition: ${event} from ${state}`)
    this.name = 'IllegalTransition'
  }
}

type Target<K extends CaseEvent['type']> = CaseState | ((e: Extract<CaseEvent, { type: K }>) => CaseState)
type Edges = { [K in CaseEvent['type']]?: Target<K> }

const ROUTE_TARGET: Record<Route, CaseState> = {
  A: 'ClosedNotControlled',
  B: 'RouteQuote',
  C: 'RouteQuote',
  D: 'ClosedDoNotProceed',
}

const SCREENED_TARGET: Record<ScreeningVerdict, CaseState> = {
  clear: 'Classifying',
  possible: 'SanctionsReview',
  red_flag: 'SanctionsReview',
  match: 'ClosedDoNotProceed', // prohibited destination (§5.3); name matches arrive as 'possible'
}

const EDGES: Record<CaseState, Edges> = {
  Draft: { submit: (e) => (e.complete ? 'SanctionsCheck' : 'IntakeIncomplete') },
  IntakeIncomplete: { filesAdded: 'Draft' },
  SanctionsCheck: { screened: (e) => SCREENED_TARGET[e.verdict] },
  SanctionsReview: { askClient: 'AwaitingClient', sanctionsCleared: 'Classifying', sanctionsConfirmed: 'ClosedDoNotProceed' },
  AwaitingClient: { clientAnswered: 'SanctionsReview' },
  Classifying: { askClient: 'AwaitingClient2', emergingFlag: 'EmergingQuote', classified: 'OfficerReview' },
  AwaitingClient2: { clientAnswered: 'Classifying' },
  EmergingQuote: { approve: 'EmergingReview', decline: 'Closed' },
  EmergingReview: { emergingDone: 'OfficerReview' },
  OfficerReview: { officerRoute: (e) => ROUTE_TARGET[e.route] },
  RouteQuote: { approve: 'RouteInProgress', decline: 'Closed' },
  RouteInProgress: { needClient: 'AwaitingClient3', filed: 'Filed', routeBLive: 'Active' },
  AwaitingClient3: { clientAnswered: 'RouteInProgress' },
  Filed: { granted: 'Granted', refused: 'Refused' },
  Granted: { licenceActive: 'Active' },
  Active: { startMonitoring: 'Monitoring' },
  Monitoring: { newListHit: 'SanctionsReview' },
  Refused: {},
  ClosedNotControlled: {},
  ClosedDoNotProceed: {},
  Closed: {},
}

export function transition(state: CaseState, event: CaseEvent): CaseState {
  const target = EDGES[state][event.type] as Target<typeof event.type> | undefined
  if (target === undefined) throw new IllegalTransition(state, event.type)
  return typeof target === 'function' ? (target as (e: CaseEvent) => CaseState)(event) : target
}

const ACTION: Partial<Record<CaseState, ClientAction>> = {
  Draft: 'UPLOAD',
  IntakeIncomplete: 'UPLOAD',
  AwaitingClient: 'ANSWER',
  AwaitingClient2: 'ANSWER',
  EmergingQuote: 'APPROVE',
  RouteQuote: 'APPROVE',
  Refused: 'SELECT',
  Granted: 'NONE',
  Active: 'NONE',
  Monitoring: 'NONE',
  ClosedNotControlled: 'NONE',
  ClosedDoNotProceed: 'NONE',
  Closed: 'NONE',
}

export function clientActionFor(state: CaseState, pending?: 'ANSWER' | 'SIGN'): ClientAction {
  if (state === 'AwaitingClient3') return pending ?? 'ANSWER'
  return ACTION[state] ?? 'WAIT'
}
