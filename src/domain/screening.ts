// Sanctions screening rules, spec §5.2–5.3. Pure: providers do the I/O.
import type { Party, PartyType, ScreeningVerdict } from './types'

export interface ScreeningConfig {
  matchThreshold: number
  prohibitedDestinations: string[]
  redFlagCountries: string[]
  listsChecked: string[]
}

export interface ScreeningHit {
  score: number
  listedName: string
  list: string
}

export interface ScreeningProvider {
  name: string
  listVersions(): Promise<Record<string, string>>
  search(party: { name: string; country: string }): Promise<ScreeningHit[]>
}

export class ScreeningValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScreeningValidationError'
  }
}

// Ukrainian national romanisation (KMU 2010, without the word-initial variants) plus the
// Russian-only letters. Where they disagree (г, и) the Ukrainian reading wins: UK–UA corridor.
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i',
  ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia',
  ы: 'y', э: 'e', ё: 'e', ъ: '',
}
const LEGAL_SUFFIXES = new Set(['ltd', 'llc', 'tov', 'pp', 'gmbh', 'plc', 'inc'])

export function normaliseName(name: string): string {
  const latin = [...(name ?? '').toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join('')
  const out = latin
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bsp z o o\b/g, ' ')
    .split(' ')
    .filter((t) => t && !LEGAL_SUFFIXES.has(t))
    .join(' ')
  if (!out) throw new ScreeningValidationError('Party name is empty')
  return out
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aHit = new Array<boolean>(a.length).fill(false)
  const bHit = new Array<boolean>(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (!bHit[j] && a[i] === b[j]) {
        aHit[i] = bHit[j] = true
        matches++
        break
      }
    }
  }
  if (!matches) return 0
  let transpositions = 0
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!aHit[i]) continue
    while (!bHit[k]) k++
    if (a[i] !== b[k++]) transpositions++
  }
  const m = matches
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3
  let prefix = 0
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

// Spaces are dropped so "ukrspec systems" and "ukrspetssystemy" compare letter by letter.
export const nameSimilarity = (a: string, b: string): number =>
  jaroWinkler(normaliseName(a).replace(/ /g, ''), normaliseName(b).replace(/ /g, ''))

// §8 has no "distributor" type; intermediary, forwarder and agent stand in for it.
const INTERMEDIARY_TYPES: PartyType[] = ['intermediary', 'forwarder', 'agent']

export function verdictFor(
  party: Party,
  hits: { score: number }[],
  destination: string,
  cfg: ScreeningConfig,
): { verdict: ScreeningVerdict; reasons: string[] } {
  if (!party.name?.trim()) throw new ScreeningValidationError('Party name is empty')
  // Junk from a provider must never fall through to 'clear'.
  if (!hits.every((h) => typeof h.score === 'number' && h.score >= 0 && h.score <= 1)) {
    throw new ScreeningValidationError('Screening provider returned an invalid score')
  }
  const dest = destination.trim().toUpperCase()
  const country = party.country.trim().toUpperCase()
  if (cfg.prohibitedDestinations.includes(dest)) {
    return { verdict: 'match', reasons: [`Prohibited destination: ${dest}`] }
  }
  const top = Math.max(0, ...hits.map((h) => h.score))
  // A name hit is only ever 'possible': an officer confirms a match (§5.3).
  if (top >= cfg.matchThreshold) {
    return { verdict: 'possible', reasons: [`Name similar to a listed party (score ${top.toFixed(2)})`] }
  }
  if (INTERMEDIARY_TYPES.includes(party.type) && cfg.redFlagCountries.includes(country)) {
    return { verdict: 'red_flag', reasons: [`${party.type} in red-flag country ${country}`] }
  }
  return { verdict: 'clear', reasons: [] }
}

const SEVERITY: ScreeningVerdict[] = ['clear', 'red_flag', 'possible', 'match']

export function caseVerdict(results: { verdict: ScreeningVerdict }[]): ScreeningVerdict {
  if (!results.length) throw new ScreeningValidationError('No screening results: a case is never clear by default')
  return results.reduce<ScreeningVerdict>(
    (worst, r) => (SEVERITY.indexOf(r.verdict) > SEVERITY.indexOf(worst) ? r.verdict : worst),
    'clear',
  )
}
