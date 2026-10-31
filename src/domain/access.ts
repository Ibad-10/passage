// Access rule, spec §7.4 can_view. Seven conditions, checked in spec order.
import { can, requiredVetting, vettingRank } from './permissions'
import { CLIENT_ROLES, type Case, type CaseFile, type Organisation, type User } from './types'

export interface ViewContext {
  user: User
  org: Organisation
  caseRow: Case
  file: CaseFile
  assignedUserIds: string[]
  officerApprovedUserIds: string[]
  exportAuthorisedCountries: string[]
  partnerFlag?: boolean // partner authorisation flag (§7.2); not in the plan's ctx, added so the rule is expressible
}

export function canView(ctx: ViewContext): boolean {
  const { user, org, caseRow, file } = ctx
  const isClient = CLIENT_ROLES.includes(user.role)
  const controlled = file.sensitivity === 'controlled_technology'

  if (org.onboarding_status !== 'authorised') return false
  if (org.sanctions_status === 'blocked') return false
  // Assignment is condition 6, so here ask only "could this role view if assigned".
  if (!can(user.role, 'view_technical', { assigned: true, partnerFlag: ctx.partnerFlag })) return false
  if (!user.identity_verified) return false
  if (vettingRank(user.vetting_level) < vettingRank(requiredVetting(file.sensitivity))) return false
  // Product decision: client users of the owning org always see their own files; officer approval
  // for controlled_technology applies only to internal and partner users (org match is checked below).
  if (controlled && !isClient && !ctx.officerApprovedUserIds.includes(user.id)) return false
  // Client users are assigned to every case in their own org (§7.3); everyone else needs an Assignment.
  const assigned = isClient ? user.org_id === caseRow.org_id : ctx.assignedUserIds.includes(user.id)
  if (!assigned) return false
  return user.location === 'GB' || ctx.exportAuthorisedCountries.includes(user.location) || !controlled
}
