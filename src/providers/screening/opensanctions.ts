// OpenSanctions match API (https://www.opensanctions.org/docs/api/). Never used in tests.
import { ScreeningValidationError, type ScreeningProvider } from '@/domain/screening'

const API = 'https://api.opensanctions.org'
const DATASET = 'default'

export function openSanctionsProvider(apiKey: string): ScreeningProvider {
  const headers = { Authorization: `ApiKey ${apiKey}`, 'Content-Type': 'application/json' }
  return {
    name: 'opensanctions',
    async listVersions() {
      // Dataset metadata index; `version` is a sortable build id (docs: /docs/metadata).
      const res = await fetch(`https://data.opensanctions.org/datasets/latest/${DATASET}/index.json`)
      if (!res.ok) throw new Error(`OpenSanctions index failed: ${res.status}`)
      const body = (await res.json()) as { version?: string }
      if (!body.version) throw new Error('OpenSanctions index has no version')
      return { [`opensanctions:${DATASET}`]: body.version }
    },
    async search(party) {
      if (!party.name?.trim()) throw new ScreeningValidationError('Party name is empty')
      const res = await fetch(`${API}/match/${DATASET}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          queries: { q: { schema: 'LegalEntity', properties: { name: [party.name], country: [party.country] } } },
        }),
      })
      if (!res.ok) throw new Error(`OpenSanctions match failed: ${res.status}`)
      const body = (await res.json()) as {
        responses?: { q?: { results?: { caption: string; score: number; datasets?: string[] }[] } }
      }
      const results = body.responses?.q?.results
      if (!Array.isArray(results)) throw new Error('OpenSanctions returned an unexpected response')
      return results.map((r) => ({ score: r.score, listedName: r.caption, list: (r.datasets ?? []).join(',') }))
    },
  }
}
