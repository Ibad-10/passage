# Passage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stage 1 export compliance desk from the spec, core case loop first, then every remaining feature in priority order, with nothing from the spec dropped.

**Architecture:** A Next.js App Router app. All business rules (case state machine, client actions, permission matrix, access rule, pricing, completeness, screening verdicts) live as pure TypeScript in `src/domain/` with Vitest tests and no I/O. Server actions and route handlers call the domain, persist to Supabase Postgres (London region), store files in Supabase Storage, and write an append-only audit log. External services (sanctions screening, AI first pass) sit behind small provider interfaces with a local fixture implementation, so every form works offline and a bot can fill them end to end.

**Tech Stack:** Next.js 15 (App Router, TypeScript, server actions), Tailwind CSS + shadcn/ui, Supabase (Postgres, Storage), Clerk (sign-in, MFA, Organizations, roles), `@anthropic-ai/sdk` (AI first pass), OpenSanctions match API (screening), Zod (form validation), Vitest, Playwright (one end-to-end test per phase), Vercel (`lhr1` region).

**Spec:** `docs/build-plan.md`. Section numbers below (§) refer to it.

## Priority order

| Phase | What works at the end | Spec sections |
|---|---|---|
| **1. Core case loop** (detailed below) | Client opens a case, sanctions screen runs, AI first pass, analyst classifies, officer signs a route (A/B/C/D), client approves a quote. Side panel and audit log live. | §1, §3, §4.3, §4.5, §5 (case-time screening), §6, §7.1–7.5, §8, §10 (core screens) |
| 2. Route C: individual licence | Buyer certificate link, application pack, re-screen before filing, filed, granted or refused, conditions tracked | §4.7, §5.1 (C3, C4), §10 buyer page |
| 3. Route B: general licence and shipments | Condition check, declaration, per-shipment re-screen, shipment log | §4.6, §5.1 (B3), §10 shipment log |
| 4. Onboarding and authorisation | Onboarding wizard 0.1–0.7, agreements, company and owner screening, identity and vetting, roles, data ceiling | §4.2, §5.1 (0.3), §7.4 org and user attributes |
| 5. Emerging technology and rulebook | Triggers, quote, specialist deep-dive, panel decision, uncertainty options, rulebook editor with versions | §4.4, §10 rulebook editor |
| 6. Monitoring | Daily re-screen, list-update hits pause shipments, rule-change alerts, licence expiry and renewal quotes, facts-change re-quote | §4.8, §5.1 (daily), §5.4 |
| 7. Partner, admin, billing, guardrails | Kyiv partner restricted access with location rules, Ops Admin (no case content), plans P/S and invoicing, MFA, virus scan, download watermark, per-org encryption, Cyber Essentials Plus checklist | §2, §7.2 partner and ops, §9 |
| 8. Proposed additions (not in spec, from the idea review; confirm before building) | Post-licence shipment timeline (customs, delivered), lithium battery and dangerous-goods flag, US content and de minimis calculator, bilingual UK/UA end-user templates | none |

Phases 2–8 each get their own detailed plan, written when the previous phase is merged, using the interfaces Phase 1 produces. Phase 1 seeds an already authorised organisation so the case loop works before Phase 4 exists.

## Phase 0: Design first (before any code)

Requested by the user: mock up the UI before building.

- Gather visual references from defence-tech sites (Anduril, Helsing, Shield AI, Palantir) and compliance software (Vanta), using Chrome.
- Build a Claude Design mockup of the core screens: case list, new case, case detail with side panel, desk queue, sanctions review, officer sign, quote card.
- Look and feel: serious and professional. Not playful, not loud. Light-by-default palette with a dark theme, one action colour, status colours only for meaning. Subtle purposeful motion (panel reveals, status transitions, timeline progress). Fully responsive down to 360 px.
- Output: an approved mockup plus `docs/design/DESIGN.md` (tokens, components, motion rules). Tasks 6–9 build from it using shadcn/ui components, with Framer Motion (`motion`) for animation, respecting `prefers-reduced-motion`.
- Mockup: https://claude.ai/artifact/AmBTfVxv3KfSXrDHuc5mSB (6 screens). App name: **Passage**. Look adopted from Precedent (github.com/esh1306/mubithack): light navy/red workspace by default, Linear-style dark with a coral accent, IBM Plex Sans + JetBrains Mono + Source Serif 4 (+ Big Shoulders for the sign-in hero) via `next/font`, 0.5rem radius. Tokens are in `docs/design/DESIGN.md`.
- Component sources: shadcn/ui is the base for every form, table, dialog and tab. Aceternity UI and Magic UI are used only where they add meaning, not decoration: grid background with a scan sweep on sign-in, number ticker on the shipments stats, shimmer button on Approve, animated beam on the case timeline. Framer Motion handles page and step transitions. All copied into `src/components/ui/`, no runtime dependency on their sites.

