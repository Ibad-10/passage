import type { AiFirstPass, AiResult } from './index'

// Deterministic offline result: a survey drone with a thermal camera.
export const FIXTURE_RESULT: AiResult = {
  parameters: {
    product: 'Quadcopter UAV with gimbal-mounted thermal camera',
    endurance: '55 min',
    max_range: '12 km',
    thermal_resolution: '640 x 512',
    thermal_frame_rate: '30 Hz',
    datalink: 'Encrypted 2.4/5.8 GHz, AES-256',
  },
  suggestions: [
    {
      entry: 'ML10.c',
      list: 'UK Military',
      source: 'Airframe hardpoints rated for 2 kg payload release mechanism',
      confidence: 0.86,
    },
    {
      entry: '6A003.b.4',
      list: 'UK dual-use',
      source: 'Uncooled microbolometer, 640 x 512, 30 Hz frame rate',
      confidence: 0.71,
    },
    {
      entry: '5A002.a',
      list: 'UK dual-use',
      source: 'Command and video link encrypted with AES-256',
      confidence: 0.64,
    },
  ],
  usContentShare: 0.14,
}

export const fixtureProvider: AiFirstPass = {
  run: async () => structuredClone(FIXTURE_RESULT),
}
