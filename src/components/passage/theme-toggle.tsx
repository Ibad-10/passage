'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// Both icons render; CSS picks one, so server and client markup match (no hydration mismatch).
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle colour theme"
      title="Toggle colour theme"
      className={cn(
        'grid size-11 flex-none place-items-center rounded-lg border border-border-strong bg-surface text-foreground transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
    >
      <Moon className="size-[18px] dark:hidden" strokeWidth={1.8} aria-hidden />
      <Sun className="hidden size-[18px] dark:block" strokeWidth={1.8} aria-hidden />
    </button>
  )
}
