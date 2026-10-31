import { afterEach, describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { getAiProvider, parseAiResult } from '@/providers/ai'
import { fixtureProvider, FIXTURE_RESULT } from '@/providers/ai/fixture'
import { AiUnavailableError, createAnthropicProvider } from '@/providers/ai/anthropic'

const input = { files: [{ name: 'spec.txt', text: 'Quadcopter with 640x512 thermal camera' }], endUse: 'Border survey' }
const mockClient = (create: ReturnType<typeof vi.fn>) => ({ messages: { create } }) as unknown as Anthropic

afterEach(() => vi.unstubAllEnvs())

describe('parseAiResult', () => {
  it('rejects junk', () => {
    expect(parseAiResult({})).toBeNull()
    expect(parseAiResult(null)).toBeNull()
  })
  it('rejects confidence outside [0,1]', () => {
    const bad = { ...FIXTURE_RESULT, suggestions: [{ ...FIXTURE_RESULT.suggestions[0], confidence: 1.2 }] }
    expect(parseAiResult(bad)).toBeNull()
  })
  it('accepts the fixture', () => {
    expect(parseAiResult(FIXTURE_RESULT)).toEqual(FIXTURE_RESULT)
  })
})

describe('getAiProvider', () => {
  it('returns the fixture when AI_PROVIDER is unset', () => {
    vi.stubEnv('AI_PROVIDER', undefined)
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    expect(getAiProvider()).toBe(fixtureProvider)
  })
  it('returns the fixture when anthropic is selected but no key is set', () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', undefined)
    expect(getAiProvider()).toBe(fixtureProvider)
  })
  it('fixture result is deterministic and valid', async () => {
    expect(parseAiResult(await fixtureProvider.run(input))).toEqual(FIXTURE_RESULT)
  })
})

describe('anthropic provider', () => {
  it('wraps a client error as AiUnavailableError', async () => {
    const provider = createAnthropicProvider(mockClient(vi.fn().mockRejectedValue(new Error('network down'))))
    await expect(provider.run(input)).rejects.toBeInstanceOf(AiUnavailableError)
  })
  it('rejects when the tool input is junk', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't1', name: 'record_first_pass', input: { nope: 1 } }],
    })
    await expect(createAnthropicProvider(mockClient(create)).run(input)).rejects.toBeInstanceOf(AiUnavailableError)
  })
  it('rejects on refusal', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'refusal', content: [] })
    await expect(createAnthropicProvider(mockClient(create)).run(input)).rejects.toBeInstanceOf(AiUnavailableError)
  })
  it('uses AI_MODEL when set', async () => {
    vi.stubEnv('AI_MODEL', 'claude-sonnet-5-5')
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't1', name: 'record_first_pass', input: FIXTURE_RESULT }],
    })
    await createAnthropicProvider(mockClient(create)).run(input)
    expect(create.mock.calls[0][0].model).toBe('claude-sonnet-5-5')
  })
  it('returns the parsed tool_use input', async () => {
    vi.stubEnv('AI_MODEL', undefined)
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        { type: 'thinking', thinking: '', signature: 'x' },
        { type: 'tool_use', id: 't1', name: 'record_first_pass', input: FIXTURE_RESULT },
      ],
    })
    await expect(createAnthropicProvider(mockClient(create)).run(input)).resolves.toEqual(FIXTURE_RESULT)
    const req = create.mock.calls[0][0]
    expect(req.tools[0].name).toBe('record_first_pass')
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.max_tokens).toBeGreaterThanOrEqual(4000)
    expect(req.messages[0].content).toContain('Quadcopter')
  })
  it('truncates combined file text to 200k characters', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't1', name: 'record_first_pass', input: FIXTURE_RESULT }],
    })
    await createAnthropicProvider(mockClient(create)).run({ files: [{ name: 'big.txt', text: 'a'.repeat(300_000) }], endUse: 'x' })
    const files = create.mock.calls[0][0].messages[0].content.match(/<files>\n([\s\S]*)\n<\/files>/)[1]
    expect(files).toHaveLength(200_000)
  })
})
