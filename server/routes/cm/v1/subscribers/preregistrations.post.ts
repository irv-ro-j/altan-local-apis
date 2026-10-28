import {
  BATCH_FILE_FIELDS,
  BATCH_MAX_BYTES,
  BATCH_SERVER_ERROR_MSISDN,
  BatchFileError,
  parsePreregistrationFile
} from '../../../../lib/preregistration-batch'
import { preregisterBatch } from '../../../../utils/preregistration-batch'
import { ensureBearer } from '../../../../utils/request'

const FILE_NOT_FOUND = 'The file was not found. Please check it'

/** Simula el batch de preregistro de Altán (multipart/form-data, campo archivos[]). */
export default defineEventHandler(async (event) => {
  ensureBearer(event)

  const parts = await readMultipartFormData(event).catch(() => undefined)
  const file = parts?.find(part => BATCH_FILE_FIELDS.includes(part.name || ''))
  if (!file?.data?.length) {
    setResponseStatus(event, 400)
    return { errorCode: '400', description: FILE_NOT_FOUND }
  }
  if (file.data.length > BATCH_MAX_BYTES) {
    setResponseStatus(event, 400)
    return { errorCode: '400', description: 'The file exceeds the limit of 10 MB.' }
  }

  let lines
  try {
    lines = parsePreregistrationFile(file.data.toString('utf-8'))
  } catch (error) {
    if (!(error instanceof BatchFileError)) throw error
    setResponseStatus(event, 400)
    return { errorCode: '400', description: error.description }
  }

  if (lines.some(line => line.msisdn === BATCH_SERVER_ERROR_MSISDN)) {
    setResponseStatus(event, 500)
    return {
      errorCode: '500',
      description: 'Internal server error',
      detail: 'An error has been generated on the server when processing the request. If necessary, please, contact support Altán Redes'
    }
  }

  const batch = await preregisterBatch(lines, file.filename || 'preregistrations.txt')
  return {
    effectiveDate: batch.effectiveDate,
    lines: String(batch.reportedLines),
    transaction: { id: batch.transactionId }
  }
})
