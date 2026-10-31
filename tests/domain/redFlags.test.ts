import { describe, expect, it } from 'vitest'
import { diversionRedFlags, type RedFlagInput } from '@/domain/redFlags'

const p = (id: string, type: RedFlagInput['parties'][number]['type'], country: string, name = `Party ${id}`) => ({
  id,
  name,
  type,
  country,
})

const clean: RedFlagInput = {
  destination: 'UA',
  endUse: 'Aerial reconnaissance for the armed forces',
  buyerBusiness: 'Ministry of Defence procurement agency',
  parties: [p('b', 'buyer', 'UA', 'Ukrspecsystems'), p('e', 'end_user', 'UA'), p('c', 'consignee', 'PL')],
  payer: { name: 'UKRSPEC SYSTEMS LTD' },
}
const codes = (over: Partial<RedFlagInput>) => diversionRedFlags({ ...clean, ...over }).map((f) => f.code)

describe('diversionRedFlags', () => {
  it('raises nothing for a clean case (adjacent consignee, payer is the buyer)', () => {
    expect(diversionRedFlags(clean)).toEqual([])
  })

  it('flags unusual routing: consignee country neither destination nor adjacent', () => {
    expect(codes({ parties: [...clean.parties.slice(0, 2), p('c', 'consignee', 'ae')] })).toEqual(['unusual_routing'])
    expect(codes({ parties: [...clean.parties.slice(0, 2), p('c', 'consignee', 'UA')] })).toEqual([])
    expect(codes({ parties: [...clean.parties.slice(0, 2), p('c', 'consignee', 'MD')] })).toEqual([]) // adjacent
  })

  it('flags an intermediary in a country next to a sanctioned state', () => {
    const f = diversionRedFlags({ ...clean, parties: [...clean.parties, p('i', 'forwarder', 'GE')] })
    expect(f.map((x) => x.code)).toEqual(['sanctioned_neighbour'])
    expect(f[0].reason).toMatch(/GE/)
  })

  it('flags an end use that does not fit the buyer business, as a heuristic', () => {
    const f = diversionRedFlags({ ...clean, buyerBusiness: 'Agricultural cooperative, crop spraying' })
    expect(f).toEqual([expect.objectContaining({ code: 'end_use_mismatch', heuristic: true })])
    expect(codes({ buyerBusiness: null })).toEqual([]) // unknown business: no claim either way
  })

  it('flags missing end-user details', () => {
    expect(codes({ parties: clean.parties.filter((x) => x.type !== 'end_user') })).toEqual(['missing_end_user'])
    expect(codes({ parties: [clean.parties[0], p('e', 'end_user', ' '), clean.parties[2]] })).toEqual(['missing_end_user'])
    expect(codes({ parties: [clean.parties[0], p('e', 'end_user', 'UA', '  '), clean.parties[2]] })).toEqual(['missing_end_user'])
  })

  it('flags a payer that is not the buyer, tolerating transliteration', () => {
    expect(codes({ payer: { name: 'Golden Sands Trading FZE' } })).toEqual(['third_party_payer'])
    expect(codes({ payer: { name: 'Укрспецсистеми' } })).toEqual([])
    expect(codes({ payer: null })).toEqual([])
  })

  it('flags a payer when there is no usable buyer name to compare against', () => {
    expect(codes({ parties: [p('b', 'buyer', 'UA', 'LTD'), ...clean.parties.slice(1)] })).toEqual(['third_party_payer'])
  })

  it('gives every flag a readable reason', () => {
    const f = diversionRedFlags({
      ...clean,
      buyerBusiness: 'Hospital',
      payer: { name: 'Someone Else' },
      parties: [p('b', 'buyer', 'UA', 'Ukrspecsystems'), p('c', 'consignee', 'KZ'), p('i', 'agent', 'TR')],
    })
    expect(f.map((x) => x.code).sort()).toEqual(
      ['end_use_mismatch', 'missing_end_user', 'sanctioned_neighbour', 'third_party_payer', 'unusual_routing'].sort(),
    )
    expect(f.every((x) => x.reason.length > 10)).toBe(true)
  })
})
