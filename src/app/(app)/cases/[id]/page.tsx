import Link from 'next/link'
import { ActionChip, StatusChip } from '@/components/passage/chips'
import { CaseTimeline } from '@/components/passage/case-timeline'
import { SidePanel } from '@/components/passage/side-panel'
import { Rise } from '@/components/passage/rise'
import { ACTION_MEANING, SENSITIVITY_LABEL, STATE_LABEL, gbp, isActionable } from '@/components/passage/labels'
import { Button } from '@/components/ui/button'
import { getCaseForUser } from '@/server/queries'
import { AUDIT_LABEL, PARTY_LABEL, auditText, countryName, fmtDate, fmtTime, shortId } from '../../format'
import { timelineFor, verdictStatus } from '../../steps'
import { AnswerForm, QuoteSection } from './client'

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const v = await getCaseForUser(id)
  const c = v.case as typeof v.case & { title?: string | null }
  const buyer = v.parties.find((p) => p.type === 'buyer')
  const byParty = new Map(v.screening.map((r) => [r.party_id, r]))
  const destRow = v.screening.find((r) => !r.party_id)
  const openQ = v.questions.find((q) => q.status === 'open' && ['client_admin', 'client_member', 'client_approver'].includes(q.to_role))
  const shownQuotes = v.quotes.filter((q) => q.status === 'shown')
  const approved = v.quotes.find((q) => q.status === 'approved')
  const flagged = v.screening.some((r) => r.result !== 'clear' && !r.decision)

  const nextText =
    openQ?.text ??
    (c.state === 'RouteQuote' ? 'Approve the fixed quote to start the licence work.' : c.state === 'IntakeIncomplete' ? 'Add the missing items to submit.' : ACTION_MEANING[v.clientAction])

  return (
    <>
      <Rise className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 font-mono text-[11px] tracking-[0.14em] text-dim">
            <Link href="/cases" className="text-dim no-underline hover:text-foreground">SHIPMENTS</Link> / {shortId(c.id)}
          </div>
          <h1 className="m-0 font-serif text-[clamp(24px,3vw,34px)] font-semibold leading-tight tracking-[-0.02em]">
            {c.title || 'Shipment'} → {countryName(c.destination)}
          </h1>
          <p className="mt-2 mb-0 text-muted-foreground">
            {buyer ? `Buyer: ${buyer.name} (${countryName(buyer.country)}) · ` : ''}Deadline {fmtDate(c.deadline)} · Opened {fmtDate(c.created_at)}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-sm border border-warn-border bg-warn-bg px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] text-warn uppercase">
          {isActionable(v.clientAction) && <span aria-hidden className="pulse-warn size-[7px] rounded-full bg-warn" />}
          {STATE_LABEL[c.state]}
        </span>
      </Rise>

      <CaseTimeline steps={timelineFor(c.state, flagged ? 'Possible match' : undefined)} className="mb-6" />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          {!v.viewer.isClient && (
            <div className="rounded-lg border border-info-border bg-info-bg px-5 py-4">
              You are viewing as {v.viewer.role}.{' '}
              <Link href={`/desk/${c.id}`}>Open the desk workspace for this case</Link>
            </div>
          )}

          {v.viewer.isClient && openQ && v.viewer.canAnswer && (
            <section className="rounded-lg border border-warn-border bg-warn-bg px-6 py-5">
              <div className="mb-1.5 flex items-center gap-2.5">
                <ActionChip action={openQ.to_role ? 'ANSWER' : v.clientAction} tone="primary" />
                <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">YOUR NEXT ACTION</span>
              </div>
              <h2 className="m-0 mb-1 text-lg font-semibold">{openQ.text}</h2>
              <AnswerForm questionId={openQ.id} />
            </section>
          )}

          {v.viewer.isClient && c.state === 'RouteQuote' && shownQuotes.length > 0 && (
            <QuoteSection
              quotes={shownQuotes.map((q) => ({ id: q.id, item: q.item, amount: q.amount }))}
              canApprove={v.viewer.canApproveQuote}
              caseRef={shortId(c.id)}
              route={c.route}
              title={c.title ?? 'this shipment'}
              orgName={v.org.name}
              buyer={buyer?.name ?? 'your buyer'}
              deadline={fmtDate(c.deadline)}
              caseHref={`/cases/${c.id}`}
            />
          )}
          {approved && (
            <div className="rounded-lg border border-good-border bg-good-bg px-5 py-4">
              <strong>Approved.</strong> Price locked at {gbp(approved.amount)}. Next action for you:{' '}
              <span className="font-mono">{v.clientAction}</span>.
            </div>
          )}

          <section className="rounded-lg border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
              <h2 className="m-0 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground">PARTIES · SANCTIONS SCREENING</h2>
              <span className="text-xs text-dim">
                {v.screening.length ? `Lists: ${v.screening[0].lists_checked.join(' · ')} · screened ${fmtTime(v.screening[0].screened_at)}` : 'Not screened yet'}
              </span>
            </div>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Parties">
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
                  {v.parties.map((p) => {
                    const r = byParty.get(p.id)
                    return (
                      <tr key={p.id} className="border-t border-border hover:bg-surface-2">
                        <td className="px-6 py-3.5 text-muted-foreground">{PARTY_LABEL[p.type] ?? p.type}</td>
                        <td className="px-3 py-3.5 font-medium">{p.name}</td>
                        <td className="px-3 py-3.5 text-muted-foreground">{countryName(p.country)}</td>
                        <td className="px-6 py-3.5">{r ? <StatusChip status={verdictStatus(r)} /> : <span className="text-dim">—</span>}</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t border-border">
                    <td className="px-6 py-3.5 text-muted-foreground">Destination</td>
                    <td className="px-3 py-3.5 font-medium">{countryName(c.destination)}</td>
                    <td className="px-3 py-3.5 text-muted-foreground">{countryName(c.destination)}</td>
                    <td className="px-6 py-3.5">
                      {destRow ? <StatusChip status={verdictStatus(destRow)} label={destRow.result === 'clear' ? 'Not restricted' : undefined} /> : <span className="text-dim">—</span>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface">
            <h2 className="m-0 border-b border-border px-6 py-4 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground">FILES</h2>
            <ul className="m-0 list-none p-0">
              {v.files.map((f) => (
                <li key={f.id} className="flex flex-wrap justify-between gap-2 border-t border-border px-6 py-3.5 first:border-t-0">
                  <span>
                    {f.name} <span className="text-dim">· {f.type} · {(f.size_bytes / 1024).toFixed(0)} KB</span>
                  </span>
                  <span className="rounded-sm border border-border-strong px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    {SENSITIVITY_LABEL[f.sensitivity]}
                  </span>
                </li>
              ))}
              {!v.files.length && <li className="px-6 py-4 text-dim">No files you can see.</li>}
              {v.hiddenFileCount > 0 && <li className="border-t border-border px-6 py-3 text-dim">{v.hiddenFileCount} file(s) hidden by access rules.</li>}
            </ul>
          </section>

          {c.route && (
            <section className="rounded-lg border border-border bg-surface px-6 py-5">
              <h2 className="m-0 mb-2 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground">SIGNED OUTCOME</h2>
              <p className="m-0">
                Route <strong>{c.route}</strong>
                {v.classification?.list_entries?.length ? ` · ${v.classification.list_entries.join(', ')}` : ''}
              </p>
              {c.route_note && <p className="mt-1 mb-0 text-muted-foreground">{c.route_note}</p>}
            </section>
          )}
        </div>

        <SidePanel
          className="flex-[1_1_320px]"
          locked={v.locked}
          authorisation={{
            orgStatus: v.org.onboarding_status,
            agreementsSigned: v.org.onboarding_status === 'authorised' ? 'Signed' : null,
            companyChecks: v.org.sanctions_status === 'clear' ? 'passed' : v.org.sanctions_status === 'blocked' ? 'failed' : 'pending',
            dataCeiling: v.org.data_ceiling,
            caseSensitivity: c.sensitivity,
            hosting: 'UK · London',
          }}
          sanctions={{
            rows: [
              ...v.parties.map((p) => {
                const r = byParty.get(p.id)
                return {
                  label: PARTY_LABEL[p.type] ?? p.type,
                  status: r ? verdictStatus(r) : ('review' as const),
                  text: r ? undefined : 'Pending',
                  decision: r?.decision ? `${r.decision === 'cleared' ? 'Cleared' : 'Confirmed'} by officer: ${r.reason ?? ''}` : undefined,
                }
              }),
              { label: 'Destination', status: destRow ? verdictStatus(destRow) : ('review' as const), text: destRow?.result === 'clear' ? 'Not restricted' : destRow ? undefined : 'Pending' },
            ],
            listsChecked: v.screening[0]?.lists_checked ?? ['UK', 'EU', 'UN', 'US'],
            lastScreened: v.screening[0] ? fmtTime(v.screening[0].screened_at) : '—',
          }}
          team={v.team.map((t) => ({ name: t.name, role: t.role, vetting: t.vetting, you: t.userId === v.viewer.id }))}
          nextAction={{
            action: v.clientAction,
            text: nextText,
            cta:
              v.clientAction === 'UPLOAD' && v.viewer.canUpload ? (
                <Button asChild variant="outline" className="self-start">
                  <Link href="/cases/new">Start a new shipment</Link>
                </Button>
              ) : undefined,
          }}
          fees={[
            { label: 'Sanctions checks', value: 'Included' },
            { label: 'Classification', value: 'Included' },
            ...v.quotes.map((q) => ({
              label: q.item === 'individual' ? 'Individual licence' : q.item.replace(/_/g, ' '),
              value: q.status === 'approved' ? `${gbp(q.amount)} · approved` : q.status === 'declined' ? 'Declined' : `${gbp(q.amount)} · awaiting approval`,
              pending: q.status === 'shown',
            })),
          ]}
          audit={v.audit.map((a) => ({ time: fmtTime(a.timestamp), text: AUDIT_LABEL[a.action] ?? auditText(a.action) }))}
        />
      </div>
    </>
  )
}
