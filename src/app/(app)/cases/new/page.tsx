import { redirect } from 'next/navigation'
import { Rise } from '@/components/passage/rise'
import { getCurrentUser } from '@/server/session'
import { can } from '@/domain/permissions'
import { NewCaseForm } from './new-case-form'

export default async function NewCasePage() {
  const user = await getCurrentUser()
  if (!user || !can(user.role, 'open_case')) redirect('/cases')
  return (
    <>
      <Rise className="mb-7">
        <div className="mb-2 font-mono text-[11px] tracking-[0.16em] text-dim">NEW SHIPMENT · DRAFT</div>
        <h1 className="m-0 font-serif text-[clamp(26px,3vw,36px)] font-semibold tracking-[-0.02em]">
          What are you shipping, and to whom?
        </h1>
        <p className="mt-2 max-w-[640px] text-muted-foreground">
          Sanctions checks and classification are included. You only see a price if a licence or specialist review is
          needed, and nothing paid starts until you approve it.
        </p>
      </Rise>
      <NewCaseForm />
    </>
  )
}
