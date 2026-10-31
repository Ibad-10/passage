'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { EASE } from './rise'

export type StepStatus = 'done' | 'active' | 'todo'
export interface TimelineStep {
  label: string
  sub: string
  status: StepStatus
}

/** The 7 case steps from the Main mockup, with a default sub-label each. */
export const CASE_STEPS = [
  { label: 'Intake', sub: 'Complete' },
  { label: 'Sanctions', sub: 'Parties screened' },
  { label: 'Classification', sub: 'AI + analyst' },
  { label: 'Officer sign-off', sub: '≤2 working days' },
  { label: 'Route + quote', sub: 'A · B · C · D' },
  { label: 'Licence', sub: 'ECJU ~4 weeks' },
  { label: 'Ship', sub: 'Customs + records' },
] as const

const STATUS_TEXT: Record<StepStatus, string> = { done: 'done', active: 'in progress', todo: 'not started' }

export function CaseTimeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  return (
    <section
      aria-label="Progress"
      tabIndex={0}
      className={cn('relative overflow-x-auto rounded-lg border border-border bg-surface', className)}
    >
      <ol
        className="m-0 grid min-w-[780px] list-none px-6 py-5"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(110px, 1fr))` }}
      >
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-col gap-2.5" aria-current={s.status === 'active' ? 'step' : undefined}>
            <div className="flex items-center">
              <span
                aria-hidden
                className={cn(
                  'size-3 flex-none rounded-full',
                  s.status === 'done' && 'bg-good',
                  s.status === 'active' && 'pulse-warn bg-warn',
                  s.status === 'todo' && 'border-2 border-line-dim',
                )}
              />
              <span aria-hidden className="relative h-0.5 flex-1 overflow-hidden bg-border">
                {s.status === 'done' && (
                  <motion.span
                    className="absolute inset-0 origin-left bg-good"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.9, ease: EASE, delay: 0.15 + i * 0.12 }}
                  />
                )}
              </span>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[0.14em] text-dim">{String(i + 1).padStart(2, '0')}</div>
              <div className={cn('text-sm font-semibold', s.status === 'todo' ? 'text-dim' : 'text-foreground')}>
                {s.label}
                <span className="sr-only">, {STATUS_TEXT[s.status]}</span>
              </div>
              <div className="text-xs text-dim">{s.sub}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
