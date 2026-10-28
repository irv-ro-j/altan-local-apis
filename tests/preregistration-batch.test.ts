import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BATCH_MAX_STORED_FAILURES,
  BatchFileError,
  batchEffectiveDate,
  batchTransactionId,
  buildBatchRecord,
  parsePreregistrationFile,
  preregisterBatchLine,
  reportedLineCount
} from '../server/lib/preregistration-batch'
import type { BatchLineResult } from '../server/lib/preregistration-batch'
import { createInitialSims, provisionSim } from '../server/lib/sim-data'
import { MemoryBackend, MockStore } from '../server/lib/storage'

test('parses required and optional fields and ignores blank lines', () => {
  const lines = parsePreregistrationFile('\uFEFF5550000001|1709902609\r\n\n5532689574|1001000019||5528964875|9999\n')
  assert.deepEqual(lines, [
    { line: 1, msisdn: '5550000001', offeringId: '1709902609', coordinates: '', msisdnPorted: '', idPoS: '' },
    { line: 3, msisdn: '5532689574', offeringId: '1001000019', coordinates: '', msisdnPorted: '5528964875', idPoS: '9999' }
  ])
})

test('rejects the whole file when any line is invalid', () => {
  for (const content of ['', '\n\n', '555000000|1709902609', '5550000001', '5550000001|abc', '5550000001|1|c|123', '5550000001|1|c|p|i|extra']) {
    assert.throws(() => parsePreregistrationFile(content), BatchFileError, content)
  }
})

test('rejects files over the documented line limit', () => {
  const content = Array.from({ length: 10_001 }, (_, index) => `55${String(index).padStart(8, '0')}|1709902609`).join('\n')
  assert.throws(() => parsePreregistrationFile(content), /10000 lines/)
})

test('only Idle SIMs are preregistered, like the individual endpoint', () => {
  const idle = provisionSim('5551112222', 'Idle')
  preregisterBatchLine(idle, { line: 1, msisdn: idle.msisdn, offeringId: '1709902609', coordinates: '', msisdnPorted: '', idPoS: '' })
  assert.equal(idle.status, 'Active')
  assert.equal(idle.offerId, '1709902609')
  assert.equal(idle.operations.at(-1)?.type, 'preregister')

  const active = createInitialSims().find(sim => sim.msisdn === '5550000002')!
  assert.throws(() => preregisterBatchLine(active, { line: 1, msisdn: active.msisdn, offeringId: '1', coordinates: '', msisdnPorted: '', idPoS: '' }), /Active SIM/)
})

test('response metadata follows the Altán format and the mismatch scenario reports one line less', () => {
  assert.match(batchEffectiveDate(new Date(2026, 9, 28, 9, 5, 7)), /^20261028090507$/)
  assert.match(batchTransactionId(), /^\d{16}$/)
  const lines = parsePreregistrationFile('5550000001|1\n5550000097|1')
  assert.equal(reportedLineCount(lines), 1)
  assert.equal(reportedLineCount(lines.slice(0, 1)), 1)
})

test('batch record keeps counts and caps stored failures', () => {
  const lines = parsePreregistrationFile(Array.from({ length: 600 }, (_, index) => `55${String(index).padStart(8, '0')}|1`).join('\n'))
  const results: BatchLineResult[] = lines.map((line, index) => ({ ...line, status: index < 2 ? 'Successful' : 'Failed', reason: 'x' }))
  const record = buildBatchRecord({ transactionId: '1', effectiveDate: '20261028', fileName: 'a.txt', lines, results })
  assert.equal(record.successful, 2)
  assert.equal(record.failed, 598)
  assert.equal(record.failures.length, BATCH_MAX_STORED_FAILURES)
  assert.equal(record.failuresTruncated, true)
})

test('reset clears preregistration batches', async () => {
  const store = new MockStore(new MemoryBackend([]))
  await store.create([{ collection: 'preregistrationBatches', key: '1', value: { transactionId: '1' } }])
  assert.equal((await store.list('preregistrationBatches')).length, 1)
  await store.reset()
  assert.deepEqual(await store.list('preregistrationBatches'), [])
})
