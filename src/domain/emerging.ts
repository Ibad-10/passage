// Sub-process E triggers, spec §4.4. Pure: no I/O. A trigger only flags the case for
// review; people decide (Global Constraints).
import emerging from '../../config/emerging.json'

export type EmergingConfig = {
  lowConfidence: number
  nearThresholdFraction: number
  recentChangeMonths: number
  watchList: Record<string, string[]>
  intangibles: Record<string, string[]>
}

export type EmergingInput = {
  now: Date
  rulebookRefs: string[]
  aiConfidence: number | null
  parameters: { name: string; value: number; threshold: number }[]
  listEntries: { entry: string; changedAt: string | null }[]
  text: string // product name, description and end use
  intangibleTransfers?: string[] // keys of cfg.intangibles picked at intake
}

export type EmergingTriggerCode =
  | 'no_rulebook_match'
  | 'low_ai_confidence'
  | 'near_threshold'
  | 'recent_list_change'
  | 'watch_list_technology'
  | 'intangible_transfer'

export type EmergingTrigger = { code: EmergingTriggerCode; reason: string }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// ponytail: whole-word keyword match; misses synonyms and paraphrase. Upgrade to the AI
// first pass tagging technology areas once its output is trusted.
const mentions = (text: string, words: string[]) =>
  words.some((w) => new RegExp(`(?<![a-z0-9])${escape(w)}(?![a-z0-9])`, 'i').test(text))

export function emergingTriggers(input: EmergingInput, cfg: EmergingConfig = emerging): EmergingTrigger[] {
  const out: EmergingTrigger[] = []
  const fire = (code: EmergingTriggerCode, reason: string) => out.push({ code, reason })

  if (!input.rulebookRefs.length) fire('no_rulebook_match', 'No rulebook entry matches this product')

  const c = input.aiConfidence
  // Missing or out-of-range confidence is treated as low: junk never passes as confident.
  if (c === null || !(c >= 0 && c <= 1) || c < cfg.lowConfidence) {
    fire('low_ai_confidence', c === null ? 'No AI confidence available' : `AI confidence ${c} is below ${cfg.lowConfidence}`)
  }

  const pct = Math.round(cfg.nearThresholdFraction * 100)
  const near = input.parameters.filter(
    ({ value: v, threshold: t }) => !Number.isFinite(v) || !Number.isFinite(t) || Math.abs(v - t) <= cfg.nearThresholdFraction * Math.abs(t),
  )
  if (near.length) {
    fire('near_threshold', `Within ${pct}% of a control threshold, or not comparable: ${near.map((p) => `${p.name} ${p.value} vs ${p.threshold}`).join('; ')}`)
  }

  const cutoff = new Date(input.now)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - cfg.recentChangeMonths)
  const recent = input.listEntries.filter((e) => e.changedAt && Date.parse(e.changedAt) >= cutoff.getTime())
  if (recent.length) {
    fire('recent_list_change', `List entry changed in the last ${cfg.recentChangeMonths} months: ${recent.map((e) => e.entry).join(', ')}`)
  }

  const areas = Object.entries(cfg.watchList).filter(([, words]) => mentions(input.text, words)).map(([area]) => area)
  if (areas.length) fire('watch_list_technology', `Watch-list technology: ${areas.join(', ')}`)

  const kinds = Object.entries(cfg.intangibles)
    .filter(([kind, words]) => input.intangibleTransfers?.includes(kind) || mentions(input.text, words))
    .map(([kind]) => kind.replace(/_/g, ' '))
  if (kinds.length) fire('intangible_transfer', `Intangible transfer: ${kinds.join(', ')}`)

  return out
}
