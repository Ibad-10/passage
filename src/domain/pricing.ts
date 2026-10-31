// Pricing and quotes, spec §2 and §4.5. Prices live in config/pricing.json, never here.
import pricing from '../../config/pricing.json'
import { can } from './permissions'
import type { Plan, QuoteItem, Role, Route } from './types'

type PriceEntry = { min: number | null; max: number | null; discountPercent?: number; note?: string }
export type PricingConfig = { currency: string; plans: Record<Plan, { items: Record<QuoteItem, PriceEntry> }> }

export const GUARANTEE_TEXT =
  'We guarantee the service, not the government decision: a complete, correct file signed by a qualified officer, reworked at no cost if rejected because of our error. The client remains the legal exporter.'

// Verbatim §4.5. £X/£Y filled by formatRouteMessage. D's reasons are shown separately.
export const ROUTE_MESSAGES: Record<Route, string> = {
  A: 'No licence needed. Sanctions check clear. Signed opinion and record saved.',
  B: 'This can go under a general licence. Setup £X one-off. Shipments: included / £Y each.',
  C: 'An individual licence is needed. Fixed fee £X. Our preparation 3–5 working days. Government decision usually ~4 weeks.',
  D: "We can't support this export.",
}

const LABELS: Record<QuoteItem, string> = {
  emerging: 'Emerging technology review',
  general_setup: 'General licence setup (one-off)',
  general_shipment: 'Shipment under a general licence (each)',
  individual: 'Individual licence pack',
  consultation: 'Consultation',
  sanctions_licence: 'Sanctions licence',
}

// Uses config min; the officer can edit before the quote is shown (plan Task 8).
export function quoteFor(item: QuoteItem, plan: Plan, cfg: PricingConfig = pricing as PricingConfig): { amountPence: number; label: string } {
  const e = cfg.plans[plan].items[item]
  if (e.min == null) throw new Error(`${item} on plan ${plan} has no configured price; the officer must set it`)
  if (e.discountPercent) {
    return { amountPence: Math.round((e.min * (100 - e.discountPercent)) / 100), label: `${LABELS[item]} (${e.discountPercent}% subscription discount)` }
  }
  return { amountPence: e.min, label: e.note ? `${LABELS[item]}: ${e.note.toLowerCase()}` : LABELS[item] }
}

type RouteQuote = { item: QuoteItem; amountPence: number; label: string }
const ROUTE_ITEMS: Partial<Record<Route, QuoteItem[]>> = { B: ['general_setup', 'general_shipment'], C: ['individual'] }

export function quotesForRoute(route: Route, plan: Plan, opts: { both?: boolean } = {}): RouteQuote[] {
  if (route === 'A' || route === 'D') return []
  const items = opts.both ? [...ROUTE_ITEMS.B!, ...ROUTE_ITEMS.C!] : ROUTE_ITEMS[route]!
  return items.map((item) => ({ item, ...quoteFor(item, plan) }))
}

export function formatRouteMessage(route: Route, quotes: { item: QuoteItem; amountPence: number }[]): string {
  const amt = (item: QuoteItem) => quotes.find((q) => q.item === item)?.amountPence ?? 0
  if (route === 'B') {
    const ship = amt('general_shipment')
    return ROUTE_MESSAGES.B.replace('£X', formatGBP(amt('general_setup'))).replace('included / £Y each', ship ? `${formatGBP(ship)} each` : 'included')
  }
  if (route === 'C') return ROUTE_MESSAGES.C.replace('£X', formatGBP(amt('individual')))
  return ROUTE_MESSAGES[route]
}

export const canApproveQuote = (role: Role): boolean => can(role, 'approve_quote')

export function formatGBP(pence: number): string {
  const pounds = pence / 100
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: Number.isInteger(pounds) ? 0 : 2 }).format(pounds)
}
