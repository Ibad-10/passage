import { describe, expect, it } from 'vitest'
import { CaseEvent, IllegalTransition, clientActionFor, transition } from '@/domain/caseMachine'
import { CASE_STATES, CLIENT_ACTIONS, CaseState } from '@/domain/types'

const run = (start: CaseState, ...events: CaseEvent[]) => events.reduce(transition, start)

describe('transition', () => {
  it('happy path to route C', () => {
    expect(
      run(
        'Draft',
        { type: 'submit', complete: true },
        { type: 'screened', verdict: 'clear' },
        { type: 'classified' },
        { type: 'officerRoute', route: 'C' },
        { type: 'approve' },
      ),
    ).toBe('RouteInProgress')
  })

  it('incomplete intake loops back to Draft', () => {
    expect(transition('Draft', { type: 'submit', complete: false })).toBe('IntakeIncomplete')
    expect(transition('IntakeIncomplete', { type: 'filesAdded' })).toBe('Draft')
  })

  it('possible match goes through review and client question', () => {
    expect(transition('SanctionsCheck', { type: 'screened', verdict: 'possible' })).toBe('SanctionsReview')
    expect(transition('SanctionsCheck', { type: 'screened', verdict: 'red_flag' })).toBe('SanctionsReview')
    expect(
      run('SanctionsReview', { type: 'askClient' }, { type: 'clientAnswered' }, { type: 'sanctionsCleared' }),
    ).toBe('Classifying')
    expect(transition('SanctionsReview', { type: 'askClient' })).toBe('AwaitingClient')
  })

  it('prohibited destination at screening closes the case', () => {
    expect(transition('SanctionsCheck', { type: 'screened', verdict: 'match' })).toBe('ClosedDoNotProceed')
  })

  it('closing outcomes', () => {
    expect(transition('SanctionsReview', { type: 'sanctionsConfirmed' })).toBe('ClosedDoNotProceed')
    expect(transition('OfficerReview', { type: 'officerRoute', route: 'A' })).toBe('ClosedNotControlled')
    expect(transition('OfficerReview', { type: 'officerRoute', route: 'D' })).toBe('ClosedDoNotProceed')
    expect(transition('OfficerReview', { type: 'officerRoute', route: 'B' })).toBe('RouteQuote')
    expect(transition('RouteQuote', { type: 'decline' })).toBe('Closed')
  })

  it('emerging technology sub-process', () => {
    expect(transition('Classifying', { type: 'emergingFlag' })).toBe('EmergingQuote')
    expect(transition('EmergingQuote', { type: 'decline' })).toBe('Closed')
    expect(run('EmergingQuote', { type: 'approve' }, { type: 'emergingDone' })).toBe('OfficerReview')
  })

  it('classification question goes to AwaitingClient2 and back', () => {
    expect(run('Classifying', { type: 'askClient' })).toBe('AwaitingClient2')
    expect(run('Classifying', { type: 'askClient' }, { type: 'clientAnswered' })).toBe('Classifying')
  })

  it('route C and B tail, monitoring and new list hit', () => {
    expect(run('RouteInProgress', { type: 'needClient', kind: 'SIGN' })).toBe('AwaitingClient3')
    expect(run('AwaitingClient3', { type: 'clientAnswered' })).toBe('RouteInProgress')
    expect(run('RouteInProgress', { type: 'filed' }, { type: 'granted' })).toBe('Granted')
    expect(run('Filed', { type: 'refused' })).toBe('Refused')
    expect(run('Granted', { type: 'licenceActive' }, { type: 'startMonitoring' })).toBe('Monitoring')
    expect(run('RouteInProgress', { type: 'routeBLive' })).toBe('Active')
    expect(run('Monitoring', { type: 'newListHit' })).toBe('SanctionsReview')
  })

  it('Review Focus 1: approving an already approved quote is illegal', () => {
    expect(() => transition('RouteInProgress', { type: 'approve' })).toThrow(IllegalTransition)
  })

  it('terminal states accept nothing', () => {
    for (const s of ['ClosedNotControlled', 'ClosedDoNotProceed', 'Closed', 'Refused'] as const) {
      expect(() => transition(s, { type: 'approve' })).toThrow(IllegalTransition)
    }
  })
})

describe('clientActionFor', () => {
  it('every state maps to exactly one client action', () => {
    for (const s of CASE_STATES) expect(CLIENT_ACTIONS).toContain(clientActionFor(s))
  })

  it('uses the plan mapping', () => {
    expect(clientActionFor('Draft')).toBe('UPLOAD')
    expect(clientActionFor('IntakeIncomplete')).toBe('UPLOAD')
    expect(clientActionFor('AwaitingClient')).toBe('ANSWER')
    expect(clientActionFor('AwaitingClient2')).toBe('ANSWER')
    expect(clientActionFor('AwaitingClient3')).toBe('ANSWER')
    expect(clientActionFor('AwaitingClient3', 'SIGN')).toBe('SIGN')
    expect(clientActionFor('EmergingQuote')).toBe('APPROVE')
    expect(clientActionFor('RouteQuote')).toBe('APPROVE')
    expect(clientActionFor('Refused')).toBe('SELECT')
    expect(clientActionFor('Granted')).toBe('NONE')
    expect(clientActionFor('ClosedDoNotProceed')).toBe('NONE')
    expect(clientActionFor('SanctionsCheck')).toBe('WAIT')
    expect(clientActionFor('OfficerReview')).toBe('WAIT')
  })
})
