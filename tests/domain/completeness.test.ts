import { describe, expect, it } from 'vitest'
import { missingItems, type Draft, type DraftFile } from '@/domain/completeness'

const MB = 1024 * 1024
const f = (over: Partial<DraftFile> = {}): DraftFile => ({
  name: 'f.pdf', type: 'other', sizeBytes: 1000, sensitivity: 'unclassified', hash: Math.random().toString(36), ...over,
})
const complete = (): Draft => ({
  files: [f({ name: 'spec.pdf', type: 'spec', hash: 'a' }), f({ name: 'order.pdf', type: 'order', hash: 'b' })],
  parties: [
    { type: 'buyer', name: 'Buyer TOV', country: 'UA' },
    { type: 'end_user', name: 'End User TOV', country: 'UA' },
    { type: 'consignee', name: 'Consignee TOV', country: 'UA' },
  ],
  destination: 'UA',
  endUse: 'Agricultural survey drones for crop monitoring.',
  deadline: '2026-12-01',
})
const withFile = (file: DraftFile): Draft => {
  const d = complete()
  d.files.push(file)
  return d
}

describe('missingItems (§4.3 step 1.2)', () => {
  it('complete draft has nothing missing', () => {
    expect(missingItems(complete())).toEqual([])
  })
  it('no spec file', () => {
    const d = complete()
    d.files = d.files.filter((x) => x.type !== 'spec')
    expect(missingItems(d)).toEqual(['spec file'])
  })
  it('no order file', () => {
    const d = complete()
    d.files = d.files.filter((x) => x.type !== 'order')
    expect(missingItems(d)).toEqual(['order file'])
  })
  it('each required party', () => {
    for (const t of ['buyer', 'end_user', 'consignee']) {
      const d = complete()
      d.parties = d.parties.filter((p) => p.type !== t)
      expect(missingItems(d)).toEqual([`${t.replace('_', ' ')} party`])
    }
  })
  it('party with a blank name does not count', () => {
    const d = complete()
    d.parties[0].name = '  '
    expect(missingItems(d)).toEqual(['buyer party'])
  })
  it('destination and end use', () => {
    expect(missingItems({ ...complete(), destination: '' })).toEqual(['destination'])
    expect(missingItems({ ...complete(), endUse: undefined })).toEqual(['end use (1 to 600 characters)'])
    expect(missingItems({ ...complete(), endUse: 'x'.repeat(601) })).toEqual(['end use (1 to 600 characters)'])
    expect(missingItems({ ...complete(), endUse: 'x'.repeat(600) })).toEqual([])
  })
  describe('Review Focus 5: bad uploads', () => {
    it('empty file', () => {
      expect(missingItems(withFile(f({ name: 'x.pdf', sizeBytes: 0 })))).toEqual(['empty file: x.pdf'])
    })
    it('file over 25 MB', () => {
      expect(missingItems(withFile(f({ name: 'y.pdf', sizeBytes: 25 * MB + 1 })))).toEqual(['file over 25 MB: y.pdf'])
      expect(missingItems(withFile(f({ name: 'y.pdf', sizeBytes: 25 * MB })))).toEqual([])
    })
    it('SECRET upload', () => {
      expect(missingItems(withFile(f({ sensitivity: 'secret' })))).toEqual(['SECRET uploads are not accepted'])
    })
    it('duplicate hash', () => {
      expect(missingItems(withFile(f({ name: 'z.pdf', hash: 'a' })))).toEqual(['duplicate file: z.pdf'])
    })
    it('a rejected file does not satisfy a required type', () => {
      const d = complete()
      d.files[0].sizeBytes = 0
      expect(missingItems(d)).toEqual(['empty file: spec.pdf', 'spec file'])
    })
  })
})