## Global Constraints

- Hosting and processing in the UK region only: Supabase project region `eu-west-2` (London), Vercel functions region `lhr1` (§9.1).
- Never send real controlled technical files to an offshore AI service (§9.2). Phase 1 calls the AI only when `AI_PROVIDER=anthropic` is set; the default is `fixture`. Production must use an in-region, no-training, no-retention model before real client files.
- AI suggests; people decide. No classification, sanctions decision or route is ever final without an officer signature (§1 principle 3).
- No paid work starts before the client approves a fixed quote. Once approved, the price never changes (§1 principle 2, §4.8).
- The product never suggests changing a product description to get past a threshold (§1 principle 5).
- Prices are configuration, not code: `config/pricing.json` (§2).
- Guarantee text shown on every quote, verbatim: "We guarantee the service, not the government decision: a complete, correct file signed by a qualified officer, reworked at no cost if rejected because of our error. The client remains the legal exporter." (§2)
- Client action labels exactly `UPLOAD`, `DESCRIBE`, `SELECT`, `ANSWER`, `APPROVE`, `SIGN`, `WAIT`, `NONE`. One active per case (§3).
- Case state names exactly as §6 (including `AwaitingClient`, `AwaitingClient2`, `AwaitingClient3`).
- Uploads tagged SECRET are blocked (§7.1 principle 4, §9.9).
- Every view, download, edit, approval, signature and sanctions decision writes an `AuditEvent`. The table is append-only: no update or delete grants (§7.1 principle 5, §9.6).
- Every screening result stores `lists_checked`, `list_versions` and `screened_at` (§5.4).
- Sanctions runs before classification (§4.3).
- Clerk stores identity data outside the UK by default. Only names, emails and MFA factors go to Clerk, never case data or files. Flag for the security adviser (spec §12.3).
- Git commits are authored as `Ibad Ullah Zuberi <99681549+Ibad-10@users.noreply.github.com>`, with no Claude or Anthropic attribution trailers (user's CLAUDE.md).

## Review Focus

1. **Double submit or stale tab.** The client clicks Approve twice, or approves in a tab that shows an old state. Expect: the second call is rejected as an illegal transition, one quote approval recorded, no double charge. Test in Task 2 and Task 9.
2. **Direct URL to someone else's case.** A user who isn't assigned opens `/cases/<id>` or a file URL. Expect: 404 (no existence leak) and an audit event for the denied attempt. Test in Task 3 and Task 6.
3. **Cyrillic and transliterated party names.** "Укрспецсистеми", "Ukrspecsystems", "UKRSPEC SYSTEMS LTD". Expect: names normalised (case, punctuation, legal suffixes, Ukrainian transliteration) before matching; no crash; near-matches become `possible`, never silently `clear`. Test in Task 5.
4. **AI or screening provider down or returning junk.** Expect: the case stays in `Classifying` (or `SanctionsCheck`) with a visible "manual" task for the analyst; nothing auto-advances and nothing is auto-signed. Test in Task 7.
5. **Bad uploads.** Empty file, a file over 25 MB, a file tagged SECRET, a duplicate (same hash). Expect: clear inline error per file and no partial case submission. Test in Task 4.

---

## Phase 1: Core case loop

### File structure

```
cleared-to-ship/
  config/pricing.json             prices per plan and item (§2)
  config/screening.json           match threshold, prohibited destinations, red-flag countries
  supabase/migrations/0001_init.sql   all §8 tables + enums
  supabase/seed.sql               one authorised org, one user per role, assignments
  src/domain/types.ts             enums and entity types from §7.4 and §8
  src/domain/caseMachine.ts       §6 transitions + clientActionFor
  src/domain/permissions.ts       §7.3 matrix
  src/domain/access.ts            §7.4 canView
  src/domain/pricing.ts           quotes from config
  src/domain/completeness.ts      §4.3 step 1.2
  src/domain/screening.ts         normalise, verdicts, case aggregate (§5.2–5.3)
  src/providers/screening/{index,fixture,opensanctions}.ts
  src/providers/ai/{index,fixture,anthropic}.ts
  src/server/db.ts                Supabase server client
  src/server/audit.ts             logEvent
  src/server/session.ts           current user (Supabase Auth) + dev "act as"
  src/server/cases.ts             server actions that run the domain and persist
  app/(client)/cases/page.tsx               case list
  app/(client)/cases/new/page.tsx           new case form
  app/(client)/cases/[id]/page.tsx          case detail + timeline + side panel
  app/(desk)/desk/page.tsx                  desk queue
  app/(desk)/desk/sanctions/[caseId]/page.tsx   sanctions review
  app/(desk)/desk/ticket/[caseId]/page.tsx      analyst ticket workspace
  app/(desk)/desk/officer/[caseId]/page.tsx     officer review + sign
  app/dev/act-as/page.tsx                   dev-only user switcher (404 in production)
  src/components/SidePanel.tsx, ActionChip.tsx, QuoteCard.tsx, Timeline.tsx
  tests/domain/*.test.ts, tests/e2e/core-loop.spec.ts
```

### Task 1: Project setup and domain types

**Files:**
- Create: the Next.js app (`npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint`), shadcn init, `vitest.config.ts`, `src/domain/types.ts`, `config/pricing.json`, `config/screening.json`, `.env.example`
- Test: `tests/domain/types.test.ts`

**Interfaces:**
- Produces, in `src/domain/types.ts`:
  - `type ClientAction = 'UPLOAD'|'DESCRIBE'|'SELECT'|'ANSWER'|'APPROVE'|'SIGN'|'WAIT'|'NONE'`
  - `type CaseState` = the 21 §6 states as string literals
  - `type Role = 'client_admin'|'client_member'|'client_approver'|'client_viewer'|'buyer'|'analyst'|'officer'|'specialist'|'partner'|'ops_admin'`
  - `type VettingLevel = 'none'|'baseline'|'sc'|'dv'`, `type Sensitivity = 'unclassified'|'official_sensitive'|'controlled_technology'`, `type DataCeiling = 'unclassified'|'official_sensitive'`
  - `type ScreeningVerdict = 'clear'|'possible'|'red_flag'|'match'`, `type Route = 'A'|'B'|'C'|'D'`
  - `type QuoteItem = 'emerging'|'general_setup'|'individual'|'consultation'|'sanctions_licence'|'general_shipment'`
  - Entity interfaces mirroring the §8 field lists exactly (`Organisation`, `User`, `Case`, `Party`, `ScreeningResult`, `CaseFile`, `Classification`, `Quote`, `Question`, `Assignment`, `AuditEvent`, plus `Agreement`, `Product`, `RulebookEntry`, `Licence`, `Shipment` for later phases)
- `config/pricing.json`: the §2 table, both plans, values as `{min,max}` in GBP pence where the spec gives a range, plus `"fairUseClassifications": null` (open question §12.1).

- [ ] **Step 1:** `git init`, set local `user.name`/`user.email` per Global Constraints, scaffold, add Vitest (`npm i -D vitest`), `"test": "vitest run"`.
- [ ] **Step 2: Failing test** `tests/domain/types.test.ts`: `expect(CASE_STATES).toHaveLength(21)` and `expect(CLIENT_ACTIONS).toEqual(['UPLOAD','DESCRIBE','SELECT','ANSWER','APPROVE','SIGN','WAIT','NONE'])`.
- [ ] **Step 3:** Run `npm test`. Expect FAIL (module not found).
- [ ] **Step 4:** Write `types.ts` exporting `CASE_STATES` and `CLIENT_ACTIONS` as `const` arrays, with the types derived from them.
- [ ] **Step 5:** Run `npm test`. Expect PASS. Run `npm run build`. Expect success.
- [ ] **Step 6:** Commit `chore: scaffold app and domain types`.

### Task 2: Case state machine and client actions

**Files:** Create `src/domain/caseMachine.ts`. Test `tests/domain/caseMachine.test.ts`.

**Interfaces:**
- Consumes: `CaseState`, `ClientAction`, `ScreeningVerdict`, `Route` from Task 1.
- Produces:
  - `type CaseEvent` =
    `{type:'submit', complete:boolean}` | `{type:'filesAdded'}` | `{type:'screened', verdict:ScreeningVerdict}` | `{type:'askClient'}` | `{type:'clientAnswered'}` | `{type:'sanctionsCleared'}` | `{type:'sanctionsConfirmed'}` | `{type:'emergingFlag'}` | `{type:'classified'}` | `{type:'approve'}` | `{type:'decline'}` | `{type:'emergingDone'}` | `{type:'officerRoute', route:Route}` | `{type:'needClient', kind:'ANSWER'|'SIGN'}` | `{type:'filed'}` | `{type:'granted'}` | `{type:'refused'}` | `{type:'routeBLive'}` | `{type:'startMonitoring'}` | `{type:'newListHit'}`
  - `transition(state: CaseState, event: CaseEvent): CaseState`. Throws `IllegalTransition` (exported class) for any pair not in §6.
  - `clientActionFor(state: CaseState, pending?: 'ANSWER'|'SIGN'): ClientAction`

Mapping, my call where §6 is silent: `Draft`/`IntakeIncomplete` → `UPLOAD`; `AwaitingClient`/`AwaitingClient2` → `ANSWER`; `AwaitingClient3` → `pending ?? 'ANSWER'`; `EmergingQuote`/`RouteQuote` → `APPROVE`; `Refused` → `SELECT`; `Granted`, `Active`, `Monitoring` and all `Closed*` → `NONE`; everything else → `WAIT`.

Two §6 edges need disambiguation, my call: `screened` with `verdict:'match'` from `SanctionsCheck` goes to `ClosedDoNotProceed` (prohibited destination, §5.3), and `possible`/`red_flag` go to `SanctionsReview`. `askClient` from `Classifying` goes to `AwaitingClient2`, and from `SanctionsReview` to `AwaitingClient`.

- [ ] **Step 1: Failing tests:**
  - Happy path to route C: `Draft` -submit(true)→ `SanctionsCheck` -screened(clear)→ `Classifying` -classified→ `OfficerReview` -officerRoute(C)→ `RouteQuote` -approve→ `RouteInProgress`.
  - `submit(false)` → `IntakeIncomplete`; `filesAdded` → `Draft`.
  - `screened(possible)` → `SanctionsReview` -askClient→ `AwaitingClient` -clientAnswered→ `SanctionsReview` -sanctionsCleared→ `Classifying`.
  - `sanctionsConfirmed` → `ClosedDoNotProceed`. `officerRoute(A)` → `ClosedNotControlled`. `officerRoute(D)` → `ClosedDoNotProceed`.
  - `emergingFlag` → `EmergingQuote`; `decline` → `Closed`; `approve` → `EmergingReview` -emergingDone→ `OfficerReview`.
  - Review Focus 1: `transition('RouteInProgress', {type:'approve'})` throws `IllegalTransition`.
  - Table test: every one of the 21 states returns exactly one `ClientAction`; `clientActionFor('AwaitingClient3','SIGN') === 'SIGN'`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement as a lookup `Record<CaseState, Partial<Record<CaseEvent['type'], CaseState | ((e)=>CaseState)>>>`.
- [ ] **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit `feat(domain): case state machine and client actions`.

### Task 3: Permission matrix and access rule

**Files:** Create `src/domain/permissions.ts`, `src/domain/access.ts`. Test `tests/domain/access.test.ts`.

**Interfaces:**
- Produces:
  - `type Action = 'open_case'|'upload'|'view_technical'|'view_sanctions'|'clear_match'|'propose_clear_match'|'ask_client'|'approve_quote'|'sign_declaration'|'sign_classification'|'manage_users'|'see_audit'`
  - `can(role: Role, action: Action, opts?: {assigned?: boolean; partnerFlag?: boolean}): boolean`: §7.3 exactly. "assigned" cells need `opts.assigned`; Partner `view_technical` needs `opts.partnerFlag`; Partner `upload` (limited) needs `opts.assigned`; Analyst gets `propose_clear_match`, not `clear_match`.
  - `vettingRank(v: VettingLevel): number` (none 0, baseline 1, sc 2, dv 3)
  - `requiredVetting(s: Sensitivity): VettingLevel` (unclassified → none, official_sensitive → baseline, controlled_technology → baseline)
  - `canView(ctx: {user: User; org: Organisation; caseRow: Case; file: CaseFile; assignedUserIds: string[]; officerApprovedUserIds: string[]; exportAuthorisedCountries: string[]}): boolean`: the seven §7.4 conditions in order. For `controlled_technology` the user must also be in `officerApprovedUserIds`. `location_allowed` means user.location is `GB`, or is in `exportAuthorisedCountries`, or the file is not `controlled_technology`.
- Client-side users count as "assigned" to every case in their own org (§7.3 shows ✓ for client roles). Internal and partner users need an `Assignment` row.

- [ ] **Step 1: Failing tests**, one per condition: unauthorised org → false; org blocked → false; viewer can view, ops_admin cannot (no case files); unverified identity → false; baseline user on official_sensitive → true, none → false; analyst not assigned → false (Review Focus 2); partner in `UA` on controlled_technology without authorisation → false, with `UA` in `exportAuthorisedCountries` and the partner flag → true; controlled_technology analyst without officer approval → false.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement `can` as a matrix literal and `canView` as an early-return chain.
- [ ] **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit `feat(domain): permission matrix and access rule`.

### Task 4: Database, seed, storage, audit and session

**Files:** Create `supabase/migrations/0001_init.sql`, `supabase/seed.sql`, `src/server/db.ts`, `src/server/audit.ts`, `src/server/session.ts`, `app/dev/act-as/page.tsx`, `src/domain/completeness.ts`. Test `tests/domain/completeness.test.ts`.

**Interfaces:**
- Migration: one table per §8 entity, enums from Task 1, `cases.state` defaulting to `'Draft'`, `cases.pending_client_kind text null`, `case_files.hash` unique per case, `audit_events` with `REVOKE UPDATE, DELETE` from all app roles. Storage bucket `case-files`, private.
- Seed: org "Skyline Drones Ltd" (`onboarding_status='authorised'`, `sanctions_status='clear'`, `data_ceiling='official_sensitive'`, plan `S`), one user per role, all `identity_verified=true`. Analyst and officer at `baseline` and `sc`. Partner `location='UA'`.
- `logEvent(e: {actorId: string; action: string; object: string; objectId: string; location?: string}): Promise<void>`
- `getCurrentUser(): Promise<User | null>`: Clerk session (`auth()` from `@clerk/nextjs/server`), mapped to our `users` row by `clerk_user_id`; client org = Clerk Organization (`org_id` → `organisations.clerk_org_id`), client role = Clerk org role (`org:admin`/`org:member`/`org:approver`/`org:viewer` → `client_*`); internal roles live in our `users.role`. Middleware `clerkMiddleware()` protects everything except `/sign-in`. MFA is required in the Clerk dashboard. Sign-in page uses Clerk's `<SignIn />` themed with the Passage tokens via the `appearance` prop. When `NODE_ENV!=='production'` and the `act_as` cookie is set, return that seeded user. `/dev/act-as` lists seeded users and sets the cookie; it calls `notFound()` in production.
- `missingItems(draft: {files: {type:string; sizeBytes:number; sensitivity:string; hash:string}[]; parties: {type:string; name:string; country:string}[]; destination?: string; endUse?: string; deadline?: string}): string[]`. Required: at least one `spec` file and one `order` file, parties of type `buyer`, `end_user` and `consignee`, `destination`, and `endUse` of 1 to 600 characters. Per file: reject size 0, over 25 MB, `sensitivity==='secret'`, or a duplicate hash.

- [ ] **Step 1: Failing tests** for `missingItems`: a complete draft gives `[]`; no spec file gives `['spec file']`; Review Focus 5 cases each return their own message (`'empty file: x.pdf'`, `'file over 25 MB: y.pdf'`, `'SECRET uploads are not accepted'`, `'duplicate file: z.pdf'`).
- [ ] **Step 2:** Run. Expect FAIL. Implement. Run. Expect PASS.
- [ ] **Step 3:** Create the Supabase project in London (`eu-west-2`) through the Supabase MCP or dashboard, apply the migration and seed, and fill `.env.local` from `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER=fixture`, `SCREENING_PROVIDER=fixture`, `ANTHROPIC_API_KEY=`, `OPENSANCTIONS_API_KEY=`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=`, `CLERK_SECRET_KEY=`). Add `clerk_user_id text unique` to `users` and `clerk_org_id text unique` to `organisations`..
- [ ] **Step 4:** Verify with `npm run dev`, open `/dev/act-as`, pick the officer. The header shows "Officer". In SQL, `select count(*) from audit_events` increases after switching (the switch is logged).
- [ ] **Step 5:** Commit `feat: schema, seed, audit log, session, completeness`.

### Task 5: Sanctions screening

**Files:** Create `src/domain/screening.ts`, `src/providers/screening/{index,fixture,opensanctions}.ts`, `src/providers/screening/fixture-list.json`. Test `tests/domain/screening.test.ts`.

**Interfaces:**
- `normaliseName(name: string): string`: lowercase, transliterate Ukrainian and Russian Cyrillic to Latin, strip punctuation, and drop legal suffixes (`ltd, llc, tov, тов, pp, gmbh, sp z o o, plc, inc`).
- `interface ScreeningProvider { name: string; listVersions(): Promise<Record<string,string>>; search(party: {name:string; country:string}): Promise<{score:number; listedName:string; list:string}[]> }`
- `verdictFor(party: Party, hits: {score:number}[], destination: string, cfg: ScreeningConfig): {verdict: ScreeningVerdict; reasons: string[]}`: `match` if destination is in `cfg.prohibitedDestinations`; `possible` if the top score is at least `cfg.matchThreshold` (default 0.7); `red_flag` if the party is a distributor or intermediary in `cfg.redFlagCountries`; otherwise `clear`. A `match` verdict on a party name is never automatic: only an officer confirms one (§5.3).
- `caseVerdict(results: {verdict: ScreeningVerdict}[]): ScreeningVerdict`, worst wins: match > possible > red_flag > clear.
- `screenCase(caseId: string): Promise<ScreeningResult[]>` (in `src/server/cases.ts`, Task 6) uses `getScreeningProvider()` from `index.ts`. That returns `opensanctions` when `SCREENING_PROVIDER=opensanctions` and a key is set, else `fixture`.
- Fixture list: 5 obviously fictional listed names, including one that near-matches the seed consignee, so the possible-match path can be exercised.
- `config/screening.json`: `matchThreshold`, `prohibitedDestinations`, and `redFlagCountries` (placeholder country lists, marked "confirm with officer"), plus `listsChecked: ["UK","EU","UN","US"]`.

- [ ] **Step 1: Failing tests:** `normaliseName('ТОВ «Укрспецсистеми»') === normaliseName('Ukrspetssystemy LLC')` is false but scores ≥ 0.7 through the fixture provider's similarity (Review Focus 3); destination in prohibited list → `match`; top score 0.8 → `possible`; score 0.5 → `clear`; `caseVerdict` worst-wins table; an empty name throws a validation error rather than returning `clear`.
- [ ] **Step 2:** Run. Expect FAIL. Implement. The fixture provider scores with normalised Jaro-Winkler (write the ~20-line function; no new dependency). OpenSanctions calls `POST https://api.opensanctions.org/match/default`; check its current request shape with Context7 or its docs before coding.
- [ ] **Step 3:** Run. Expect PASS.
- [ ] **Step 4:** Commit `feat: sanctions screening with fixture and OpenSanctions providers`.

### Task 6: Client flow: case list, new case, case detail with side panel

**Files:** Create `src/server/cases.ts`, the three `app/(client)/cases/*` pages, and `src/components/{SidePanel,ActionChip,Timeline}.tsx`. Test `tests/e2e/core-loop.spec.ts` (started here, extended in Tasks 7–9).

**Interfaces:**
- Server actions in `src/server/cases.ts`, each calling `getCurrentUser`, `can`, `transition` and `logEvent`:
  - `createCase(form: FormData): Promise<{caseId: string} | {errors: string[]}>`: Zod-validates, uploads files to `case-files/<orgId>/<caseId>/` with SHA-256 hash, runs `missingItems`, then applies `submit(complete)`. If complete, it calls `screenCase` and applies `screened(caseVerdict)`.
  - `addFiles(caseId, form)`, `answerQuestion(questionId, form)`
  - `getCaseForUser(caseId): Promise<CaseView>` returns `notFound()` unless `canView` passes for the case's first file or the user is client-side in the same org. A denied attempt is logged (Review Focus 2).
- New case form fields follow §4.3 step 1.1: uploads (spec, BOM, order) each with a sensitivity select (unclassified, official_sensitive, controlled_technology, secret, where secret is rejected), destination, parties (buyer, end user, consignee, and repeatable intermediaries with type forwarder or agent, plus bank), deadline, and end use. Every input has a `<label>` and `name` so a bot can fill it.
- Side panel follows §7.5 exactly: Authorisation, Sanctions (per party with list versions and last screened), Your next action (one `ActionChip`), Case status, Fees, Audit (last 5). Any red Authorisation or Sanctions item locks the case: the form inputs are disabled and the reason is shown.
- Case list shows state, next action chip and deadline.

- [ ] **Step 1: Failing e2e test** (Playwright): act as client_member, fill the new case form with the Skyline fixture files, submit, land on `/cases/<id>`, side panel shows "Sanctions" with consignee "⚠ Possible match" and next action `WAIT`.
- [ ] **Step 2:** Run `npx playwright test`. Expect FAIL.
- [ ] **Step 3:** Build the pages and actions.
- [ ] **Step 4:** Run. Expect PASS. Also act as an unassigned analyst and open the URL: expect 404.
- [ ] **Step 5:** Commit `feat: client case intake, detail and side panel`.

### Task 7: Desk: queue, sanctions review, AI first pass, analyst ticket

**Files:** Create the desk pages and `src/providers/ai/{index,fixture,anthropic}.ts`. Extend `src/server/cases.ts`. Test `tests/domain/ai.test.ts` and extend e2e.

**Interfaces:**
- `interface AiFirstPass { run(input: {files: {name:string; text:string}[]; endUse:string}): Promise<AiResult> }`, where `AiResult = {parameters: Record<string,string>; suggestions: {entry:string; list:'UK Military'|'UK dual-use'|'EU dual-use'|'US CCL'|'US USML'; source:string; confidence:number}[]; usContentShare: number | null}`. `confidence` and `usContentShare` are in `[0,1]`.
- `parseAiResult(raw: unknown): AiResult | null` (Zod). Junk returns null.
- Anthropic provider: read the `claude-api` skill before writing it. Use a tool-use call with a JSON schema matching `AiResult` and the model id the skill names for current Sonnet. Extract text from PDFs before sending; send no files over 2 MB of text.
- Server actions: `proposeClearMatch(resultId, reason)` (analyst), `decideMatch(resultId, decision:'cleared'|'confirmed', reason)` (officer only, applies `sanctionsCleared`/`sanctionsConfirmed`), `askClient(caseId, text, kind:'ANSWER'|'SIGN')`, `runAiFirstPass(caseId)`, `saveClassification(caseId, {listEntries, reasoning, rulebookRefs, confidence})` (applies `classified`).
- Desk queue: tickets grouped by state with target times from §4.3, plus an "Assigned to me" filter.
- Sanctions review: party details beside candidate matches, and clear or confirm with a required reason.
- Ticket workspace: file list, AI suggestions with source and confidence, a free-text rulebook reference field (the full rulebook comes in Phase 5), and a question composer.

- [ ] **Step 1: Failing tests:** `parseAiResult({})` → null; a valid fixture object parses; Review Focus 4: when `runAiFirstPass` gets a provider that throws, the case state stays `Classifying` and a `Question`-free "manual classification" flag is set (`cases.ai_status='failed'`).
- [ ] **Step 2:** Run. Expect FAIL. Implement. Run. Expect PASS.
- [ ] **Step 3:** Extend e2e: act as analyst, propose clear; act as officer, clear with a reason; the case moves to `Classifying`; the AI fixture suggestions show; the analyst saves the classification; the case is `OfficerReview`.
- [ ] **Step 4:** Commit `feat: desk queue, sanctions review, AI first pass, analyst ticket`.

### Task 8: Officer review and route decision

**Files:** Create `app/(desk)/desk/officer/[caseId]/page.tsx`. Extend `src/server/cases.ts`. Test: extend e2e and add `tests/domain/pricing.test.ts`.

**Interfaces:**
- `signRoute(caseId, route: Route, note: string)`: officer only. It writes `Classification.signed_by/at`, applies `officerRoute`, and for B or C creates the quote(s) through `quoteFor`. The "B or C both possible" case creates two quotes and the client picks one (§4.5).
- `quoteFor(item: QuoteItem, plan: 'P'|'S', cfg = pricing): {amountPence: number; label: string}`: uses the config `min` for now (the officer can edit before showing). Plan S `individual` applies the configured discount.
- Officer page shows the sanctions summary, classification reasoning and a Sign button with the route radio plus a note. Outcome copy for A, B, C and D is verbatim from §4.5.

- [ ] **Step 1: Failing tests:** `quoteFor('individual','P')` equals the config min; `quoteFor('general_shipment','S')` returns 0 ("included up to tier limit"); e2e: the officer signs C and the client sees a `RouteQuote` with next action `APPROVE`.
- [ ] **Step 2:** Run. Expect FAIL. Implement. Run. Expect PASS.
- [ ] **Step 3:** Commit `feat: officer sign-off and route decision`.

### Task 9: Quote approval and Phase 1 finish

**Files:** Create `src/components/QuoteCard.tsx`. Extend `src/server/cases.ts`. Test: extend e2e.

**Interfaces:**
- `approveQuote(quoteId)`: client_admin or client_approver only. It locks the price (`status='approved'`, `approved_by/at`) and applies `approve` in a single DB transaction, guarded by `where status='shown'`. `askAboutQuote(quoteId, text)` creates a Question. `declineQuote(quoteId)` applies `decline`.
- QuoteCard shows the price, scope, time ("Our preparation 3–5 working days. Government decision usually ~4 weeks."), the verbatim guarantee text, and Approve / Ask a question buttons.

- [ ] **Step 1: Failing e2e:** client_member sees no Approve button. client_approver approves and the case is `RouteInProgress`. Review Focus 1: calling `approveQuote` twice at once gives exactly one approval row and the second call returns an error.
- [ ] **Step 2:** Run. Expect FAIL. Implement. Run. Expect PASS.
- [ ] **Step 3:** Full verification: `npm test && npx playwright test && npm run build`. All pass.
- [ ] **Step 4:** Deploy a preview to Vercel with region `lhr1` (`vercel.json`: `{"regions":["lhr1"]}`). Run the e2e suite against the preview URL.
- [ ] **Step 5:** Commit `feat: quote approval; phase 1 complete`.

**Phase 1 done when:** a bot acting through `/dev/act-as` can take one case from new case to `RouteInProgress` (route C), and separately to `ClosedNotControlled` (A) and `ClosedDoNotProceed` (D), with every step in the audit log.
