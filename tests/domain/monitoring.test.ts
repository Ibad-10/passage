import { describe, expect, it } from 'vitest'
import cfg from '../../config/monitoring.json'
import { isExpiringSoon, monitoringEvents, type MonitoringInput } from '@/domain/monitoring'

const now = new Date('2026-10-31T09:00:00Z')

const input = (over: Partial<MonitoringInput> = {}): MonitoringInput => ({
  licences: [],
  cases: [],
  screeningHits: [],
  ruleChanges: [],
  classifications: [],
  ...over,
})

describe('isExpiringSoon', () => {
  it('uses the configured 60-day window, inclusive', () => {
    expect(cfg.renewalWindowDays).toBe(60)
    expect(isExpiringSoon('2026-12-30', now)).toBe(true) // 60 days
    expect(isExpiringSoon('2026-12-31', now)).toBe(false) // 61 days
    expect(isExpiringSoon('2026-10-31', now)).toBe(true) // expires today
  })

  it('takes a custom window', () => {
    expect(isExpiringSoon('2026-12-30', now, 30)).toBe(false)
    expect(isExpiringSoon('2026-11-30', now, 30)).toBe(true)
  })

  it('is false for no expiry, an already expired licence, or junk', () => {
    expect(isExpiringSoon(null, now)).toBe(false)
    expect(isExpiringSoon('2026-10-30', now)).toBe(false)
    expect(isExpiringSoon('not a date', now)).toBe(false)
  })
})

describe('monitoringEvents', () => {
  it('pauses an open case and its shipments when a party is hit', () => {
    const events = monitoringEvents(
      now,
      input({
        cases: [{ id: 'c1', state: 'Active', party_ids: ['p1', 'p2'] }],
        licences: [{ id: 'l1', case_id: 'c1', reference: 'GEN-1', expiry: null }],
        screeningHits: [{ party_id: 'p2', result: 'possible' }],
      }),
    )
    expect(events).toEqual([
      expect.objectContaining({
        type: 'sanctions_hit',
        caseId: 'c1',
        partyId: 'p2',
        licenceIds: ['l1'],
        actions: ['pause_case', 'pause_shipments', 'analyst_task'],
        clientAction: 'WAIT',
      }),
    ])
    expect(events[0].reason).toMatch(/p2/)
  })

  it('ignores clear results, unrelated parties and closed cases', () => {
    const events = monitoringEvents(
      now,
      input({
        cases: [
          { id: 'c1', state: 'Monitoring', party_ids: ['p1'] },
          { id: 'c2', state: 'ClosedDoNotProceed', party_ids: ['p9'] },
          { id: 'c3', state: 'Refused', party_ids: ['p9'] },
        ],
        screeningHits: [
          { party_id: 'p1', result: 'clear' },
          { party_id: 'p9', result: 'match' },
          { party_id: 'p7', result: 'match' },
        ],
      }),
    )
    expect(events).toEqual([])
  })

  it('quotes a renewal for a licence expiring within 60 days', () => {
    const events = monitoringEvents(
      now,
      input({
        licences: [
          { id: 'l1', case_id: 'c1', reference: 'IND-1', expiry: '2026-12-01' },
          { id: 'l2', case_id: 'c2', reference: 'IND-2', expiry: '2027-06-01' },
        ],
      }),
    )
    expect(events).toEqual([
      expect.objectContaining({ type: 'licence_renewal', licenceId: 'l1', caseId: 'c1', daysLeft: 31, clientAction: 'APPROVE' }),
    ])
  })

  it('honours a configured window', () => {
    const lic = { id: 'l1', case_id: 'c1', reference: 'IND-1', expiry: '2026-12-01' }
    expect(monitoringEvents(now, input({ licences: [lic] }), { renewalWindowDays: 30 })).toEqual([])
  })

  it('opens a new case when a rule change touches a classified list entry', () => {
    const events = monitoringEvents(
      now,
      input({
        cases: [
          { id: 'c1', state: 'Active', party_ids: [] },
          { id: 'c2', state: 'Active', party_ids: [] },
          { id: 'c3', state: 'ClosedDoNotProceed', party_ids: [] },
        ],
        classifications: [
          { case_id: 'c1', list_entries: ['ML10a'] },
          { case_id: 'c2', list_entries: ['5A002'] },
          { case_id: 'c3', list_entries: ['ml10a'] },
        ],
        ruleChanges: [{ id: 'r1', list_entries: [' ml10A '], summary: 'ML10 amended' }],
      }),
    )
    expect(events).toEqual([
      expect.objectContaining({ type: 'rule_change', caseId: 'c1', ruleChangeId: 'r1', listEntries: ['ML10a'], action: 'open_new_case' }),
    ])
  })
})
