'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { CaseState, Route } from '@/domain/types'
import type { AiResult } from '@/providers/ai'
import { Button } from '@/components/ui/button'
import { ClassificationList, RouteSelector, SanctionsReviewCard, type MatchStatus } from '@/components/passage/officer'
import { askClient, decideMatch, proposeClearMatch, runAiFirstPass, saveClassification, signRoute } from '@/server/desk'

type Flag = {
  id: string
  result: string
  decision: string | null
  reason: string | null
  proposedBy: string | null
  proposedReason: string | null
  partyRole: string
  party: { name: string; country: string; regNo: string; address: string; source: string }
  entry: { list: string; name: string; country: string; regNo: string; regime: string; score: number }
}

const box = 'rounded-lg border border-border bg-surface'
const h2 = 'm-0 border-b border-border px-6 py-4 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground'
const field = 'rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-foreground'

export function DeskWorkspace(p: {
  caseId: string
  state: CaseState
  viewer: { role: string; canProposeClear: boolean; canDecideMatch: boolean; canClassify: boolean; canSign: boolean; canAskClient: boolean }
  flagged: Flag[]
  ai: AiResult | null
  aiStatus: 'done' | 'failed' | null
  classification: { listEntries: string[]; reasoning: string; signed: boolean } | null
  route: Route | null
  files: string[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string } | object>, ok: string) =>
    start(async () => {
      const r = await fn()
      if ('error' in r) toast.error((r as { error: string }).error)
      else {
        toast.success(ok)
        router.refresh()
      }
    })

  const suggestions = p.ai?.suggestions ?? []
  const [entries, setEntries] = useState(
    p.classification?.listEntries.join(', ') ?? suggestions.filter((s) => s.confidence >= 0.6).map((s) => s.entry.split(' ')[0]).join(', '),
  )
  const [reasoning, setReasoning] = useState(p.classification?.reasoning ?? '')
  const [route, setRoute] = useState<Route | null>(p.route ?? 'C')
  const [note, setNote] = useState('')
  const [question, setQuestion] = useState('')
  const openFlags = p.flagged.filter((f) => !f.decision)

  return (
    <div className="flex flex-col gap-6">
      {/* 1 · Sanctions */}
      {p.flagged.length === 0 ? (
        <section className={`${box} px-6 py-5`}>
          <h2 className="m-0 mb-1 font-mono text-[11px] tracking-[0.14em] text-muted-foreground">1 · SANCTIONS</h2>
          <p className="m-0">All parties and the destination screened clear.</p>
        </section>
      ) : (
        p.flagged.map((f) => {
          const status: MatchStatus = f.decision === 'cleared' ? 'cleared' : f.decision === 'confirmed' ? 'confirmed' : 'open'
          return (
            <SanctionsReviewCard
              key={f.id}
              partyRole={f.partyRole}
              party={f.party}
              entry={f.entry}
              analyst={{
                name: f.proposedBy ? 'Analyst' : 'No analyst proposal yet',
                proposal: 'clear',
                note: f.proposedReason ?? (p.viewer.canDecideMatch ? 'Waiting for the analyst, or decide directly.' : 'Propose a decision with a reason.'),
              }}
              status={status}
              onClear={(reason) =>
                p.viewer.canDecideMatch
                  ? run(() => decideMatch(f.id, 'cleared', reason), 'Match cleared')
                  : p.viewer.canProposeClear
                    ? run(() => proposeClearMatch(f.id, reason), 'Proposed clear: sent to officer')
                    : toast.error('Your role cannot act on sanctions matches')
              }
              onConfirm={(reason) =>
                p.viewer.canDecideMatch
                  ? run(() => decideMatch(f.id, 'confirmed', reason), 'Match confirmed: case closed as D')
                  : toast.error('Only a compliance officer can confirm a match')
              }
            />
          )
        })
      )}

      {/* 2 · Classification */}
      <section className={box}>
        <h2 className={h2}>2 · CLASSIFICATION · AI FIRST PASS + ANALYST</h2>
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <span className="text-sm text-muted-foreground">
            Files: {p.files.length ? p.files.join(', ') : 'none visible'} ·{' '}
            {p.aiStatus === 'failed' ? <span className="text-bad">AI unavailable: classify manually</span> : p.ai ? 'AI suggestions ready' : 'AI not run yet'}
          </span>
          {p.state === 'Classifying' && p.viewer.canClassify && (
            <Button variant="outline" disabled={pending} onClick={() => run(() => runAiFirstPass(p.caseId), 'AI first pass complete')}>
              {pending ? 'Working… (up to 30s)' : p.ai ? 'Re-run AI first pass' : 'Run AI first pass'}
            </Button>
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="px-6 pb-4">
            <ClassificationList
              items={suggestions.map((s) => ({ entry: s.entry, list: s.list, source: s.source, confidence: s.confidence, tag: s.confidence >= 0.8 ? 'Strong' : s.confidence >= 0.6 ? 'Check' : 'Weak' }))}
              footer={p.ai?.usContentShare != null ? <>US content: <strong className="text-foreground">{Math.round(p.ai.usContentShare * 100)}%</strong>. AI suggests; people decide.</> : 'AI suggests; people decide.'}
            />
          </div>
        )}
        {p.viewer.canClassify && (p.state === 'Classifying' || p.state === 'OfficerReview') && (
          <form
            className="flex flex-col gap-3 border-t border-border px-6 py-5"
            onSubmit={(e) => {
              e.preventDefault()
              const list = entries.split(',').map((s) => s.trim()).filter(Boolean)
              const top = suggestions.length ? Math.max(...suggestions.map((s) => s.confidence)) : null
              run(() => saveClassification(p.caseId, { listEntries: list, reasoning, rulebookRefs: [], confidence: top }), 'Classification saved: sent to officer')
            }}
          >
            <label htmlFor="class-entries" className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Control-list entries (comma separated)
              <input id="class-entries" name="list_entries" value={entries} onChange={(e) => setEntries(e.target.value)} className={field} placeholder="e.g. ML10.c, 6A003.b.4" />
            </label>
            <label htmlFor="class-reasoning" className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Reasoning (goes into the signed case pack)
              <textarea id="class-reasoning" name="reasoning" rows={3} required value={reasoning} onChange={(e) => setReasoning(e.target.value)} className={field} />
            </label>
            <Button type="submit" disabled={pending || !reasoning.trim()} className="self-start">
              Save classification
            </Button>
          </form>
        )}
        {p.viewer.canAskClient && !['ClosedNotControlled', 'ClosedDoNotProceed', 'Closed'].includes(p.state) && (
          <form
            className="flex flex-wrap items-end gap-3 border-t border-border px-6 py-5"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => askClient(p.caseId, question, 'ANSWER'), 'Question sent to client')
              setQuestion('')
            }}
          >
            <label htmlFor="ask-client" className="flex flex-[1_1_280px] flex-col gap-1.5 text-xs text-muted-foreground">
              Ask the client a question
              <input id="ask-client" name="question" value={question} onChange={(e) => setQuestion(e.target.value)} className={field} placeholder="e.g. Confirm the consignee's registration number" />
            </label>
            <Button type="submit" variant="outline" disabled={pending || !question.trim()}>
              Send question
            </Button>
          </form>
        )}
      </section>

      {/* 3 · Route */}
      <RouteSelector
        value={route}
        onChange={setRoute}
        disabled={!p.viewer.canSign || p.state !== 'OfficerReview'}
        hint={
          p.route
            ? `Signed route ${p.route}.`
            : openFlags.length
              ? 'Resolve the sanctions match first.'
              : p.state !== 'OfficerReview'
                ? 'Unlocks when the analyst has saved a classification.'
                : p.viewer.canSign
                  ? 'Your signature and reasoning go into the case pack and audit log.'
                  : 'Only a compliance officer can sign.'
        }
      >
        {p.viewer.canSign && p.state === 'OfficerReview' && route && (
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor="route-note" className="flex flex-[1_1_280px] flex-col gap-1.5 text-xs text-muted-foreground">
              Officer note
              <input id="route-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} className={field} placeholder="Basis for the decision" />
            </label>
            <Button disabled={pending || !note.trim()} onClick={() => run(() => signRoute(p.caseId, route, note), `Signed route ${route}`)}>
              Sign classification and route {route}
            </Button>
          </div>
        )}
      </RouteSelector>
    </div>
  )
}
