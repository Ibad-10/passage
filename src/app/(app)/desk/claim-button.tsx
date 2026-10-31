'use client'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { claimCase } from '@/server/cases'

export function ClaimButton({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await claimCase(caseId)
          if ('error' in r) return void toast.error(r.error)
          router.push(`/desk/${caseId}`)
        })
      }
    >
      {pending ? 'Claiming…' : 'Claim case'}
    </Button>
  )
}
