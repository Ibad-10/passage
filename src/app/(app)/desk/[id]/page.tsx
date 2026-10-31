import Link from 'next/link'
import { Rise } from '@/components/passage/rise'
import { CaseTimeline } from '@/components/passage/case-timeline'
import { STATE_LABEL } from '@/components/passage/labels'
import { getCaseForUser } from '@/server/queries'
import { PARTY_LABEL, countryName, fmtTime, shortId } from '../../format'
import { timelineFor } from '../../steps'
import { DeskWorkspace } from './workspace'

export default async function DeskCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const v = await getCaseForUser(id)
  const c = v.case as typeof v.case & { title?: string | null }
  const partyById = new Map(v.parties.map((p) => [p.id, p]))

  const flagged = v.screening
    .filter((r) => r.result !== 'clear')
    .map((r) => {
      const p = r.party_id ? partyById.get(r.party_id) : null
      const hit = r.hits?.[0]
      const ids = (p?.identifiers ?? {}) as Record<string, string>
      return {
        id: r.id,
        result: r.result,
        decision: r.decision,
        reason: r.reason,
        proposedBy: r.proposed_by,
        proposedReason: r.proposed_reason,
        partyRole: p ? PARTY_LABEL[p.type] ?? p.type : 'Destination',
        party: {
          name: p?.name ?? countryName(c.destination),
          country: countryName(p?.country ?? c.destination),
          regNo: ids.reg_no ?? ids.registration ?? '—',
          address: ids.address ?? '—',
          source: `Screened ${fmtTime(r.screened_at)}`,
        },
        entry: {
          list: hit?.list ?? r.lists_checked.join(', '),
          name: hit?.listedName ?? (r.reasons?.[0] || 'Destination rule'),
          country: '—',
          regNo: '—',
          regime: r.reasons?.join('; ') || '—',
          score: hit?.score ?? 1,
        },
      }
    })

  return (
    <>
      <Rise className="mb-6">
        <div className="mb-2 font-mono text-[11px] tracking-[0.14em] text-dim">
          <Link href="/desk" className="text-dim no-underline hover:text-foreground">QUEUE</Link> / {shortId(c.id)} · {v.org.name.toUpperCase()}
        </div>
        <h1 className="m-0 font-serif text-[clamp(22px,2.6vw,30px)] font-semibold tracking-[-0.02em]">
          {c.title || 'Shipment'} → {countryName(c.destination)}
        </h1>
        <p className="mt-2 mb-0 text-muted-foreground">
          {STATE_LABEL[c.state]} · End use: {c.end_use ?? '—'} ·{' '}
          <Link href={`/cases/${c.id}`}>Client view</Link>
        </p>
      </Rise>
      <CaseTimeline steps={timelineFor(c.state)} className="mb-6" />
      <DeskWorkspace
        caseId={c.id}
        state={c.state}
        viewer={v.viewer}
        flagged={flagged}
        ai={c.ai_result}
        aiStatus={c.ai_status}
        classification={v.classification ? { listEntries: v.classification.list_entries, reasoning: v.classification.reasoning, signed: !!v.classification.signed_by } : null}
        route={c.route}
        files={v.files.map((f) => f.name)}
      />
    </>
  )
}
