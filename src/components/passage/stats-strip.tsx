'use client'

import { useEffect, useRef } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { EASE } from './rise'

export interface Stat {
  label: string
  value: number
  decimals?: number
  suffix?: string
  sub: string
  /** Amber number, for the "needs your action" count. */
  emphasis?: boolean
}

/** Number ticker: counts up from 0 once in view; jumps straight to the value under reduced motion. */
function Ticker({ value, decimals = 0, suffix = '' }: Pick<Stat, 'value' | 'decimals' | 'suffix'>) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const fmt = (n: number) => n.toFixed(decimals) + suffix

  useEffect(() => {
    const el = ref.current
    if (!el || !inView) return
    if (reduce) {
      el.textContent = fmt(value)
      return
    }
    const controls = animate(0, value, { duration: 1.1, ease: EASE, onUpdate: (n) => (el.textContent = fmt(n)) })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, value, decimals, suffix])

  // Server/no-JS render shows the real value; the ticker only animates after mount.
  return (
    <>
      <span ref={ref} aria-hidden className="tabular-nums">
        {fmt(value)}
      </span>
      <span className="sr-only">{fmt(value)}</span>
    </>
  )
}

export function StatsStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <section
      aria-label="Summary"
      className={cn(
        'grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-px overflow-hidden rounded-lg border border-border bg-border',
        className,
      )}
    >
      {stats.map((k) => (
        <div key={k.label} className="bg-surface px-[22px] py-5">
          <div className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">{k.label}</div>
          <div
            className={cn(
              'mt-2 mb-0.5 text-4xl font-semibold tracking-[-0.02em]',
              k.emphasis && 'text-warn',
            )}
          >
            <Ticker value={k.value} decimals={k.decimals} suffix={k.suffix} />
          </div>
          <div className="text-xs text-dim">{k.sub}</div>
        </div>
      ))}
    </section>
  )
}
