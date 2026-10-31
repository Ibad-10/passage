'use client'

import { useId, useState, useTransition } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import type { Quote } from '@/domain/types'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { gbp } from './labels'
import { EASE, Rise } from './rise'

/** Verbatim from docs/build-plan.md §2. Shown on every quote. */
export const GUARANTEE_TEXT =
  'We guarantee the service, not the government decision: a complete, correct file signed by a qualified officer, reworked at no cost if rejected because of our error. The client remains the legal exporter.'

export interface QuoteCardProps {
  quote: Pick<Quote, 'amount' | 'status'>
  /** Mono line above the title, e.g. "CTS-0142 · ROUTE C · SIGNED BY R. DOYLE, 31 OCT". */
  eyebrow: string
  title: string
  summary: string
  /** Under the price, e.g. "Plan S discount applied · ex. VAT · no government fee". */
  priceNote: string
  scope: string[]
  timeline: { when: string; what: string; current?: boolean }[]
  orgName: string
  /** Success copy, e.g. "We've sent the end-user certificate request to Kalyna Systems TOV." */
  afterApproval: string
  backHref: string
  onApprove: () => void | Promise<void>
  onAsk?: (question: string) => void | Promise<void>
}

const mono = 'font-mono text-[10px] tracking-[0.16em] text-dim'

export function QuoteCard(p: QuoteCardProps) {
  const [ack, setAck] = useState(false)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [approvedLocal, setApprovedLocal] = useState(false)
  const [pending, startTransition] = useTransition()
  const id = useId()
  const price = gbp(p.quote.amount)
  const approved = approvedLocal || p.quote.status === 'approved'

  if (approved)
    return (
      <section className="px-4 py-[clamp(32px,8vw,96px)] text-center" aria-live="polite">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.08, 1], opacity: [0, 1, 1] }}
          transition={{ duration: 0.5, ease: EASE, times: [0, 0.6, 1] }}
          className="mx-auto mb-6 grid size-[72px] place-items-center rounded-full bg-good-soft"
        >
          <Check className="size-[34px] text-good" strokeWidth={2.4} aria-hidden />
        </motion.div>
        <Rise>
          <h1 className="m-0 font-serif text-[clamp(26px,3.4vw,38px)] font-semibold tracking-[-0.02em]">
            Approved. Price locked at {price}.
          </h1>
        </Rise>
        <Rise delay={0.08}>
          <p className="mx-auto mt-3 max-w-[520px] text-base text-muted-foreground">
            {p.afterApproval} Next action for you: <span className="font-mono text-foreground">WAIT</span>.
          </p>
        </Rise>
        <Rise delay={0.16}>
          <Link
            href={p.backHref}
            className="mt-7 inline-flex min-h-11 items-center rounded-lg border border-border-strong px-5 text-foreground no-underline"
          >
            Back to case
          </Link>
        </Rise>
      </section>
    )

  return (
    <div>
      <Rise className="mb-6">
        <div className="mb-2 font-mono text-[11px] tracking-[0.16em] text-primary uppercase">{p.eyebrow}</div>
        <h1 className="m-0 font-serif text-[clamp(26px,3.4vw,40px)] leading-[1.1] font-semibold tracking-[-0.025em]">
          {p.title}
        </h1>
        <p className="mt-2.5 max-w-[640px] text-base text-muted-foreground">{p.summary}</p>
      </Rise>

      <Rise delay={0.08} className="flex flex-wrap rounded-lg border border-border-strong bg-surface">
        <div className="flex-[1_1_340px] border-b border-border p-[clamp(20px,3vw,32px)] md:border-r md:border-b-0">
          <div className={mono}>FIXED FEE</div>
          <div className="mt-1.5 mb-0.5 text-[clamp(44px,6vw,64px)] font-semibold tracking-[-0.04em]">{price}</div>
          <div className="text-muted-foreground">{p.priceNote}</div>
          <ul className="m-0 mt-6 flex list-none flex-col gap-2.5 p-0">
            {p.scope.map((s) => (
              <li key={s} className="flex gap-2.5">
                <span aria-hidden className="text-good">
                  ✓
                </span>
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-[1_1_300px] flex-col gap-5 p-[clamp(20px,3vw,32px)]">
          <div>
            <div className={cn(mono, 'mb-3')}>TIMELINE</div>
            <ol className="m-0 flex list-none flex-col gap-3.5 border-l border-border-strong p-0">
              {p.timeline.map((t) => (
                <li key={t.when} className="relative pl-4">
                  <span
                    aria-hidden
                    className={cn(
                      'absolute top-1.5 -left-[5px] size-[9px] rounded-full',
                      t.current ? 'bg-primary' : 'border-2 border-line-dim bg-surface',
                    )}
                  />
                  <strong className="font-semibold">{t.when}</strong>{' '}
                  <span className="text-muted-foreground">· {t.what}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="m-0 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">{GUARANTEE_TEXT}</p>
          <label htmlFor={`${id}-ack`} className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[13px]">
            <Checkbox
              id={`${id}-ack`}
              checked={ack}
              onCheckedChange={(v) => setAck(v === true)}
              className="mt-0.5 size-[18px]"
            />
            <span>I&apos;m authorised to approve spend for {p.orgName}.</span>
          </label>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={!ack || pending}
              onClick={() =>
                startTransition(async () => {
                  await p.onApprove()
                  setApprovedLocal(true)
                })
              }
              className="shine min-h-12 rounded-[6px] px-6 text-[15px] font-semibold text-primary-foreground transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {pending ? 'Approving…' : `Approve ${price}`}
            </button>
            <button
              type="button"
              onClick={() => setAsking((a) => !a)}
              aria-expanded={asking}
              className="min-h-12 rounded-lg border border-border-strong px-5 text-sm text-foreground"
            >
              Ask a question
            </button>
          </div>
          {asking && (
            <form
              className="flex flex-col gap-2.5"
              onSubmit={(e) => {
                e.preventDefault()
                if (!question.trim()) return
                startTransition(async () => {
                  await p.onAsk?.(question.trim())
                  setQuestion('')
                  setAsking(false)
                })
              }}
            >
              <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
                Your question goes to the analyst on this case
                <textarea
                  rows={3}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="rounded-lg border border-border-strong bg-background p-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                />
              </label>
              <button
                type="submit"
                disabled={!question.trim() || pending}
                className="min-h-11 self-start rounded-lg border border-border-strong px-4 text-sm text-foreground disabled:opacity-40"
              >
                Send question
              </button>
            </form>
          )}
        </div>
      </Rise>
    </div>
  )
}
