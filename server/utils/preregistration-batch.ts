import { getStore } from './runtime-storage'
import { updateSim } from './mock'
import {
  batchEffectiveDate,
  batchTransactionId,
  buildBatchRecord,
  preregisterBatchLine
} from '../lib/preregistration-batch'
import type { BatchFileLine, BatchLineResult, PreregistrationBatch } from '../lib/preregistration-batch'

function failureReason(error: unknown) {
  const failure = error as { data?: { message?: string }, message?: string }
  return failure.data?.message || failure.message || 'Preregistration failed'
}

/**
 * Preactiva cada línea con la misma regla del preregistro individual y guarda el lote.
 * Altán procesa el archivo de forma asíncrona y no informa resultados por línea en la
 * respuesta; el simulador los aplica de inmediato y los expone en /api/mock/preregistrations.
 */
export async function preregisterBatch(lines: BatchFileLine[], fileName: string): Promise<PreregistrationBatch> {
  const results: BatchLineResult[] = []
  for (const line of lines) {
    try {
      await updateSim(line.msisdn, 'Idle', sim => preregisterBatchLine(sim, line))
      results.push({ ...line, status: 'Successful' })
    } catch (error) {
      results.push({ ...line, status: 'Failed', reason: failureReason(error) })
    }
  }
  const record = buildBatchRecord({
    transactionId: batchTransactionId(),
    effectiveDate: batchEffectiveDate(),
    fileName,
    lines,
    results
  })
  await getStore().create([{ collection: 'preregistrationBatches', key: record.transactionId, value: record }])
  return record
}

export async function getPreregistrationBatches() {
  return (await getStore().list<PreregistrationBatch>('preregistrationBatches'))
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
}

export async function getPreregistrationBatch(transactionId: string) {
  return await getStore().get<PreregistrationBatch>('preregistrationBatches', transactionId)
}
