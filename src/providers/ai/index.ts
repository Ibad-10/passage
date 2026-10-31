// AI first pass (spec §4.3 step 1.4). AI suggests; an analyst and officer decide (§1 principle 3).
// Default is the offline fixture; real files go offshore only when AI_PROVIDER=anthropic (§9.2).
import { z } from 'zod'
import { createAnthropicProvider } from './anthropic'
import { fixtureProvider } from './fixture'

const share = z.number().min(0).max(1)

export const AiResultSchema = z.object({
  parameters: z.record(z.string(), z.string()),
  suggestions: z.array(
    z.object({
      entry: z.string().min(1),
      list: z.enum(['UK Military', 'UK dual-use', 'EU dual-use', 'US CCL', 'US USML']),
      source: z.string().min(1),
      confidence: share,
    }),
  ),
  usContentShare: share.nullable(),
})

export type AiResult = z.infer<typeof AiResultSchema>

export interface AiFirstPass {
  run(input: { files: { name: string; text: string }[]; endUse: string }): Promise<AiResult>
}

export function parseAiResult(raw: unknown): AiResult | null {
  const r = AiResultSchema.safeParse(raw)
  return r.success ? r.data : null
}

export function getAiProvider(): AiFirstPass {
  return process.env.AI_PROVIDER === 'anthropic' && process.env.ANTHROPIC_API_KEY ? createAnthropicProvider() : fixtureProvider
}
