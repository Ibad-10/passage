// Diversion red flags, spec §5.2. Pure: no I/O. Flags go to an analyst; they never stop a case alone (§5.3).
import redFlags from '../../config/redFlags.json'
import screening from '../../config/screening.json'
import { nameSimilarity, type ScreeningConfig } from './screening'
import type { Party, PartyType } from './types'

export type RedFlagConfig = {
  neighbours: Record<string, string[]>
  sectors: Record<string, string[]>
} & Pick<ScreeningConfig, 'redFlagCountries' | 'matchThreshold'>

export type RedFlagInput = {
  destination: string
  endUse: string
  parties: Pick<Party, 'id' | 'name' | 'type' | 'country'>[]
  buyerBusiness?: string | null // what the buyer does, from intake or the end-user certificate
  payer?: { name: string } | null // null = not known yet
}

export type RedFlagCode = 'unusual_routing' | 'sanctioned_neighbour' | 'end_use_mismatch' | 'missing_end_user' | 'third_party_payer'
export type RedFlag = { code: RedFlagCode; reason: string; heuristic?: true }

// Same as INTERMEDIARY_TYPES in screening.ts (not exported there): §8 has no "distributor" type.
const INTERMEDIARY_TYPES: PartyType[] = ['intermediary', 'forwarder', 'agent']

const cc = (s: string) => s.trim().toUpperCase()
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function diversionRedFlags(input: RedFlagInput, cfg: RedFlagConfig = { ...redFlags, ...screening }): RedFlag[] {
  const flags: RedFlag[] = []
  const dest = cc(input.destination)
  // ponytail: partial adjacency map, an unknown country counts as not adjacent (flags more,
  // never less). Swap in a full ISO border dataset if analysts see noise.
  const adjacent = (a: string, b: string) => !!cfg.neighbours[a]?.includes(b) || !!cfg.neighbours[b]?.includes(a)

  for (const c of input.parties.filter((x) => x.type === 'consignee')) {
    const country = cc(c.country)
    if (country && country !== dest && !adjacent(country, dest)) {
      flags.push({ code: 'unusual_routing', reason: `Consignee ${c.name} is in ${country}, which is neither the destination ${dest} nor next to it` })
    }
  }

  for (const i of input.parties.filter((x) => INTERMEDIARY_TYPES.includes(x.type))) {
    const country = cc(i.country)
    if (cfg.redFlagCountries.includes(country)) {
      flags.push({ code: 'sanctioned_neighbour', reason: `${i.type} ${i.name} is in ${country}, a country next to a sanctioned state or a known diversion hub` })
    }
  }

  // ponytail: keyword sectors, so "agri drone for the army" style overlaps slip through and
  // unusual phrasing is missed. Upgrade to analyst-tagged buyer sectors.
  const sectorsOf = (text: string) =>
    Object.entries(cfg.sectors)
      .filter(([, words]) => words.some((w) => new RegExp(`(?<![a-z0-9])${escape(w)}(?![a-z0-9])`, 'i').test(text)))
      .map(([s]) => s)
  const business = sectorsOf(input.buyerBusiness ?? '')
  const use = sectorsOf(input.endUse)
  if (business.length && use.length && !use.some((s) => business.includes(s))) {
    flags.push({
      code: 'end_use_mismatch',
      heuristic: true,
      reason: `Stated end use looks like ${use.join('/')} but the buyer's business looks like ${business.join('/')} (keyword heuristic, analyst to confirm)`,
    })
  }

  const endUsers = input.parties.filter((x) => x.type === 'end_user')
  if (!endUsers.length || endUsers.some((e) => !e.name?.trim() || !e.country?.trim())) {
    flags.push({ code: 'missing_end_user', reason: 'End-user name or country has not been provided' })
  }

  const buyer = input.parties.find((x) => x.type === 'buyer')
  if (input.payer?.name?.trim()) {
    let same = false
    try {
      same = !!buyer && nameSimilarity(input.payer.name, buyer.name) >= cfg.matchThreshold
    } catch {
      // a buyer name that normalises to nothing cannot be shown to match the payer
    }
    if (!same) {
      flags.push({ code: 'third_party_payer', reason: `Payment comes from ${input.payer.name}, not the buyer${buyer ? ` ${buyer.name}` : ''}` })
    }
  }

  return flags
}
