import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import pricing from '../../config/pricing.json'
import {
  GUARANTEE_TEXT,
  ROUTE_MESSAGES,
  canApproveQuote,
  formatGBP,
  formatRouteMessage,
  quoteFor,
  quotesForRoute,
  type PricingConfig,
} from '@/domain/pricing'
import type { Role, Route } from '@/domain/types'

const P = pricing.plans.P.items
const S = pricing.plans.S.items

describe('quoteFor', () => {
  it('uses the config min', () => {
    expect(quoteFor('individual', 'P').amountPence).toBe(P.individual.min)
    expect(quoteFor('general_setup', 'S').amountPence).toBe(S.general_setup.min)
    expect(quoteFor('emerging', 'P').amountPence).toBe(P.emerging.min)
  })

  it('applies the configured Plan S discount to individual', () => {
    const expected = Math.round((S.individual.min * (100 - S.individual.discountPercent)) / 100)
    expect(quoteFor('individual', 'S').amountPence).toBe(expected)
    expect(expected).toBeLessThan(S.individual.min)
  })

  it('general_shipment on S is 0, included up to tier limit', () => {
    const q = quoteFor('general_shipment', 'S')
    expect(q.amountPence).toBe(0)
    expect(q.label.toLowerCase()).toContain('included up to tier limit')
  })

  it('general_shipment on P uses the config per-shipment price', () => {
    expect(quoteFor('general_shipment', 'P').amountPence).toBe(P.general_shipment.min)
  })

  it('reads prices from the cfg passed in, not hard-coded values', () => {
    const cfg = structuredClone(pricing) as PricingConfig
    cfg.plans.P.items.individual.min = 123400
    expect(quoteFor('individual', 'P', cfg).amountPence).toBe(123400)
  })

  it('throws rather than quoting £0 when the config has no price (hourly items)', () => {
    expect(() => quoteFor('consultation', 'P')).toThrow(/no configured price/)
    expect(() => quoteFor('sanctions_licence', 'S')).toThrow(/no configured price/)
  })
})

describe('quotesForRoute', () => {
  for (const plan of ['P', 'S'] as const) {
    it(`A and D never produce a fee (plan ${plan}, with or without both)`, () => {
      for (const r of ['A', 'D'] as Route[]) {
        expect(quotesForRoute(r, plan)).toEqual([])
        expect(quotesForRoute(r, plan, { both: true })).toEqual([])
      }
    })
  }

  it('B gives general_setup plus a general_shipment line', () => {
    expect(quotesForRoute('B', 'P')).toEqual([
      { item: 'general_setup', ...quoteFor('general_setup', 'P') },
      { item: 'general_shipment', ...quoteFor('general_shipment', 'P') },
    ])
  })

  it('C gives individual', () => {
    expect(quotesForRoute('C', 'S')).toEqual([{ item: 'individual', ...quoteFor('individual', 'S') }])
  })

  it('both gives the B and C sets', () => {
    expect(quotesForRoute('B', 'P', { both: true }).map((q) => q.item)).toEqual(['general_setup', 'general_shipment', 'individual'])
    expect(quotesForRoute('C', 'P', { both: true })).toEqual(quotesForRoute('B', 'P', { both: true }))
  })
})

describe('copy', () => {
  it('guarantee text is exact', () => {
    expect(GUARANTEE_TEXT).toBe(
      'We guarantee the service, not the government decision: a complete, correct file signed by a qualified officer, reworked at no cost if rejected because of our error. The client remains the legal exporter.',
    )
  })

  it('guarantee and route messages appear verbatim in the spec', () => {
    const spec = readFileSync('docs/build-plan.md', 'utf8')
    expect(spec).toContain(GUARANTEE_TEXT)
    for (const r of ['A', 'B', 'C', 'D'] as Route[]) expect(spec).toContain(`"${ROUTE_MESSAGES[r]}"`)
  })

  it('formatRouteMessage fills £X/£Y', () => {
    const fmt = (n: number) => formatGBP(n)
    expect(formatRouteMessage('B', quotesForRoute('B', 'P'))).toBe(
      `This can go under a general licence. Setup ${fmt(P.general_setup.min)} one-off. Shipments: ${fmt(P.general_shipment.min)} each.`,
    )
    expect(formatRouteMessage('B', quotesForRoute('B', 'S'))).toBe(
      `This can go under a general licence. Setup ${fmt(S.general_setup.min)} one-off. Shipments: included.`,
    )
    expect(formatRouteMessage('C', quotesForRoute('C', 'P'))).toBe(
      `An individual licence is needed. Fixed fee ${fmt(P.individual.min)}. Our preparation 3–5 working days. Government decision usually ~4 weeks.`,
    )
    expect(formatRouteMessage('A', [])).toBe(ROUTE_MESSAGES.A)
    expect(formatRouteMessage('D', [])).toBe(ROUTE_MESSAGES.D)
  })
})

describe('canApproveQuote', () => {
  it('only client_admin and client_approver', () => {
    const all: Role[] = ['client_admin', 'client_member', 'client_approver', 'client_viewer', 'buyer', 'analyst', 'officer', 'specialist', 'partner', 'ops_admin']
    expect(all.filter(canApproveQuote)).toEqual(['client_admin', 'client_approver'])
    expect(canApproveQuote('client_member')).toBe(false)
  })
})

describe('formatGBP', () => {
  it('formats pence as pounds', () => {
    expect(formatGBP(150000)).toBe('£1,500')
    expect(formatGBP(2500)).toBe('£25')
    expect(formatGBP(2550)).toBe('£25.50')
    expect(formatGBP(0)).toBe('£0')
  })
})
