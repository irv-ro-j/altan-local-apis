import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DuplicateKeyError, MemoryBackend, MockStore } from '../server/lib/storage'

const fixture = { msisdn: '5550000001', balance: 10 }
function setup() {
  const backend = new MemoryBackend([{ collection: 'sims', key: fixture.msisdn, value: fixture }])
  return { backend, store: new MockStore(backend) }
}

test('reads are detached and new repositories see saved records without reseeding', async () => {
  const { backend, store } = setup()
  await store.create([{ collection: 'sims', key: 'manual', value: { msisdn: 'manual', balance: 20 } }])
  const value = await store.get<typeof fixture>('sims', fixture.msisdn)
  value!.balance = 0
  const fresh = new MockStore(backend)
  assert.equal((await fresh.get<typeof fixture>('sims', fixture.msisdn))?.balance, 10)
  assert.equal((await fresh.list('sims')).length, 2)
})

test('concurrent changes accumulate rather than losing updates', async () => {
  const { store } = setup()
  await Promise.all(Array.from({ length: 6 }, () => store.update('sims', fixture.msisdn, () => fixture, (sim) => {
    sim.balance++
  })))
  assert.equal((await store.get<typeof fixture>('sims', fixture.msisdn))?.balance, 16)
})

test('a transient transaction conflict is retried instead of reporting a duplicate', async () => {
  class BusyOnceBackend extends MemoryBackend {
    private busy = true
    override async commit(...args: Parameters<MemoryBackend['commit']>) {
      if (this.busy) {
        this.busy = false
        return false
      }
      return await super.commit(...args)
    }
  }
  const store = new MockStore(new BusyOnceBackend([]))
  assert.equal(await store.create([{ collection: 'sims', key: 'manual', value: fixture }]), true)
  assert.deepEqual(await store.get('sims', 'manual'), fixture)
})

test('port-in renames atomically and a new repository does not resurrect the fixture', async () => {
  const { backend, store } = setup()
  await store.update('sims', fixture.msisdn, () => fixture, (sim) => {
    sim.msisdn = '5551234567'
  }, sim => sim.msisdn)
  const fresh = new MockStore(backend)
  assert.equal(await fresh.get('sims', fixture.msisdn), undefined)
  assert.equal((await fresh.get<typeof fixture>('sims', '5551234567'))?.balance, 10)
  await assert.rejects(store.update('sims', 'manual', () => ({ msisdn: 'manual', balance: 0 }), (sim) => {
    sim.msisdn = '5551234567'
  }, sim => sim.msisdn), DuplicateKeyError)
  assert.equal(await store.get('sims', 'manual'), undefined)
})

test('idempotency key and sale are saved together without orphan records', async () => {
  const { backend, store } = setup()
  const other = new MockStore(backend)
  const results = await Promise.all([store, other].map((client, index) => client.create([
    { collection: 'sales', key: String(index), value: { id: index } },
    { collection: 'saleIdentifiers', key: 'same-reference', value: { id: index } }
  ])))
  assert.deepEqual(results.sort(), [false, true])
  assert.equal((await store.list('sales')).length, 1)
  assert.equal((await store.list('saleIdentifiers')).length, 1)
})

test('reset restores fixtures and clears sales and idempotency keys across repositories', async () => {
  const { backend, store } = setup()
  await store.create([{ collection: 'sales', key: '1', value: {} }, { collection: 'saleIdentifiers', key: 'reference', value: {} }])
  await store.update('sims', fixture.msisdn, () => fixture, (sim) => {
    sim.balance = 0
  })
  await store.reset()
  const fresh = new MockStore(backend)
  assert.deepEqual(await fresh.list('sims'), [fixture])
  assert.deepEqual(await fresh.list('sales'), [])
  assert.deepEqual(await fresh.list('saleIdentifiers'), [])
})

test('a rejected operation does not persist an autoprovisioned SIM', async () => {
  const { store } = setup()
  await assert.rejects(store.update('sims', 'absent', () => fixture, () => {
    throw new Error('invalid operation')
  }))
  assert.equal(await store.get('sims', 'absent'), undefined)
})

test('writes from an old generation cannot restore state after a reset', async () => {
  const { backend, store } = setup()
  const previous = await backend.scope()
  await store.reset()
  assert.equal(await backend.commit(previous, [{ collection: 'sims', key: 'stale', revision: null, value: {} }]), false)
  assert.equal(await store.get('sims', 'stale'), undefined)
})
