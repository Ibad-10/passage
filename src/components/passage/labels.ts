// Display labels for domain enums. Spec: docs/build-plan.md §3, §6, §7.
import type { CaseState, ClientAction, DataCeiling, Role, Sensitivity, VettingLevel } from '@/domain/types'

export const ACTION_MEANING: Record<ClientAction, string> = {
  UPLOAD: 'Upload files',
  DESCRIBE: 'Answer in free text',
  SELECT: 'Pick from options',
  ANSWER: 'Answer a question from our team',
  APPROVE: 'Approve a quote or decision',
  SIGN: 'Sign a declaration',
  WAIT: 'Nothing needed: our team or the government is working',
  NONE: 'Case closed or informational',
}

/** Actions the client has to do something about (highlighted chips). */
export const isActionable = (a: ClientAction) => a !== 'WAIT' && a !== 'NONE'

export const STATE_LABEL: Record<CaseState, string> = {
  Draft: 'Draft',
  IntakeIncomplete: 'Intake incomplete',
  SanctionsCheck: 'Sanctions check',
  SanctionsReview: 'Sanctions review',
  AwaitingClient: 'Awaiting your answer',
  Classifying: 'Classifying',
  AwaitingClient2: 'Awaiting your answer',
  EmergingQuote: 'Specialist review quote',
  EmergingReview: 'Specialist review',
  OfficerReview: 'Officer review',
  RouteQuote: 'Route quote',
  RouteInProgress: 'Licence in preparation',
  AwaitingClient3: 'Awaiting your input',
  Filed: 'Filed with ECJU',
  Granted: 'Licence granted',
  Refused: 'Licence refused',
  Active: 'Licence active',
  Monitoring: 'Monitoring',
  ClosedNotControlled: 'Not controlled',
  ClosedDoNotProceed: 'Do not proceed',
  Closed: 'Closed',
}

export type CaseGroup = 'action' | 'progress' | 'licensed' | 'closed'

export function caseGroup(state: CaseState, action: ClientAction): CaseGroup {
  if (state.startsWith('Closed')) return 'closed'
  if (state === 'Granted' || state === 'Active' || state === 'Monitoring') return 'licensed'
  return isActionable(action) ? 'action' : 'progress'
}

export const ROLE_LABEL: Record<Role, string> = {
  client_admin: 'Admin',
  client_member: 'Member',
  client_approver: 'Approver',
  client_viewer: 'Viewer',
  buyer: 'Buyer',
  analyst: 'Analyst',
  officer: 'Officer',
  specialist: 'Specialist',
  partner: 'Partner',
  ops_admin: 'Ops admin',
}

export const VETTING_LABEL: Record<VettingLevel, string> = {
  none: 'NONE',
  baseline: 'BASELINE',
  sc: 'SC',
  dv: 'DV',
}

export const SENSITIVITY_LABEL: Record<Sensitivity | DataCeiling, string> = {
  unclassified: 'UNCLASSIFIED',
  official_sensitive: 'OFFICIAL-SENSITIVE',
  controlled_technology: 'CONTROLLED TECH',
}

export const gbp = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(pence / 100)
