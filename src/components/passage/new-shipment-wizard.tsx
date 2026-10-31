'use client'

import { useRef, useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { PartyType, Sensitivity } from '@/domain/types'
import { cn } from '@/lib/utils'
import { EASE } from './rise'

/**
 * FormData field names the wizard submits. Party fields repeat once per party, in order
 * (use formData.getAll). Files are `file_<type>` with `sensitivity_<type>` alongside.
 */
export const WIZARD_FIELDS = {
  productName: 'product_name',
  quantity: 'quantity',
  goodsKind: 'goods_kind',
  file: (type: WizardFileType) => `file_${type}`,
  sensitivity: (type: WizardFileType) => `sensitivity_${type}`,
  partyType: 'party_type',
  partyName: 'party_name',
  partyCountry: 'party_country',
  partyRegNo: 'party_reg_no',
  destination: 'destination',
  deadline: 'deadline',
  endUse: 'end_use',
} as const

export type WizardFileType = 'spec' | 'bom' | 'order'
/** 'secret' is offered only so it can be refused; it never reaches the server. */
type FileSensitivity = Sensitivity | 'secret'

const FILES: { type: WizardFileType; label: string; required: boolean }[] = [
  { type: 'spec', label: 'Spec sheet', required: true },
  { type: 'bom', label: 'Bill of materials', required: false },
  { type: 'order', label: 'Order or quote', required: true },
]
const SENSITIVITY_OPTIONS: [FileSensitivity, string][] = [
  ['unclassified', 'Unclassified'],
  ['official_sensitive', 'Official-Sensitive'],
  ['controlled_technology', 'Controlled tech'],
  ['secret', 'SECRET'],
]
const STEP_LABELS = ['The goods', 'The parties', 'Destination + use', 'Review']
const INTERMEDIARY_TYPES: [PartyType, string][] = [
  ['forwarder', 'Forwarder'],
  ['agent', 'Agent'],
  ['bank', 'Bank'],
  ['intermediary', 'Other intermediary'],
]
const DEFAULT_DESTINATIONS = [
  { code: 'UA', name: 'Ukraine' },
  { code: 'PL', name: 'Poland' },
  { code: 'NO', name: 'Norway' },
  { code: 'EE', name: 'Estonia' },
  { code: 'RU', name: 'Russia' },
]
const END_USE_MAX = 600

interface PartyDraft {
  key: number
  type: PartyType
  name: string
  country: string
}

const field =
  'w-full rounded-lg border border-border-strong bg-background px-3 text-sm text-foreground min-h-[46px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring'
const labelCls = 'flex flex-col gap-1.5 text-[13px] text-muted-foreground'

export function NewShipmentWizard({
  onSubmit,
  destinations = DEFAULT_DESTINATIONS,
  prohibited = ['RU'],
}: {
  onSubmit: (formData: FormData) => void | Promise<void>
  destinations?: { code: string; name: string }[]
  /** Destination codes that close the case as D. Do not proceed. */
  prohibited?: string[]
}) {
  const [step, setStep] = useState(1)
  const [product, setProduct] = useState('')
  const [files, setFiles] = useState<Record<WizardFileType, string | null>>({ spec: null, bom: null, order: null })
  const [sens, setSens] = useState<Record<WizardFileType, FileSensitivity>>({
    spec: 'unclassified',
    bom: 'unclassified',
    order: 'unclassified',
  })
  const [parties, setParties] = useState<PartyDraft[]>([
    { key: 0, type: 'buyer', name: '', country: '' },
    { key: 1, type: 'end_user', name: '', country: '' },
    { key: 2, type: 'consignee', name: '', country: '' },
  ])
  const [dest, setDest] = useState('')
  const [endUse, setEndUse] = useState('')
  const [pending, startTransition] = useTransition()
  const fileRefs = useRef<Partial<Record<WizardFileType, HTMLInputElement | null>>>({})

  const anySecret = Object.values(sens).includes('secret')
  const partyOk = (t: PartyType) => parties.some((p) => p.type === t && p.name.trim() && p.country.trim())
  const checks: [string, boolean][] = [
    ['Product name', !!product.trim()],
    ['Spec sheet', !!files.spec],
    ['Order or quote', !!files.order],
    ['No SECRET files', !anySecret],
    ['Buyer', partyOk('buyer')],
    ['End user', partyOk('end_user')],
    ['Consignee', partyOk('consignee')],
    ['Destination', !!dest],
    ['End use described', endUse.trim().length > 0],
  ]
  const done = checks.filter((c) => c[1]).length
  const isProhibited = prohibited.includes(dest)
  const complete = done === checks.length && !isProhibited

  const setParty = (key: number, patch: Partial<PartyDraft>) =>
    setParties((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)))

  function removeFile(t: WizardFileType) {
    const input = fileRefs.current[t]
    if (input) input.value = ''
    setFiles((f) => ({ ...f, [t]: null }))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!complete || pending) return
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      await onSubmit(data)
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="New shipment">
      <ol aria-label="Steps" className="m-0 mb-7 grid list-none grid-cols-4 gap-2 p-0">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(n)}
                aria-current={step === n ? 'step' : undefined}
                className={cn(
                  'flex h-full min-h-14 w-full flex-col gap-0.5 border border-t-[3px] px-2.5 py-3 text-left sm:px-3.5 text-foreground transition-colors',
                  step === n ? 'border-warn bg-sel' : 'border-border bg-surface',
                  step > n && 'border-t-good',
                )}
              >
                <span className="font-mono text-[10px] tracking-[0.14em] text-dim">0{n}</span>
                <span className="text-[13px] leading-tight font-semibold">{label}</span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[999_1_560px] rounded-lg border border-border bg-surface p-[clamp(18px,3vw,32px)]">
          {/* All steps stay mounted so every field reaches FormData; inactive ones are hidden. */}
          <Step active={step === 1} title="1 · The goods">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <label className={labelCls}>
                Product name
                <input
                  id="wiz-product-name"
                  name={WIZARD_FIELDS.productName}
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="e.g. Kestrel-4 ISR drone"
                  autoComplete="off"
                  className={field}
                />
              </label>
              <label className={labelCls}>
                Quantity
                <input id="wiz-quantity" name={WIZARD_FIELDS.quantity} type="number" min={1} defaultValue={1} className={field} />
              </label>
              <label className={labelCls}>
                What&apos;s moving
                <select id="wiz-goods-kind" name={WIZARD_FIELDS.goodsKind} className={field} defaultValue="goods">
                  <option value="goods">Physical goods</option>
                  <option value="software">Software or firmware</option>
                  <option value="technology">Design files or technical data</option>
                  <option value="goods_software">Goods + software</option>
                </select>
              </label>
            </div>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-[13px] text-muted-foreground">
                Files · tag each one&apos;s sensitivity. SECRET material is not accepted.
              </legend>
              <div className="flex flex-col gap-2.5">
                {FILES.map(({ type, label, required }) => {
                  const name = files[type]
                  const secret = sens[type] === 'secret'
                  const id = `wiz-file-${type}`
                  return (
                    <div
                      key={type}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-3 border px-4 py-3.5 transition-colors',
                        name ? 'border-good-border' : 'border-dashed border-border-strong',
                        secret ? 'bg-bad-bg' : 'bg-surface-inset',
                      )}
                    >
                      <div className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
                        <span
                          aria-hidden
                          className={cn(
                            'grid size-8 flex-none place-items-center font-bold',
                            name ? 'bg-good-soft text-good' : 'border border-dashed border-line-dim text-dim',
                          )}
                        >
                          {name ? '✓' : '↑'}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium">
                            {label} <span className="font-normal text-dim">· {required ? 'required' : 'recommended'}</span>
                          </div>
                          <div className="truncate text-xs text-dim">{name ?? 'Drop a file or attach'}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          Sensitivity
                          <select
                            id={`wiz-sensitivity-${type}`}
                            name={WIZARD_FIELDS.sensitivity(type)}
                            value={sens[type]}
                            onChange={(e) => setSens((s) => ({ ...s, [type]: e.target.value as FileSensitivity }))}
                            aria-label={`${label} sensitivity`}
                            className="min-h-11 rounded-lg border border-border-strong bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            {SENSITIVITY_OPTIONS.map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </label>
                        <input
                          ref={(el) => {
                            fileRefs.current[type] = el
                          }}
                          id={id}
                          type="file"
                          name={WIZARD_FIELDS.file(type)}
                          className="peer sr-only"
                          onChange={(e) => setFiles((f) => ({ ...f, [type]: e.target.files?.[0]?.name ?? null }))}
                        />
                        {name ? (
                          <button
                            type="button"
                            onClick={() => removeFile(type)}
                            aria-label={`Remove ${label.toLowerCase()}`}
                            className="min-h-11 rounded-lg border border-border-strong bg-surface-3 px-3.5 text-[13px] text-foreground"
                          >
                            Remove
                          </button>
                        ) : (
                          <label
                            htmlFor={id}
                            className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border-strong bg-surface-3 px-3.5 text-[13px] text-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"
                          >
                            Attach<span className="sr-only"> {label.toLowerCase()}</span>
                          </label>
                        )}
                      </div>
                      {secret && (
                        <p role="alert" className="m-0 basis-full text-xs text-bad">
                          SECRET uploads are blocked. Contact your officer for an alternative route.
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </fieldset>
          </Step>

          <Step active={step === 2} title="2 · The parties">
            <p className="m-0 text-muted-foreground">
              Every party is screened against UK, EU, UN and US lists before any classification work starts.
            </p>
            {parties.map((p, i) => {
              const fixed = i < 3
              return (
                <fieldset
                  key={p.key}
                  className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 rounded-lg border border-border p-4"
                >
                  <legend className="px-1.5 font-mono text-[10px] tracking-[0.14em] text-primary uppercase">
                    {fixed ? p.type.replace('_', ' ') : 'Intermediary'}
                  </legend>
                  {fixed ? (
                    <input type="hidden" name={WIZARD_FIELDS.partyType} value={p.type} />
                  ) : (
                    <label className={labelCls}>
                      Role
                      <select
                        id={`wiz-party-${i}-type`}
                        name={WIZARD_FIELDS.partyType}
                        value={p.type}
                        onChange={(e) => setParty(p.key, { type: e.target.value as PartyType })}
                        className={field}
                      >
                        {INTERMEDIARY_TYPES.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className={labelCls}>
                    Legal name
                    <input
                      id={`wiz-party-${i}-name`}
                      name={WIZARD_FIELDS.partyName}
                      value={p.name}
                      onChange={(e) => setParty(p.key, { name: e.target.value })}
                      autoComplete="organization"
                      className={field}
                    />
                  </label>
                  <label className={labelCls}>
                    Country
                    <input
                      id={`wiz-party-${i}-country`}
                      name={WIZARD_FIELDS.partyCountry}
                      value={p.country}
                      onChange={(e) => setParty(p.key, { country: e.target.value })}
                      autoComplete="country-name"
                      className={field}
                    />
                  </label>
                  <label className={labelCls}>
                    Registration no. (optional)
                    <input
                      id={`wiz-party-${i}-reg-no`}
                      name={WIZARD_FIELDS.partyRegNo}
                      autoComplete="off"
                      className={cn(field, 'font-mono')}
                    />
                  </label>
                  {!fixed && (
                    <button
                      type="button"
                      onClick={() => setParties((ps) => ps.filter((q) => q.key !== p.key))}
                      className="min-h-11 self-end justify-self-start rounded-lg border border-border-strong px-3.5 text-[13px] text-muted-foreground"
                    >
                      Remove intermediary
                    </button>
                  )}
                </fieldset>
              )
            })}
            <button
              type="button"
              onClick={() =>
                setParties((ps) => [...ps, { key: Math.max(...ps.map((q) => q.key)) + 1, type: 'forwarder', name: '', country: '' }])
              }
              className="min-h-11 self-start rounded-lg border border-dashed border-warn-border px-4 text-[13px] text-primary"
            >
              + Add intermediary (forwarder, agent, bank)
            </button>
          </Step>

          <Step active={step === 3} title="3 · Destination and end use">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <label className={labelCls}>
                Destination country
                <select
                  id="wiz-destination"
                  name={WIZARD_FIELDS.destination}
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  className={field}
                >
                  <option value="">Select…</option>
                  {destinations.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                Needed by
                <input id="wiz-deadline" type="date" name={WIZARD_FIELDS.deadline} className={field} />
              </label>
            </div>
            {isProhibited && (
              <div role="alert" className="rounded-lg border border-bad-border bg-bad-bg px-4 py-3.5 text-bad">
                Prohibited destination. This shipment would close as <strong>D. Do not proceed</strong>, with no fee.
              </div>
            )}
            <label className={labelCls}>
              End use, in 1–3 sentences
              <textarea
                id="wiz-end-use"
                name={WIZARD_FIELDS.endUse}
                rows={4}
                maxLength={END_USE_MAX}
                value={endUse}
                onChange={(e) => setEndUse(e.target.value)}
                placeholder="e.g. Reconnaissance by the buyer's own units. No onward transfer."
                aria-describedby="wiz-end-use-count"
                className={cn(field, 'resize-y py-3')}
              />
              <span id="wiz-end-use-count" className="text-xs text-dim">
                {endUse.length} / {END_USE_MAX}
              </span>
            </label>
          </Step>

          <Step active={step === 4} title="4 · Review and submit">
            <p className="m-0 text-muted-foreground">
              On submit: sanctions screening runs within minutes, then AI first pass and analyst classification. An
              officer signs the outcome within 2 working days.
            </p>
            {complete ? (
              <Button type="submit" size="lg" disabled={pending} className="self-start">
                {pending ? 'Submitting…' : 'Submit for screening'}
              </Button>
            ) : (
              <div className="rounded-lg border border-warn-border bg-warn-bg px-4 py-3.5 text-warn-text">
                {isProhibited
                  ? 'This destination is prohibited, so the shipment cannot be submitted.'
                  : 'Add the missing items on the right to submit.'}
              </div>
            )}
          </Step>

          <div className="mt-7 flex justify-between gap-3 border-t border-border pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              Back
            </Button>
            {step < 4 && (
              <Button
                type="button"
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                Continue
              </Button>
            )}
          </div>
        </section>

        <aside
          aria-label="Completeness"
          className="min-w-0 flex-[1_1_300px] rounded-lg border border-border bg-surface p-5"
        >
          <h2 className="m-0 mb-1.5 font-mono text-[10px] font-medium tracking-[0.16em] text-dim">COMPLETENESS</h2>
          <Progress
            value={Math.round((done / checks.length) * 100)}
            aria-label={`${done} of ${checks.length} items complete`}
            className={cn(
              'my-2.5 mb-4 rounded-none bg-border',
              complete ? '[&>[data-slot=progress-indicator]]:bg-good' : '[&>[data-slot=progress-indicator]]:bg-warn',
            )}
          />
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-live="polite">
            {checks.map(([label, ok]) => (
              <li key={label} className="flex items-center gap-2.5">
                <span aria-hidden className={cn('w-5 text-center font-bold', ok ? 'text-good' : 'text-line-dim')}>
                  {ok ? '✓' : '○'}
                </span>
                <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>
                  {label}
                  <span className="sr-only">{ok ? ': done' : ': missing'}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-dim">
            Files stay in the UK (London). Controlled technical files are only shown to vetted people assigned to this
            case.
          </div>
        </aside>
      </div>
    </form>
  )
}

/** A wizard step: always mounted, slides in when it becomes active (no remount, so file inputs keep their files). */
function Step({ active, title, children }: { active: boolean; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      hidden={!active}
      initial={false}
      animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: 16 }}
      transition={active ? { duration: 0.4, ease: EASE } : { duration: 0 }}
      className="flex flex-col gap-5"
    >
      <h2 className="m-0 text-lg font-semibold">{title}</h2>
      {children}
    </motion.div>
  )
}
