import { portIn, requireSim } from '../../../../utils/mock'
import { ensureBearer, readPayload } from '../../../../utils/request'

/** Mock local de Altán AC port-in-c. No tiene efectos fuera de memoria. */
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

  const sim = requireSim(transitory)
  if (sim.status !== 'Active') {
    throw createError({ statusCode: 409, data: { errorCode: 'LOCAL_PORT_IN_NOT_ACTIVE', message: 'Port-in requires an Active transitory SIM.' } })
  }
  return portIn(sim, ported)
})
