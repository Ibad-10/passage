import { describe, expect, it } from 'vitest'
import cfg from '../../config/emerging.json'
import { emergingTriggers, type EmergingInput } from '@/domain/emerging'

const base: EmergingInput = {
  now: new Date('2026-10-31T00:00:00Z'),
  rulebookRefs: ['RB-12'],
  aiConfidence: 0.9,
  parameters: [{ name: 'range_km', value: 50, threshold: 100 }],
  listEntries: [{ entry: 'ML10a', changedAt: '2020-01-01' }],
  text: 'Fixed-wing survey airframe with a ground control station',
  intangibleTransfers: [],
}
const codes = (over: Partial<EmergingInput>, c = cfg) => emergingTriggers({ ...base, ...over }, c).map((t) => t.code)

describe('emergingTriggers', () => {
  it('fires nothing for a plain, well-matched product', () => {
    expect(emergingTriggers(base)).toEqual([])
  })

  it('fires on no rulebook match', () => {
    expect(codes({ rulebookRefs: [] })).toEqual(['no_rulebook_match'])
  })

  it('fires below the configured 0.6 confidence, and on missing or junk confidence', () => {
    expect(cfg.lowConfidence).toBe(0.6)
    expect(codes({ aiConfidence: 0.59 })).toEqual(['low_ai_confidence'])
    expect(codes({ aiConfidence: 0.6 })).toEqual([])
    expect(codes({ aiConfidence: null })).toEqual(['low_ai_confidence'])
    expect(codes({ aiConfidence: 7 })).toEqual(['low_ai_confidence'])
  })

  it('fires within 10% of a threshold on either side', () => {
    expect(codes({ parameters: [{ name: 'r', value: 90, threshold: 100 }] })).toEqual(['near_threshold'])
    expect(codes({ parameters: [{ name: 'r', value: 110, threshold: 100 }] })).toEqual(['near_threshold'])
    expect(codes({ parameters: [{ name: 'r', value: 89, threshold: 100 }] })).toEqual([])
    expect(codes({ parameters: [{ name: 'r', value: 0.5, threshold: 0 }] })).toEqual([])
    expect(codes({ parameters: [{ name: 'r', value: Number.NaN, threshold: 100 }] })).toEqual(['near_threshold'])
    expect(codes({ parameters: [{ name: 'r', value: 80, threshold: 100 }] }, { ...cfg, nearThresholdFraction: 0.2 })).toEqual([
      'near_threshold',
    ])
  })

  it('keeps the near-threshold reason neutral (never suggests changing the product)', () => {
    const [t] = emergingTriggers({ ...base, parameters: [{ name: 'range_km', value: 95, threshold: 100 }] })
    expect(t.reason).toMatch(/range_km/)
    expect(t.reason).not.toMatch(/reduce|lower|below|change/i)
  })

  it('fires on a list entry changed in the last 12 months', () => {
    expect(codes({ listEntries: [{ entry: 'ML10a', changedAt: '2026-01-15' }] })).toEqual(['recent_list_change'])
    expect(codes({ listEntries: [{ entry: 'ML10a', changedAt: '2025-10-30' }] })).toEqual([])
    expect(codes({ listEntries: [{ entry: 'ML10a', changedAt: null }] })).toEqual([])
  })

  it('matches watch-list keywords on word boundaries, case-insensitively', () => {
    expect(codes({ text: 'Onboard AI for autonomous navigation' })).toEqual(['watch_list_technology'])
    expect(codes({ text: 'Counter-drone jammer' })).toEqual(['watch_list_technology'])
    expect(codes({ text: 'QUANTUM key distribution module' })).toEqual(['watch_list_technology'])
    expect(codes({ text: 'Maintain the chair; see detail drawing' })).toEqual([])
  })

  it('fires on an intangible transfer, selected or described', () => {
    expect(codes({ intangibleTransfers: ['model_weights'] })).toEqual(['intangible_transfer'])
    expect(codes({ text: 'We will send the source code and grant remote access' })).toEqual(['intangible_transfer'])
  })

  it('returns every trigger that fired, each with a reason', () => {
    const t = emergingTriggers({ ...base, rulebookRefs: [], aiConfidence: 0.2, text: 'Quantum sensor firmware source code' })
    expect(t.map((x) => x.code)).toEqual(['no_rulebook_match', 'low_ai_confidence', 'watch_list_technology', 'intangible_transfer'])
    expect(t.every((x) => x.reason.length > 0)).toBe(true)
  })
})
