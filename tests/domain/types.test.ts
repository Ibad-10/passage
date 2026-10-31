import { describe, expect, it } from 'vitest'
import { CASE_STATES, CLIENT_ACTIONS } from '@/domain/types'

describe('domain types', () => {
  it('has the 21 case states from spec §6', () => {
    expect(CASE_STATES).toHaveLength(21)
    expect(new Set(CASE_STATES).size).toBe(21)
  })
  it('has the client actions from spec §3 in order', () => {
    expect(CLIENT_ACTIONS).toEqual(['UPLOAD', 'DESCRIBE', 'SELECT', 'ANSWER', 'APPROVE', 'SIGN', 'WAIT', 'NONE'])
  })
})
