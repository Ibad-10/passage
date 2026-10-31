import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getCurrentUser } from '@/server/session'
import { isClientUser } from '@/server/core'

// Home: send each user to their workspace.
export default function Home() {
  return (
    <Suspense>
      <Go />
    </Suspense>
  )
}

async function Go(): Promise<null> {
  await connection()
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  redirect(isClientUser(user) ? '/cases' : '/desk')
}
