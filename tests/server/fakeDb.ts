// Tiny in-memory stand-in for the subset of supabase-js the server layer uses. Unit tests only;
// the real query behaviour is covered by tests/integration/core-loop.test.ts.
import { randomUUID } from 'node:crypto'

type Row = Record<string, unknown>
type Filter = (r: Row) => boolean

const DEFAULTS: Record<string, (now: string) => Row> = {
  cases: (now) => ({ created_at: now, party_ids: [], sanctions_status: 'pending', route: null, ai_status: null, ai_result: null, pending_client_kind: null }),
  screening_results: (now) => ({ screened_at: now, reviewed_by: null, decision: null, reason: null, proposed_by: null, proposed_reason: null, hits: [], reasons: [] }),
  audit_events: (now) => ({ timestamp: now }),
  questions: () => ({ status: 'open', answer: null }),
  quotes: () => ({ status: 'shown', approved_by: null, approved_at: null }),
  classifications: () => ({ signed_by: null, signed_at: null }),
  case_files: (now) => ({ uploaded_at: now }),
}

class Query {
  private filters: Filter[] = []
  private op: 'select' | 'insert' | 'update' = 'select'
  private payload: Row | Row[] = {}
  private returning = false
  private one: 'single' | 'maybe' | null = null
  private sort: [string, boolean] | null = null
  private max: number | null = null

  constructor(private db: FakeDb, private table: string) {}

  select() {
    if (this.op !== 'select') this.returning = true
    return this
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert'
    this.payload = rows
    return this
  }
  update(patch: Row) {
    this.op = 'update'
    this.payload = patch
    return this
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v)
    return this
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => r[c] !== v)
    return this
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]))
    return this
  }
  is(c: string, v: null) {
    this.filters.push((r) => (r[c] ?? null) === v)
    return this
  }
  order(c: string, o: { ascending?: boolean } = {}) {
    this.sort = [c, o.ascending !== false]
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }
  single() {
    this.one = 'single'
    return this
  }
  maybeSingle() {
    this.one = 'maybe'
    return this
  }

  private run(): { data: unknown; error: { message: string; code?: string } | null } {
    const table = (this.db.tables[this.table] ??= [])
    const match = (r: Row) => this.filters.every((f) => f(r))
    let out: Row[]
    if (this.op === 'insert') {
      const now = new Date().toISOString()
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({
        id: randomUUID(),
        ...(DEFAULTS[this.table]?.(now) ?? {}),
        ...structuredClone(r),
      }))
      const err = this.db.failInsert?.(this.table, rows)
      if (err) return { data: null, error: err }
      table.push(...rows)
      out = rows
      if (!this.returning) return { data: null, error: null }
    } else if (this.op === 'update') {
      out = table.filter(match)
      out.forEach((r) => Object.assign(r, structuredClone(this.payload)))
      if (!this.returning) return { data: null, error: null }
    } else {
      out = table.filter(match)
    }
    if (this.sort) {
      const [c, asc] = this.sort
      out = [...out].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (asc ? 1 : -1))
    }
    if (this.max != null) out = out.slice(0, this.max)
    const data = structuredClone(out)
    if (this.one === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: `expected 1 row, got ${data.length}` } }
    if (this.one === 'maybe') return { data: data[0] ?? null, error: null }
    return { data, error: null }
  }

  then<A, B>(ok?: (v: { data: unknown; error: { message: string; code?: string } | null }) => A, bad?: (e: unknown) => B) {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, bad)
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {}
  files = new Map<string, Buffer>()
  rpcs: Record<string, (args: Row, db: FakeDb) => { message: string } | null> = {}
  failInsert?: (table: string, rows: Row[]) => { message: string; code?: string } | null

  constructor(seed: Record<string, object[]> = {}) {
    this.tables = structuredClone(seed) as Record<string, Row[]>
  }
  from(table: string) {
    return new Query(this, table)
  }
  async rpc(name: string, args: Row) {
    const error = this.rpcs[name]?.(args, this) ?? null
    return { data: null, error }
  }
  storage = {
    from: () => ({
      upload: async (path: string, body: Buffer) => {
        if (this.files.has(path)) return { data: null, error: { message: 'exists' } }
        this.files.set(path, body)
        return { data: { path }, error: null }
      },
      download: async (path: string) => {
        const b = this.files.get(path)
        return b ? { data: new Blob([new Uint8Array(b)]), error: null } : { data: null, error: { message: 'not found' } }
      },
    }),
  }
  rows(table: string) {
    return this.tables[table] ?? []
  }
}
