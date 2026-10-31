'use client'

import { Lock } from 'lucide-react'
import type { ClientAction, DataCeiling, OnboardingStatus, Role, Sensitivity, VettingLevel } from '@/domain/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ActionChip, StatusChip, type ScreeningStatus } from './chips'
import { ROLE_LABEL, SENSITIVITY_LABEL, VETTING_LABEL } from './labels'

export interface SidePanelProps {
  authorisation: {
    orgStatus: OnboardingStatus
    /** e.g. "Signed 12 Oct"; null when NDA/terms/DPA are not all signed. */
    agreementsSigned: string | null
    companyChecks: 'passed' | 'pending' | 'failed'
    dataCeiling: DataCeiling
    caseSensitivity: Sensitivity
    hosting: string
  }
  sanctions: {
    rows: { label: string; status: ScreeningStatus; text?: string; /** officer decision + reason, shown on hover/focus */ decision?: string }[]
    listsChecked: string[]
    lastScreened: string
  }
  team: { name: string; role: Role; vetting: VettingLevel; you?: boolean }[]
  partnerAccess?: string
  nextAction: { action: ClientAction; text: string; cta?: React.ReactNode }
  fees: { label: string; value: string; pending?: boolean }[]
  audit: { time: string; text: string }[]
  /** Any red item locks the case: pass the reason and the fix. */
  locked?: string | null
  className?: string
}

const ORG_STATUS: Record<OnboardingStatus, { status: ScreeningStatus; text: string }> = {
  authorised: { status: 'clear', text: 'Authorised' },
  checks_passed: { status: 'review', text: 'Checks passed' },
  agreements_signed: { status: 'review', text: 'Agreements signed' },
  pending: { status: 'review', text: 'Pending' },
  suspended: { status: 'match', text: 'Suspended' },
}
const CHECKS: Record<'passed' | 'pending' | 'failed', { status: ScreeningStatus; text: string }> = {
  passed: { status: 'clear', text: 'Passed' },
  pending: { status: 'review', text: 'Pending' },
  failed: { status: 'match', text: 'Failed' },
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-border px-5 py-[18px] last:border-b-0', className)}>
      <h2 className="mb-3 font-mono text-[10px] font-medium tracking-[0.16em] text-dim uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Rows({ children }: { children: React.ReactNode }) {
  return <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2">{children}</dl>
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </>
  )
}

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-sm border border-border-strong px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
    {children}
  </span>
)

/** "Authorisation and status" panel, build-plan §7.5. */
export function SidePanel(p: SidePanelProps) {
  const { authorisation: a, sanctions: s } = p
  return (
    <aside
      aria-label="Authorisation and status"
      className={cn('min-w-0 rounded-lg border border-border bg-surface text-[13px]', p.className)}
    >
      {p.locked && (
        <div role="alert" className="flex gap-2.5 rounded-t-lg border-b border-bad-border bg-bad-bg px-5 py-3.5 text-bad">
          <Lock className="mt-0.5 size-4 flex-none" aria-hidden />
          <div>
            <strong className="font-semibold">Case locked.</strong> <span>{p.locked}</span>
          </div>
        </div>
      )}

      <Section title="Authorisation">
        <Rows>
          <Row label="Organisation">
            <StatusChip variant="text" status={ORG_STATUS[a.orgStatus].status} label={ORG_STATUS[a.orgStatus].text} />
          </Row>
          <Row label="NDA · Terms · DPA">
            {a.agreementsSigned ? (
              <StatusChip variant="text" status="clear" label={a.agreementsSigned} />
            ) : (
              <StatusChip variant="text" status="match" label="Not signed" />
            )}
          </Row>
          <Row label="Company checks">
            <StatusChip variant="text" status={CHECKS[a.companyChecks].status} label={CHECKS[a.companyChecks].text} />
          </Row>
          <Row label="Data ceiling">
            <span className="font-mono text-[11px]">{SENSITIVITY_LABEL[a.dataCeiling]}</span>
          </Row>
          <Row label="This case">
            <span className="font-mono text-[11px]">{SENSITIVITY_LABEL[a.caseSensitivity]}</span>
          </Row>
          <Row label="Hosting">{a.hosting}</Row>
          <Row label="Access">{p.team.length} {p.team.length === 1 ? 'person' : 'people'}</Row>
          <Row label="Partner access">{p.partnerAccess ?? 'None'}</Row>
        </Rows>
      </Section>

      <Section title="Sanctions">
        <Rows>
          {s.rows.map((r) => (
            <Row key={r.label} label={r.label}>
              {r.decision ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="-my-3 cursor-help py-3 underline decoration-dotted underline-offset-4">
                      <StatusChip variant="text" status={r.status} label={r.text} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{r.decision}</TooltipContent>
                </Tooltip>
              ) : (
                <StatusChip variant="text" status={r.status} label={r.text} />
              )}
            </Row>
          ))}
          <Row label="Lists checked">{s.listsChecked.join(', ')}</Row>
          <Row label="Last screened">
            <span className="font-mono text-[12px]">{s.lastScreened}</span>
          </Row>
        </Rows>
      </Section>

      <Section title="Case team">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {p.team.map((m) => (
            <li key={m.name + m.role} className="flex items-center justify-between gap-3">
              <span>
                {m.you ? 'You' : m.name} · {ROLE_LABEL[m.role]}
              </span>
              <Tag>{VETTING_LABEL[m.vetting]}</Tag>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Your next action">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <ActionChip action={p.nextAction.action} tone="primary" className="mt-0.5" />
            <span className="text-foreground">{p.nextAction.text}</span>
          </div>
          {p.nextAction.cta}
        </div>
      </Section>

      <Section title="Fees on this case">
        <Rows>
          {p.fees.map((f) => (
            <Row key={f.label} label={f.label}>
              <span className={cn(f.pending && 'text-warn-text')}>{f.value}</span>
            </Row>
          ))}
        </Rows>
      </Section>

      <Section title="Audit · last events">
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs text-muted-foreground">
          {p.audit.slice(0, 5).map((e, i) => (
            <li key={i}>
              <span className="font-mono text-dim">{e.time}</span> · {e.text}
            </li>
          ))}
        </ul>
      </Section>
    </aside>
  )
}
