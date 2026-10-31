// Small display helpers shared by the app pages.
const COUNTRY: Record<string, string> = {
  GB: 'United Kingdom', UA: 'Ukraine', PL: 'Poland', NO: 'Norway', EE: 'Estonia', LT: 'Lithuania', LV: 'Latvia',
  DE: 'Germany', RU: 'Russia', BY: 'Belarus', US: 'United States', FR: 'France', SE: 'Sweden', FI: 'Finland',
}
export const countryName = (c: string | null | undefined) => (c ? (COUNTRY[c.toUpperCase()] ?? c) : '—')

export const shortId = (id: string) => `CTS-${id.replace(/-/g, '').slice(-4).toUpperCase()}`

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const fmtTime = (d: string) =>
  new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const PARTY_LABEL: Record<string, string> = {
  buyer: 'Buyer', end_user: 'End user', consignee: 'Consignee', intermediary: 'Intermediary',
  forwarder: 'Forwarder', agent: 'Agent', bank: 'Bank',
}

export const AUDIT_LABEL: Record<string, string> = {
  create_case: 'Case created', view_case: 'Case viewed', submit: 'Case submitted', screen: 'Screening run',
  upload: 'File uploaded', answer: 'Client answered', propose_clear: 'Analyst proposed clear',
  decide_match: 'Officer decided match', ai_first_pass: 'AI first pass', save_classification: 'Classification saved',
  sign_route: 'Officer signed route', approve_quote: 'Quote approved', decline_quote: 'Quote declined',
  ask_client: 'Question to client', claim_case: 'Case claimed',
}
export const auditText = (a: string) => AUDIT_LABEL[a] ?? a.replace(/_/g, ' ')
