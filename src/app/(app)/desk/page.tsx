import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Rise } from '@/components/passage/rise'
import { STATE_LABEL } from '@/components/passage/labels'
import { deskQueue } from '@/server/queries'
import { getCurrentUser } from '@/server/session'
import { isClientUser } from '@/server/core'
import { fmtDate, shortId } from '../format'
import { ClaimButton } from './claim-button'

export default async function DeskPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  if (isClientUser(user)) redirect('/cases')
  const queue = await deskQueue()
  const mine = queue.filter((q) => q.assignedToMe)
  const open = queue.filter((q) => !q.assignedToMe)

  const Row = ({ q }: { q: (typeof queue)[number] }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 first:border-t-0 hover:bg-surface-2">
      <div className="min-w-0">
        <div className="font-mono text-[11px] tracking-[0.1em] text-dim">
          {shortId(q.id)} · {STATE_LABEL[q.state].toUpperCase()}
          {q.aiStatus === 'failed' && <span className="ml-2 text-bad">AI FAILED · MANUAL</span>}
        </div>
        <div className="font-medium">{q.orgName}</div>
        <div className="text-xs text-dim">
          {q.target ? `Target: ${q.target} · ` : ''}Deadline {fmtDate(q.deadline)}
        </div>
      </div>
      {q.assignedToMe ? (
        <Link href={`/desk/${q.id}`} className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground no-underline hover:text-primary-foreground">
          Open case
        </Link>
      ) : (
        <ClaimButton caseId={q.id} />
      )}
    </li>
  )

  return (
    <>
      <Rise className="mb-7">
        <div className="mb-2 font-mono text-[11px] tracking-[0.16em] text-dim">DESK · {user.role.toUpperCase()}</div>
        <h1 className="m-0 font-serif text-[clamp(26px,3vw,36px)] font-semibold tracking-[-0.02em]">Queue</h1>
      </Rise>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface">
          <h2 className="m-0 border-b border-border px-5 py-3.5 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground">ASSIGNED TO ME · {mine.length}</h2>
          <ul className="m-0 list-none p-0">{mine.length ? mine.map((q) => <Row key={q.id} q={q} />) : <li className="px-5 py-6 text-dim">Nothing assigned. Claim a case from the right.</li>}</ul>
        </section>
        <section className="rounded-lg border border-border bg-surface">
          <h2 className="m-0 border-b border-border px-5 py-3.5 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground">UNCLAIMED · {open.length}</h2>
          <ul className="m-0 list-none p-0">{open.length ? open.map((q) => <Row key={q.id} q={q} />) : <li className="px-5 py-6 text-dim">Queue is clear.</li>}</ul>
        </section>
      </div>
    </>
  )
}
