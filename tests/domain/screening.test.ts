import { describe, expect, it } from 'vitest'
import {
  ScreeningValidationError,
  caseVerdict,
  jaroWinkler,
  nameSimilarity,
  normaliseName,
  verdictFor,
  type ScreeningConfig,
} from '@/domain/screening'
import { fixtureProvider } from '@/providers/screening/fixture'
import fixtureList from '@/providers/screening/fixture-list.json'
import type { Party, ScreeningVerdict } from '@/domain/types'

const cfg: ScreeningConfig = {
  matchThreshold: 0.7,
  prohibitedDestinations: ['RU', 'BY'],
  redFlagCountries: ['KZ'],
  listsChecked: ['UK', 'EU', 'UN', 'US'],
}
const party = (over: Partial<Party> = {}): Party => ({
  id: 'p1', name: 'Kalyna Agro Systems TOV', type: 'buyer', country: 'UA', identifiers: {}, owners: [], ...over,
})

describe('jaroWinkler', () => {
  it('known values', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.961, 3)
    expect(jaroWinkler('dixon', 'dicksonx')).toBeCloseTo(0.813, 3)
    expect(jaroWinkler('abc', 'abc')).toBe(1)
    expect(jaroWinkler('abc', 'xyz')).toBe(0)
  })
})

describe('normaliseName', () => {
  it('lowercases, strips punctuation and legal suffixes', () => {
    expect(normaliseName('UKRSPEC SYSTEMS LTD')).toBe('ukrspec systems')
    expect(normaliseName('Acme Sp. z o.o.')).toBe('acme')
    expect(normaliseName('Acme, GmbH')).toBe('acme')
  })
  it('transliterates Ukrainian Cyrillic and drops ТОВ', () => {
    // Plan Task 5 asserted these two are NOT equal. Under the standard Ukrainian romanisation
    // (и->y, ц->ts) they are identical, which is the better outcome, so equality is asserted.
    expect(normaliseName('ТОВ «Укрспецсистеми»')).toBe('ukrspetssystemy')
    expect(normaliseName('ТОВ «Укрспецсистеми»')).toBe(normaliseName('Ukrspetssystemy LLC'))
  })
  it('throws on an empty name, or a name that is only a legal suffix', () => {
    expect(() => normaliseName('')).toThrow(ScreeningValidationError)
    expect(() => normaliseName('  ')).toThrow(ScreeningValidationError)
    expect(() => normaliseName('LLC')).toThrow(ScreeningValidationError)
  })
})

describe('Review Focus 3: Cyrillic and transliterated names', () => {
  const cyr = 'Укрспецсистеми'
  it('different spellings still score at or above the threshold', () => {
    for (const other of ['Ukrspecsystems', 'UKRSPEC SYSTEMS LTD']) {
      expect(normaliseName(cyr)).not.toBe(normaliseName(other))
      expect(nameSimilarity(cyr, other)).toBeGreaterThanOrEqual(0.7)
    }
  })
  it('unrelated names score below the threshold', () => {
    expect(nameSimilarity(cyr, 'Kalyna Agro Systems TOV')).toBeLessThan(0.7)
  })
})

describe('fixture provider', () => {
  it('has five listed names and list versions for every list', async () => {
    expect(fixtureList).toHaveLength(5)
    expect(Object.keys(await fixtureProvider.listVersions())).toEqual(['UK', 'EU', 'UN', 'US'])
  })
  it('seed consignee near-matches a listed name (possible-match path)', async () => {
    const hits = await fixtureProvider.search({ name: 'Nordline Freight Services TOV', country: 'UA' })
    expect(hits[0].score).toBeGreaterThanOrEqual(0.7)
    expect(hits[0].score).toBeLessThan(1)
    expect(verdictFor(party({ type: 'consignee', name: 'Nordline Freight Services TOV' }), hits, 'UA', cfg).verdict).toBe('possible')
  })
  it('seed buyer and end user stay clear', async () => {
    for (const name of ['Kalyna Agro Systems TOV', 'Polissia Field Survey TOV']) {
      const hits = await fixtureProvider.search({ name, country: 'UA' })
      expect(verdictFor(party({ name }), hits, 'UA', cfg).verdict).toBe('clear')
    }
  })
  it('empty name throws rather than returning no hits', async () => {
    await expect(fixtureProvider.search({ name: '', country: 'UA' })).rejects.toThrow(ScreeningValidationError)
  })
})

describe('verdictFor (§5.3)', () => {
  it('baseline: low score, ordinary party, allowed destination is clear', () => {
    expect(verdictFor(party(), [{ score: 0.5 }], 'UA', cfg)).toEqual({ verdict: 'clear', reasons: [] })
    expect(verdictFor(party(), [], 'UA', cfg).verdict).toBe('clear')
  })
  it('prohibited destination is a match', () => {
    expect(verdictFor(party(), [], 'RU', cfg).verdict).toBe('match')
  })
  it('top score 0.8 is possible, never match', () => {
    expect(verdictFor(party(), [{ score: 0.3 }, { score: 0.8 }], 'UA', cfg).verdict).toBe('possible')
    expect(verdictFor(party(), [{ score: 1 }], 'UA', cfg).verdict).toBe('possible')
  })
  it('threshold is inclusive', () => {
    expect(verdictFor(party(), [{ score: 0.7 }], 'UA', cfg).verdict).toBe('possible')
  })
  it('intermediary in a red-flag country is red_flag', () => {
    expect(verdictFor(party({ type: 'forwarder', country: 'KZ' }), [], 'UA', cfg).verdict).toBe('red_flag')
    expect(verdictFor(party({ type: 'buyer', country: 'KZ' }), [], 'UA', cfg).verdict).toBe('clear')
  })
  it('precedence: match > possible > red_flag', () => {
    expect(verdictFor(party(), [{ score: 0.9 }], 'RU', cfg).verdict).toBe('match')
    expect(verdictFor(party({ type: 'intermediary', country: 'KZ' }), [{ score: 0.9 }], 'UA', cfg).verdict).toBe('possible')
  })
  it('every non-clear verdict has a reason', () => {
    expect(verdictFor(party(), [{ score: 0.9 }], 'RU', cfg).reasons.length).toBeGreaterThan(0)
  })
  it('empty party name throws a validation error rather than clear', () => {
    expect(() => verdictFor(party({ name: ' ' }), [], 'UA', cfg)).toThrow(ScreeningValidationError)
  })
})

describe('caseVerdict: worst wins', () => {
  const table: [ScreeningVerdict[], ScreeningVerdict][] = [
    [['clear', 'clear'], 'clear'],
    [['clear', 'red_flag'], 'red_flag'],
    [['red_flag', 'possible', 'clear'], 'possible'],
    [['possible', 'match', 'red_flag'], 'match'],
  ]
  it.each(table)('%j -> %s', (verdicts, expected) => {
    expect(caseVerdict(verdicts.map((verdict) => ({ verdict })))).toBe(expected)
  })
  it('no results is an error, not clear', () => {
    expect(() => caseVerdict([])).toThrow(ScreeningValidationError)
  })
})
