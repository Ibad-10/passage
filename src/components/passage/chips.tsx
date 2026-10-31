import type { ClientAction } from '@/domain/types'
import { cn } from '@/lib/utils'
import { ACTION_MEANING, isActionable } from './labels'

/** Client action label (build-plan §3). Actionable labels are filled; WAIT/NONE are outlined. */
export function ActionChip({
  action,
  tone = 'warn',
  className,
}: {
  action: ClientAction
  /** Fill colour for actionable labels: amber in lists, primary on the next-action card. */
  tone?: 'warn' | 'primary'
  className?: string
}) {
  const hot = isActionable(action)
  return (
    <span
      title={ACTION_MEANING[action]}
      className={cn(
        'inline-flex items-center px-2 py-1 font-mono text-[10px] leading-none font-semibold tracking-[0.14em] whitespace-nowrap',
        hot
          ? tone === 'primary'
            ? 'bg-primary text-primary-foreground'
            : 'bg-warn text-primary-foreground'
          : 'border border-border-strong text-muted-foreground',
        className,
      )}
    >
      {action}
    </span>
  )
}

export type ScreeningStatus = 'clear' | 'possible' | 'red_flag' | 'match' | 'review'

const STATUS: Record<ScreeningStatus, { glyph: string; label: string; cls: string; text: string }> = {
  clear: { glyph: '✓', label: 'Clear', cls: 'text-good border-good-soft bg-good-bg', text: 'text-good' },
  possible: { glyph: '▲', label: 'Possible match', cls: 'text-warn border-warn-border bg-warn-bg', text: 'text-warn' },
  red_flag: { glyph: '▲', label: 'Red flag', cls: 'text-bad border-bad-border bg-bad-bg', text: 'text-bad' },
  match: { glyph: '✕', label: 'Match', cls: 'text-bad border-bad-border bg-bad-bg', text: 'text-bad' },
  review: { glyph: '◷', label: 'In review', cls: 'text-info border-info-border bg-info-bg', text: 'text-info' },
}

/** Screening status: always a symbol plus a label, never colour alone. */
export function StatusChip({
  status,
  label,
  variant = 'chip',
  className,
}: {
  status: ScreeningStatus
  /** Override the default label, e.g. "Not restricted" for a destination. */
  label?: string
  /** chip: bordered uppercase (tables). text: inline coloured text (side panel). */
  variant?: 'chip' | 'text'
  className?: string
}) {
  const s = STATUS[status]
  const text = label ?? s.label
  if (variant === 'text')
    return (
      <span className={cn('whitespace-nowrap', s.text, className)}>
        <span aria-hidden>{s.glyph}</span> {text}
      </span>
    )
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-2.5 py-[3px] font-mono text-[10px] tracking-[0.12em] whitespace-nowrap uppercase',
        s.cls,
        className,
      )}
    >
      <span aria-hidden>{s.glyph}</span>
      {text}
    </span>
  )
}
