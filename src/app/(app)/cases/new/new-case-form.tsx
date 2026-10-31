'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { NewShipmentWizard, WIZARD_FIELDS, type WizardFileType } from '@/components/passage/new-shipment-wizard'
import { createCase } from '@/server/cases'

const TYPES: WizardFileType[] = ['spec', 'bom', 'order']

// The wizard names files per type (file_spec, sensitivity_spec…). The server also accepts the
// generic repeated contract (file / file_type / file_sensitivity), so send that too.
function toIntake(fd: FormData): FormData {
  const out = new FormData()
  for (const [k, v] of fd.entries()) {
    if (TYPES.some((t) => k === WIZARD_FIELDS.file(t) || k === WIZARD_FIELDS.sensitivity(t))) continue
    out.append(k, v)
  }
  for (const t of TYPES) {
    const f = fd.get(WIZARD_FIELDS.file(t))
    if (f instanceof File && f.name) {
      out.append('file', f)
      out.append('file_type', t)
      out.append('file_sensitivity', String(fd.get(WIZARD_FIELDS.sensitivity(t)) ?? 'unclassified'))
    }
  }
  return out
}

export function NewCaseForm() {
  const router = useRouter()
  const [errors, setErrors] = useState<string[]>([])

  return (
    <>
      {errors.length > 0 && (
        <div role="alert" className="mb-6 rounded-lg border border-bad-border bg-bad-bg px-5 py-4 text-bad">
          <p className="m-0 font-semibold">We couldn&apos;t submit this shipment:</p>
          <ul className="mt-2 mb-0 pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <NewShipmentWizard
        onSubmit={async (fd) => {
          setErrors([])
          const res = await createCase(toIntake(fd))
          if ('errors' in res) {
            setErrors(res.errors)
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return
          }
          if (res.missing.length) toast.warning('Saved, but some items are missing', { description: res.missing.join(' · ') })
          else toast.success('Submitted for screening')
          if (res.warning) toast.warning(res.warning)
          router.push(`/cases/${res.caseId}`)
        }}
      />
    </>
  )
}
