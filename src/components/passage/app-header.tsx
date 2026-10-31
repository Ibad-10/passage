import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PassageLogo } from './logo'
import { ThemeToggle } from './theme-toggle'

export interface NavItem {
  label: string
  href: string
  active?: boolean
}

export const CLIENT_NAV: NavItem[] = [
  { label: 'Shipments', href: '/cases' },
  { label: 'Products', href: '/products' },
  { label: 'Licences', href: '/licences' },
  { label: 'Records', href: '/records' },
]

export function AppHeader({
  orgName,
  nav = CLIENT_NAV,
  homeHref = '/',
  userSlot,
}: {
  orgName: string
  nav?: NavItem[]
  homeHref?: string
  /** Clerk <UserButton/> or the dev user switcher. */
  userSlot?: React.ReactNode
}) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-7 gap-y-0 px-[clamp(16px,3vw,32px)] py-2.5">
        <Link href={homeHref} aria-label="Passage home" className="flex min-h-11 items-center">
          <PassageLogo />
        </Link>
        {/* Phones: logo + controls on row one, nav on row two. */}
        <nav aria-label="Main" className="order-last -mx-2 flex basis-full overflow-x-auto md:order-none md:basis-auto">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center px-2 font-mono text-[11px] tracking-[0.12em] uppercase no-underline',
                item.active
                  ? 'text-foreground [&>span]:border-primary'
                  : 'text-dim hover:text-foreground',
              )}
            >
              <span className="border-b-2 border-transparent pb-1 pt-[6px]">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {/* Hidden on phones so logo and controls share one row. */}
          <span className="hidden truncate font-mono text-[11px] tracking-[0.1em] text-dim uppercase sm:inline">{orgName}</span>
          <ThemeToggle />
          {userSlot}
        </div>
      </div>
    </header>
  )
}
