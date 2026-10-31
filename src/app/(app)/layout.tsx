import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AppHeader, CLIENT_NAV, type NavItem } from '@/components/passage/app-header'
import { UserMenu } from './user-menu'
import { getCurrentUser, actAsAllowed } from '@/server/session'
import { isClientUser, loadOrg } from '@/server/core'
import { ROLE_LABEL } from '@/components/passage/labels'

const DESK_NAV: NavItem[] = [
  { label: 'Queue', href: '/desk' },
  { label: 'Assigned cases', href: '/cases' },
]

// Everything below reads cookies (session), so it streams inside Suspense (cacheComponents).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
      <Shell>{children}</Shell>
    </Suspense>
  )
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  const client = isClientUser(user)
  const orgName = client && user.org_id ? (await loadOrg(user.org_id)).name : 'Passage desk'
  const canSwitch = await actAsAllowed()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        orgName={orgName}
        nav={client ? CLIENT_NAV.slice(0, 1) : DESK_NAV}
        homeHref={client ? '/cases' : '/desk'}
        userSlot={
          <div className="flex items-center gap-3">
            {canSwitch && (
              <Link
                href="/dev/act-as"
                className="inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 font-mono text-[11px] tracking-[0.1em] text-muted-foreground no-underline hover:text-foreground"
              >
                SWITCH ROLE
              </Link>
            )}
            <span className="hidden font-mono text-[11px] tracking-[0.08em] text-dim sm:inline">
              {user.name} · {ROLE_LABEL[user.role]}
            </span>
            <UserMenu />
          </div>
        }
      />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-[clamp(16px,3vw,32px)] pt-8 pb-16">{children}</main>
    </div>
  )
}
