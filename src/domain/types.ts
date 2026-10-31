// Domain enums and entity types. Spec: docs/build-plan.md §3, §6, §7.4, §8.
// Entity fields are snake_case so a database row maps to them with no translation.

export const CLIENT_ACTIONS = ['UPLOAD', 'DESCRIBE', 'SELECT', 'ANSWER', 'APPROVE', 'SIGN', 'WAIT', 'NONE'] as const
export type ClientAction = (typeof CLIENT_ACTIONS)[number]

export const CASE_STATES = [
  'Draft',
  'IntakeIncomplete',
  'SanctionsCheck',
  'SanctionsReview',
  'AwaitingClient',
  'Classifying',
  'AwaitingClient2',
  'EmergingQuote',
  'EmergingReview',
  'OfficerReview',
  'RouteQuote',
  'RouteInProgress',
  'AwaitingClient3',
  'Filed',
  'Granted',
  'Refused',
  'Active',
  'Monitoring',
  'ClosedNotControlled',
  'ClosedDoNotProceed',
  'Closed',
] as const
export type CaseState = (typeof CASE_STATES)[number]

export type Role =
  | 'client_admin'
  | 'client_member'
  | 'client_approver'
  | 'client_viewer'
  | 'buyer'
  | 'analyst'
  | 'officer'
  | 'specialist'
  | 'partner'
  | 'ops_admin'
export const CLIENT_ROLES: readonly Role[] = ['client_admin', 'client_member', 'client_approver', 'client_viewer']

export type VettingLevel = 'none' | 'baseline' | 'sc' | 'dv'
export type Sensitivity = 'unclassified' | 'official_sensitive' | 'controlled_technology'
export type DataCeiling = 'unclassified' | 'official_sensitive'
export type ScreeningVerdict = 'clear' | 'possible' | 'red_flag' | 'match'
export type Route = 'A' | 'B' | 'C' | 'D'
export type QuoteItem = 'emerging' | 'general_setup' | 'individual' | 'consultation' | 'sanctions_licence' | 'general_shipment'

export type Plan = 'P' | 'S'
export type OnboardingStatus = 'pending' | 'agreements_signed' | 'checks_passed' | 'authorised' | 'suspended'
export type OrgSanctionsStatus = 'clear' | 'under_review' | 'blocked'
export type CaseSanctionsStatus = 'pending' | 'clear' | 'under_review' | 'blocked'
export type PartyType = 'buyer' | 'end_user' | 'consignee' | 'intermediary' | 'forwarder' | 'agent' | 'bank'
export type FileType = 'spec' | 'bom' | 'order' | 'euc' | 'licence' | 'other'
export type AgreementType = 'nda' | 'terms' | 'dpa'
export type QuoteStatus = 'shown' | 'approved' | 'declined'
export type LicenceType = 'general' | 'individual' | 'open_individual'

type Json = unknown
type Id = string
type Timestamp = string

export interface Organisation {
  id: Id
  name: string
  reg_no: string
  country: string
  plan: Plan
  plan_tier: string | null
  onboarding_status: OnboardingStatus
  sanctions_status: OrgSanctionsStatus
  data_ceiling: DataCeiling
  clerk_org_id?: string | null
}

export interface User {
  id: Id
  org_id: Id | null
  name: string
  email: string
  role: Role
  identity_verified: boolean
  vetting_level: VettingLevel
  location: string
  clerk_user_id?: string | null
}

export interface Agreement {
  id: Id
  org_id: Id
  type: AgreementType
  signed_by: Id | null
  signed_at: Timestamp | null
  file_id: Id | null
}

export interface Product {
  id: Id
  org_id: Id
  name: string
  version: string
  description: string
  parameters: Json
  classification_id: Id | null
}

export interface Party {
  id: Id
  name: string
  type: PartyType
  country: string
  identifiers: Json
  owners: Json
}

export interface ScreeningResult {
  id: Id
  party_id: Id
  case_id: Id
  lists_checked: string[]
  list_versions: Record<string, string>
  result: ScreeningVerdict
  reviewed_by: Id | null
  decision: 'cleared' | 'confirmed' | null
  reason: string | null
  screened_at: Timestamp
}

export interface Case {
  id: Id
  org_id: Id
  product_ids: Id[]
  party_ids: Id[]
  destination: string
  end_use: string
  deadline: string | null
  sensitivity: Sensitivity
  sanctions_status: CaseSanctionsStatus
  state: CaseState
  route: Route | null
  emerging_flag: boolean
  pending_client_kind?: 'ANSWER' | 'SIGN' | null
}

export interface CaseFile {
  id: Id
  case_id: Id
  type: FileType
  sensitivity: Sensitivity
  storage_region: string
  hash: string
}

export interface Classification {
  id: Id
  case_id: Id
  list_entries: string[]
  reasoning: string
  rulebook_refs: string[]
  confidence: number | null
  signed_by: Id | null
  signed_at: Timestamp | null
}

export interface RulebookEntry {
  id: Id
  title: string
  list_entries: string[]
  decision_logic: string
  examples: Json
  author: Id
  version: number
  updated_at: Timestamp
}

export interface Quote {
  id: Id
  case_id: Id
  item: QuoteItem
  amount: number // GBP pence
  status: QuoteStatus
  approved_by: Id | null
  approved_at: Timestamp | null
}

export interface Licence {
  id: Id
  case_id: Id
  type: LicenceType
  reference: string
  conditions: Json
  quantity_limits: Json
  expiry: string | null
}

export interface Shipment {
  id: Id
  licence_id: Id
  party_ids: Id[]
  items: Json
  value: number
  screening_result_ids: Id[]
  check_result: Json
  recorded_at: Timestamp
}

export interface Question {
  id: Id
  case_id: Id
  from_user: Id
  to_role: Role
  text: string
  answer: string | null
  status: 'open' | 'answered'
}

export interface Assignment {
  id: Id
  case_id: Id
  user_id: Id
  role: Role
}

export interface AuditEvent {
  id: Id
  actor_id: Id
  action: string
  object: string
  object_id: Id
  timestamp: Timestamp
  ip: string | null
  location: string | null
}
