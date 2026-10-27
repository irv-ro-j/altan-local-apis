import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createInitialSims, crtLinkageFor, manualSim, profileFor, provisionSim } from '../server/lib/sim-data'
import { MemoryBackend, MockStore } from '../server/lib/storage'

test('returns the CRT state for linked and unlinked subscribers', () => {
  const sims = createInitialSims()
  const linked = sims.find(sim => sim.msisdn === '5550000002')!
  const unlinked = sims.find(sim => sim.msisdn === '5550000001')!

  assert.deepEqual(crtLinkageFor(linked), { isCrtLinked: true })
  assert.deepEqual(crtLinkageFor(unlinked), { isCrtLinked: false })
})

test('manual and automatically provisioned sims default to unlinked', () => {
  assert.equal(manualSim('5551234567', 'Active').isCrtLinked, false)
  assert.equal(manualSim('5551234568', 'Active', true).isCrtLinked, true)
  assert.equal(provisionSim('5551234569', 'Active').isCrtLinked, false)
})

test('CRT linkage remains separate from the subscriber profile response', () => {
  const linked = createInitialSims().find(sim => sim.msisdn === '5550000002')!

  assert.equal('isCrtLinked' in profileFor(linked), false)
})

test('CRT changes persist in both directions without changing the profile or other SIM fields', async () => {
  for (const original of createInitialSims()) {
    const backend = new MemoryBackend([{ collection: 'sims', key: original.msisdn, value: original }])
    const store = new MockStore(backend)
    for (const isCrtLinked of [true, false]) {
      await store.update('sims', original.msisdn, () => {
        throw new Error('SIM not found')
      }, (sim: typeof original) => {
        sim.isCrtLinked = isCrtLinked
      })
      const saved = await new MockStore(backend).get<typeof original>('sims', original.msisdn)
      assert.deepEqual(saved, { ...original, isCrtLinked })
      assert.deepEqual(crtLinkageFor(saved!), { isCrtLinked })
      assert.deepEqual(profileFor(saved!), profileFor(original))
    }
  }
})
