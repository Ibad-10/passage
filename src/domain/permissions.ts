// Permission matrix, spec §7.3. "(own org)" scoping for manage_users / see_audit is the caller's job.
import type { Role, Sensitivity, VettingLevel } from './types'

export type Action =
  | 'open_case'
  | 'upload'
  | 'view_technical'
  | 'view_sanctions'
  | 'clear_match'
  | 'propose_clear_match'
  | 'ask_client'
  | 'approve_quote'
  | 'sign_declaration'
  | 'sign_classification'
  | 'manage_users'
  | 'see_audit'

// true = allowed; 'assigned' = needs opts.assigned; 'flag' = needs opts.partnerFlag
type Cell = true | 'assigned' | 'flag'
const C = { client_admin: true, client_member: true, client_approver: true } as const

const MATRIX: Record<Action, Partial<Record<Role, Cell>>> = {
  open_case: { ...C },
  upload: { ...C, analyst: true, officer: true, specialist: true, partner: 'assigned' }, // partner "limited"
  view_technical: { ...C, client_viewer: true, analyst: 'assigned', officer: 'assigned', specialist: 'assigned', partner: 'flag' },
  view_sanctions: { ...C, client_viewer: true, analyst: 'assigned', officer: 'assigned' },
  clear_match: { officer: true },
  propose_clear_match: { analyst: true },
  ask_client: { analyst: true, officer: true, specialist: true },
  approve_quote: { client_admin: true, client_approver: true },
  sign_declaration: { client_admin: true, client_approver: true },
  sign_classification: { officer: true },
  manage_users: { client_admin: true, ops_admin: true },
  see_audit: { client_admin: true, officer: true, ops_admin: true },
}

export function can(role: Role, action: Action, opts: { assigned?: boolean; partnerFlag?: boolean } = {}): boolean {
  const cell = MATRIX[action][role]
  if (cell === 'assigned') return !!opts.assigned
  if (cell === 'flag') return !!opts.partnerFlag
  return cell === true
}

const RANK: Record<VettingLevel, number> = { none: 0, baseline: 1, sc: 2, dv: 3 }
export const vettingRank = (v: VettingLevel): number => RANK[v]

// Placeholder values per §7.4; confirm with the security adviser. Officer approval for
// controlled_technology is checked separately in canView.
const REQUIRED: Record<Sensitivity, VettingLevel> = {
  unclassified: 'none',
  official_sensitive: 'baseline',
  controlled_technology: 'baseline',
}
export const requiredVetting = (s: Sensitivity): VettingLevel => REQUIRED[s]
