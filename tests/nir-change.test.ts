import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changeSubscriberNumber, createInitialSims, profileFor } from '../server/lib/sim-data'
import { DuplicateKeyError, MemoryBackend, MockStore } from '../server/lib/storage'

Object.assign(globalThis, {
  createError: (details: { statusCode: number, data: { message: string } }) => Object.assign(new Error(details.data.message), details)
})

test('NIR change atomically replaces the number and preserves the SIM and its benefits', async () => {
  const original = createInitialSims().find(sim => sim.msisdn === '5550000002')!
  const backend = new MemoryBackend([{ collection: 'sims', key: original.msisdn, value: original }])
  const store = new MockStore(backend)
  const changed = await store.update('sims', original.msisdn, () => original,
    sim => changeSubscriberNumber(sim, '3', '1', '3123456789'), sim => sim.msisdn)
  const restarted = new MockStore(backend)
  assert.equal(await restarted.get('sims', original.msisdn), undefined)
  assert.deepEqual(await restarted.get('sims', changed.msisdn), changed)
  assert.equal(changed.msisdn, '3123456789')
  assert.deepEqual({ ...changed, msisdn: original.msisdn, operations: original.operations }, original)
  assert.deepEqual(profileFor(changed).responseSubscriber.freeUnits, profileFor(original).responseSubscriber.freeUnits)
  assert.deepEqual(changed.operations.at(-1), {
    type: 'change_nir', oldMsisdn: original.msisdn, newMsisdn: changed.msisdn,
    zone: '3', msisdnType: '1', at: changed.operations.at(-1)!.at
  })
})

test('NIR change rejects inactive SIMs without mutation', () => {
  for (const original of createInitialSims().filter(sim => sim.status !== 'Active')) {
    const sim = structuredClone(original)
    assert.throws(() => changeSubscriberNumber(sim, '9', '1', '9123456789'), /Active SIM/)
    assert.deepEqual(sim, original)
  }
})

test('occupied NIR destination rolls back the source and does not overwrite the destination', async () => {
  const original = createInitialSims().find(sim => sim.status === 'Active')!
  const destination = { ...structuredClone(original), msisdn: '3123456789' }
  const store = new MockStore(new MemoryBackend([
    { collection: 'sims', key: original.msisdn, value: original },
    { collection: 'sims', key: destination.msisdn, value: destination }
  ]))
  await assert.rejects(store.update('sims', original.msisdn, () => original,
    sim => changeSubscriberNumber(sim, '3', '1', destination.msisdn), sim => sim.msisdn), DuplicateKeyError)
  assert.deepEqual(await store.get('sims', original.msisdn), original)
  assert.deepEqual(await store.get('sims', destination.msisdn), destination)
})
