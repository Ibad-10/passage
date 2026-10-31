import { describe, expect, it } from 'vitest'
import { clientActionFor } from '@/domain/caseMachine'
import {
  ROUTE_C_STEPS,
  clientActionForRouteC,
  nextRouteCStep,
  rescreenRequiredAt,
  targetDays,
} from '@/domain/routeC'

describe('Route C step model', () => {
  it('has C0..C8 in order', () => {
    expect(ROUTE_C_STEPS.map((s) => s.step)).toEqual(['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'])
  })

  it('walks the happy path to granted', () => {
    const path = ['C0']
    let step = nextRouteCStep({ step: 'C0' })
    while (step) {
      path.push(step)
      step = nextRouteCStep({ step, decision: 'granted' })
    }
    expect(path).toEqual(['C0', 'C1', 'C2', 'C3', 'C4', 'C6', 'C7'])
  })

  it('goes C4 -> C5 only when the regulator raised a query, then C5 -> C6', () => {
    expect(nextRouteCStep({ step: 'C4', regulatorQuery: true })).toBe('C5')
    expect(nextRouteCStep({ step: 'C4' })).toBe('C6')
    expect(nextRouteCStep({ step: 'C5' })).toBe('C6')
  })

  it('C6 branches on the decision and waits without one', () => {
    expect(nextRouteCStep({ step: 'C6', decision: 'granted' })).toBe('C7')
    expect(nextRouteCStep({ step: 'C6', decision: 'refused' })).toBe('C8')
    expect(nextRouteCStep({ step: 'C6' })).toBe('C6')
  })

  it('C7 and C8 are terminal', () => {
    expect(nextRouteCStep({ step: 'C7' })).toBeNull()
    expect(nextRouteCStep({ step: 'C8' })).toBeNull()
  })

  it('maps client actions per §4.7', () => {
    expect(ROUTE_C_STEPS.map((s) => clientActionForRouteC(s.step))).toEqual([
      'APPROVE', 'WAIT', 'ANSWER', 'WAIT', 'SIGN', 'ANSWER', 'WAIT', 'NONE', 'SELECT',
    ])
  })

  it('"if needed" steps show WAIT when no question is pending', () => {
    expect(clientActionForRouteC('C2', false)).toBe('WAIT')
    expect(clientActionForRouteC('C5', false)).toBe('WAIT')
    expect(clientActionForRouteC('C4', false)).toBe('SIGN') // not optional
  })

  it('agrees with the case machine on shared states', () => {
    expect(clientActionForRouteC('C0')).toBe(clientActionFor('RouteQuote'))
    expect(clientActionForRouteC('C7')).toBe(clientActionFor('Granted'))
    expect(clientActionForRouteC('C8')).toBe(clientActionFor('Refused'))
  })

  it('re-screens new parties at C3 and all parties at C4 only (§5.1)', () => {
    const scopes = Object.fromEntries(ROUTE_C_STEPS.map((s) => [s.step, rescreenRequiredAt(s.step)]))
    expect(scopes).toEqual({
      C0: null, C1: null, C2: null, C3: 'new_parties', C4: 'all_parties', C5: null, C6: null, C7: null, C8: null,
    })
  })

  it('gives §4.7 target times in working days', () => {
    expect(targetDays('C1')).toEqual({ min: 0, max: 0, from: 'quote_approved' })
    expect(targetDays('C3')).toEqual({ min: 3, max: 4, from: 'quote_approved' })
    expect(targetDays('C4')).toEqual({ min: 4, max: 5, from: 'quote_approved' })
    expect(targetDays('C5')).toEqual({ min: 0, max: 2, from: 'step_start' })
    expect(targetDays('C6')).toEqual({ min: 20, max: 20, from: 'step_start' })
    expect(targetDays('C0')).toBeNull()
    expect(targetDays('C8')).toBeNull()
  })
})
