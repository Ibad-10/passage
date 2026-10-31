// Intake completeness check, spec §4.3 step 1.2. Returns human-readable problems; [] = complete.
export interface DraftFile {
  name: string // not in the plan's signature; needed for the per-file messages
  type: string
  sizeBytes: number
  sensitivity: string
  hash: string
}
export interface Draft {
  files: DraftFile[]
  parties: { type: string; name: string; country: string }[]
  destination?: string
  endUse?: string
  deadline?: string
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
const REQUIRED_FILES = ['spec', 'order']
const REQUIRED_PARTIES = ['buyer', 'end_user', 'consignee']

export function missingItems(draft: Draft): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const okTypes = new Set<string>()

  for (const file of draft.files) {
    let problem: string | null = null
    if (file.sensitivity === 'secret') problem = 'SECRET uploads are not accepted'
    else if (file.sizeBytes <= 0) problem = `empty file: ${file.name}`
    else if (file.sizeBytes > MAX_FILE_BYTES) problem = `file over 25 MB: ${file.name}`
    else if (seen.has(file.hash)) problem = `duplicate file: ${file.name}`
    seen.add(file.hash)
    if (problem) problems.push(problem)
    else okTypes.add(file.type)
  }

  for (const t of REQUIRED_FILES) if (!okTypes.has(t)) problems.push(`${t} file`)
  for (const t of REQUIRED_PARTIES) {
    if (!draft.parties.some((p) => p.type === t && p.name.trim())) problems.push(`${t.replace('_', ' ')} party`)
  }
  if (!draft.destination?.trim()) problems.push('destination')
  const endUse = draft.endUse?.trim() ?? ''
  if (endUse.length < 1 || endUse.length > 600) problems.push('end use (1 to 600 characters)')
  return problems
}
