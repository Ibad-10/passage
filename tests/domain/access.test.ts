import { describe, expect, it } from 'vitest'
import { canView, type ViewContext } from '@/domain/access'
import { can, requiredVetting, vettingRank } from '@/domain/permissions'
import type { Case, CaseFile, Organisation, Role, User } from '@/domain/types'

const org: Organisation = {
  id: 'org1', name: 'Skyline Drones Ltd', reg_no: '123', country: 'GB', plan: 'S', plan_tier: null,
  onboarding_status: 'authorised', sanctions_status: 'clear', data_ceiling: 'official_sensitive',
}
const caseRow: Case = {
  id: 'case1', org_id: 'org1', product_ids: [], party_ids: [], destination: 'UA', end_use: 'x', deadline: null,
  sensitivity: 'official_sensitive', sanctions_status: 'clear', state: 'Classifying', route: null, emerging_flag: false,
}
const file: CaseFile = { id: 'f1', case_id: 'case1', type: 'spec', sensitivity: 'official_sensitive', storage_region: 'eu-west-2', hash: 'h' }
const analyst: User = {
  id: 'u-analyst', org_id: null, name: 'A', email: 'a@x', role: 'analyst', identity_verified: true, vetting_level: 'baseline', location: 'GB',
}

function ctx(over: { user?: Partial<User>; org?: Partial<Organisation>; file?: Partial<CaseFile> } & Partial<Omit<ViewContext, 'user' | 'org' | 'file'>> = {}): ViewContext {
  const { user, org: o, file: f, ...rest } = over
  return {
    user: { ...analyst, ...user },
    org: { ...org, ...o },
    caseRow,
    file: { ...file, ...f },
    assignedUserIds: ['u-analyst'],
    officerApprovedUserIds: [],
    exportAuthorisedCountries: [],
    ...rest,
  }
}

describe('canView (§7.4, conditions in order)', () => {
  it('baseline: assigned, vetted, verified analyst in GB can view', () => {
    expect(canView(ctx())).toBe(true)
  })
  it('1. org not authorised', () => {
    expect(canView(ctx({ org: { onboarding_status: 'checks_passed' } }))).toBe(false)
  })
  it('2. org blocked', () => {
    expect(canView(ctx({ org: { sanctions_status: 'blocked' } }))).toBe(false)
  })
  it('3. role: client viewer can view, ops_admin cannot', () => {
    expect(canView(ctx({ user: { role: 'client_viewer', org_id: 'org1' }, assignedUserIds: [] }))).toBe(true)
    expect(canView(ctx({ user: { role: 'ops_admin' } }))).toBe(false)
  })
  it('4. unverified identity', () => {
    expect(canView(ctx({ user: { identity_verified: false } }))).toBe(false)
  })
  it('5. vetting: none fails on official_sensitive, passes on unclassified', () => {
    expect(canView(ctx({ user: { vetting_level: 'none' } }))).toBe(false)
    expect(canView(ctx({ user: { vetting_level: 'none' }, file: { sensitivity: 'unclassified' } }))).toBe(true)
  })
  it('5. controlled_technology needs officer approval', () => {
    const ct = { file: { sensitivity: 'controlled_technology' as const } }
    expect(canView(ctx(ct))).toBe(false)
    expect(canView(ctx({ ...ct, officerApprovedUserIds: ['u-analyst'] }))).toBe(true)
  })
  it('5. client users of the owning org see their own controlled_technology without officer approval', () => {
    const ct = { file: { sensitivity: 'controlled_technology' as const }, assignedUserIds: [], officerApprovedUserIds: [] }
    expect(canView(ctx({ ...ct, user: { role: 'client_member', org_id: 'org1' } }))).toBe(true)
    expect(canView(ctx({ ...ct, user: { role: 'client_viewer', org_id: 'org1' } }))).toBe(true)
    // another org's client user still fails on assignment
    expect(canView(ctx({ ...ct, user: { role: 'client_member', org_id: 'other' } }))).toBe(false)
    // internal and partner users still need officer approval
    expect(canView(ctx({ ...ct, assignedUserIds: ['u-analyst'] }))).toBe(false)
    const partner = { id: 'u-partner', role: 'partner' as Role, location: 'GB' }
    expect(canView(ctx({ ...ct, user: partner, assignedUserIds: ['u-partner'], partnerFlag: true }))).toBe(false)
  })
  it('6. Review Focus 2: unassigned analyst', () => {
    expect(canView(ctx({ assignedUserIds: [] }))).toBe(false)
  })
  it('6. client user of another org is not assigned', () => {
    expect(canView(ctx({ user: { role: 'client_viewer', org_id: 'other' }, assignedUserIds: [] }))).toBe(false)
  })
  it('7. partner in UA on controlled technology', () => {
    const partner = {
      user: { id: 'u-partner', role: 'partner' as Role, location: 'UA' },
      file: { sensitivity: 'controlled_technology' as const },
      assignedUserIds: ['u-partner'],
      officerApprovedUserIds: ['u-partner'],
    }
    expect(canView(ctx({ ...partner, partnerFlag: true }))).toBe(false)
    expect(canView(ctx({ ...partner, exportAuthorisedCountries: ['UA'] }))).toBe(false)
    expect(canView(ctx({ ...partner, partnerFlag: true, exportAuthorisedCountries: ['UA'] }))).toBe(true)
  })
  it('7. analyst abroad may still see non-controlled files', () => {
    expect(canView(ctx({ user: { location: 'UA' } }))).toBe(true)
  })
})

describe('can (§7.3)', () => {
  it('open case: client roles except viewer', () => {
    expect(can('client_member', 'open_case')).toBe(true)
    expect(can('client_viewer', 'open_case')).toBe(false)
    expect(can('analyst', 'open_case')).toBe(false)
  })
  it('assigned cells need opts.assigned', () => {
    expect(can('analyst', 'view_sanctions')).toBe(false)
    expect(can('analyst', 'view_sanctions', { assigned: true })).toBe(true)
    expect(can('specialist', 'view_sanctions', { assigned: true })).toBe(false)
  })
  it('partner: upload limited to assigned, technical files flag only', () => {
    expect(can('partner', 'upload')).toBe(false)
    expect(can('partner', 'upload', { assigned: true })).toBe(true)
    expect(can('partner', 'view_technical', { assigned: true })).toBe(false)
    expect(can('partner', 'view_technical', { partnerFlag: true })).toBe(true)
  })
  it('analyst proposes, officer clears', () => {
    expect(can('analyst', 'clear_match')).toBe(false)
    expect(can('analyst', 'propose_clear_match')).toBe(true)
    expect(can('officer', 'clear_match')).toBe(true)
  })
  it('approve and sign', () => {
    expect(can('client_approver', 'approve_quote')).toBe(true)
    expect(can('client_member', 'approve_quote')).toBe(false)
    expect(can('officer', 'sign_classification')).toBe(true)
    expect(can('analyst', 'sign_classification')).toBe(false)
  })
  it('ops admin manages users but never sees files', () => {
    expect(can('ops_admin', 'manage_users')).toBe(true)
    expect(can('ops_admin', 'view_technical', { assigned: true })).toBe(false)
  })
})

describe('vetting', () => {
  it('ranks and requirements', () => {
    expect(['none', 'baseline', 'sc', 'dv'].map((v) => vettingRank(v as never))).toEqual([0, 1, 2, 3])
    expect(requiredVetting('unclassified')).toBe('none')
    expect(requiredVetting('official_sensitive')).toBe('baseline')
    expect(requiredVetting('controlled_technology')).toBe('baseline')
  })
})
