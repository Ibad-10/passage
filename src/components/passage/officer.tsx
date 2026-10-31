'use client'

import { useId, useState } from 'react'
import { motion } from 'motion/react'
import type { Route } from '@/domain/types'
import { cn } from '@/lib/utils'
import { EASE } from './rise'

const panel = 'rounded-lg border border-border bg-surface'
const panelHead = 'border-b border-border px-6 py-4'
const h2 = 'm-0 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'
const tag = 'inline-flex items-center border px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase'

/** Horizontal bar that grows from zero. `value` is 0–1. */
function Bar({ value, className }: { value: number; className: string }) {
  return (
    <span aria-hidden className="inline-block h-1.5 w-[120px] flex-none bg-border align-middle">
      <motion.span
        className={cn('block h-full origin-left', className)}
        style={{ width: `${Math.round(value * 100)}%` }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
      />
    </span>
  )
}

function Facts({ items }: { items: [string, React.ReactNode, boolean?][] }) {
  return (
    <dl className="m-0 mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
      {items.map(([k, v, mono]) => (
        <div key={k} className="contents">
          <dt className="text-dim">{k}</dt>
          <dd className={cn('m-0', mono && 'font-mono')}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export type MatchStatus = 'open' | 'cleared' | 'confirmed'

export interface SanctionsReviewCardProps {
  partyRole: string
  party: { name: string; country: string; regNo: string; address: string; source: string }
  entry: { list: string; name: string; country: string; regNo: string; regime: string; score: number }
  analyst: { name: string; proposal: 'clear' | 'confirm'; note: string }
  status: MatchStatus
  onClear: (reason: string) => void
  onConfirm: (reason: string) => void
}

const MATCH_TAG: Record<MatchStatus, [string, string]> = {
  open: ['▲ Awaiting officer', 'text-warn border-warn-border bg-warn-bg'],
  cleared: ['✓ Cleared by officer', 'text-good border-good-soft bg-good-bg'],
  confirmed: ['✕ Confirmed · case stopped', 'text-bad border-bad-border bg-bad-bg'],
}

/** Officer decision on a possible sanctions match: party vs list entry side by side. */
export function SanctionsReviewCard(p: SanctionsReviewCardProps) {
  const [reason, setReason] = useState('')
  const id = useId()
  const blocked = reason.trim().length < 10 || p.status !== 'open'
  const [tagText, tagCls] = MATCH_TAG[p.status]
  return (
    <section className={panel} aria-labelledby={`${id}-h`}>
      <div className={cn(panelHead, 'flex flex-wrap items-center justify-between gap-2')}>
        <h2 id={`${id}-h`} className={h2}>
          Possible sanctions match · {p.partyRole}
        </h2>
        <span className={cn(tag, tagCls)}>{tagText}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-px bg-border">
        <div className="bg-surface px-6 py-5">
          <div className="mb-2.5 font-mono text-[10px] tracking-[0.14em] text-dim">PARTY ON CASE</div>
          <div className="text-[17px] font-semibold">{p.party.name}</div>
          <Facts
            items={[
              ['Country', p.party.country],
              ['Reg. no.', p.party.regNo, true],
              ['Address', p.party.address],
              ['Source', p.party.source],
            ]}
          />
        </div>
        <div className="bg-surface px-6 py-5">
          <div className="mb-2.5 font-mono text-[10px] tracking-[0.14em] text-dim uppercase">List entry · {p.entry.list}</div>
          <div className="text-[17px] font-semibold">{p.entry.name}</div>
          <Facts
            items={[
              ['Country', p.entry.country],
              ['Reg. no.', p.entry.regNo, true],
              ['Regime', p.entry.regime],
              [
                'Name score',
                <span key="s" className="inline-flex items-center gap-2">
                  <Bar value={p.entry.score} className="bg-primary" />
                  {p.entry.score.toFixed(2)}
                </span>,
              ],
            ]}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-border px-6 py-4">
        <div className="text-[13px] text-muted-foreground">
          Analyst {p.analyst.name} proposes:{' '}
          <strong className="text-foreground">{p.analyst.proposal === 'clear' ? 'clear' : 'confirm match'}</strong>. “
          {p.analyst.note}”
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
          Officer reason (required, shown in the case pack)
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={p.status !== 'open'}
            aria-describedby={`${id}-hint`}
            className="rounded-lg border border-border-strong bg-background p-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          />
          <span id={`${id}-hint`} className="text-xs text-dim">
            At least 10 characters.
          </span>
        </label>
        {/* Risky action kept apart from the safe one (DESIGN.md: proximity). */}
        <div className="flex flex-wrap justify-between gap-6">
          <button
            type="button"
            disabled={blocked}
            onClick={() => p.onClear(reason.trim())}
            className="min-h-11 rounded-[6px] bg-good px-[18px] font-semibold text-good-ink transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            Clear: not the listed party
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => p.onConfirm(reason.trim())}
            className="min-h-11 rounded-lg border border-bad-border px-[18px] font-semibold text-bad transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            Confirm match → Do not proceed
          </button>
        </div>
      </div>
    </section>
  )
}

export interface ClassificationSuggestion {
  entry: string
  list: string
  source: string
  /** 0–1 */
  confidence: number
  tag: string
}

/** AI first pass + analyst classification, with confidence bars. */
export function ClassificationList({
  items,
  footer,
  disabled,
}: {
  items: ClassificationSuggestion[]
  footer?: React.ReactNode
  /** Dimmed until the sanctions match is resolved. */
  disabled?: boolean
}) {
  return (
    <section className={cn(panel, 'transition-opacity', disabled && 'opacity-45')}>
      <div className={panelHead}>
        <h2 className={h2}>Classification · AI first pass + analyst</h2>
      </div>
      <ul className="m-0 list-none p-0">
        {items.map((g) => (
          <li
            key={g.entry}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border px-6 py-3.5 first:border-t-0"
          >
            <div className="min-w-0 flex-[1_1_280px]">
              <div>
                <span className="font-mono font-medium">{g.entry}</span> <span className="text-dim">· {g.list}</span>
              </div>
              <div className="text-xs text-dim">{g.source}</div>
            </div>
            <div className="flex items-center gap-2.5 font-mono text-xs">
              <Bar value={g.confidence} className={g.confidence >= 0.8 ? 'bg-good' : 'bg-warn'} />
              <span>
                <span className="sr-only">Confidence </span>
                {g.confidence.toFixed(2)}
              </span>
            </div>
            <span className={cn(tag, 'border-border-strong text-muted-foreground')}>{g.tag}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="border-t border-border px-6 py-4 text-[13px] text-muted-foreground">{footer}</div>}
    </section>
  )
}

export const ROUTES: { k: Route; title: string; sub: string }[] = [
  { k: 'A', title: 'Not controlled', sub: 'Signed opinion · no fee' },
  { k: 'B', title: 'General licence', sub: 'OGEL if conditions met' },
  { k: 'C', title: 'Individual licence', sub: 'SIEL · ~4 weeks ECJU' },
  { k: 'D', title: 'Do not proceed', sub: 'Reasons · no fee' },
]

/** Route A/B/C/D choice. Native radios, so it is keyboard-operable and submits as `name`. */
export function RouteSelector({
  value,
  onChange,
  disabled,
  name = 'route',
  hint,
  children,
}: {
  value: Route | null
  onChange: (r: Route) => void
  disabled?: boolean
  name?: string
  /** Shown under the cards, e.g. "Resolve the sanctions match first." */
  hint?: string
  /** Action area, e.g. the sign button. */
  children?: React.ReactNode
}) {
  const id = useId()
  return (
    <section className={cn(panel, 'transition-opacity', disabled && 'opacity-45')}>
      <div className={panelHead}>
        <h2 id={`${id}-h`} className={h2}>
          Route decision
        </h2>
      </div>
      <fieldset
        disabled={disabled}
        aria-labelledby={`${id}-h`}
        className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 border-0 px-6 py-5"
      >
        {ROUTES.map((r) => (
          <label
            key={r.k}
            className={cn(
              'flex min-h-24 cursor-pointer flex-col gap-1 border p-4 text-foreground transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:disabled]:cursor-not-allowed',
              value === r.k ? 'border-warn bg-sel' : 'border-border-strong bg-surface-inset',
            )}
          >
            <input
              type="radio"
              name={name}
              value={r.k}
              checked={value === r.k}
              onChange={() => onChange(r.k)}
              className="sr-only"
            />
            <span className="font-mono text-[22px] font-semibold">{r.k}</span>
            <span className="font-semibold">{r.title}</span>
            <span className="text-xs text-muted-foreground">{r.sub}</span>
          </label>
        ))}
      </fieldset>
      {(children || hint) && (
        <div className="flex flex-wrap items-center gap-3 px-6 pb-5">
          {children}
          {hint && <span className="text-xs text-dim">{hint}</span>}
        </div>
      )}
    </section>
  )
}
