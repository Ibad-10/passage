import type { ScreeningConfig, ScreeningProvider } from '@/domain/screening'
import screeningConfig from '../../../config/screening.json'
import { fixtureProvider } from './fixture'
import { openSanctionsProvider } from './opensanctions'

export const screeningCfg: ScreeningConfig = screeningConfig

export function getScreeningProvider(): ScreeningProvider {
  const key = process.env.OPENSANCTIONS_API_KEY
  return process.env.SCREENING_PROVIDER === 'opensanctions' && key ? openSanctionsProvider(key) : fixtureProvider
}
