import { cn } from '@/lib/utils'

export function PassageLogo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="text-brand"
        aria-hidden
      >
        <path d="M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6l-9-4z" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </svg>
      <span className="font-mono text-[13px] font-medium tracking-[0.14em] text-foreground">PASSAGE</span>
    </span>
  )
}
