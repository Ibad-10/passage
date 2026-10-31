'use client'

// Component gallery with fixture props (fictional names from the mockups). No data fetching.
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import type { ClientAction, Route } from '@/domain/types'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/passage/app-header'
import { ActionChip, StatusChip, type ScreeningStatus } from '@/components/passage/chips'
import { CASE_STEPS, CaseTimeline, type TimelineStep } from '@/components/passage/case-timeline'
import { SidePanel, type SidePanelProps } from '@/components/passage/side-panel'
import { StatsStrip, type Stat } from '@/components/passage/stats-strip'
import { CaseTable, type CaseRow } from '@/components/passage/case-table'
import { NewShipmentWizard } from '@/components/passage/new-shipment-wizard'
import {
  ClassificationList,
  RouteSelector,
  SanctionsReviewCard,
  type ClassificationSuggestion,
  type MatchStatus,
} from '@/components/passage/officer'
import { QuoteCard } from '@/components/passage/quote-card'
import { Rise } from '@/components/passage/rise'

const ACTIONS: ClientAction[] = ['UPLOAD', 'DESCRIBE', 'SELECT', 'ANSWER', 'APPROVE', 'SIGN', 'WAIT', 'NONE']
const STATUSES: ScreeningStatus[] = ['clear', 'possible', 'red_flag', 'match', 'review']

const STATS: Stat[] = [
  { label: 'Needs your action', value: 2, sub: '1 answer · 1 quote', emphasis: true },
  { label: 'In progress', value: 2, sub: 'Classifying · Filed' },
  { label: 'Active licences', value: 1, sub: 'SIEL · Poland' },
  { label: 'Avg. time to route', value: 2.4, decimals: 1, suffix: 'd', sub: 'Last 90 days' },
]

const ROWS: CaseRow[] = [
  { id: 'CTS-0142', title: '15 × Kestrel-4 ISR drones', buyer: 'Kalyna Systems TOV', destination: 'Ukraine', state: 'SanctionsReview', action: 'ANSWER', deadline: '28 Nov', href: '#case' },
  { id: 'CTS-0139', title: '200 × FC-7 flight controllers', buyer: 'Nordvik Robotics AS', destination: 'Norway', state: 'RouteQuote', action: 'APPROVE', deadline: '14 Dec', href: '#case' },
  { id: 'CTS-0137', title: 'Thermal module TM-2 (40 units)', buyer: 'Wisła Defence Sp. z o.o.', destination: 'Poland', state: 'Classifying', action: 'WAIT', deadline: '20 Nov', href: '#case' },
  { id: 'CTS-0131', title: 'Ground station software v2.4', buyer: 'Kalyna Systems TOV', destination: 'Ukraine', state: 'Filed', action: 'WAIT', deadline: '05 Dec', href: '#case' },
  { id: 'CTS-0124', title: '60 × LiPo battery packs 6S', buyer: 'Baltic UAS OÜ', destination: 'Estonia', state: 'ClosedNotControlled', action: 'NONE', deadline: '—', href: '#case' },
  { id: 'CTS-0118', title: '30 × Kestrel-4 airframes', buyer: 'Wisła Defence Sp. z o.o.', destination: 'Poland', state: 'Granted', action: 'NONE', deadline: 'exp. Oct 2028', href: '#case' },
]

const STEPS: TimelineStep[] = CASE_STEPS.map((s, i) => ({
  ...s,
  sub: i === 1 ? 'Possible match' : s.sub,
  status: i === 0 ? 'done' : i === 1 ? 'active' : 'todo',
}))

