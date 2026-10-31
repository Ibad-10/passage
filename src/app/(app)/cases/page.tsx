import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CaseTable, type CaseRow } from '@/components/passage/case-table'
import { StatsStrip, type Stat } from '@/components/passage/stats-strip'
import { Rise } from '@/components/passage/rise'
import { isActionable } from '@/components/passage/labels'
import { listCasesForUser } from '@/server/queries'
import { getCurrentUser } from '@/server/session'
import { isClientUser } from '@/server/core'
import { can } from '@/domain/permissions'
import { countryName, fmtDate, shortId } from '../format'

const IN_PROGRESS = ['SanctionsCheck', 'SanctionsReview', 'Classifying', 'EmergingReview', 'OfficerReview', 'RouteInProgress', 'Filed']
const LICENSED = ['Granted', 'Active', 'Monitoring']

export default async function CasesPage() {
  const [user, cases] = await Promise.all([getCurrentUser(), listCasesForUser()])
  const client = !!user && isClientUser(user)
  const canOpen = !!user && can(user.role, 'open_case')

  const rows: CaseRow[] = cases.map((c) => {
    const x = c as typeof c & { title?: string | null; buyerName?: string | null }
    return {
      id: shortId(c.id),
      title: x.title || c.endUse?.slice(0, 60) || 'Untitled shipment',
      buyer: x.buyerName ?? '',
      destination: countryName(c.destination),
      state: c.state,
      action: client ? c.clientAction : 'WAIT',
      deadline: fmtDate(c.deadline),
      href: client ? `/cases/${c.id}` : `/desk/${c.id}`,
    }
  })
  const stats: Stat[] = [
    { label: 'Needs your action', value: cases.filter((c) => isActionable(c.clientAction)).length, sub: 'Answers, uploads, approvals', emphasis: true },
    { label: 'In progress', value: cases.filter((c) => IN_PROGRESS.includes(c.state)).length, sub: 'Screening to filing' },
    { label: 'Active licences', value: cases.filter((c) => LICENSED.includes(c.state)).length, sub: 'Granted or active' },
    { label: 'All shipments', value: cases.length, sub: 'This workspace' },
  ]

  return (
    <>
      <Rise className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 font-mono text-[11px] tracking-[0.16em] text-dim">
            {client ? 'WORKSPACE · AUTHORISED' : 'ASSIGNED TO YOU'}
          </div>
          <h1 className="m-0 font-serif text-[clamp(26px,3vw,36px)] font-semibold tracking-[-0.02em]">Shipments</h1>
        </div>
        {canOpen && (
          <Button asChild size="lg">
            <Link href="/cases/new" className="text-primary-foreground no-underline hover:text-primary-foreground">
              <Plus aria-hidden strokeWidth={2.2} />
              New shipment
            </Link>
          </Button>
        )}
      </Rise>
      <StatsStrip stats={stats} className="mb-7" />
      {rows.length ? (
        <CaseTable rows={rows} />
      ) : (
        <div className="rounded-lg border border-border bg-surface px-6 py-14 text-center">
          <p className="m-0 font-serif text-xl font-semibold">No shipments yet</p>
          <p className="mt-2 text-muted-foreground">
            {canOpen ? 'Start with “New shipment”: tell us what you are shipping and to whom.' : 'Nothing assigned to you.'}
          </p>
        </div>
      )}
    </>
  )
}
