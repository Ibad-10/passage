// Monitoring after any route, spec §4.8 and §5.1 (daily). Pure: the daily job does the I/O
// and drives case state; this only says what happened and what to do.
import monitoring from '../../config/monitoring.json'
import type { Case, CaseState, Classification, ClientAction, Licence, ScreeningResult } from './types'

export type MonitoringConfig = { renewalWindowDays: number }

export type MonitoringInput = {
  licences: Pick<Licence, 'id' | 'case_id' | 'reference' | 'expiry'>[]
  cases: Pick<Case, 'id' | 'state' | 'party_ids'>[]
  screeningHits: Pick<ScreeningResult, 'party_id' | 'result'>[] // results of the latest re-screen
  ruleChanges: { id: string; list_entries: string[]; summary: string }[]
  classifications: Pick<Classification, 'case_id' | 'list_entries'>[] // a case's list entries live here
}

export type MonitoringEvent =
  | {
      type: 'sanctions_hit'
      caseId: string
      partyId: string
      licenceIds: string[]
      actions: ['pause_case', 'pause_shipments', 'analyst_task']
      clientAction: ClientAction
      reason: string
    }
  | { type: 'licence_renewal'; licenceId: string; caseId: string; expiry: string; daysLeft: number; clientAction: ClientAction; reason: string }
  | { type: 'rule_change'; caseId: string; ruleChangeId: string; listEntries: string[]; action: 'open_new_case'; clientAction: ClientAction; reason: string }

// §6 terminal states. Refused is terminal there: the client's C8 choice starts a new path.
const FINISHED: CaseState[] = ['ClosedNotControlled', 'ClosedDoNotProceed', 'Closed', 'Refused']
// A not-controlled product can become controlled, so rule changes still reach ClosedNotControlled.
const NO_RULE_WATCH: CaseState[] = ['ClosedDoNotProceed', 'Closed']

const DAY = 86_400_000
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

function daysLeft(expiry: string | null, now: Date): number | null {
  const exp = expiry ? Date.parse(expiry.slice(0, 10)) : NaN
  return Number.isNaN(exp) ? null : Math.round((exp - utcDay(now)) / DAY)
}

// Inclusive window; an already-expired licence is not "expiring" (checkShipment blocks its use).
export function isExpiringSoon(expiry: string | null, now: Date, windowDays = monitoring.renewalWindowDays): boolean {
  const d = daysLeft(expiry, now)
  return d !== null && d >= 0 && d <= windowDays
}

const entry = (s: string) => s.trim().toUpperCase()

export function monitoringEvents(now: Date, input: MonitoringInput, cfg: MonitoringConfig = monitoring): MonitoringEvent[] {
  const events: MonitoringEvent[] = []

  const hitParties = new Set(input.screeningHits.filter((h) => h.result !== 'clear').map((h) => h.party_id))
  for (const c of input.cases) {
    if (FINISHED.includes(c.state)) continue
    for (const partyId of c.party_ids.filter((p) => hitParties.has(p))) {
      events.push({
        type: 'sanctions_hit',
        caseId: c.id,
        partyId,
        licenceIds: input.licences.filter((l) => l.case_id === c.id).map((l) => l.id),
        actions: ['pause_case', 'pause_shipments', 'analyst_task'],
        clientAction: 'WAIT',
        reason: `Sanctions list update hit party ${partyId}; case and shipments paused for analyst review`,
      })
    }
  }

  for (const l of input.licences) {
    if (!isExpiringSoon(l.expiry, now, cfg.renewalWindowDays)) continue
    const d = daysLeft(l.expiry, now)!
    events.push({
      type: 'licence_renewal',
      licenceId: l.id,
      caseId: l.case_id,
      expiry: l.expiry!,
      daysLeft: d,
      clientAction: 'APPROVE',
      reason: `Licence ${l.reference} expires in ${d} days; renewal quote to approve`,
    })
  }

  const watched = new Set(input.cases.filter((c) => !NO_RULE_WATCH.includes(c.state)).map((c) => c.id))
  for (const rc of input.ruleChanges) {
    const changed = new Set(rc.list_entries.map(entry))
    for (const cl of input.classifications) {
      const touched = cl.list_entries.filter((e) => changed.has(entry(e)))
      if (!watched.has(cl.case_id) || !touched.length) continue
      events.push({
        type: 'rule_change',
        caseId: cl.case_id,
        ruleChangeId: rc.id,
        listEntries: touched,
        action: 'open_new_case',
        clientAction: 'NONE', // alert; the new case asks for its own quote approval
        reason: `Rule change "${rc.summary}" affects ${touched.join(', ')}; re-classification case opened`,
      })
    }
  }

  return events
}
