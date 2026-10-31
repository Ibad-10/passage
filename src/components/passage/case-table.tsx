'use client'

import Link from 'next/link'
import type { CaseState, ClientAction } from '@/domain/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActionChip } from './chips'
import { caseGroup, STATE_LABEL, type CaseGroup } from './labels'

export interface CaseRow {
  id: string
  title: string
  buyer: string
  destination: string
  state: CaseState
  /** Overrides STATE_LABEL[state], e.g. "Filed with ECJU". */
  stateLabel?: string
  action: ClientAction
  deadline: string
  href: string
}

const TABS: [CaseGroup | 'all', string][] = [
  ['all', 'All'],
  ['action', 'Needs your action'],
  ['progress', 'In progress'],
  ['licensed', 'Licensed'],
  ['closed', 'Closed'],
]

const th = 'px-3 py-3 font-mono text-[10px] font-medium tracking-[0.14em] text-dim uppercase'

function Rows({ rows }: { rows: CaseRow[] }) {
  if (rows.length === 0) return <p className="m-0 px-6 py-10 text-center text-dim">No shipments in this view.</p>
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Shipments table">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr>
            <th scope="col" className={`${th} pl-6`}>Case</th>
            <th scope="col" className={th}>Shipment</th>
            <th scope="col" className={th}>Destination</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={th}>Next action</th>
            <th scope="col" className={`${th} pr-6`}>Deadline</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
              <td className="py-4 pr-3 pl-6 font-mono text-xs">
                <Link href={r.href} className="inline-flex min-h-11 items-center text-foreground underline-offset-4">
                  {r.id}
                </Link>
              </td>
              <td className="px-3 py-4">
                <div className="font-medium">{r.title}</div>
                <div className="text-xs text-dim">{r.buyer}</div>
              </td>
              <td className="px-3 py-4 text-muted-foreground">{r.destination}</td>
              <td className="px-3 py-4 text-muted-foreground">{r.stateLabel ?? STATE_LABEL[r.state]}</td>
              <td className="px-3 py-4">
                <ActionChip action={r.action} />
              </td>
              <td className="py-4 pr-6 pl-3 font-mono text-xs text-muted-foreground">{r.deadline}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Case list with filter tabs (CaseList mockup). */
export function CaseTable({ rows }: { rows: CaseRow[] }) {
  const grouped = rows.map((r) => ({ ...r, group: caseGroup(r.state, r.action) }))
  return (
    <Tabs defaultValue="all" className="gap-0 rounded-lg border border-border bg-surface">
      <TabsList
        variant="line"
        aria-label="Filter shipments"
        className="h-auto w-full justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none border-b border-border px-4 py-0"
      >
        {TABS.map(([k, label]) => (
          <TabsTrigger
            key={k}
            value={k}
            className="h-12 flex-none px-3 text-[13px] font-medium text-muted-foreground data-active:text-foreground group-data-horizontal/tabs:after:bottom-0 after:bg-warn"
          >
            {label}{' '}
            <span className="text-dim">{k === 'all' ? rows.length : grouped.filter((r) => r.group === k).length}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map(([k]) => (
        <TabsContent key={k} value={k}>
          <Rows rows={k === 'all' ? grouped : grouped.filter((r) => r.group === k)} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
