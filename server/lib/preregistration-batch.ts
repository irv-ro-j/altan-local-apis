import { activatePlan } from './sim-data'
import type { MockSim } from './sim-data'

// Límites documentados por Altán para el batch de preregistro.
export const BATCH_MAX_LINES = 10_000
export const BATCH_MAX_BYTES = 10 * 1024 * 1024
export const BATCH_FILE_FIELDS = ['archivos[]', 'archivos']

// Escenarios controlados para probar el manejo de errores del CRM.
export const BATCH_SERVER_ERROR_MSISDN = '5550000098'
export const BATCH_LINE_MISMATCH_MSISDN = '5550000097'

export type BatchFileLine = {
  line: number
  msisdn: string
  offeringId: string
  coordinates: string
  msisdnPorted: string
  idPoS: string
}

export type BatchLineResult = BatchFileLine & {
  status: 'Successful' | 'Failed'
  reason?: string
}

export type PreregistrationBatch = {
  transactionId: string
  effectiveDate: string
  fileName: string
  receivedLines: number
  reportedLines: number
  successful: number
  failed: number
  // Solo las fallidas (con tope): cada registro de DynamoDB admite máximo 400 KB.
  // El resultado de las exitosas queda en la propia SIM (estado, oferta y operaciones).
  failures: BatchLineResult[]
  failuresTruncated: boolean
}

export const BATCH_MAX_STORED_FAILURES = 500

export class BatchFileError extends Error {
  constructor(public readonly description: string) {
    super(description)
  }
}

const DIGITS_10 = /^\d{10}$/
const DIGITS = /^\d+$/

/**
 * Formato por línea: msisdn|offeringId|Coordenadas(opcional)|msisdnPorted(opcional)|idPoS(opcional).
 * Las líneas vacías se ignoran; cualquier línea inválida rechaza el archivo completo (HTTP 400).
 */
export function parsePreregistrationFile(content: string): BatchFileLine[] {
  const rows = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  const lines: BatchFileLine[] = []
  rows.forEach((raw, index) => {
    const text = raw.trim()
    if (!text) return
    const lineNumber = index + 1
    const fields = text.split('|').map(field => field.trim())
    if (fields.length < 2 || fields.length > 5) {
      throw new BatchFileError(`Line ${lineNumber}: expected msisdn|offeringId|coordinates|msisdnPorted|idPoS.`)
    }
    const [msisdn = '', offeringId = '', coordinates = '', msisdnPorted = '', idPoS = ''] = fields
    if (!DIGITS_10.test(msisdn)) throw new BatchFileError(`Line ${lineNumber}: msisdn must have 10 digits.`)
    if (!DIGITS.test(offeringId)) throw new BatchFileError(`Line ${lineNumber}: offeringId is required and must be numeric.`)
    if (msisdnPorted && !DIGITS_10.test(msisdnPorted)) throw new BatchFileError(`Line ${lineNumber}: msisdnPorted must have 10 digits.`)
    lines.push({ line: lineNumber, msisdn, offeringId, coordinates, msisdnPorted, idPoS })
  })
  if (!lines.length) throw new BatchFileError('The file does not contain lines to preregister.')
  if (lines.length > BATCH_MAX_LINES) throw new BatchFileError(`The file exceeds the limit of ${BATCH_MAX_LINES} lines.`)
  return lines
}

/** Misma regla que el preregistro individual: solo una SIM Idle puede preactivarse. */
export function preregisterBatchLine(sim: MockSim, line: BatchFileLine) {
  if (sim.status !== 'Idle') throw new BatchFileError(`Cannot preregister a ${sim.status} SIM`)
  activatePlan(sim, line.offeringId, 'preregister')
}

export function batchEffectiveDate(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function batchTransactionId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => String(value % 10)).join('')
}

/** Líneas que se reportan en la respuesta; el escenario de control reporta una menos. */
export function reportedLineCount(lines: BatchFileLine[]) {
  const mismatch = lines.some(line => line.msisdn === BATCH_LINE_MISMATCH_MSISDN)
  return mismatch ? Math.max(lines.length - 1, 0) : lines.length
}

export function buildBatchRecord(input: { transactionId: string, effectiveDate: string, fileName: string, lines: BatchFileLine[], results: BatchLineResult[] }): PreregistrationBatch {
  const failures = input.results.filter(result => result.status === 'Failed')
  return {
    transactionId: input.transactionId,
    effectiveDate: input.effectiveDate,
    fileName: input.fileName,
    receivedLines: input.lines.length,
    reportedLines: reportedLineCount(input.lines),
    successful: input.results.length - failures.length,
    failed: failures.length,
    failures: failures.slice(0, BATCH_MAX_STORED_FAILURES),
    failuresTruncated: failures.length > BATCH_MAX_STORED_FAILURES
  }
}
