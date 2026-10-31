// Route B: general licence, spec §4.6 and §5.1 (B3). Pure: no I/O.
import screening from '../../config/screening.json'
import type { ScreeningConfig } from './screening'
import type { ClientAction, Licence, ScreeningResult } from './types'

// §3 allows one active action per case, so the primary action comes first.
export const ROUTE_B_STEPS: readonly { step: string; name: string; clientActions: ClientAction[]; ifNeeded: boolean }[] = [
  { step: 'B0', name: 'Quote', clientActions: ['APPROVE'], ifNeeded: false },
  { step: 'B1', name: 'Condition check', clientActions: ['ANSWER'], ifNeeded: true },
  { step: 'B2', name: 'Eligibility and registration', clientActions: ['SIGN'], ifNeeded: false },
  { step: 'B3', name: 'Each shipment', clientActions: ['UPLOAD', 'SELECT'], ifNeeded: false },
  { step: 'B4', name: 'Ongoing records', clientActions: ['NONE'], ifNeeded: false },
]

// Licence.conditions / quantity_limits are untyped Json; the server parses them into this.
export type GeneralLicenceTerms = Pick<Licence, 'id' | 'type' | 'reference' | 'expiry'> & {
  destinations: string[]
  allowedPartyIds: string[]
  quantityLimits: Record<string, number> // per item key, cumulative over the licence
  shippedToDate?: Record<string, number>
  conditions: string[] // each one needs a matching declaration on every shipment
}

export type ShipmentInput = {
  destination: string
  consigneeId: string | null
  partyIds: string[]
  items: { key: string; quantity: number }[]
  declarations: string[]
  submittedAt: string // ISO timestamp the client uploaded the shipment details
  screenings: Pick<ScreeningResult, 'party_id' | 'result' | 'decision' | 'screened_at'>[]
}

export type ShipmentException = { code: string; message: string }

const cc = (s: string) => s.trim().toUpperCase()

export function checkShipment(
  s: ShipmentInput,
  lic: GeneralLicenceTerms,
  cfg: Pick<ScreeningConfig, 'prohibitedDestinations'> = screening,
): { ok: boolean; exceptions: ShipmentException[] } {
  const ex: ShipmentException[] = []
  const add = (code: string, message: string) => ex.push({ code, message })

  if (lic.type !== 'general') add('licence_type', `Licence ${lic.reference} is ${lic.type}, not a general licence`)
  // Valid through its expiry date; an unparseable expiry counts as expired.
  if (lic.expiry && (Number.isNaN(Date.parse(lic.expiry)) || lic.expiry.slice(0, 10) < s.submittedAt.slice(0, 10))) {
    add('licence_expired', `Licence ${lic.reference} expired on ${lic.expiry}`)
  }

  const dest = cc(s.destination)
  if (cfg.prohibitedDestinations.includes(dest)) add('prohibited_destination', `${dest} is a prohibited destination`)
  else if (!lic.destinations.map(cc).includes(dest)) add('destination', `${dest} is not a permitted destination under ${lic.reference}`)

  if (!s.consigneeId) add('consignee_missing', 'No consignee named on the shipment')
  else if (!lic.allowedPartyIds.includes(s.consigneeId)) {
    add('consignee_not_allowed', `Consignee ${s.consigneeId} is not an allowed party under ${lic.reference}`)
  }

  for (const { key, quantity } of s.items) {
    const limit = lic.quantityLimits[key]
    if (!Number.isFinite(quantity) || quantity <= 0) add('invalid_quantity', `Quantity for ${key} is not a positive number`)
    else if (limit === undefined) continue
    else if (!Number.isFinite(limit) || limit < 0) add('invalid_limit', `Licence limit for ${key} is malformed`)
    else {
      const total = (lic.shippedToDate?.[key] ?? 0) + quantity
      if (total > limit) add('quantity_limit', `${key}: ${total} would exceed the licence limit of ${limit}`)
    }
  }

  for (const c of lic.conditions) {
    if (!s.declarations.includes(c)) add('condition_undeclared', `Condition "${c}" has no signed declaration for this shipment`)
  }

  // §4.6 B3: every party is re-screened for every shipment. A result from before the
  // shipment was submitted (e.g. the case-open screen) does not count.
  const parties = [...new Set([...s.partyIds, ...(s.consigneeId ? [s.consigneeId] : [])])]
  const submitted = Date.parse(s.submittedAt)
  for (const p of parties) {
    const fresh = s.screenings.filter((r) => r.party_id === p && Date.parse(r.screened_at) >= submitted)
    if (!fresh.length) add('screening_stale', `Party ${p} has not been screened for this shipment`)
    else if (!fresh.some((r) => r.result === 'clear' || r.decision === 'cleared')) {
      add('screening_hit', `Party ${p} screening is not clear; analyst review needed`)
    }
  }

  return { ok: ex.length === 0, exceptions: ex }
}
