import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SignIn } from '@clerk/nextjs'
import { PassageLogo } from '@/components/passage/logo'
import { Rise } from '@/components/passage/rise'
import { ThemeToggle } from '@/components/passage/theme-toggle'

export const metadata: Metadata = { title: 'Sign in · Passage' }

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen flex-1 flex-wrap bg-background text-foreground">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <section className="grid-bg flex min-h-[420px] min-w-0 flex-[1_1_520px] flex-col justify-between border-b border-border p-[clamp(24px,5vw,64px)] md:border-r md:border-b-0">
        <PassageLogo size={24} className="relative z-10" />
        <div className="relative z-10 max-w-[640px] py-10">
          <Rise delay={0.08} y={12}>
            <h1 className="m-0 font-display text-[clamp(56px,8vw,112px)] leading-[0.9] font-black tracking-[-0.01em] uppercase">
              Ship it legally.
            </h1>
          </Rise>
          <Rise delay={0.16} y={12}>
            <p className="mt-5 max-w-[440px] text-[17px] leading-normal text-muted-foreground">
              Export licences for defence and dual-use goods.
            </p>
          </Rise>
        </div>
        <Rise
          delay={0.24}
          y={12}
          className="relative z-10 flex flex-wrap gap-x-7 gap-y-2 font-mono text-[11px] tracking-[0.12em] text-dim"
        >
          <span>UK-HOSTED · LONDON</span>
          <span>MFA REQUIRED</span>
          <span>EVERY ACTION LOGGED</span>
        </Rise>
      </section>

      <section className="flex min-w-0 flex-[1_1_420px] flex-col items-center justify-center p-[clamp(16px,5vw,64px)]">
        <Rise delay={0.08} y={12} className="flex w-full max-w-[400px] flex-col items-center">
          <Suspense fallback={<div className="h-[420px] w-full" aria-busy="true" />}>
            <SignIn path="/sign-in" />
          </Suspense>
          <p className="mt-7 w-full border-t border-border pt-4 font-mono text-[11px] tracking-[0.12em] text-dim">
            SECURED BY CLERK · MFA ENFORCED
          </p>
        </Rise>
      </section>
    </div>
  )
}
