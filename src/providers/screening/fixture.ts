// Offline screening provider. Five obviously fictional listed names; scores with normalised Jaro-Winkler.
import { nameSimilarity, normaliseName, type ScreeningProvider } from '@/domain/screening'
import list from './fixture-list.json'

export const fixtureProvider: ScreeningProvider = {
  name: 'fixture',
  async listVersions() {
    return { UK: 'fixture-2026-10-31', EU: 'fixture-2026-10-31', UN: 'fixture-2026-10-31', US: 'fixture-2026-10-31' }
  },
  async search(party) {
    normaliseName(party.name) // throws ScreeningValidationError on an empty name
    return list
      .map((e) => ({ ...e, score: nameSimilarity(party.name, e.listedName) }))
      .sort((a, b) => b.score - a.score)
  },
}