const PANEL: SidePanelProps = {
  authorisation: {
    orgStatus: 'authorised',
    agreementsSigned: 'Signed 12 Oct',
    companyChecks: 'passed',
    dataCeiling: 'official_sensitive',
    caseSensitivity: 'controlled_technology',
    hosting: 'UK · London',
  },
  sanctions: {
    rows: [
      { label: 'Buyer', status: 'clear' },
      { label: 'End user', status: 'clear' },
      { label: 'Consignee', status: 'possible' },
      { label: 'Forwarder', status: 'clear', decision: 'Cleared by R. Doyle (officer): different registry and country.' },
      { label: 'Destination', status: 'clear', text: 'Not restricted' },
    ],
    listsChecked: ['UK', 'EU', 'UN', 'US'],
    lastScreened: '31 Oct 09:12',
  },
  team: [
    { name: 'Mira Okafor', role: 'client_approver', vetting: 'baseline', you: true },
    { name: 'J. Hart', role: 'analyst', vetting: 'baseline' },
    { name: 'R. Doyle', role: 'officer', vetting: 'sc' },
    { name: 'S. Patel', role: 'specialist', vetting: 'sc' },
  ],
  nextAction: { action: 'ANSWER', text: "Confirm the consignee's registration number" },
  fees: [
    { label: 'Sanctions checks', value: 'Included' },
    { label: 'Classification', value: 'Included' },
  ],
  audit: [
    { time: '09:12', text: 'Screening run · 5 parties' },
    { time: '09:12', text: 'Possible match flagged' },
    { time: '09:08', text: 'Case submitted complete' },
    { time: '09:01', text: '3 files uploaded' },
  ],
}

const PARTY_ROWS: { role: string; name: string; country: string; status: ScreeningStatus; text?: string }[] = [
  { role: 'Buyer', name: 'Kalyna Systems TOV', country: 'Ukraine', status: 'clear' },
  { role: 'End user', name: 'Kalyna Systems TOV', country: 'Ukraine', status: 'clear' },
  { role: 'Consignee', name: 'Volna Logistics LLC', country: 'Poland', status: 'possible' },
  { role: 'Forwarder', name: 'Baltic Air Cargo Ltd', country: 'United Kingdom', status: 'clear' },
  { role: 'Destination', name: 'Kyiv region', country: 'Ukraine', status: 'clear', text: 'Not restricted' },
]

const SUGGESTIONS: ClassificationSuggestion[] = [
  { entry: 'ML10.c', list: 'UK Military List', source: 'Spec p.4: “designed for military reconnaissance”, encrypted datalink', confidence: 0.86, tag: 'Analyst agrees' },
  { entry: '6A003.b.4', list: 'UK dual-use (thermal camera)', source: 'Spec p.7: 640×512 uncooled, 30 Hz', confidence: 0.71, tag: 'Subsumed by ML10' },
  { entry: '5A002.a', list: 'Encryption', source: 'Datalink AES-256', confidence: 0.64, tag: 'Checked' },
]

