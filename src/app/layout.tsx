import type { Metadata } from 'next'
import { Big_Shoulders, IBM_Plex_Sans, JetBrains_Mono, Source_Serif_4 } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { clerkAppearance, clerkLocalization } from './clerk-theme'
import { Providers } from './providers'
import './globals.css'

const plex = IBM_Plex_Sans({ variable: '--font-plex', subsets: ['latin'], weight: ['400', '500', '600'] })
const mono = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'], weight: ['400', '500'] })
const serif = Source_Serif_4({ variable: '--font-source-serif', subsets: ['latin'], weight: ['400', '600'] })
const display = Big_Shoulders({ variable: '--font-big-shoulders', subsets: ['latin'], weight: ['800', '900'], adjustFontFallback: false })

export const metadata: Metadata = {
  title: 'Passage',
  description: 'Export licences for defence and dual-use goods.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plex.variable} ${mono.variable} ${serif.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Inside <body>, not around <html>: required with cacheComponents (Clerk core 3). */}
        <ClerkProvider signInUrl="/sign-in" appearance={clerkAppearance} localization={clerkLocalization}>
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  )
}
