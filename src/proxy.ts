import { clerkMiddleware } from '@clerk/nextjs/server'

// Everything except /sign-in needs a Clerk session.
// Dev only: an `act_as` cookie (set by the dev user switcher) skips the check.
export default clerkMiddleware(
  async (auth, req) => {
    const path = req.nextUrl.pathname
    if (path === '/sign-in' || path.startsWith('/sign-in/')) return
    if (process.env.NODE_ENV !== 'production' && req.cookies.has('act_as')) return
    await auth.protect()
  },
  { signInUrl: '/sign-in' },
)

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
}
