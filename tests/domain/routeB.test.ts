import { describe, expect, it } from 'vitest'
import { ROUTE_B_STEPS, checkShipment, type GeneralLicenceTerms, type ShipmentInput } from '@/domain/routeB'

const licence: GeneralLicenceTerms = {
  id: 'lic1',
  type: 'general',
  reference: 'GEN-1',
  expiry: '2027-06-30',
  destinations: ['UA', 'PL'],
  allowedPartyIds: ['cons1'],
  quantityLimits: { 'prod-a': 100 },
  shippedToDate: { 'prod-a': 60 },
  conditions: ['no_onward_transfer'],
}

const fresh = (party_id: string, over: Partial<ShipmentInput['screenings'][number]> = {}) => ({
  party_id,
  result: 'clear' as const,
  decision: null,
  screened_at: '2026-11-02T10:05:00Z',
  ...over,
})

const ship = (over: Partial<ShipmentInput> = {}): ShipmentInput => ({
  destination: 'UA',
  consigneeId: 'cons1',
  partyIds: ['buyer1', 'cons1'],
  items: [{ key: 'prod-a', quantity: 30 }],
  declarations: ['no_onward_transfer'],
  submittedAt: '2026-11-02T10:00:00Z',
  screenings: [fresh('buyer1'), fresh('cons1')],
  ...over,
})

const codes = (s: ShipmentInput, l: GeneralLicenceTerms = licence) => checkShipment(s, l).exceptions.map((e) => e.code)

describe('Route B model', () => {
  it('has B0..B4 with §4.6 client actions, primary first', () => {
    expect(ROUTE_B_STEPS.map((s) => [s.step, s.clientActions])).toEqual([
      ['B0', ['APPROVE']],
      ['B1', ['ANSWER']],
      ['B2', ['SIGN']],
      ['B3', ['UPLOAD', 'SELECT']],
      ['B4', ['NONE']],
    ])
  })
})

describe('checkShipment', () => {
  it('passes a clean shipment', () => {
    expect(checkShipment(ship(), licence)).toEqual({ ok: true, exceptions: [] })
  })

  it('every exception carries a readable message', () => {
    const r = checkShipment(ship({ destination: 'CN' }), licence)
    expect(r.ok).toBe(false)
    expect(r.exceptions[0].message).toMatch(/CN/)
  })

  it('flags a cumulative quantity overrun (60 shipped + 50 > 100)', () => {
    expect(codes(ship({ items: [{ key: 'prod-a', quantity: 50 }] }))).toEqual(['quantity_limit'])
    expect(codes(ship({ items: [{ key: 'prod-a', quantity: 40 }] }))).toEqual([])
  })

  it('rejects junk quantities and junk limits', () => {
    expect(codes(ship({ items: [{ key: 'prod-a', quantity: 0 }] }))).toEqual(['invalid_quantity'])
    expect(codes(ship({ items: [{ key: 'prod-a', quantity: Number.NaN }] }))).toEqual(['invalid_quantity'])
    expect(codes(ship(), { ...licence, quantityLimits: { 'prod-a': -1 } })).toEqual(['invalid_limit'])
  })

  it('flags a destination outside the licence', () => {
    expect(codes(ship({ destination: 'cn' }))).toEqual(['destination'])
    expect(codes(ship({ destination: ' ua ' }))).toEqual([])
  })

  it('flags a prohibited destination even if the licence lists it', () => {
    expect(codes(ship({ destination: 'RU' }), { ...licence, destinations: ['UA', 'RU'] })).toEqual(['prohibited_destination'])
  })

  it('flags a missing consignee or one outside the allowed parties', () => {
    expect(codes(ship({ consigneeId: null }))).toEqual(['consignee_missing'])
    expect(codes(ship({ consigneeId: 'other', screenings: [fresh('buyer1'), fresh('cons1'), fresh('other')] }))).toEqual([
      'consignee_not_allowed',
    ])
  })

  it('needs a declaration for every licence condition', () => {
    expect(codes(ship({ declarations: [] }))).toEqual(['condition_undeclared'])
    expect(codes(ship(), { ...licence, conditions: ['no_onward_transfer', 'end_use_civil'] })).toEqual(['condition_undeclared'])
  })

  it('flags a non-general or expired licence', () => {
    expect(codes(ship(), { ...licence, type: 'individual' })).toEqual(['licence_type'])
    expect(codes(ship(), { ...licence, expiry: '2026-11-01' })).toEqual(['licence_expired'])
    expect(codes(ship(), { ...licence, expiry: '2026-11-02' })).toEqual([]) // valid through its last day
  })

  describe('fresh screening (§4.6 B3)', () => {
    it('rejects a case-open screening result reused for the shipment', () => {
      const stale = fresh('buyer1', { screened_at: '2026-10-01T09:00:00Z' })
      expect(codes(ship({ screenings: [stale, fresh('cons1')] }))).toEqual(['screening_stale'])
    })

    it('rejects a party with no screening at all', () => {
      expect(codes(ship({ screenings: [fresh('cons1')] }))).toEqual(['screening_stale'])
    })

    it('sends a fresh non-clear result to an analyst unless an officer cleared it', () => {
      expect(codes(ship({ screenings: [fresh('buyer1', { result: 'possible' }), fresh('cons1')] }))).toEqual(['screening_hit'])
      expect(
        codes(ship({ screenings: [fresh('buyer1', { result: 'possible', decision: 'cleared' }), fresh('cons1')] })),
      ).toEqual([])
    })

    it('screens the consignee even if it is not in partyIds', () => {
      expect(codes(ship({ partyIds: ['buyer1'], screenings: [fresh('buyer1')] }))).toEqual(['screening_stale'])
    })
  })
})
