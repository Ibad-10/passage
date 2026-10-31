'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { QuoteCard } from '@/components/passage/quote-card'
import { answerQuestion } from '@/server/cases'
import { approveQuote, askAboutQuote } from '@/server/quotes'

export function AnswerForm({ questionId }: { questionId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3"
      action={(fd) =>
        start(async () => {
          setErr(null)
          const r = await answerQuestion(questionId, fd)
          if ('error' in r) return setErr(r.error)
          toast.success('Sent to the analyst')
          router.refresh()
        })
      }
    >
      <label htmlFor="answer" className="flex min-w-[240px] flex-[1_1_260px] flex-col gap-1.5 text-xs text-muted-foreground">
        Your answer
        <textarea id="answer" name="answer" required rows={2} maxLength={4000} className="rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-foreground" />
      </label>
      <Button type="submit" disabled={pending} className="min-h-11">
        {pending ? 'Sending…' : 'Send to analyst'}
      </Button>
      {err && <p role="alert" className="m-0 basis-full text-sm text-bad">{err}</p>}
    </form>
  )
}

const ROUTE_COPY: Record<string, { title: string; summary: (t: string) => string }> = {
  C: { title: 'An individual export licence is needed.', summary: (t) => `We prepare and file a standard individual export licence (SIEL) for ${t}.` },
  B: { title: 'This can go under a general licence.', summary: (t) => `We check the conditions, register the general licence and record each shipment of ${t}.` },
}

export function QuoteSection(p: {
  quotes: { id: string; item: string; amount: number }[]
  canApprove: boolean
  caseRef: string
  route: string | null
  title: string
  orgName: string
  buyer: string
  deadline: string
  caseHref: string
}) {
  const router = useRouter()
  const main = p.quotes.find((q) => q.item === 'individual' || q.item === 'general_setup') ?? p.quotes[0]
  const copy = ROUTE_COPY[p.route ?? 'C'] ?? ROUTE_COPY.C
  if (!p.canApprove) {
    return (
      <div className="rounded-lg border border-warn-border bg-warn-bg px-5 py-4">
        A fixed quote is waiting. Only an approver or admin at {p.orgName} can approve it.
      </div>
    )
  }
  return (
    <QuoteCard
      quote={{ amount: main.amount, status: 'shown' }}
      eyebrow={`${p.caseRef} · Route ${p.route ?? ''} · Signed by compliance officer`}
      title={copy.title}
      summary={copy.summary(p.title)}
      priceNote="Fixed fee · ex. VAT · no government fee"
      scope={[
        'End-user certificate request sent to your buyer',
        'Application pack prepared by analyst',
        'All parties re-screened before filing',
        'Officer signs and files; regulator queries answered in 48h',
        'Licence conditions, quantities and expiry tracked',
      ]}
      timeline={[
        { when: 'Day 0–5', what: 'our preparation', current: true },
        { when: '~4 weeks', what: 'government decision' },
        { when: 'Your deadline', what: p.deadline },
      ]}
      orgName={p.orgName}
      afterApproval={`We've sent the end-user certificate request to ${p.buyer}.`}
      backHref={p.caseHref}
      onApprove={async () => {
        for (const q of p.quotes) {
          const r = await approveQuote(q.id)
          if ('error' in r) {
            toast.error(r.error)
            throw new Error(r.error)
          }
        }
        router.refresh()
      }}
      onAsk={async (text) => {
        const r = await askAboutQuote(main.id, text)
        if ('error' in r) toast.error(r.error)
        else toast.success('Question sent to the analyst')
      }}
    />
  )
}
