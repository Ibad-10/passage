import { clerkMiddleware } from '@clerk/nextjs/server'

// Everything needs a Clerk session except:
// - /sign-in
// - /dev/enter and any request with a `dev_session` cookie, in every environment. The proxy only
//   checks the cookie exists; getCurrentUser verifies its HMAC and redirects to sign-in if invalid.
// - outside production, any request with an `act_as` cookie (dev user switcher).
export default clerkMiddleware(
  async (auth, req) => {
    const path = req.nextUrl.pathname
    if (path === '/sign-in' || path.startsWith('/sign-in/')) return
    if (path === '/dev/enter' || req.cookies.has('dev_session')) return
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
