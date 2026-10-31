'use client'
import { UserButton, useAuth } from '@clerk/nextjs'

// Clerk user menu when signed in with Clerk; nothing for dev-token / act-as sessions.
export function UserMenu() {
  const { isSignedIn } = useAuth()
  return isSignedIn ? <UserButton /> : null
}