function Block({ id, label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 border-t border-border pt-10">
      <div className="mb-6">
        <div className="mb-2 font-mono text-[11px] tracking-[0.16em] text-dim uppercase">{label}</div>
        <h2 id={`${id}-h`} className="m-0 font-serif text-[clamp(22px,2.6vw,30px)] font-semibold tracking-[-0.02em]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

export function Gallery() {
  const [match, setMatch] = useState<MatchStatus>('open')
  const [route, setRoute] = useState<Route>('C')
  const cleared = match === 'cleared'

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        orgName="Skyline Drones Ltd"
        nav={[
          { label: 'Shipments', href: '#case-list', active: true },
          { label: 'Products', href: '#chips' },
          { label: 'Licences', href: '#quote' },
          { label: 'Records', href: '#officer' },
        ]}
        homeHref="/ui"
        userSlot={
          <span
            aria-label="Signed in as Mira Okafor"
            className="grid size-8 place-items-center rounded-lg border border-border-strong bg-surface-3 text-xs font-semibold"
          >
            MO
          </span>
        }
      />

      <main className="mx-auto flex max-w-[1400px] flex-col gap-14 px-[clamp(16px,3vw,32px)] pt-8 pb-16">
        <Rise>
          <div className="mb-2 font-mono text-[11px] tracking-[0.16em] text-dim">PREVIEW · FIXTURE DATA</div>
          <h1 className="m-0 font-serif text-[clamp(26px,3vw,36px)] font-semibold tracking-[-0.02em]">UI gallery</h1>
          <p className="mt-2 max-w-[640px] text-muted-foreground">
            Every Passage component with realistic props, for review before wiring. Toggle the theme in the header. The
            sign-in screen lives at <Link href="/sign-in">/sign-in</Link>.
          </p>
        </Rise>

        <Block id="chips" label="Primitives" title="Action and status chips">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((a) => (
                <ActionChip key={a} action={a} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.slice(0, 3).map((a) => (
                <ActionChip key={a} action={a} tone="primary" />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <StatusChip key={s} status={s} />
              ))}
              <StatusChip status="clear" label="Not restricted" />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
              {STATUSES.map((s) => (
                <StatusChip key={s} status={s} variant="text" />
              ))}
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button>Primary action</Button>
              <Button variant="outline">Secondary</Button>
              <Button variant="outline" className="border-bad-border text-bad hover:text-bad">
                Destructive (outlined)
              </Button>
            </div>
          </div>
        </Block>

        <Block id="case-list" label="Screen · Case list" title="Shipments">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <p className="m-0 font-mono text-[11px] tracking-[0.16em] text-dim">WORKSPACE · AUTHORISED</p>
            <Button asChild size="lg">
              <Link href="#new" className="text-primary-foreground no-underline hover:text-primary-foreground">
                <Plus aria-hidden strokeWidth={2.2} />
                New shipment
              </Link>
            </Button>
          </div>
          <StatsStrip stats={STATS} className="mb-7" />
          <CaseTable rows={ROWS} />
        </Block>

        <Block id="case" label="Screen · Case detail" title="15 × Kestrel-4 ISR drones → Kyiv">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <p className="m-0 text-muted-foreground">
              Buyer: Kalyna Systems TOV (Ukraine) · Deadline 28 Nov 2026 · Opened 31 Oct by Mira Okafor
            </p>
            <span className="inline-flex items-center gap-2 rounded-xs border border-warn-border bg-warn-bg px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] text-primary">
              <span aria-hidden className="pulse-warn size-[7px] rounded-full bg-primary" />
              AWAITING YOUR ANSWER
            </span>
          </div>
          <CaseTimeline steps={STEPS} className="mb-6" />
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
              <section className="rounded-lg border border-warn-border bg-warn-bg px-6 py-5">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <ActionChip action="ANSWER" tone="primary" />
                  <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">YOUR NEXT ACTION</span>
                </div>
                <h3 className="m-0 mb-1 text-lg font-semibold">Confirm the consignee&apos;s company registration number</h3>
                <p className="m-0 max-w-[620px] text-muted-foreground">
                  “Volna Logistics LLC” is similar to a name on the UK consolidated list. A registration number lets our
                  analyst rule it out. Nothing else on this shipment is blocked.
                </p>
              </section>
              <section className="rounded-lg border border-border bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
                  <h3 className="m-0 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground">
                    PARTIES · SANCTIONS SCREENING
                  </h3>
                  <span className="text-xs text-dim">Lists: UK · EU · UN · US · screened 31 Oct 09:12</span>
                </div>
                <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Parties">
                  <table className="w-full min-w-[560px] border-collapse text-left">
                    <thead>
                      <tr className="font-mono text-[10px] tracking-[0.14em] text-dim">
                        <th scope="col" className="px-6 py-2.5 font-medium">ROLE</th>
                        <th scope="col" className="px-3 py-2.5 font-medium">NAME</th>
                        <th scope="col" className="px-3 py-2.5 font-medium">COUNTRY</th>
                        <th scope="col" className="px-6 py-2.5 font-medium">RESULT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PARTY_ROWS.map((r) => (
                        <tr key={r.role} className="border-t border-border hover:bg-surface-2">
                          <td className="px-6 py-3.5 text-muted-foreground">{r.role}</td>
                          <td className="px-3 py-3.5 font-medium">{r.name}</td>
                          <td className="px-3 py-3.5 text-muted-foreground">{r.country}</td>
                          <td className="px-6 py-3.5">
                            <StatusChip status={r.status} label={r.text} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <SidePanel
              {...PANEL}
              className="flex-[1_1_320px]"
              nextAction={{
                ...PANEL.nextAction,
                cta: (
                  <Button className="self-start" onClick={() => toast('Reply box opens here')}>
                    Reply
                  </Button>
                ),
              }}
            />
          </div>
          <div className="mt-6 max-w-[420px]">
            <p className="mb-2 font-mono text-[11px] tracking-[0.14em] text-dim">SIDE PANEL · LOCKED VARIANT</p>
            <SidePanel
              {...PANEL}
              locked="Consignee confirmed on the UK consolidated list. No uploads or work until resolved."
              sanctions={{
                ...PANEL.sanctions,
                rows: PANEL.sanctions.rows.map((r) =>
                  r.label === 'Consignee' ? { ...r, status: 'match', decision: 'Confirmed by R. Doyle: same OGRN.' } : r,
                ),
              }}
              nextAction={{ action: 'NONE', text: 'Case closed as D. Do not proceed. No fee.' }}
              fees={[...PANEL.fees, { label: 'Individual licence', value: 'Awaiting approval', pending: true }]}
            />
          </div>
        </Block>

        <Block id="new" label="Screen · New case" title="What are you shipping, and to whom?">
          <p className="-mt-3 mb-7 max-w-[640px] text-muted-foreground">
            Sanctions checks and classification are included. You only see a price if a licence or specialist review is
            needed, and nothing paid starts until you approve it.
          </p>
          <NewShipmentWizard
            onSubmit={(fd) => {
              const summary = [...fd.entries()]
                .map(([k, v]) => `${k}=${v instanceof File ? v.name || '(none)' : v}`)
                .join(' · ')
              toast.success('Submitted (fixture)', { description: summary })
            }}
          />
        </Block>

        <Block id="officer" label="Screen · Officer review · CTS-0142" title="Officer review">
          <div className="flex flex-col gap-6">
            <SanctionsReviewCard
              partyRole="Consignee"
              party={{
                name: 'Volna Logistics LLC',
                country: 'Poland',
                regNo: '0000781245 (KRS)',
                address: 'ul. Portowa 12, Gdynia',
                source: 'Client answer 31 Oct 10:04',
              }}
              entry={{
                list: 'UK consolidated',
                name: 'VOLNA LOGISTIKA OOO',
                country: 'Russia',
                regNo: '1147847 (OGRN)',
                regime: 'Russia',
                score: 0.78,
              }}
              analyst={{
                name: 'J. Hart',
                proposal: 'clear',
                note: 'Different country, different registry and number; no ownership link found.',
              }}
              status={match}
              onClear={() => setMatch('cleared')}
              onConfirm={() => {
                setMatch('confirmed')
                setRoute('D')
              }}
            />
            <ClassificationList
              items={SUGGESTIONS}
              disabled={!cleared}
              footer={
                <>
                  US content: <strong className="text-foreground">14%</strong> (thermal core, EAR99). Below de minimis;
                  no US re-export authorisation needed.
                </>
              }
            />
            <RouteSelector
              value={route}
              onChange={setRoute}
              disabled={!cleared}
              hint={
                cleared
                  ? 'Your signature and reasoning go into the case pack and audit log.'
                  : match === 'confirmed'
                    ? 'Case closed as D. Client told plainly, no fee.'
                    : 'Resolve the sanctions match first.'
              }
            >
              {cleared && <Button onClick={() => toast.success(`Signed route ${route}`)}>Sign classification and route {route}</Button>}
            </RouteSelector>
          </div>
        </Block>

        <Block id="quote" label="Screen · Quote" title="Quote card">
          <div className="mx-auto max-w-[980px]">
            <QuoteCard
              quote={{ amount: 150000, status: 'shown' }}
              eyebrow="CTS-0142 · Route C · Signed by R. Doyle, 31 Oct"
              title="An individual export licence is needed."
              summary="Kestrel-4 is classified ML10.c on the UK Military List. We prepare and file a standard individual export licence (SIEL) for 15 units to Kalyna Systems TOV."
              priceNote="Plan S discount applied · ex. VAT · no government fee"
              scope={[
                'End-user certificate request sent to your buyer',
                'Application pack prepared by analyst',
                'All parties re-screened before filing',
                'Officer signs and files; ECJU queries answered in 48h',
                'Licence conditions, quantities and expiry tracked',
              ]}
              timeline={[
                { when: 'Day 0–5', what: 'our preparation', current: true },
                { when: '~4 weeks', what: 'government decision' },
                { when: 'Your deadline', what: '28 Nov 2026' },
              ]}
              orgName="Skyline Drones Ltd"
              afterApproval="We've sent the end-user certificate request to Kalyna Systems TOV."
              backHref="#case"
              onApprove={() => new Promise((r) => setTimeout(r, 600))}
              onAsk={(q) => {
                toast(`Question sent: ${q}`)
              }}
            />
          </div>
        </Block>
      </main>
    </div>
  )
}
