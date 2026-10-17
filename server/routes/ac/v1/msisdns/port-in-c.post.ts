import { portIn } from '../../../../utils/mock'
import { ensureBearer, readPayload } from '../../../../utils/request'

type PortInError = Error & { statusCode?: number, data?: unknown, statusMessage?: string }

function errorPayload(error: unknown) {
  const apiError = error as PortInError
  const statusCode = apiError.statusCode && apiError.statusCode >= 400 && apiError.statusCode < 600
    ? apiError.statusCode
    : 500
  const data = apiError.data && typeof apiError.data === 'object' && !Array.isArray(apiError.data)
    ? apiError.data as Record<string, unknown>
    : {}

  return {
    statusCode,
    body: {
      errorCode: typeof data.errorCode === 'string' ? data.errorCode : `LOCAL_PORT_IN_${statusCode}`,
      message: typeof data.message === 'string'
        ? data.message
        : apiError.statusMessage || 'The port-in request could not be completed.'
    }
  }
}

/** Simulates Altan AC port-in-c and returns JSON errors for CRM RequestLog. */
export default defineEventHandler(async (event) => {
  ensureBearer(event)
  const body = await readPayload(event)
  const transitory = String(body.msisdnTransitory || '')
  const ported = String(body.msisdnPorted || '')

  if (!/^\d{10}$/.test(transitory) || !/^\d{10}$/.test(ported)) {
    setResponseStatus(event, 400)
    return { errorCode: 'LOCAL_PORT_IN_INVALID', message: 'msisdnTransitory and msisdnPorted must have 10 digits.' }
  }
  if (transitory === '5511119999') {
    setResponseStatus(event, 400)
    return { errorCode: 'LOCAL_PORT_IN_400', message: 'Simulated port-in validation error.' }
  }
  if (transitory === '5599991111') {
    setResponseStatus(event, 500)
    return { errorCode: 'LOCAL_PORT_IN_500', message: 'Simulated port-in server error.' }
  }

  try {
    return await portIn(transitory, ported)
  } catch (error) {
    const response = errorPayload(error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
