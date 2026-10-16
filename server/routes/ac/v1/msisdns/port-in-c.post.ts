import { portIn } from '../../../../utils/mock'
import { ensureBearer, readPayload } from '../../../../utils/request'

/** Simulates Altán AC port-in-c without calling the operator. */
export default defineEventHandler(async (event) => {
  ensureBearer(event)
  const body = await readPayload(event)
  const transitory = String(body.msisdnTransitory || '')
  const ported = String(body.msisdnPorted || '')

  if (!/^\d{10}$/.test(transitory) || !/^\d{10}$/.test(ported)) {
    throw createError({ statusCode: 400, data: { errorCode: 'LOCAL_PORT_IN_INVALID', message: 'msisdnTransitory and msisdnPorted must have 10 digits.' } })
  }
  if (transitory === '5511119999') {
    throw createError({ statusCode: 400, data: { errorCode: 'LOCAL_PORT_IN_400', message: 'Simulated port-in validation error.' } })
  }
  if (transitory === '5599991111') {
    throw createError({ statusCode: 500, data: { errorCode: 'LOCAL_PORT_IN_500', message: 'Simulated port-in server error.' } })
  }

  return await portIn(transitory, ported)
})
